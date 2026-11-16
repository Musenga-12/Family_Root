"""/milestones: the family timeline (births, weddings, journeys, memorials and other milestones)."""
import random

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import MILESTONE_TYPES, Milestone, MilestoneBase, User, now
from app.routers.memories import DATE_RE, PALETTES, check_tagged
from app.routers.uploads import family_upload, file_url

router = APIRouter(prefix="/milestones", tags=["timeline"])
EDITORS = ("Admin", "Custodian", "Contributor")
MODERATORS = ("Admin", "Custodian")


def _type(v: str | None) -> str | None:
    if v is not None and v not in MILESTONE_TYPES:
        raise ValueError(f"must be one of: {', '.join(MILESTONE_TYPES)}")
    return v


def _date(v: str | None) -> str | None:
    if v is not None and not DATE_RE.match(v):
        raise ValueError("use YYYY, YYYY-MM or YYYY-MM-DD")
    return v


class MilestoneOut(MilestoneBase):
    id: str
    icon: str
    people: list[str]
    upload_id: str | None
    img: str | None
    hasPhoto: bool  # the frontend's name for "show a picture"
    p1: str | None
    p2: str | None
    can_edit: bool


class MilestoneCreate(MilestoneBase):
    people: list[str] = []
    upload_id: str | None = None

    _t = field_validator("type")(_type)
    _d = field_validator("date")(_date)

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("is required")
        return v.strip()

    model_config = {"json_schema_extra": {"examples": [{
        "type": "Milestones", "title": "Mary retires from teaching", "date": "2026-07-01", "place": "Edinburgh",
        "text": "Forty years at the same school.", "people": ["mary"]
    }]}}


class MilestoneUpdate(BaseModel):
    type: str | None = None
    title: str | None = None
    date: str | None = None
    approx: bool | None = None
    source: str | None = None
    place: str | None = None
    text: str | None = None
    people: list[str] | None = None
    upload_id: str | None = None

    _t = field_validator("type")(_type)
    _d = field_validator("date")(_date)

    model_config = {"json_schema_extra": {"examples": [{"text": "Forty-one years at the same school, as it turns out."}]}}


def may_edit(user: User, m: Milestone) -> bool:
    return m.owner_user_id == user.id or user.role in MODERATORS


def get_milestone(db: Session, user: User, mid: str, include_deleted: bool = False) -> Milestone:
    m = db.get(Milestone, mid)
    if not m or m.family_id != user.family_id or (m.deleted_at and not include_deleted):
        raise HTTPException(404, "Milestone not found")
    return m


def out(user: User, m: Milestone) -> MilestoneOut:
    return MilestoneOut(**m.model_dump(), img=file_url(m.upload_id), hasPhoto=bool(m.upload_id or m.p1),
                        can_edit=may_edit(user, m))


@router.get("", response_model=list[MilestoneOut])
def list_milestones(
    type: str | None = None,
    person: str | None = Query(None, description="person id"),
    from_year: int | None = None,
    to_year: int | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Newest first. `from_year`/`to_year` match the Timeline's era filter."""
    stmt = select(Milestone).where(Milestone.family_id == user.family_id, Milestone.deleted_at == None)  # noqa: E711
    if type:
        stmt = stmt.where(Milestone.type == type)
    if from_year is not None:
        stmt = stmt.where(Milestone.date >= f"{from_year:04d}")
    if to_year is not None:
        stmt = stmt.where(Milestone.date < f"{to_year + 1:04d}")
    needle = (q or "").strip().lower()
    rows = []
    for m in db.exec(stmt.order_by(Milestone.date.desc())).all():
        if person and person not in m.people:
            continue
        if needle and needle not in f"{m.title} {m.text} {m.place or ''}".lower():
            continue
        rows.append(out(user, m))
    return rows


@router.get("/{mid}", response_model=MilestoneOut)
def read_milestone(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return out(user, get_milestone(db, user, mid))


@router.post("", response_model=MilestoneOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_milestone(body: MilestoneCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if body.upload_id:
        family_upload(db, user, body.upload_id, kind="image")
    m = Milestone(**body.model_dump(exclude={"people", "verified"}), family_id=user.family_id,
                  icon=MILESTONE_TYPES[body.type], people=check_tagged(db, user, body.people),
                  # A curator's confirmed date counts as verified; a contributor's waits for review.
                  verified=not body.approx and user.role in MODERATORS, owner_user_id=user.id)
    if m.upload_id:
        m.p1, m.p2 = random.choice(PALETTES)
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m)


@router.patch("/{mid}", response_model=MilestoneOut)
def update_milestone(mid: str, body: MilestoneUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_milestone(db, user, mid)
    if not may_edit(user, m):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can change it")
    data = body.model_dump(exclude_unset=True)
    if "people" in data:
        data["people"] = check_tagged(db, user, data["people"])
    if data.get("upload_id"):
        family_upload(db, user, data["upload_id"], kind="image")
    if "type" in data:
        m.icon = MILESTONE_TYPES[data["type"]]
    if {"date", "approx", "source"} & data.keys() and user.role not in MODERATORS:
        m.verified = False  # changing the facts needs a curator to check them again
    for k, v in data.items():
        setattr(m, k, v)
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m)


@router.post("/{mid}/verify", response_model=MilestoneOut, dependencies=[Depends(require_role(*MODERATORS))])
def verify_milestone(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Confirm the date against a record. An estimated date can't be verified until it is exact."""
    m = get_milestone(db, user, mid)
    if m.approx:
        raise HTTPException(422, "Set the exact date (approx: false) before verifying")
    m.verified = True
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m)


@router.post("/{mid}/reopen", response_model=MilestoneOut, dependencies=[Depends(require_role(*MODERATORS))])
def reopen_milestone(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Undo "verified": the date shows as reported again until it is checked."""
    m = get_milestone(db, user, mid)
    m.verified = False
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m)


@router.delete("/{mid}", status_code=204)
def delete_milestone(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_milestone(db, user, mid)
    if not may_edit(user, m):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can remove it")
    m.deleted_at = now()
    db.add(m)
    db.commit()
    return Response(status_code=204)


@router.post("/{mid}/restore", response_model=MilestoneOut)
def restore_milestone(mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_milestone(db, user, mid, include_deleted=True)
    if not may_edit(user, m):
        raise HTTPException(403, "Only the person who added this, an Admin or a Custodian can restore it")
    m.deleted_at = None
    db.add(m)
    db.commit()
    db.refresh(m)
    return out(user, m)
