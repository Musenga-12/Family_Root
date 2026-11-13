"""/auth and /me: create an account, sign in, check a family code, read the current user."""
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.auth import create_reset_link, create_token, get_current_user, hash_password, use_reset_token, verify_password
from app.db import get_session
from app.models import Family, Invite, JoinRequest, User, now

router = APIRouter(tags=["auth"])
log = logging.getLogger("familyroots")


class RegisterIn(BaseModel):
    """Three ways in:
    - invite_token: accept an invitation; the account is ready at once.
    - family_code: ask to join; an Admin approves or declines (status "pending", no token yet).
    - neither: start a new family and become its Admin.
    """
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=10)  # same rule as the Create account form
    easy_mode: bool = False
    invite_token: str | None = None
    family_code: str | None = None
    family_name: str | None = None  # for a new family
    relation: str | None = None  # join requests: "Cousin (Campbell side)"
    note: str | None = Field(None, max_length=500)  # join requests: a word for the Admin


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterOut(BaseModel):
    status: str  # "active" (signed in) or "pending" (waiting for an Admin)
    access_token: str | None = None
    token_type: str = "bearer"
    family_name: str


class CodeIn(BaseModel):
    code: str


class MeOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    family_id: int
    family_name: str
    person_id: str | None
    easy_mode: bool


def family_by_code(db: Session, code: str) -> Family | None:
    return db.exec(select(Family).where(Family.code == code.strip().upper())).first()


def pending_request(db: Session, email: str) -> JoinRequest | None:
    return db.exec(select(JoinRequest).where(JoinRequest.email == email, JoinRequest.status == "pending")).first()


@router.post("/auth/register", response_model=RegisterOut, status_code=201)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_session)):
    email, name = body.email.lower(), body.name.strip()
    if db.exec(select(User).where(User.email == email)).first():
        raise HTTPException(409, "An account with this email already exists")
    if pending_request(db, email):
        raise HTTPException(409, "You've already asked to join. An Admin will look at your request soon.")

    if body.invite_token:
        inv = db.exec(select(Invite).where(Invite.token == body.invite_token)).first()
        if not inv or inv.accepted_at or inv.cancelled_at:
            raise HTTPException(404, "This invitation link is not valid any more")
        if inv.email != email:
            raise HTTPException(422, f"This invitation was sent to {inv.email}. Sign up with that address.")
        user = User(family_id=inv.family_id, email=email, name=name, password_hash=hash_password(body.password),
                    role=inv.role, easy_mode=body.easy_mode)
        inv.accepted_at = now()
        db.add_all([user, inv])
        db.commit()
        db.refresh(user)
        return RegisterOut(status="active", access_token=create_token(user.id), family_name=db.get(Family, inv.family_id).name)

    if body.family_code:
        family = family_by_code(db, body.family_code)
        if not family:
            raise HTTPException(404, "Family code not found")
        db.add(JoinRequest(family_id=family.id, name=name, email=email, password_hash=hash_password(body.password),
                           easy_mode=body.easy_mode, relation=body.relation, note=body.note))
        db.commit()
        response.status_code = 202  # accepted, waiting for an Admin
        return RegisterOut(status="pending", family_name=family.name)

    last = name.split()[-1]
    code = f"{last[:3].upper()}-{secrets.randbelow(9000) + 1000}"
    while family_by_code(db, code):
        code = f"{last[:3].upper()}-{secrets.randbelow(9000) + 1000}"
    family = Family(name=body.family_name or f"{last} family", code=code)
    db.add(family)
    db.flush()
    user = User(family_id=family.id, email=email, name=name, password_hash=hash_password(body.password),
                role="Admin", easy_mode=body.easy_mode)  # whoever starts a family looks after it
    db.add(user)
    db.commit()
    db.refresh(user)
    return RegisterOut(status="active", access_token=create_token(user.id), family_name=family.name)


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_session)):
    email = body.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()
    if not user:
        req = pending_request(db, email)
        if req and req.password_hash and verify_password(body.password, req.password_hash):
            raise HTTPException(403, "Your request to join is waiting for an Admin. You'll be able to sign in once it's approved.")
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    if user.removed_at:
        raise HTTPException(403, "Your access to this family archive was removed. Ask a family Admin if this is a mistake.")
    user.last_active = now()
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/auth/family-code/verify")
def verify_code(body: CodeIn, db: Session = Depends(get_session)):
    family = family_by_code(db, body.code)
    if not family:
        raise HTTPException(404, "Family code not found")
    return {"family_name": family.name}


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    family = db.get(Family, user.family_id)
    return MeOut(id=user.id, name=user.name, email=user.email, role=user.role, family_id=user.family_id,
                 family_name=family.name, person_id=user.person_id, easy_mode=user.easy_mode)


# ---------- passwords ----------

class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=10)


class ChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)


def set_password(db: Session, user: User, password: str) -> None:
    user.password_hash = hash_password(password)
    user.password_changed_at = now()  # signs out every other device
    db.add(user)


@router.post("/auth/forgot-password", status_code=202)
def forgot_password(body: ForgotIn, db: Session = Depends(get_session)):
    """Always answers the same way, so nobody can use it to find out who has an account."""
    user = db.exec(select(User).where(User.email == body.email.strip().lower(), User.removed_at == None)).first()  # noqa: E711
    if user:
        link, _ = create_reset_link(db, user)
        # TODO: email the link. Until sending is set up, it is written to the server console.
        log.warning("Password reset link for %s: %s", user.email, link)
    return {"detail": "If that email has an account, a link to choose a new password is on its way."}


@router.post("/auth/reset-password", response_model=TokenOut)
def reset_password(body: ResetIn, db: Session = Depends(get_session)):
    user = use_reset_token(db, body.token)
    if not user or user.removed_at:
        raise HTTPException(400, "This link has expired or was already used. Ask for a new one.")
    set_password(db, user, body.password)
    db.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/auth/change-password", response_model=TokenOut)
def change_password(body: ChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Returns a fresh token for this device; other devices are signed out."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is not right")
    set_password(db, user, body.new_password)
    db.commit()
    return TokenOut(access_token=create_token(user.id))
