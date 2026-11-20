"""Uploaded files in a private Supabase Storage bucket (STORAGE=supabase), checked against a stand-in for Supabase."""
import io

import httpx
import pytest
from fastapi import HTTPException

from app.storage import LocalStorage, SupabaseStorage


class FakeSupabase:
    """Just enough of Supabase Storage's REST API: upload, download, delete, with the service key required."""

    def __init__(self):
        self.files: dict[str, tuple[bytes, str]] = {}

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
            return httpx.Response(200, content=self.files[key][0]) if key in self.files else httpx.Response(400, json={"error": "not found"})
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
    assert r.body == b"\x89PNG data"
    assert r.media_type == "image/png"
    assert r.headers["cache-control"].startswith("private")
    assert "Grandma%27s%20garden.png" in r.headers["content-disposition"]
    store.delete("3/u1.png")
    assert "3/u1.png" not in fake.files


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
