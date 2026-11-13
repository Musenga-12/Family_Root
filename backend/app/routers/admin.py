"""Family administration: members and roles, join requests, invitations.

Roles, most to least access: Admin > Custodian > Contributor > Viewer.
A family always keeps at least one Admin, and nobody can remove themselves.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, func, select

from app.auth import create_reset_link, get_current_user, hash_password, require_role
from app.config import settings
from app.db import get_session
from app.models import ROLES, Family, Invite, JoinRequest, LegacyRecord, Person, User, iso, now

router = APIRouter(tags=["admin"])
admin_only = [Depends(require_role("Admin"))]
EDITORS = ("Admin", "Custodian", "Contributor")


# ---------- schemas ----------

class MemberOut(BaseModel):
    user_id: int
    person_id: str | None
    name: str
    email: str | None  # Admins only
    role: str
    joined: str | None
    last_active: str | None
    removed: bool
    is_you: bool


class RoleIn(BaseModel):
    role: str

    model_config = {"json_schema_extra": {"examples": [{"role": "Contributor"}]}}


class RequestOut(BaseModel):
    id: str
    name: str
    email: str
    relation: str | None
    note: str | None
    vouched_by: str | None
    date: str
    status: str


class ApproveIn(BaseModel):
    role: str = "Viewer"  # the Admin screen offers Custodian, Contributor or Viewer

    model_config = {"json_schema_extra": {"examples": [{"role": "Viewer"}]}}


class InviteIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    relation: str | None = None
    role: str | None = None  # Admins may choose; anyone else's invitations join as Viewers

    model_config = {"json_schema_extra": {"examples": [{
        "name": "Fiona Campbell", "email": "fiona@example.com", "relation": "Cousin", "role": "Contributor"
    }]}}


class InviteOut(BaseModel):
    id: str
    name: str
    email: str
    relation: str | None
    role: str
    sent: str
    by: int | None
    link: str | None  # shown to the sender and Admins, until email sending is added
    status: str  # pending | accepted | cancelled


class InviteInfo(BaseModel):
    family_name: str
    name: str
    email: str
    relation: str | None


class Summary(BaseModel):
    members: int
    admins: int
    join_requests: int
    invites: int
    people_to_confirm: int  # tree entries marked pending
    records_to_review: int


# ---------- helpers ----------

def check_role(role: str, allow_admin: bool = True) -> str:
    allowed = ROLES if allow_admin else ROLES[1:]
    if role not in allowed:
        raise HTTPException(422, f"role must be one of: {', '.join(allowed)}")
    return role


def active_admins(db: Session, family_id: int) -> int:
    return db.exec(select(func.count()).select_from(User).where(
        User.family_id == family_id, User.role == "Admin", User.removed_at == None)).one()  # noqa: E711


def get_member(db: Session, user: User, uid: int) -> User:
    m = db.get(User, uid)
    if not m or m.family_id != user.family_id:
        raise HTTPException(404, "Member not found")
    return m


def member_out(user: User, m: User) -> MemberOut:
    return MemberOut(user_id=m.id, person_id=m.person_id, name=m.name, email=m.email if user.role == "Admin" else None,
                     role=m.role, joined=iso(m.created_at), last_active=iso(m.last_active), removed=m.removed_at is not None,
                     is_you=m.id == user.id)


def request_out(r: JoinRequest) -> RequestOut:
    return RequestOut(id=r.id, name=r.name, email=r.email, relation=r.relation, note=r.note, vouched_by=r.vouched_by,
                      date=iso(r.created_at), status=r.status)


def invite_link(inv: Invite) -> str:
    return f"{settings.frontend_origin}/auth?invite={inv.token}"


def invite_out(user: User, inv: Invite) -> InviteOut:
    status = "accepted" if inv.accepted_at else "cancelled" if inv.cancelled_at else "pending"
    show = user.role == "Admin" or inv.invited_by == user.id
    return InviteOut(id=inv.id, name=inv.name, email=inv.email, relation=inv.relation, role=inv.role, sent=iso(inv.sent_at),
                     by=inv.invited_by, link=invite_link(inv) if show and status == "pending" else None, status=status)


def get_request(db: Session, user: User, rid: str) -> JoinRequest:
    r = db.get(JoinRequest, rid)
    if not r or r.family_id != user.family_id:
        raise HTTPException(404, "Request not found")
    return r


def get_invite(db: Session, user: User, iid: str) -> Invite:
    inv = db.get(Invite, iid)
    if not inv or inv.family_id != user.family_id:
        raise HTTPException(404, "Invitation not found")
    if user.role != "Admin" and inv.invited_by != user.id:
        raise HTTPException(403, "Only the sender or an Admin can change this invitation")
    return inv


def email_taken(db: Session, email: str) -> bool:
    return db.exec(select(User).where(User.email == email.lower())).first() is not None


# ---------- overview ----------

@router.get("/admin/summary", response_model=Summary, dependencies=admin_only)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """The counts at the top of the Family Administration screen."""
    fid = user.family_id

    def count(model, *where):
        return db.exec(select(func.count()).select_from(model).where(model.family_id == fid, *where)).one()

    return Summary(
        members=count(User, User.removed_at == None),  # noqa: E711
        admins=active_admins(db, fid),
        join_requests=count(JoinRequest, JoinRequest.status == "pending"),
        invites=count(Invite, Invite.accepted_at == None, Invite.cancelled_at == None),  # noqa: E711
        people_to_confirm=count(Person, Person.pending == True, Person.deleted_at == None),  # noqa: E711, E712
        records_to_review=count(LegacyRecord, LegacyRecord.status == "review", LegacyRecord.deleted_at == None),  # noqa: E711
    )


# ---------- members ----------

@router.get("/members", response_model=list[MemberOut])
def list_members(include_removed: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Everyone with access and their role. Email addresses are shown to Admins only."""
    stmt = select(User).where(User.family_id == user.family_id)
    if not (include_removed and user.role == "Admin"):
        stmt = stmt.where(User.removed_at == None)  # noqa: E711
    order = {r: i for i, r in enumerate(ROLES)}
    return sorted((member_out(user, m) for m in db.exec(stmt).all()), key=lambda m: (order.get(m.role, 9), m.name))


@router.patch("/members/{uid}", response_model=MemberOut, dependencies=admin_only)
def change_role(uid: int, body: RoleIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_member(db, user, uid)
    role = check_role(body.role)
    if m.role == "Admin" and role != "Admin" and active_admins(db, user.family_id) <= 1:
        raise HTTPException(422, "The family needs at least one Admin. Make someone else an Admin first.")
    m.role = role
    db.add(m)
    db.commit()
    db.refresh(m)
    return member_out(user, m)


@router.delete("/members/{uid}", status_code=204, dependencies=admin_only)
def remove_member(uid: int, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Remove access. Their stories, photos and messages stay in the archive. Undo with /restore."""
    m = get_member(db, user, uid)
    if m.id == user.id:
        raise HTTPException(422, "You can't remove yourself")
    if m.role == "Admin" and active_admins(db, user.family_id) <= 1:
        raise HTTPException(422, "The family needs at least one Admin")
    m.removed_at = now()
    db.add(m)
    db.commit()
    return Response(status_code=204)


@router.post("/members/{uid}/restore", response_model=MemberOut, dependencies=admin_only)
def restore_member(uid: int, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    m = get_member(db, user, uid)
    m.removed_at = None
    db.add(m)
    db.commit()
    db.refresh(m)
    return member_out(user, m)


class ResetLinkOut(BaseModel):
    link: str
    expires: str


@router.post("/members/{uid}/reset-link", response_model=ResetLinkOut, dependencies=admin_only)
def member_reset_link(uid: int, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Help a relative who can't sign in (or a newly approved member without a password): a one-time link,
    valid for 3 days, to pass on in person or by phone."""
    m = get_member(db, user, uid)
    if m.removed_at:
        raise HTTPException(422, "This member's access was removed")
    link, expires = create_reset_link(db, m, minutes=3 * 24 * 60)
    return ResetLinkOut(link=link, expires=iso(expires))


# ---------- join requests ----------

@router.get("/join-requests", response_model=list[RequestOut], dependencies=admin_only)
def list_requests(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    rows = db.exec(select(JoinRequest).where(JoinRequest.family_id == user.family_id, JoinRequest.status == "pending")
                   .order_by(JoinRequest.created_at.desc())).all()
    return [request_out(r) for r in rows]


@router.post("/join-requests/{rid}/approve", response_model=MemberOut, dependencies=admin_only)
def approve(rid: str, body: ApproveIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    r = get_request(db, user, rid)
    if r.status != "pending":
        raise HTTPException(422, f"This request was already {r.status}")
    role = check_role(body.role, allow_admin=False)
    m = db.get(User, r.user_id) if r.user_id else None
    if m:  # approved before, then undone: give the same account back
        m.removed_at, m.role = None, role
    else:
        if email_taken(db, r.email):
            raise HTTPException(409, "An account with this email already exists")
        # Requests without a password (e.g. the sample data) get an unusable one; they set theirs with a reset link.
        m = User(family_id=r.family_id, email=r.email.lower(), name=r.name, role=role, easy_mode=r.easy_mode,
                 password_hash=r.password_hash or hash_password(secrets.token_urlsafe(32)))
    db.add(m)
    db.flush()
    r.status, r.user_id, r.decided_by, r.decided_at = "approved", m.id, user.id, now()
    db.add(r)
    db.commit()
    db.refresh(m)
    return member_out(user, m)


@router.post("/join-requests/{rid}/decline", status_code=204, dependencies=admin_only)
def decline(rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    r = get_request(db, user, rid)
    if r.status != "pending":
        raise HTTPException(422, f"This request was already {r.status}")
    r.status, r.decided_by, r.decided_at = "declined", user.id, now()
    db.add(r)
    db.commit()
    return Response(status_code=204)


@router.post("/join-requests/{rid}/reopen", response_model=RequestOut, dependencies=admin_only)
def reopen(rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Undo an approval or a decline. Undoing an approval removes the new account's access again."""
    r = get_request(db, user, rid)
    if r.status == "approved" and r.user_id:
        m = db.get(User, r.user_id)
        if m.role == "Admin" and active_admins(db, user.family_id) <= 1:
            raise HTTPException(422, "The family needs at least one Admin")
        m.removed_at = now()
        db.add(m)
    r.status, r.decided_by, r.decided_at = "pending", None, None
    db.add(r)
    db.commit()
    db.refresh(r)
    return request_out(r)


# ---------- invitations ----------

@router.get("/invites", response_model=list[InviteOut])
def list_invites(include_all: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Admins see every invitation; others see the ones they sent. Pending only, unless include_all."""
    stmt = select(Invite).where(Invite.family_id == user.family_id)
    if user.role != "Admin":
        stmt = stmt.where(Invite.invited_by == user.id)
    if not include_all:
        stmt = stmt.where(Invite.accepted_at == None, Invite.cancelled_at == None)  # noqa: E711
    return [invite_out(user, i) for i in db.exec(stmt.order_by(Invite.sent_at.desc())).all()]


@router.post("/invites", response_model=InviteOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_invite(body: InviteIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    email = body.email.lower()
    if email_taken(db, email):
        raise HTTPException(409, "This person already has a FamilyRoots account")
    if db.exec(select(Invite).where(Invite.family_id == user.family_id, Invite.email == email,
                                    Invite.accepted_at == None, Invite.cancelled_at == None)).first():  # noqa: E711
        raise HTTPException(409, "This email address has already been invited")
    role = check_role(body.role or "Contributor") if user.role == "Admin" else "Viewer"
    inv = Invite(family_id=user.family_id, name=body.name.strip(), email=email, relation=body.relation, role=role,
                 token=secrets.token_urlsafe(24), invited_by=user.id)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    # TODO: email the link. Until then the sender copies `link` from the response.
    return invite_out(user, inv)


@router.post("/invites/{iid}/resend", response_model=InviteOut)
def resend_invite(iid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    inv = get_invite(db, user, iid)
    if inv.accepted_at or inv.cancelled_at:
        raise HTTPException(422, "This invitation is no longer open")
    inv.sent_at = now()
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return invite_out(user, inv)


@router.delete("/invites/{iid}", status_code=204)
def cancel_invite(iid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """The link stops working at once. Undo with /restore."""
    inv = get_invite(db, user, iid)
    if inv.accepted_at:
        raise HTTPException(422, "This invitation was already accepted")
    inv.cancelled_at = inv.cancelled_at or now()
    db.add(inv)
    db.commit()
    return Response(status_code=204)


@router.post("/invites/{iid}/restore", response_model=InviteOut)
def restore_invite(iid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    inv = get_invite(db, user, iid)
    inv.cancelled_at = None
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return invite_out(user, inv)


@router.get("/invites/by-token/{token}", response_model=InviteInfo)
def invite_info(token: str, db: Session = Depends(get_session)):
    """Public: lets the sign-up page greet the invited person and fill in their name and email."""
    inv = db.exec(select(Invite).where(Invite.token == token)).first()
    if not inv or inv.accepted_at or inv.cancelled_at:
        raise HTTPException(404, "This invitation link is not valid any more")
    return InviteInfo(family_name=db.get(Family, inv.family_id).name, name=inv.name, email=inv.email, relation=inv.relation)
