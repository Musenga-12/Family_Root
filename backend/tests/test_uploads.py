"""Uploading, checking and serving photos, scans and recordings."""
from datetime import timedelta

from conftest import UPLOADS
from helpers import API, JPEG, PDF, PNG, WEBM, local, make_token, upload


def stored_files() -> list:
    return [p for p in UPLOADS.rglob("*") if p.is_file()] if UPLOADS.exists() else []


def test_upload_and_open_a_photo(client, auth):
    r = upload(client, auth("james"))
    assert r.status_code == 201
    up = r.json()
    assert up["content_type"] == "image/png" and up["size"] == len(PNG) and up["filename"] == "photo.png"
    f = client.get(local(up["url"]))  # no sign-in header: the signed link is enough, like <img src>
    assert f.status_code == 200 and f.content == PNG
    assert f.headers["content-type"] == "image/png" and f.headers["x-content-type-options"] == "nosniff"
    assert f.headers["cache-control"] == "private, max-age=3600"


def test_accepted_kinds(client, auth):
    h = auth("james")
    assert upload(client, h, JPEG, "image/jpeg", "a.jpg").status_code == 201
    assert upload(client, h, PDF, "application/pdf", "scan.pdf").status_code == 201
    assert upload(client, h, WEBM, "audio/webm;codecs=opus", "rec.webm").json()["content_type"] == "audio/webm"


def test_contents_must_match_the_type(client, auth):
    h = auth("james")
    r = upload(client, h, b"<script>alert(1)</script>" + b" " * 40, "image/png", "evil.png")
    assert r.status_code == 415 and "don't match" in r.json()["detail"]
    assert upload(client, h, PNG, "audio/webm", "x.webm").status_code == 415
    assert upload(client, h, b"<html></html>", "text/html", "page.html").status_code == 415
    assert upload(client, h, b"<svg/>", "image/svg+xml", "a.svg").status_code == 415
    assert stored_files() == []


def test_empty_and_oversized_files(client, auth, monkeypatch):
    from app.config import settings

    h = auth("james")
    assert upload(client, h, b"", "image/png").status_code == 422
    monkeypatch.setattr(settings, "max_image_mb", 1)
    r = upload(client, h, PNG + b"\0" * (1024 * 1024), "image/png")
    assert r.status_code == 413
    assert stored_files() == []  # nothing left behind


def test_signed_links(client, auth):
    a, b = upload(client, auth("james")).json(), upload(client, auth("james"), JPEG, "image/jpeg").json()
    other_token = local(b["url"]).split("token=")[1]
    assert client.get(f"{API}/uploads/{a['id']}/file?token={other_token}").status_code == 403  # another file's link
    expired = make_token({"sub": a["id"], "typ": "file"}, expires_in=timedelta(minutes=-1))
    assert client.get(f"{API}/uploads/{a['id']}/file?token={expired}").status_code == 403
    sign_in = auth("james")["Authorization"].split()[1]
    assert client.get(f"{API}/uploads/{a['id']}/file?token={sign_in}").status_code == 403  # a sign-in token isn't a file link
    assert client.get(f"{API}/uploads/{a['id']}/file").status_code == 422
    missing = make_token({"sub": "unone", "typ": "file"})
    assert client.get(f"{API}/uploads/unone/file?token={missing}").status_code == 404


def test_upload_details_are_for_the_uploader(client, auth):
    up = upload(client, auth("james")).json()
    assert client.get(f"{API}/uploads/{up['id']}", headers=auth("james")).status_code == 200
    assert client.get(f"{API}/uploads/{up['id']}", headers=auth("michael")).status_code == 404
    assert client.get(f"{API}/uploads/{up['id']}", headers=auth("mary")).status_code == 404


def test_files_can_only_be_attached_by_whoever_uploaded_them(client, auth):
    photo = upload(client, auth("james")).json()["id"]
    audio = upload(client, auth("james"), WEBM, "audio/webm", "r.webm").json()["id"]
    memory = {"title": "T", "date": "2026", "alt": "a", "consent": True, "upload_ids": [photo]}
    for who in ("michael", "mary"):
        h = auth(who)
        assert client.post(f"{API}/memories", headers=h, json=memory).status_code == 422
        assert client.post(f"{API}/stories", headers=h, json={"title": "T", "upload_id": audio, "duration": 5}).status_code == 422
        assert client.post(f"{API}/milestones", headers=h, json={"title": "T", "date": "2026", "upload_id": photo}).status_code == 422
        assert client.post(f"{API}/records/r1/attachments", headers=h, json={"upload_id": photo}).status_code == 422
        assert client.post(f"{API}/threads/c1/messages", headers=h, json={"upload_id": photo}).status_code == 422
    h = auth("james")
    m = client.post(f"{API}/memories", headers=h, json=memory)
    assert m.status_code == 201 and m.json()[0]["img"]
    # Others then see the photo through the memory, according to its visibility.
    seen = client.get(f"{API}/memories/{m.json()[0]['id']}", headers=auth("emma")).json()
    assert client.get(local(seen["img"])).content == PNG


def test_wrong_kind_for_the_item(client, auth):
    h = auth("james")
    audio = upload(client, h, WEBM, "audio/webm", "r.webm").json()["id"]
    photo = upload(client, h).json()["id"]
    assert client.post(f"{API}/memories", headers=h, json={"title": "T", "date": "2026", "alt": "a", "consent": True,
                                                           "upload_ids": [audio]}).status_code == 422
    assert client.post(f"{API}/stories", headers=h, json={"title": "T", "upload_id": photo, "duration": 5}).status_code == 422


def test_recording_studio_saves_audio_in_one_request(client, auth):
    r = client.post(f"{API}/stories/audio", headers=auth("james"), files={"file": ("rec.webm", WEBM, "audio/webm")},
                    data={"title": "Grandad's boat", "duration": "42", "visibility": "Only Me (private draft)", "prompt": "Tell us about the boat"})
    assert r.status_code == 201
    s = r.json()
    assert s["kind"] == "audio" and s["visibility"] == "Only Me (draft)" and s["duration"] == 42
    assert client.get(local(s["audio_url"])).content == WEBM
    bad = client.post(f"{API}/stories/audio", headers=auth("james"), files={"file": ("x.png", PNG, "image/png")},
                      data={"title": "x", "duration": "4"})
    assert bad.status_code == 415
