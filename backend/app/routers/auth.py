"""/auth and /me: create an account, sign in, check a family code, read the current user."""
import logging
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.auth import (create_reset_link, create_token, get_current_user, hash_password, use_reset_token, verify_password,
                      waste_password_check)
from app.config import settings
from app.db import get_session
from app.models import DEFAULT_PREFS, Family, Invite, JoinRequest, User, UserPrefs, now
from app.ratelimit import limit, limiter
from app.routers.notifications import family_users, notify

router = APIRouter(tags=["auth"])
log = logging.getLogger("familyroots")

# Attempts allowed per visitor (IP address) in a time window, in seconds; see app/ratelimit.py.
SIGN_IN_LIMIT = limit("sign-in", 20, 5 * 60)


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

    model_config = {"json_schema_extra": {"examples": [
        {"name": "Fiona Campbell", "email": "fiona@example.com", "password": "familyroots123", "family_name": "Campbell family"},
        {"name": "Ian Mackenzie", "email": "ian@example.com", "password": "familyroots123", "family_code": "MCK-8294",
         "relation": "Cousin (Campbell side)", "note": "Robert's nephew"},
    ]}}


class LoginIn(BaseModel):
    email: str
    password: str

    model_config = {"json_schema_extra": {"examples": [{"email": "mary@example.com", "password": "familyroots123"}]}}


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

    model_config = {"json_schema_extra": {"examples": [{"code": "MCK-8294"}]}}


class MeOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    family_id: int
    family_name: str
    person_id: str | None
    easy_mode: bool
    family_code: str | None = None  # Admins only: the code relatives use to ask to join
    onboarding_done: bool = True  # False until a new account finishes or skips the welcome steps


def family_by_code(db: Session, code: str) -> Family | None:
    return db.exec(select(Family).where(Family.code == code.strip().upper())).first()


def pending_request(db: Session, email: str) -> JoinRequest | None:
    return db.exec(select(JoinRequest).where(JoinRequest.email == email, JoinRequest.status == "pending")).first()


def start_onboarding(db: Session, user: User) -> None:
    """Marks a brand-new account so the app shows its welcome steps once. Accounts without the mark
    (everyone created before onboarding existed) count as done, so nobody is asked to repeat it."""
    db.add(UserPrefs(user_id=user.id, data={**DEFAULT_PREFS, "notify": dict(DEFAULT_PREFS["notify"]), "onboarding": "pending"}))


def onboarding_done(db: Session, user: User) -> bool:
    p = db.get(UserPrefs, user.id)
    return not p or (p.data or {}).get("onboarding") != "pending"


@router.post("/auth/register", response_model=RegisterOut, status_code=201, dependencies=[Depends(limit("register", 10, 60 * 60))])
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
        db.flush()
        start_onboarding(db, user)
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
        notify(db, family.id, family_users(db, family.id, ("Admin",)), "join.requested",
               f"{name} asked to join the family archive", body.relation, "/admin")
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
    db.flush()
    start_onboarding(db, user)
    db.commit()
    db.refresh(user)
    return RegisterOut(status="active", access_token=create_token(user.id), family_name=family.name)


def sign_in(db: Session, email: str, password: str) -> TokenOut:
    email = email.strip().lower()
    limiter.hit(f"sign-in-email:{email}", 10, 15 * 60)  # also per account, so spreading guesses over many addresses doesn't help
    user = db.exec(select(User).where(User.email == email)).first()
    if not user:
        req = pending_request(db, email)
        if req and req.password_hash and verify_password(password, req.password_hash):
            raise HTTPException(403, "Your request to join is waiting for an Admin. You'll be able to sign in once it's approved.")
        if not (req and req.password_hash):
            waste_password_check(password)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    if user.removed_at:
        raise HTTPException(403, "Your access to this family archive was removed. Ask a family Admin if this is a mistake.")
    user.last_active = now()
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/auth/login", response_model=TokenOut, dependencies=[Depends(SIGN_IN_LIMIT)])
def login(body: LoginIn, db: Session = Depends(get_session)):
    return sign_in(db, body.email, body.password)


@router.post("/auth/token", response_model=TokenOut, summary="Sign in from the Authorize button in /docs",
             dependencies=[Depends(SIGN_IN_LIMIT)])
def token(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Session = Depends(get_session)):
    """The same as /auth/login, but as an OAuth2 password form so Swagger UI can call it.
    Put the email address in `username`. The React app uses /auth/login."""
    return sign_in(db, form.username, form.password)


@router.post("/auth/family-code/verify", dependencies=[Depends(limit("family-code", 10, 5 * 60))])
def verify_code(body: CodeIn, db: Session = Depends(get_session)):
    family = family_by_code(db, body.code)
    if not family:
        raise HTTPException(404, "Family code not found")
    return {"family_name": family.name}


def me_out(db: Session, user: User) -> MeOut:
    family = db.get(Family, user.family_id)
    return MeOut(id=user.id, name=user.name, email=user.email, role=user.role, family_id=user.family_id,
                 family_name=family.name, person_id=user.person_id, easy_mode=user.easy_mode,
                 family_code=family.code if user.role == "Admin" else None, onboarding_done=onboarding_done(db, user))


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return me_out(db, user)


class MeUpdate(BaseModel):
    """Settings → Your account. Send only what changed. A new email address needs your current password."""
    name: str | None = Field(None, min_length=1, max_length=120)
    email: EmailStr | None = None
    easy_mode: bool | None = None
    current_password: str | None = None
    onboarding_done: bool | None = None  # true when the welcome steps are finished or skipped

    model_config = {"json_schema_extra": {"examples": [{"easy_mode": True}]}}


@router.patch("/me", response_model=MeOut)
def update_me(body: MeUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(422, "Your name can't be empty")
        user.name = body.name.strip()
    if body.email is not None and body.email.lower() != user.email:
        if not body.current_password or not verify_password(body.current_password, user.password_hash):
            raise HTTPException(400, "Enter your current password to change your email address")
        email = body.email.lower()
        if db.exec(select(User).where(User.email == email)).first() or pending_request(db, email):
            raise HTTPException(409, "An account with this email already exists")
        user.email = email
    if body.easy_mode is not None:
        user.easy_mode = body.easy_mode
    if body.onboarding_done is not None:
        p = user_prefs(db, user)
        p.data = {**(p.data or DEFAULT_PREFS), "onboarding": "done" if body.onboarding_done else "pending"}  # new dict, so the JSON column saves
        db.add(p)
    db.add(user)
    db.commit()
    db.refresh(user)
    return me_out(db, user)


class NotifyPrefs(BaseModel):
    birthdays: bool = True
    stories: bool = True
    digest: Literal["off", "daily", "weekly", "monthly"] = "weekly"


class PrefsIO(BaseModel):
    """Settings that follow the account to every device. Theme, accent and text size stay per device."""
    lang: Literal["en", "fr", "rw", "sw"] = "en"
    notify: NotifyPrefs = NotifyPrefs()

    model_config = {"json_schema_extra": {"examples": [{"lang": "rw", "notify": {"birthdays": True, "stories": False, "digest": "monthly"}}]}}


def user_prefs(db: Session, user: User) -> UserPrefs:
    return db.get(UserPrefs, user.id) or UserPrefs(user_id=user.id)


@router.get("/me/preferences", response_model=PrefsIO)
def read_prefs(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return PrefsIO(**user_prefs(db, user).data)


@router.put("/me/preferences", response_model=PrefsIO)
def save_prefs(body: PrefsIO, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = user_prefs(db, user)
    keep = {k: v for k, v in (p.data or {}).items() if k == "onboarding"}  # not part of this form
    p.data = {**body.model_dump(), **keep}
    db.add(p)
    db.commit()
    return body


# ---------- passwords ----------

class ForgotIn(BaseModel):
    email: str

    model_config = {"json_schema_extra": {"examples": [{"email": "mary@example.com"}]}}


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=10)

    model_config = {"json_schema_extra": {"examples": [
        {"token": "the part after ?reset= in the link from the server console", "password": "familyroots123"}]}}


class ChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)

    # Keeps the demo password, so trying this in /docs doesn't lock you out of the sample account.
    model_config = {"json_schema_extra": {"examples": [{
        "current_password": "familyroots123", "new_password": "familyroots123"
    }]}}


def set_password(db: Session, user: User, password: str) -> None:
    user.password_hash = hash_password(password)
    user.password_changed_at = now()  # signs out every other device
    db.add(user)


@router.post("/auth/forgot-password", status_code=202, dependencies=[Depends(limit("forgot-password", 5, 15 * 60))])
def forgot_password(body: ForgotIn, db: Session = Depends(get_session)):
    """Always answers the same way, so nobody can use it to find out who has an account."""
    user = db.exec(select(User).where(User.email == body.email.strip().lower(), User.removed_at == None)).first()  # noqa: E711
    if user:
        link, _ = create_reset_link(db, user)
        # TODO: email the link. Until sending is set up, it is written to the server console on a developer's
        # computer only: a server's logs are read by more people than the account holder, so there it isn't logged
        # and an Admin makes a link instead (POST /members/{id}/reset-link).
        if settings.production:
            log.warning("Password reset requested for user %s (email sending is not set up)", user.id)
        else:
            log.warning("Password reset link for %s: %s", user.email, link)
    return {"detail": "If that email has an account, a link to choose a new password is on its way."}


@router.post("/auth/reset-password", response_model=TokenOut, dependencies=[Depends(limit("reset-password", 10, 15 * 60))])
def reset_password(body: ResetIn, db: Session = Depends(get_session)):
    user = use_reset_token(db, body.token)
    if not user or user.removed_at:
        raise HTTPException(400, "This link has expired or was already used. Ask for a new one.")
    set_password(db, user, body.password)
    db.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/auth/change-password", response_model=TokenOut, dependencies=[Depends(limit("change-password", 10, 15 * 60))])
def change_password(body: ChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Returns a fresh token for this device; other devices are signed out."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is not right")
    set_password(db, user, body.new_password)
    db.commit()
    return TokenOut(access_token=create_token(user.id))
