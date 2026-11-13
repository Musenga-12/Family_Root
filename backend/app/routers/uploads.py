"""/uploads: store a photo or audio file, then attach it to a memory or story by its id.

Flow for the frontend:
  1. POST /uploads (multipart, field "file")  ->  { id, url, ... }
  2. POST /memories with upload_ids: [id]
Files are served by GET /uploads/{id}/file?token=..., using the signed `url` returned by the API.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import create_file_token, file_token_ok, get_current_user, require_role
from app.config import settings
from app.db import get_session
from app.models import Upload, User

router = APIRouter(prefix="/uploads", tags=["uploads"])
UPLOAD_ROOT = Path(settings.upload_dir).resolve()
CHUNK = 1024 * 1024

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
AUDIO_TYPES = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/x-wav": ".wav"}


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


def family_upload(db: Session, user: User, upload_id: str, kind: str | None = None) -> Upload:
    """An upload from the user's own family, optionally checked to be an image or audio."""
    u = db.get(Upload, upload_id)
    if not u or u.family_id != user.family_id:
        raise HTTPException(404, f"Upload {upload_id} not found")
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
    elif kind == "audio":
        raise HTTPException(415, "Recordings must be WebM, Ogg, MP3, M4A or WAV audio")
    else:
        raise HTTPException(415, "Only JPEG, PNG, WebP or GIF images and WebM, Ogg, MP3, M4A or WAV audio can be uploaded")

    u = Upload(family_id=user.family_id, owner_user_id=user.id, filename=Path(file.filename or "file").name,
               content_type=ctype, size=0, path="")
    rel = Path(str(user.family_id)) / f"{u.id}{ext}"
    dest = UPLOAD_ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Stream to disk in chunks and stop as soon as the file is too big.
    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit * CHUNK:
                    raise HTTPException(413, f"File is larger than {limit} MB")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(422, "The file is empty")

    u.size, u.path = size, rel.as_posix()
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.post("", response_model=UploadOut, status_code=201,
             dependencies=[Depends(require_role("Admin", "Custodian", "Contributor"))])
async def upload_file(file: UploadFile, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return to_out(await save_upload(file, user, db))


@router.get("/{upload_id}", response_model=UploadOut)
def upload_info(upload_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return to_out(family_upload(db, user, upload_id))


@router.get("/{upload_id}/file", include_in_schema=True)
def download(upload_id: str, token: str = Query(...), db: Session = Depends(get_session)):
    if not file_token_ok(token, upload_id):
        raise HTTPException(403, "This file link has expired. Reload the page to get a new one.")
    u = db.get(Upload, upload_id)
    path = (UPLOAD_ROOT / u.path) if u else None
    if not path or not path.is_file():
        raise HTTPException(404, "File not found")
    # Private family files: browsers may cache them, shared caches may not.
    return FileResponse(path, media_type=u.content_type, filename=u.filename, content_disposition_type="inline",
                        headers={"Cache-Control": "private, max-age=3600"})
