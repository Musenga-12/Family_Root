"""/albums: named collections of memories. An album only shows the memories the viewer is allowed to see."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import Album, AlbumBase, Memory, User
from app.routers.uploads import file_url
from app.visibility import Kin, can_see

router = APIRouter(prefix="/albums", tags=["albums"])
EDITORS = ("Admin", "Custodian", "Contributor")


class AlbumOut(AlbumBase):
    id: str
    items: list[str]  # memory ids the viewer can see, in album order
    count: int
    cover: str | None  # image link of the first item that has one


class AlbumCreate(AlbumBase):
    items: list[str] = []

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("is required")
        return v.strip()


class AlbumUpdate(AlbumBase):
    title: str | None = None


class ItemsIn(BaseModel):
    items: list[str]


def get_album(db: Session, user: User, aid: str) -> Album:
    a = db.get(Album, aid)
    if not a or a.family_id != user.family_id:
        raise HTTPException(404, "Album not found")
    return a


def check_items(db: Session, user: User, ids: list[str]) -> list[str]:
    ids = list(dict.fromkeys(ids))
    rows = db.exec(select(Memory).where(Memory.family_id == user.family_id, Memory.id.in_(ids))).all() if ids else []
    kin = Kin(db, user.family_id)
    ok = {m.id for m in rows if not m.deleted_at and can_see(user, kin, m.visibility, m.owner_user_id, m.owner, m.tagged)}
    missing = [i for i in ids if i not in ok]
    if missing:
        raise HTTPException(422, f"Unknown memories: {', '.join(missing)}")
    return ids


def out_many(db: Session, user: User, albums: list[Album]) -> list[AlbumOut]:
    ids = {i for a in albums for i in a.items}
    mems = {m.id: m for m in db.exec(select(Memory).where(Memory.id.in_(ids))).all()} if ids else {}
    kin = Kin(db, user.family_id)
    result = []
    for a in albums:
        shown = [mems[i] for i in a.items if i in mems and not mems[i].deleted_at
                 and can_see(user, kin, mems[i].visibility, mems[i].owner_user_id, mems[i].owner, mems[i].tagged)]
        cover = next((m.upload_id for m in shown if m.upload_id), None)
        result.append(AlbumOut(**a.model_dump(exclude={"items"}), items=[m.id for m in shown], count=len(shown), cover=file_url(cover)))
    return result


@router.get("", response_model=list[AlbumOut])
def list_albums(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    albums = db.exec(select(Album).where(Album.family_id == user.family_id).order_by(Album.created_at.desc())).all()
    return out_many(db, user, list(albums))


@router.get("/{aid}", response_model=AlbumOut)
def read_album(aid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return out_many(db, user, [get_album(db, user, aid)])[0]


@router.post("", response_model=AlbumOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_album(body: AlbumCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    a = Album(**body.model_dump(exclude={"items"}), items=check_items(db, user, body.items), family_id=user.family_id)
    a.p1, a.p2 = a.p1 or "#7fa894", a.p2 or "#2a5140"
    db.add(a)
    db.commit()
    db.refresh(a)
    return out_many(db, user, [a])[0]


@router.patch("/{aid}", response_model=AlbumOut, dependencies=[Depends(require_role(*EDITORS))])
def update_album(aid: str, body: AlbumUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    a = get_album(db, user, aid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    db.add(a)
    db.commit()
    db.refresh(a)
    return out_many(db, user, [a])[0]


@router.put("/{aid}/items", response_model=AlbumOut, dependencies=[Depends(require_role(*EDITORS))])
def set_items(aid: str, body: ItemsIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Replace the album's contents (the "Edit album" picker). Items this user can't see are kept, so editing
    an album never silently drops someone else's private memory."""
    a = get_album(db, user, aid)
    new = check_items(db, user, body.items)
    kin = Kin(db, user.family_id)
    hidden = [i for i in a.items if (m := db.get(Memory, i)) and not can_see(user, kin, m.visibility, m.owner_user_id, m.owner, m.tagged)]
    a.items = new + [i for i in hidden if i not in new]
    db.add(a)
    db.commit()
    db.refresh(a)
    return out_many(db, user, [a])[0]


@router.delete("/{aid}", status_code=204, dependencies=[Depends(require_role("Admin", "Custodian"))])
def delete_album(aid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Deletes the album only; its memories stay in the archive."""
    db.delete(get_album(db, user, aid))
    db.commit()
    return Response(status_code=204)
