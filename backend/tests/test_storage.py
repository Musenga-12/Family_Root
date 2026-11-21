"""Uploaded files in a private Supabase Storage bucket (STORAGE=supabase), checked against a stand-in for Supabase."""
import asyncio
import io

import httpx
import pytest
from fastapi import HTTPException

from app.storage import LocalStorage, SupabaseStorage


class FakeSupabase:
    """Just enough of Supabase Storage's REST API: upload, download, delete, with the service key required."""

    def __init__(self):
        self.files: dict[str, tuple[bytes, str]] = {}
        self.ranges: list[str | None] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("authorization") != "Bearer service-key":
            return httpx.Response(403, json={"error": "unauthorized"})
        prefix = "/storage/v1/object/family-files/"
        assert request.url.path.startswith(prefix)
        key = request.url.path[len(prefix):]
        if request.method == "POST":
            if key in self.files:
                return httpx.Response(409, json={"error": "exists"})
            self.files[key] = (request.content, request.headers["content-type"])
            return httpx.Response(200, json={"Key": key})
        if request.method == "GET":
            if key not in self.files:
                return httpx.Response(400, json={"error": "not found"})
            data, rng = self.files[key][0], request.headers.get("range")
            self.ranges.append(rng)
            if rng:  # "bytes=start-end" or "bytes=start-", as browsers send for <audio>
                start, _, end = rng.removeprefix("bytes=").partition("-")
                start, end = int(start), int(end) if end else len(data) - 1
                if start >= len(data):
                    return httpx.Response(416, headers={"Content-Range": f"bytes */{len(data)}"})
                return httpx.Response(206, content=data[start:end + 1], headers={"Content-Range": f"bytes {start}-{end}/{len(data)}"})
            return httpx.Response(200, content=data)
        if request.method == "DELETE":
            self.files.pop(key, None)
            return httpx.Response(200, json={})
        return httpx.Response(405)


def make(fake, key="service-key"):
    return SupabaseStorage("https://proj.supabase.co/", key, "family-files", transport=httpx.MockTransport(fake))


def test_supabase_storage_round_trip():
    fake = FakeSupabase()
    store = make(fake)
    store.put("3/u1.png", io.BytesIO(b"\x89PNG data"), "image/png")
    assert fake.files["3/u1.png"] == (b"\x89PNG data", "image/png")
    r = store.response("3/u1.png", "image/png", "Grandma's garden.png")
    assert body(r) == b"\x89PNG data"
    assert r.media_type == "image/png"
    assert r.headers["cache-control"].startswith("private")
    assert "Grandma%27s%20garden.png" in r.headers["content-disposition"]
    store.delete("3/u1.png")
    assert "3/u1.png" not in fake.files


def body(response) -> bytes:
    """Everything a streamed response sends."""
    async def collect():
        return b"".join([chunk async for chunk in response.body_iterator])
    return asyncio.run(collect())


def test_supabase_files_stream_and_allow_seeking():
    """Recordings are played from the middle with Range requests, as local storage allows (FileResponse)."""
    fake = FakeSupabase()
    store = make(fake)
    store.put("3/u1.webm", io.BytesIO(b"0123456789"), "audio/webm")
    whole = store.response("3/u1.webm", "audio/webm", "voice.webm")
    assert whole.status_code == 200 and whole.headers["accept-ranges"] == "bytes" and body(whole) == b"0123456789"
    part = store.response("3/u1.webm", "audio/webm", "voice.webm", "bytes=4-")
    assert part.status_code == 206 and part.headers["content-range"] == "bytes 4-9/10" and body(part) == b"456789"
    assert fake.ranges == [None, "bytes=4-"]  # the browser's Range went along to Supabase
    past = store.response("3/u1.webm", "audio/webm", "voice.webm", "bytes=50-")
    assert past.status_code == 416 and past.headers["content-range"] == "bytes */10"


def test_an_unavailable_store_is_a_502_not_a_crash():
    store = SupabaseStorage("https://proj.supabase.co/", "service-key", "family-files",
                            transport=httpx.MockTransport(lambda request: httpx.Response(503)))
    with pytest.raises(HTTPException) as e:
        store.response("3/u1.png", "image/png", "x.png")
    assert e.value.status_code == 502


def test_missing_file_is_a_404():
    with pytest.raises(HTTPException) as e:
        make(FakeSupabase()).response("3/nothing.png", "image/png", "x.png")
    assert e.value.status_code == 404


def test_a_refused_upload_is_reported_not_ignored():
    with pytest.raises(HTTPException) as e:
        make(FakeSupabase(), key="wrong-key").put("3/u2.png", io.BytesIO(b"x"), "image/png")
    assert e.value.status_code == 502


def test_local_storage_round_trip(tmp_path):
    store = LocalStorage(tmp_path)
    store.put("3/u1.webm", io.BytesIO(b"\x1a\x45\xdf\xa3 audio"), "audio/webm")
    assert (tmp_path / "3" / "u1.webm").read_bytes().startswith(b"\x1a\x45")
    assert store.response("3/u1.webm", "audio/webm", "voice.webm").status_code == 200
    store.delete("3/u1.webm")
    with pytest.raises(HTTPException):
        store.response("3/u1.webm", "audio/webm", "voice.webm")


def test_through_the_api_a_recording_in_supabase_can_be_played_from_the_middle(client, auth, monkeypatch):
    """The whole path in production: upload → signed link → Range request → 206 from the private bucket."""
    import app.routers.uploads as uploads
    from helpers import WEBM, local, upload

    fake = FakeSupabase()
    monkeypatch.setattr(uploads, "storage", make(fake))
    up = upload(client, auth("james"), WEBM, "audio/webm", "voice.webm").json()
    [key] = fake.files  # exactly one object in the bucket: <family id>/<upload id>.webm
    folder, name = key.split("/")
    assert folder.isdigit() and name == f"{up['id']}.webm"
    r = client.get(local(up["url"]), headers={"Range": "bytes=4-"})
    assert r.status_code == 206 and r.content == WEBM[4:]
    assert r.headers["content-range"] == f"bytes 4-{len(WEBM) - 1}/{len(WEBM)}"
    assert r.headers["cache-control"].startswith("private")
    # The signed link is for this one file: it opens nothing else, and a wrong token opens nothing.
    assert client.get(local(up["url"]).replace("token=", "token=x")).status_code == 403
