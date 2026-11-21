"""Where uploaded files (photos, recordings, scans) are kept.

STORAGE=local     (default) a folder on this server's disk, UPLOAD_DIR. Fine on your own computer or a server with a
                  persistent disk; many hosts wipe the disk on every deploy, which would lose every family's photos.
STORAGE=supabase  a *private* Supabase Storage bucket (SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET). Files never
                  get public links: the API checks the signed file link (GET /uploads/{id}/file) and then passes the
                  file on, exactly as with local storage.
"""
import shutil
from urllib.parse import quote
from pathlib import Path
from typing import BinaryIO, Protocol

import httpx
from fastapi import HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

from app.config import settings

# Private family files: browsers may cache them, shared caches may not.
FILE_HEADERS = {"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"}


class Storage(Protocol):
    def put(self, rel: str, data: BinaryIO, content_type: str) -> None: ...
    def delete(self, rel: str) -> None: ...
    def response(self, rel: str, content_type: str, filename: str, byte_range: str | None = None) -> Response: ...


class LocalStorage:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()

    def put(self, rel: str, data: BinaryIO, content_type: str) -> None:
        dest = self.root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as out:
            shutil.copyfileobj(data, out)

    def delete(self, rel: str) -> None:
        (self.root / rel).unlink(missing_ok=True)

    def response(self, rel: str, content_type: str, filename: str, byte_range: str | None = None) -> Response:
        # FileResponse answers Range requests itself (from the request), so byte_range isn't needed here.
        path = self.root / rel
        if not path.is_file():
            raise HTTPException(404, "File not found")
        return FileResponse(path, media_type=content_type, filename=filename, content_disposition_type="inline", headers=FILE_HEADERS)


class SupabaseStorage:
    """Supabase Storage's REST API with the service key (kept on the server only; the bucket stays private)."""

    def __init__(self, url: str, key: str, bucket: str, transport: httpx.BaseTransport | None = None):
        self.base = f"{url.rstrip('/')}/storage/v1/object/{bucket}"
        self.client = httpx.Client(headers={"Authorization": f"Bearer {key}", "apikey": key}, timeout=60, transport=transport)

    def put(self, rel: str, data: BinaryIO, content_type: str) -> None:
        r = self.client.post(f"{self.base}/{rel}", content=data.read(), headers={"Content-Type": content_type, "x-upsert": "false"})
        if r.status_code >= 300:
            raise HTTPException(502, "The file couldn't be stored right now. Please try again.")

    def delete(self, rel: str) -> None:
        self.client.delete(f"{self.base}/{rel}")

    def response(self, rel: str, content_type: str, filename: str, byte_range: str | None = None) -> Response:
        """Passed on as it arrives, never held whole in the server's memory (recordings can be 50 MB). The browser's
        Range header goes along, so a recording can be played from the middle (seeking) as with local storage."""
        r = self.client.send(self.client.build_request("GET", f"{self.base}/{rel}",
                                                       headers={"Range": byte_range} if byte_range else {}), stream=True)
        if r.status_code in (200, 206):
            headers = {**FILE_HEADERS, "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}", "Accept-Ranges": "bytes"}
            for name in ("Content-Length", "Content-Range"):
                if name in r.headers:
                    headers[name] = r.headers[name]
            return StreamingResponse(r.iter_bytes(), status_code=r.status_code, media_type=content_type, headers=headers,
                                     background=BackgroundTask(r.close))
        r.close()
        if r.status_code == 416:  # a range past the end of the file
            return Response(status_code=416, headers={"Content-Range": r.headers.get("Content-Range", "bytes */*")})
        if r.status_code in (400, 404):
            raise HTTPException(404, "File not found")
        raise HTTPException(502, "The file couldn't be loaded right now. Please try again.")


def make_storage() -> Storage:
    if settings.storage.strip().lower() == "supabase":
        return SupabaseStorage(settings.supabase_url, settings.supabase_service_key, settings.supabase_bucket)
    return LocalStorage(settings.upload_dir)


storage: Storage = make_storage()
