"""/records: the Legacy Archive (certificates, wills and legal papers, letters, sealed time capsules).

Two rules the browser can't enforce on its own:
- A sealed time capsule's text and source are never sent before its opening date, except to the person who wrote it.
- A record is verified by someone other than the person who added it (a second pair of eyes).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import RECORD_CATEGORIES, VISIBILITY, LegacyRecord, Person, RecordBase, User, now
from app.routers.memories import DATE_RE
from app.visibility import Kin, can_see

router = APIRouter(prefix="/records", tags=["legacy"])
EDITORS = ("Admin", "Custodian", "Contributor")
MODERATORS = ("Admin", "Custodian")
SORTS = {"newest": (LegacyRecord.date.desc(),), "oldest": (LegacyRecord.date,), "title": (LegacyRecord.title,)}


def _category(v):
    if v is not None and v not in RECORD_CATEGORIES:
        raise ValueError(f"must be one of: {', '.join(RECORD_CATEGORIES)}")
    return v


def _date(v):
    if v is not None and not DATE_RE.match(v):
        raise ValueError("use YYYY, YYYY-MM or YYYY-MM-DD")
    return v


def _vis(v):
    if v is not None and v not in VISIBILITY:
        raise ValueError(f"must be one of: {', '.join(VISIBILITY)}")
    return v


def _seal(v):
    if v is None:
        return v
    try:
        d = date.fromisoformat(v)
    except ValueError:
        raise ValueError("use YYYY-MM-DD")
    if d <= date.today():
        raise ValueError("the opening date must be in the future")
    return v


class RecordOut(RecordBase):
    id: str
    icon: str
    status: str
    sealed: bool  # true while the capsule is closed; text and source are then empty for everyone but its author
    can_edit: bool
    can_verify: bool


class RecordCreate(RecordBase):
    _c = field_validator("category")(_category)
    _d = field_validator("date")(_date)
    _v = field_validator("visibility")(_vis)
    _s = field_validator("sealedUntil")(_seal)

    @field_validator("title", "text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("is required")
        return v.strip()

    model_config = {"json_schema_extra": {"examples": [{
        "title": "Letter from Robert, 1958", "category": "Letters", "date": "1958-04",
        "text": "Dear Margaret, the crossing was rough but we are all well...", "source": "Shoebox in the attic",
        "visibility": "All Family Branches"
    }]}}


class RecordUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    date: str | None = None
    approx: bool | None = None
    custodian: str | None = None
    source: str | None = None
    text: str | None = None
    visibility: str | None = None
    sealedUntil: str | None = None

    _c = field_validator("category")(_category)
    _d = field_validator("date")(_date)
    _v = field_validator("visibility")(_vis)
    _s = field_validator("sealedUntil")(_seal)

    model_config = {"json_schema_extra": {"examples": [{"source": "National Records of Scotland #ED-2016-8932"}]}}


def is_sealed(r: LegacyRecord) -> bool:
    return bool(r.sealedUntil) and r.sealedUntil > date.today().isoformat()


def is_author(user: User, r: LegacyRecord) -> bool:
    return r.owner_user_id is not None and r.owner_user_id == user.id


def may_edit(user: User, r: LegacyRecord) -> bool:
    if is_sealed(r):
        return is_author(user, r)  # nobody else may change what they can't read
    return is_author(user, r) or user.role in MODERATORS


def may_verify(user: User, r: LegacyRecord) -> bool:
    return user.role in MODERATORS and not is_author(user, r) and not is_sealed(r) and r.status != "verified"


def visible(user: User, kin: Kin, r: LegacyRecord) -> bool:
    return can_see(user, kin, r.visibility, r.owner_user_id, r.custodian, [r.custodian] if r.custodian else [])


def out(user: User, r: LegacyRecord) -> RecordOut:
    sealed = is_sealed(r)
    data = r.model_dump()
    if sealed and not is_author(user, r):
        data["text"], data["source"] = "", None
    return RecordOut(**data, sealed=sealed, can_edit=may_edit(user, r), can_verify=may_verify(user, r))


def get_record(db: Session, user: User, rid: str, include_deleted: bool = False) -> LegacyRecord:
    r = db.get(LegacyRecord, rid)
    if not r or r.family_id != user.family_id or (r.deleted_at and not include_deleted) \
            or not visible(user, Kin(db, user.family_id), r):
        raise HTTPException(404, "Record not found")
    return r


def check_custodian(db: Session, user: User, pid: str | None) -> str | None:
    if pid is None:
        return None
    p = db.get(Person, pid)
    if not p or p.family_id != user.family_id:
        raise HTTPException(422, f"Unknown custodian: {pid}")
    return pid


@router.get("", response_model=list[RecordOut])
def list_records(
    category: str | None = None,
    status: str | None = Query(None, description="review or verified"),
    sealed: bool | None = None,
    q: str | None = None,
    sort: str = Query("newest", description="newest, oldest or title"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    if sort not in SORTS:
        raise HTTPException(422, f"sort must be one of: {', '.join(SORTS)}")
    stmt = select(LegacyRecord).where(LegacyRecord.family_id == user.family_id, LegacyRecord.deleted_at == None)  # noqa: E711
    if category:
        stmt = stmt.where(LegacyRecord.category == category)
    if status:
        stmt = stmt.where(LegacyRecord.status == status)
    kin = Kin(db, user.family_id)
    needle = (q or "").strip().lower()
    result = []
    for r in db.exec(stmt.order_by(*SORTS[sort])).all():
        if not visible(user, kin, r) or (sealed is not None and is_sealed(r) != sealed):
            continue
        o = out(user, r)
        if needle and needle not in f"{o.title} {o.text} {o.source or ''}".lower():  # sealed text is never searched
            continue
        result.append(o)
    return result


@router.get("/{rid}", response_model=RecordOut)
def read_record(rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return out(user, get_record(db, user, rid))


@router.post("", response_model=RecordOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_record(body: RecordCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """New records start "awaiting review". Setting sealedUntil makes it a time capsule."""
    category = "Time capsules" if body.sealedUntil else body.category
    r = LegacyRecord(**body.model_dump(exclude={"category", "custodian"}), category=category, icon=RECORD_CATEGORIES[category],
                     custodian=check_custodian(db, user, body.custodian or user.person_id),
                     family_id=user.family_id, owner_user_id=user.id, status="review")
    db.add(r)
    db.commit()
    db.refresh(r)
    return out(user, r)


@router.patch("/{rid}", response_model=RecordOut)
def update_record(rid: str, body: RecordUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    r = get_record(db, user, rid)
    if not may_edit(user, r):
        raise HTTPException(403, "A sealed capsule can only be changed by its author" if is_sealed(r)
                            else "Only the person who added this, an Admin or a Custodian can change it")
    data = body.model_dump(exclude_unset=True)
    if "custodian" in data:
        check_custodian(db, user, data["custodian"])
    if "text" in data and not (data["text"] or "").strip():
        raise HTTPException(422, "The record text can't be empty")
    if "sealedUntil" in data:
        data["category"] = "Time capsules" if data["sealedUntil"] else data.get("category", r.category)
    if "category" in data:
        r.icon = RECORD_CATEGORIES[data["category"]]
    if {"text", "date", "approx", "source"} & data.keys():
        r.status, r.verified_by = "review", None  # changed facts need checking again
    for k, v in data.items():
        setattr(r, k, v.strip() if isinstance(v, str) else v)
    db.add(r)
    db.commit()
    db.refresh(r)
    return out(user, r)


@router.post("/{rid}/verify", response_model=RecordOut, dependencies=[Depends(require_role(*MODERATORS))])
def verify_record(rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    r = get_record(db, user, rid)
    if is_author(user, r):
        raise HTTPException(403, "Someone other than the person who added it needs to verify this record")
    if is_sealed(r):
        raise HTTPException(422, "A sealed capsule can't be checked until it opens")
    r.status, r.verified_by = "verified", user.id
    db.add(r)
    db.commit()
    db.refresh(r)
    return out(user, r)


@router.delete("/{rid}", status_code=204)
def delete_record(rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    r = get_record(db, user, rid)
    if not (is_author(user, r) or user.role in MODERATORS):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can remove it")
    r.deleted_at = now()
    db.add(r)
    db.commit()
    return Response(status_code=204)


@router.post("/{rid}/restore", response_model=RecordOut)
def restore_record(rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    r = get_record(db, user, rid, include_deleted=True)
    if not (is_author(user, r) or user.role in MODERATORS):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can restore it")
    r.deleted_at = None
    db.add(r)
    db.commit()
    db.refresh(r)
    return out(user, r)
