"""Privacy & Consent: your own privacy choices, protections for minors, consent records, the access log,
downloading your data and closing your account."""
import secrets
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.auth import get_current_user, hash_password, require_role
from app.db import get_session
from app.models import (PRIVACY_CATEGORIES, VISIBILITY, AccessLog, Album, Consent, Event, Family, LegacyRecord, Memory,
                        Message, Milestone, MinorSetting, Person, Story, ThreadMember, User, UserPrivacy, iso, now)
from app.realtime import hub
from app.routers.notifications import notify
from app.visibility import Kin, age_of, is_minor

router = APIRouter(tags=["privacy"])
GRACE_DAYS = 30
EDITORS = ("Admin", "Custodian", "Contributor")


# ---------- schemas ----------

class MinorOut(BaseModel):
    person_id: str
    name: str
    age: int | None
    hide: bool
    guardian: bool
    guardians: list[str]  # parents' person ids
    can_edit: bool


class DeletionOut(BaseModel):
    requested: str  # YYYY-MM-DD
    closes_on: str


class PrivacyOut(BaseModel):
    categories: dict[str, str]
    mine: dict[str, bool]
    minors: list[MinorOut]
    deletion: DeletionOut | None


class MineIn(BaseModel):
    tagging: bool | None = None
    voice: bool | None = None
    books: bool | None = None
    age: bool | None = None

    model_config = {"json_schema_extra": {"examples": [{"age": True}]}}


class MinorIn(BaseModel):
    hide: bool | None = None
    guardian: bool | None = None

    model_config = {"json_schema_extra": {"examples": [{"hide": True}]}}


class ConsentOut(BaseModel):
    id: str
    person: str
    item: str
    kind: str
    status: str
    date: str
    guardian: str | None
    memory_id: str | None
    can_decide: bool  # you are the person, or their guardian
    can_remind: bool


class ConsentCreate(BaseModel):
    person: str
    item: str = Field(min_length=1)
    kind: Literal["Photo", "Voice"] = "Photo"
    memory_id: str | None = None

    model_config = {"json_schema_extra": {"examples": [{"person": "sarah", "item": "Beach photo (2026)", "kind": "Photo"}]}}


class ConsentDecision(BaseModel):
    status: Literal["given", "withdrawn"]

    model_config = {"json_schema_extra": {"examples": [{"status": "given"}]}}


class LogOut(BaseModel):
    id: str
    who: str | None
    action: str
    title: str | None
    at: str


class ActivityIn(BaseModel):
    action: Literal["listened", "downloaded"]
    kind: Literal["story", "memory"]
    id: str

    model_config = {"json_schema_extra": {"examples": [{"action": "listened", "kind": "story", "id": "s1"}]}}


# ---------- helpers ----------

def prefs(db: Session, user: User) -> UserPrivacy:
    p = db.get(UserPrivacy, user.id)
    if not p:
        p = UserPrivacy(user_id=user.id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


def deletion_out(user: User) -> DeletionOut | None:
    if not user.deletion_requested_at:
        return None
    d = user.deletion_requested_at.date()
    return DeletionOut(requested=d.isoformat(), closes_on=(d + timedelta(days=GRACE_DAYS)).isoformat())


def can_edit_minor(user: User, kin: Kin, pid: str) -> bool:
    return user.role == "Admin" or user.person_id in kin.guardians(pid)


def minors_out(db: Session, user: User) -> list[MinorOut]:
    kin = Kin(db, user.family_id)
    out = []
    for p in kin.people.values():
        if p.deleted_at or not is_minor(p) or kin.minor_hidden_from(user, p.id):
            continue
        m = kin.minor(p.id)
        out.append(MinorOut(person_id=p.id, name=f"{p.first} {p.last}", age=age_of(p), hide=m.hide, guardian=m.guardian,
                            guardians=kin.guardians(p.id), can_edit=can_edit_minor(user, kin, p.id)))
    return sorted(out, key=lambda m: m.age or 0)


def privacy_out(db: Session, user: User) -> PrivacyOut:
    p = prefs(db, user)
    return PrivacyOut(categories=p.categories, mine=p.mine, minors=minors_out(db, user), deletion=deletion_out(user))


def deciders(kin: Kin, c: Consent) -> set[str]:
    """Who may give or withdraw this consent: the person, or a guardian if they're a minor."""
    if kin.minor(c.person):
        return set(kin.guardians(c.person))
    return {c.person}


def consent_out(user: User, kin: Kin, c: Consent) -> ConsentOut:
    return ConsentOut(id=c.id, person=c.person, item=c.item, kind=c.kind, status=c.status, date=c.date, guardian=c.guardian,
                      memory_id=c.memory_id, can_decide=user.person_id in deciders(kin, c),
                      can_remind=c.status == "pending" and (c.requested_by == user.id or user.role == "Admin"))


def consent_visible(user: User, kin: Kin, c: Consent) -> bool:
    return user.role == "Admin" or c.requested_by == user.id or user.person_id == c.person or user.person_id in deciders(kin, c)


def get_consent(db: Session, user: User, cid: str, kin: Kin) -> Consent:
    c = db.get(Consent, cid)
    if not c or c.family_id != user.family_id or not consent_visible(user, kin, c):
        raise HTTPException(404, "Consent record not found")
    return c


def last_admin(db: Session, user: User) -> bool:
    if user.role != "Admin":
        return False
    n = db.exec(select(func.count()).select_from(User).where(User.family_id == user.family_id, User.role == "Admin",
                                                             User.removed_at == None, User.deletion_requested_at == None)).one()  # noqa: E711
    return n <= 1


# ---------- your privacy ----------

@router.get("/privacy", response_model=PrivacyOut)
def read_privacy(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return privacy_out(db, user)


@router.patch("/privacy/categories", response_model=PrivacyOut)
def set_categories(
    body: dict[str, str] = Body(examples=[{"birthdays": "Immediate Family", "location": "Only Me (draft)"}]),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Who can see each kind of your information, e.g. {"birthdays": "Immediate Family"}."""
    for k, v in body.items():
        if k not in PRIVACY_CATEGORIES:
            raise HTTPException(422, f"Unknown category {k}: use {', '.join(PRIVACY_CATEGORIES)}")
        if v not in VISIBILITY:
            raise HTTPException(422, f"{k} must be one of: {', '.join(VISIBILITY)}")
    p = prefs(db, user)
    p.categories = {**p.categories, **body}  # new dict, so the JSON column is saved
    db.add(p)
    db.commit()
    return privacy_out(db, user)


@router.patch("/privacy/mine", response_model=PrivacyOut)
def set_mine(body: MineIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = prefs(db, user)
    p.mine = {**p.mine, **body.model_dump(exclude_none=True)}
    db.add(p)
    db.commit()
    return privacy_out(db, user)


@router.patch("/privacy/minors/{pid}", response_model=MinorOut)
def set_minor(pid: str, body: MinorIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Parents (guardians) and Admins can change a minor's protections."""
    kin = Kin(db, user.family_id)
    if pid not in kin.people or not kin.minor(pid):
        raise HTTPException(404, "No relative under 18 with this id")
    if not can_edit_minor(user, kin, pid):
        raise HTTPException(403, "Only a parent or an Admin can change this")
    m = db.get(MinorSetting, pid) or MinorSetting(person_id=pid)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(m, k, v)
    db.add(m)
    db.commit()
    return next(x for x in minors_out(db, user) if x.person_id == pid)


# ---------- consent ----------

@router.get("/consents", response_model=list[ConsentOut])
def list_consents(status: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Admins see every record; others see the ones about them, their children, or that they asked for."""
    kin = Kin(db, user.family_id)
    stmt = select(Consent).where(Consent.family_id == user.family_id)
    if status:
        stmt = stmt.where(Consent.status == status)
    return [consent_out(user, kin, c) for c in db.exec(stmt.order_by(Consent.date.desc())).all() if consent_visible(user, kin, c)]


@router.post("/consents", response_model=ConsentOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def request_consent(body: ConsentCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    kin = Kin(db, user.family_id)
    if body.person not in kin.people:
        raise HTTPException(422, f"Unknown person: {body.person}")
    if body.memory_id:
        m = db.get(Memory, body.memory_id)
        if not m or m.family_id != user.family_id:
            raise HTTPException(422, "Unknown memory")
    guardian = next(iter(kin.guardians(body.person)), None) if kin.minor(body.person) else None
    c = Consent(family_id=user.family_id, person=body.person, item=body.item.strip(), kind=body.kind, date=date.today().isoformat(),
                guardian=guardian, memory_id=body.memory_id, requested_by=user.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    notify_deciders(db, kin, c, "consent.requested")
    return consent_out(user, kin, c)


@router.patch("/consents/{cid}", response_model=ConsentOut)
def decide(cid: str, body: ConsentDecision, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Give or withdraw consent. Withdrawing consent for a photo makes that memory private to whoever added it."""
    kin = Kin(db, user.family_id)
    c = get_consent(db, user, cid, kin)
    if user.person_id not in deciders(kin, c):
        raise HTTPException(403, "Only the person (or a parent, for someone under 18) can decide this")
    c.status, c.date = body.status, date.today().isoformat()
    if body.status == "withdrawn" and c.memory_id:
        m = db.get(Memory, c.memory_id)
        if m and not m.visibility.startswith("Only"):
            m.visibility = "Only Me (draft)"
            db.add(m)
    db.add(c)
    db.commit()
    db.refresh(c)
    return consent_out(user, kin, c)


@router.post("/consents/{cid}/remind", response_model=ConsentOut)
def remind(cid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    kin = Kin(db, user.family_id)
    c = get_consent(db, user, cid, kin)
    if c.status != "pending":
        raise HTTPException(422, "Only a pending request can be reminded")
    if c.requested_by != user.id and user.role != "Admin":
        raise HTTPException(403, "Only whoever asked, or an Admin, can send a reminder")
    c.date = date.today().isoformat()
    db.add(c)
    db.commit()
    db.refresh(c)
    notify_deciders(db, kin, c, "consent.reminder")  # TODO: also by email once sending is set up
    return consent_out(user, kin, c)


def notify_deciders(db: Session, kin: Kin, c: Consent, kind: str) -> None:
    ids = [kin.users[p].id for p in deciders(kin, c) if p in kin.users]
    hub.notify(ids, {"type": kind, "consent_id": c.id, "item": c.item})
    # Also kept in the bell, so someone who was offline still sees it.
    title = "You're asked to agree to sharing" if kind == "consent.requested" else "Reminder: a family member is waiting for your answer"
    notify(db, c.family_id, ids, kind, title, c.item, "/privacy", exclude=c.requested_by if kind == "consent.requested" else None)


# ---------- access log ----------

@router.get("/access-log", response_model=list[LogOut])
def access_log(limit: int = Query(50, ge=1, le=500), user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Who opened, listened to or downloaded your things, newest first."""
    rows = db.exec(select(AccessLog).where(AccessLog.subject_user_id == user.id).order_by(AccessLog.at.desc()).limit(limit)).all()
    return [LogOut(id=r.id, who=r.who, action=r.action, title=r.title, at=iso(r.at)) for r in rows]


@router.post("/activity", status_code=204)
def record_activity(body: ActivityIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Call when someone plays a recording or downloads a photo, so its owner can see it in their access log."""
    from app.routers.memories import get_memory
    from app.routers.stories import get_story

    item = get_story(db, user, body.id) if body.kind == "story" else get_memory(db, user, body.id)
    owner = item.owner_user_id
    if owner and owner != user.id:
        db.add(AccessLog(family_id=user.family_id, subject_user_id=owner, who=user.person_id, who_user_id=user.id,
                         action=body.action, title=item.title))
        db.commit()
    return Response(status_code=204)


# ---------- your data ----------

def dump(rows) -> list[dict]:
    return [r.model_dump(mode="json") for r in rows]


@router.get("/me/export")
def export_mine(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Everything about you, as a JSON download ("Download my data")."""
    me = user.person_id
    memories = [m for m in db.exec(select(Memory).where(Memory.family_id == user.family_id, Memory.deleted_at == None)).all()  # noqa: E711
                if m.owner_user_id == user.id or (me and me in m.tagged)]
    return {
        "exported": iso(now()),
        "account": {"name": user.name, "email": user.email, "role": user.role, "joined": iso(user.created_at)},
        "profile": db.get(Person, me).model_dump(mode="json") if me else None,
        "memories": dump(memories),
        "stories": dump(db.exec(select(Story).where(Story.owner_user_id == user.id)).all()),
        "messages": dump(db.exec(select(Message).where(Message.sender_id == user.id, Message.deleted_at == None)).all()),  # noqa: E711
        "records": [r.model_dump(mode="json") for r in db.exec(select(LegacyRecord).where(LegacyRecord.family_id == user.family_id)).all()
                    if r.owner_user_id == user.id or (me and r.custodian == me)],
        "privacy": prefs(db, user).model_dump(mode="json"),
        "consents": dump(db.exec(select(Consent).where(Consent.family_id == user.family_id, Consent.person == me)).all()) if me else [],
        "access_log": dump(db.exec(select(AccessLog).where(AccessLog.subject_user_id == user.id)).all()),
    }


@router.get("/admin/export", dependencies=[Depends(require_role("Admin"))])
def export_family(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """The whole family archive (Settings: "Export the archive"). Admins only. Files are listed, not included."""
    fid = user.family_id
    return {
        "exported": iso(now()),
        "family": db.get(Family, fid).model_dump(mode="json", exclude={"id"}),
        "people": dump(db.exec(select(Person).where(Person.family_id == fid, Person.deleted_at == None)).all()),  # noqa: E711
        "memories": dump(db.exec(select(Memory).where(Memory.family_id == fid, Memory.deleted_at == None)).all()),  # noqa: E711
        "albums": dump(db.exec(select(Album).where(Album.family_id == fid)).all()),
        "stories": dump(db.exec(select(Story).where(Story.family_id == fid, Story.deleted_at == None)).all()),  # noqa: E711
        "milestones": dump(db.exec(select(Milestone).where(Milestone.family_id == fid, Milestone.deleted_at == None)).all()),  # noqa: E711
        "events": dump(db.exec(select(Event).where(Event.family_id == fid)).all()),
        # Sealed capsules stay sealed, even in an export.
        "records": [r.model_dump(mode="json") | ({"text": "", "source": None} if r.sealedUntil and r.sealedUntil > date.today().isoformat() else {})
                    for r in db.exec(select(LegacyRecord).where(LegacyRecord.family_id == fid, LegacyRecord.deleted_at == None)).all()],  # noqa: E711
        "members": [{"name": u.name, "role": u.role, "person_id": u.person_id}
                    for u in db.exec(select(User).where(User.family_id == fid, User.removed_at == None)).all()],  # noqa: E711
    }


# ---------- closing your account ----------

@router.post("/me/deletion-request", response_model=DeletionOut)
def request_deletion(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Close your account in 30 days. Until then you can change your mind."""
    if last_admin(db, user):
        raise HTTPException(422, "You're the family's only Admin. Make someone else an Admin first.")
    user.deletion_requested_at = user.deletion_requested_at or now()
    db.add(user)
    db.commit()
    db.refresh(user)
    return deletion_out(user)


@router.delete("/me/deletion-request", status_code=204)
def cancel_deletion(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    user.deletion_requested_at = None
    db.add(user)
    db.commit()
    return Response(status_code=204)


def close_due_accounts(db: Session) -> int:
    """Close accounts whose 30 days have passed: profile, messages and settings go; the family tree keeps the person,
    and memories and stories stay for the family (a custodian follows up on what to remove). Runs at startup."""
    due = db.exec(select(User).where(User.deletion_requested_at != None, User.removed_at == None,  # noqa: E711
                                     User.deletion_requested_at <= now() - timedelta(days=GRACE_DAYS))).all()
    for u in due:
        for m in db.exec(select(Message).where(Message.sender_id == u.id, Message.deleted_at == None)).all():  # noqa: E711
            m.deleted_at, m.text = now(), ""
            db.add(m)
        for tm in db.exec(select(ThreadMember).where(ThreadMember.user_id == u.id, ThreadMember.left_at == None)).all():  # noqa: E711
            tm.left_at = now()
            db.add(tm)
        if (p := db.get(UserPrivacy, u.id)):
            db.delete(p)
        u.name, u.email = "Former member", f"closed-{u.id}@closed.invalid"
        u.password_hash = hash_password(secrets.token_urlsafe(32))
        u.removed_at = now()
        db.add(u)
    db.commit()
    return len(due)
