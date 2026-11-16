"""Corrections to someone's tree profile ("Suggest a correction"). Anyone in the family can suggest one, Viewers
included; Admins and Custodians are notified, make the change with PATCH /people/{id}, then close the suggestion."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import SUGGESTION_FIELDS, Person, Suggestion, User, iso, now
from app.routers.notifications import family_users, notify

router = APIRouter(tags=["people"])
MODERATORS = ("Admin", "Custodian")


class SuggestionIn(BaseModel):
    field: str = "Other"  # Birth date | Birth place | Relationship | Occupation | Other
    value: str = Field(min_length=1, max_length=500)
    source: str | None = Field(None, max_length=300)

    model_config = {"json_schema_extra": {"examples": [{
        "field": "Birth place", "value": "Born in Perth, not Stirling", "source": "Birth certificate, 1942"}]}}


class DecisionIn(BaseModel):
    status: Literal["accepted", "dismissed", "open"]  # "open" puts it back (Undo)

    model_config = {"json_schema_extra": {"examples": [{"status": "accepted"}]}}


class SuggestionOut(BaseModel):
    id: str
    person_id: str
    field: str
    value: str
    source: str | None
    by_user_id: int
    status: str
    created_at: str
    decided_at: str | None


def to_out(s: Suggestion) -> SuggestionOut:
    return SuggestionOut(id=s.id, person_id=s.person_id, field=s.field, value=s.value, source=s.source, by_user_id=s.by_user_id,
                         status=s.status, created_at=iso(s.created_at), decided_at=iso(s.decided_at))


def get_person(db: Session, user: User, pid: str) -> Person:
    p = db.get(Person, pid)
    if not p or p.family_id != user.family_id or p.deleted_at:
        raise HTTPException(404, "Person not found")
    return p


@router.post("/people/{pid}/suggestions", response_model=SuggestionOut, status_code=201)
def suggest(pid: str, body: SuggestionIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = get_person(db, user, pid)
    if body.field not in SUGGESTION_FIELDS:
        raise HTTPException(422, f"field must be one of: {', '.join(SUGGESTION_FIELDS)}")
    s = Suggestion(family_id=user.family_id, person_id=pid, field=body.field, value=body.value.strip(),
                   source=(body.source or "").strip() or None, by_user_id=user.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    notify(db, user.family_id, family_users(db, user.family_id, MODERATORS), "suggestion.new",
           f"{user.name} suggested a correction for {p.first} {p.last}", f"{s.field}: {s.value}",
           f"/tree?person={pid}", exclude=user.id)
    return to_out(s)


@router.get("/suggestions", response_model=list[SuggestionOut])
def list_suggestions(status: str | None = "open", person: str | None = None,
                     user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Admins and Custodians see the family's suggestions; everyone else sees their own."""
    stmt = select(Suggestion).where(Suggestion.family_id == user.family_id)
    if user.role not in MODERATORS:
        stmt = stmt.where(Suggestion.by_user_id == user.id)
    if status:
        stmt = stmt.where(Suggestion.status == status)
    if person:
        stmt = stmt.where(Suggestion.person_id == person)
    return [to_out(s) for s in db.exec(stmt.order_by(Suggestion.created_at.desc())).all()]


@router.patch("/suggestions/{sid}", response_model=SuggestionOut, dependencies=[Depends(require_role(*MODERATORS))])
def decide(sid: str, body: DecisionIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = db.get(Suggestion, sid)
    if not s or s.family_id != user.family_id:
        raise HTTPException(404, "Suggestion not found")
    s.status = body.status
    s.decided_by, s.decided_at = (None, None) if body.status == "open" else (user.id, now())
    db.add(s)
    db.commit()
    db.refresh(s)
    if body.status != "open":
        p = db.get(Person, s.person_id)
        verb = "made" if body.status == "accepted" else "looked at, but didn't make,"
        notify(db, user.family_id, [s.by_user_id], "suggestion.decided",
               f"{user.name} {verb} your correction for {p.first} {p.last}", f"{s.field}: {s.value}",
               f"/tree?person={s.person_id}", exclude=user.id)
    return to_out(s)
