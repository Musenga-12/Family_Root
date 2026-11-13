"""/memories: photos and documents in the family archive. Every read respects the item's visibility."""
import random
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import field_validator
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import VISIBILITY, Memory, MemoryBase, MemoryFavorite, Person, User, now
from app.routers.uploads import family_upload, file_url
from app.visibility import Kin, can_see

router = APIRouter(prefix="/memories", tags=["memories"])
EDITORS = ("Admin", "Custodian", "Contributor")
MODERATORS = ("Admin", "Custodian")
DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
PALETTES = [("#7fa894", "#2a5140"), ("#b08a68", "#4a3626"), ("#8796b0", "#2f3b52")]  # same as AddMemoryDialog


class MemoryOut(MemoryBase):
    id: str
    tagged: list[str]
    owner: str | None
    upload_id: str | None
    img: str | None  # signed link to the image, or None for a placeholder card
    fav: bool = False
    can_edit: bool = False


def _check_visibility(v: str | None) -> str | None:
    if v is not None and v not in VISIBILITY:
        raise ValueError(f"must be one of: {', '.join(VISIBILITY)}")
    return v


def _check_date(v: str | None) -> str | None:
    if v is not None and not DATE_RE.match(v):
        raise ValueError("use YYYY, YYYY-MM or YYYY-MM-DD")
    return v


class MemoryCreate(MemoryBase):
    """Like the Add memory dialog: one memory per uploaded image (or a single card with no image).
    Leave out `visibility` to use the person's own default (Privacy: "Photos and memories")."""
    visibility: str | None = None
    tagged: list[str] = []
    upload_ids: list[str] = []
    consent: bool = False  # "Everyone pictured agreed to share this"; required unless visibility is Only Me

    _vis = field_validator("visibility")(_check_visibility)
    _date = field_validator("date")(_check_date)

    @field_validator("title", "alt")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("is required")
        return v.strip()


class MemoryUpdate(MemoryBase):
    title: str | None = None
    date: str | None = None
    approx: bool | None = None
    type: str | None = None
    visibility: str | None = None
    alt: str | None = None
    audio: bool | None = None
    tagged: list[str] | None = None
    consent: bool = False  # needed when widening an "Only Me" draft to the family

    _vis = field_validator("visibility")(_check_visibility)
    _date = field_validator("date")(_check_date)


# ---------- helpers ----------

def may_edit(user: User, m: Memory) -> bool:
    return m.owner_user_id == user.id or user.role in MODERATORS


def visible(user: User, kin: Kin, m: Memory) -> bool:
    return can_see(user, kin, m.visibility, m.owner_user_id, m.owner, m.tagged)


def get_memory(db: Session, user: User, mid: str, kin: Kin | None = None, include_deleted: bool = False) -> Memory:
    m = db.get(Memory, mid)
    if not m or m.family_id != user.family_id or (m.deleted_at and not include_deleted):
        raise HTTPException(404, "Memory not found")
    if not visible(user, kin or Kin(db, user.family_id), m):
        raise HTTPException(404, "Memory not found")  # 404, not 403: don't reveal that a private item exists
    return m


def fav_ids(db: Session, user: User) -> set[str]:
    return set(db.exec(select(MemoryFavorite.memory_id).where(MemoryFavorite.user_id == user.id)).all())


def out(user: User, m: Memory, favs: set[str]) -> MemoryOut:
    return MemoryOut(**m.model_dump(), img=file_url(m.upload_id), fav=m.id in favs, can_edit=may_edit(user, m))


def check_tagged(db: Session, user: User, ids: list[str], already: list[str] | None = None) -> list[str]:
    """Validate people tagged in a photo. Respects "Relatives can tag me" and, for minors, "A guardian approves new tags".
    Tags that were already there (`already`) are kept without asking again."""
    ids = list(dict.fromkeys(ids))  # drop duplicates, keep order
    found = set(db.exec(select(Person.id).where(Person.family_id == user.family_id, Person.id.in_(ids))).all()) if ids else set()
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(422, f"Unknown people: {', '.join(missing)}")
    kin = Kin(db, user.family_id)
    for pid in ids:
        if pid == user.person_id or pid in (already or []):
            continue
        name = kin.people[pid].first
        minor = kin.minor(pid)
        if minor and minor.guardian and user.person_id not in kin.guardians(pid):
            raise HTTPException(422, f"{name} is under 18: only a parent can tag them. Ask a parent, or leave them untagged.")
        if not kin.mine(pid, "tagging"):
            raise HTTPException(422, f"{name} has chosen not to be tagged in photos.")
    return ids


# ---------- routes ----------

@router.get("", response_model=list[MemoryOut])
def list_memories(
    type: str | None = None,
    tagged: str | None = Query(None, description="person id"),
    q: str | None = Query(None, description="search title, caption and place"),
    fav: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    stmt = select(Memory).where(Memory.family_id == user.family_id, Memory.deleted_at == None)  # noqa: E711
    if type:
        stmt = stmt.where(Memory.type == type)
    kin, favs = Kin(db, user.family_id), fav_ids(db, user)
    needle = (q or "").strip().lower()
    result = []
    for m in db.exec(stmt.order_by(Memory.date.desc())).all():
        if not visible(user, kin, m):
            continue
        if tagged and tagged not in m.tagged:
            continue
        if fav and m.id not in favs:
            continue
        if needle and needle not in " ".join(filter(None, [m.title, m.caption, m.place])).lower():
            continue
        result.append(out(user, m, favs))
    return result


@router.get("/{mid}", response_model=MemoryOut)
def read_memory(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return out(user, get_memory(db, user, mid), fav_ids(db, user))


@router.post("", response_model=list[MemoryOut], status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_memories(body: MemoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if body.visibility is None:
        body.visibility = Kin(db, user.family_id).category(user.person_id, "memories")
    if not body.consent and not body.visibility.startswith("Only"):
        raise HTTPException(422, "Confirm that everyone pictured agreed to share this, or keep it as Only Me (draft)")
    uploads = [family_upload(db, user, uid, kind="image") for uid in dict.fromkeys(body.upload_ids)]
    tagged = check_tagged(db, user, body.tagged) or ([user.person_id] if user.person_id else [])
    p1, p2 = (body.p1, body.p2) if body.p1 and body.p2 else random.choice(PALETTES)

    base = body.model_dump(exclude={"tagged", "upload_ids", "consent", "p1", "p2", "icon"})
    created = []
    for i, up in enumerate(uploads or [None]):
        title = f"{body.title} ({i + 1})" if len(uploads) > 1 else body.title
        m = Memory(**{**base, "title": title}, family_id=user.family_id, tagged=tagged, p1=p1, p2=p2,
                   icon=body.icon or "image", upload_id=up.id if up else None, owner=user.person_id, owner_user_id=user.id)
        db.add(m)
        created.append(m)
    db.commit()
    for m in created:
        db.refresh(m)
    return [out(user, m, set()) for m in created]


@router.patch("/{mid}", response_model=MemoryOut)
def update_memory(mid: str, body: MemoryUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_memory(db, user, mid)
    if not may_edit(user, m):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can change it")
    data = body.model_dump(exclude_unset=True, exclude={"consent"})
    if m.visibility.startswith("Only") and "visibility" in data and not data["visibility"].startswith("Only") and not body.consent:
        raise HTTPException(422, "Confirm consent before sharing a draft with the family")
    if "tagged" in data:
        data["tagged"] = check_tagged(db, user, data["tagged"], already=m.tagged)
    for k, v in data.items():
        setattr(m, k, v)
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m, fav_ids(db, user))


@router.delete("/{mid}", status_code=204)
def delete_memory(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_memory(db, user, mid)
    if not may_edit(user, m):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can remove it")
    m.deleted_at = now()
    db.add(m)
    db.commit()
    return Response(status_code=204)


@router.post("/{mid}/restore", response_model=MemoryOut)
def restore_memory(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Undo for a removal."""
    m = get_memory(db, user, mid, include_deleted=True)
    if not may_edit(user, m):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can restore it")
    m.deleted_at = None
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m, fav_ids(db, user))


@router.put("/{mid}/favorite", status_code=204)
def favorite(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_memory(db, user, mid)
    if not db.get(MemoryFavorite, (user.id, mid)):
        db.add(MemoryFavorite(user_id=user.id, memory_id=mid))
        db.commit()
    return Response(status_code=204)


@router.delete("/{mid}/favorite", status_code=204)
def unfavorite(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    fav = db.get(MemoryFavorite, (user.id, mid))
    if fav:
        db.delete(fav)
        db.commit()
    return Response(status_code=204)
