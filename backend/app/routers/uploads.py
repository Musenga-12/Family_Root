"""/uploads: store a photo or audio file, then attach it to a memory or story by its id.

Flow for the frontend:
  1. POST /uploads (multipart, field "file")  ->  { id, url, ... }
  2. POST /memories with upload_ids: [id]
Files are served by GET /uploads/{id}/file?token=..., using the signed `url` returned by the API.
"""
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import create_file_token, file_token_ok, get_current_user, require_role
from app.config import settings
from app.db import get_session
from app.models import Upload, User
from app.storage import storage

router = APIRouter(prefix="/uploads", tags=["uploads"])
CHUNK = 1024 * 1024

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
AUDIO_TYPES = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/x-wav": ".wav"}
DOC_TYPES = {"application/pdf": ".pdf"}  # scanned certificates and letters for the Legacy Archive


def _mp3(head: bytes) -> bool:
    return head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0)


# What the first bytes of each kind of file look like. The browser's Content-Type is only a claim; this makes sure
# a file stored as a photo really is one (the file is later served to everyone in the family under that type).
SIGNATURES = {
    "image/jpeg": lambda h: h[:3] == b"\xff\xd8\xff",
    "image/png": lambda h: h[:8] == b"\x89PNG\r\n\x1a\n",
    "image/gif": lambda h: h[:6] in (b"GIF87a", b"GIF89a"),
    "image/webp": lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP",
    "application/pdf": lambda h: h[:5] == b"%PDF-",
    "audio/webm": lambda h: h[:4] == b"\x1a\x45\xdf\xa3",
    "audio/ogg": lambda h: h[:4] == b"OggS",
    "audio/mpeg": _mp3,
    "audio/mp4": lambda h: h[4:8] == b"ftyp",
    "audio/wav": lambda h: h[:4] == b"RIFF" and h[8:12] == b"WAVE",
    "audio/x-wav": lambda h: h[:4] == b"RIFF" and h[8:12] == b"WAVE",
}


class UploadOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size: int
    url: str


def file_url(upload_id: str | None) -> str | None:
    """A link the browser can open directly, valid for FILE_LINK_MINUTES."""
    if not upload_id:
        return None
    return f"{settings.api_base_url}/api/v1/uploads/{upload_id}/file?token={create_file_token(upload_id)}"


def to_out(u: Upload) -> UploadOut:
    return UploadOut(id=u.id, filename=u.filename, content_type=u.content_type, size=u.size, url=file_url(u.id))


def family_upload(db: Session, user: User, upload_id: str, kind: str | None = None, own: bool = False) -> Upload:
    """An upload from the user's own family, optionally checked to be an image or audio. With `own`, it must be one
    this user uploaded: attaching someone else's file would show it to people its owner didn't choose."""
    u = db.get(Upload, upload_id)
    if not u or u.family_id != user.family_id:
        raise HTTPException(404, f"Upload {upload_id} not found")
    if own and u.owner_user_id != user.id:
        raise HTTPException(422, "You can only attach files you uploaded")
    if kind and not u.content_type.startswith(kind + "/"):
        raise HTTPException(422, f"Upload {upload_id} is not {kind}")
    return u


async def save_upload(file: UploadFile, user: User, db: Session, kind: str | None = None) -> Upload:
    """Validate and store one file; `kind` ("image" or "audio") restricts what is accepted. Commits the Upload row."""
    ctype = (file.content_type or "").split(";")[0].strip().lower()  # "audio/webm;codecs=opus" -> "audio/webm"
    if ctype in IMAGE_TYPES and kind in (None, "image"):
        ext, limit = IMAGE_TYPES[ctype], settings.max_image_mb
    elif ctype in AUDIO_TYPES and kind in (None, "audio"):
        ext, limit = AUDIO_TYPES[ctype], settings.max_audio_mb
    elif ctype in DOC_TYPES and kind is None:
        ext, limit = DOC_TYPES[ctype], settings.max_image_mb
    elif kind == "audio":
        raise HTTPException(415, "Recordings must be WebM, Ogg, MP3, M4A or WAV audio")
    else:
        raise HTTPException(415, "Only JPEG, PNG, WebP or GIF images, PDF scans and WebM, Ogg, MP3, M4A or WAV audio can be uploaded")

    u = Upload(family_id=user.family_id, owner_user_id=user.id, filename=Path(file.filename or "file").name,
               content_type=ctype, size=0, path="")
    rel = f"{user.family_id}/{u.id}{ext}"
    # Read in chunks (kept in memory up to a few MB, then a temporary file) and stop as soon as the file is too big.
    size = 0
    with tempfile.SpooledTemporaryFile(max_size=8 * CHUNK) as buf:
        while chunk := await file.read(CHUNK):
            if size == 0 and not SIGNATURES[ctype](chunk):
                raise HTTPException(415, "This file's contents don't match its type. Choose the original photo, scan or recording.")
            size += len(chunk)
            if size > limit * CHUNK:
                raise HTTPException(413, f"File is larger than {limit} MB")
            buf.write(chunk)
        if size == 0:
            raise HTTPException(422, "The file is empty")
        buf.seek(0)
        await run_in_threadpool(storage.put, rel, buf, ctype)  # a remote store can take a moment
    try:
        u.size, u.path = size, rel
        db.add(u)
        db.commit()
    except BaseException:
        storage.delete(rel)  # never leave a stored file without its row
        raise
    db.refresh(u)
    return u


@router.post("", response_model=UploadOut, status_code=201,
             dependencies=[Depends(require_role("Admin", "Custodian", "Contributor"))])
async def upload_file(file: UploadFile, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return to_out(await save_upload(file, user, db))


@router.get("/{upload_id}", response_model=UploadOut)
def upload_info(upload_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Your own uploads. Everyone else gets a file's link with the memory, story or message it belongs to, so the
    item's visibility decides who can open it."""
    u = db.get(Upload, upload_id)
    if not u or u.family_id != user.family_id or u.owner_user_id != user.id:
        raise HTTPException(404, f"Upload {upload_id} not found")
    return to_out(u)


@router.get("/{upload_id}/file", include_in_schema=True)
def download(upload_id: str, token: str = Query(...), db: Session = Depends(get_session)):
    if not file_token_ok(token, upload_id):
        raise HTTPException(403, "This file link has expired. Reload the page to get a new one.")
    u = db.get(Upload, upload_id)
    if not u:
        raise HTTPException(404, "File not found")
    return storage.response(u.path, u.content_type, u.filename)
