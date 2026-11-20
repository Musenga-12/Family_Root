"""Password hashing, JWT tokens and the dependencies that protect routes."""
import hashlib
import secrets
from datetime import datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlmodel import Session, select

from app.config import API_PREFIX, settings
from app.db import get_session
from app.models import User, now

ALGORITHM = "HS256"
hasher = PasswordHash.recommended()
# Reads "Authorization: Bearer <token>", as before. Declaring it as an OAuth2 password flow lets the Authorize
# button in /docs sign in with an email (in the "username" box) and password via POST /auth/token.
oauth2 = OAuth2PasswordBearer(tokenUrl=f"{API_PREFIX}/auth/token", auto_error=False)


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return hasher.verify(password, hashed)


_dummy_hash: str | None = None


def waste_password_check(password: str) -> None:
    """Take as long as a real check when there is no account, so response times don't reveal which emails exist."""
    global _dummy_hash
    _dummy_hash = _dummy_hash or hasher.hash(secrets.token_urlsafe(16))
    hasher.verify(password, _dummy_hash)


def create_token(user_id: int) -> str:
    exp = now() + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "typ": "access", "iat": int(now().timestamp()), "exp": exp},
                      settings.secret_key, algorithm=ALGORITHM)


def create_file_token(upload_id: str) -> str:
    """Short-lived signature for one file, so <img src> and <audio src> work without an Authorization header."""
    exp = now() + timedelta(minutes=settings.file_link_minutes)
    return jwt.encode({"sub": upload_id, "typ": "file", "exp": exp}, settings.secret_key, algorithm=ALGORITHM)


def file_token_ok(token: str, upload_id: str) -> bool:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return False
    return payload.get("typ") == "file" and payload.get("sub") == upload_id


def user_from_token(token: str, db: Session) -> User | None:
    """The account a sign-in token belongs to, or None. Also used by the WebSocket, which can't send headers."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "access":  # a file link can't be used to sign in
        return None
    try:
        user = db.get(User, int(payload.get("sub", "")))
    except ValueError:
        return None
    if not user or user.removed_at:  # removed members lose access at once
        return None
    if user.password_changed_at and payload.get("iat", 0) < int(user.password_changed_at.timestamp()):
        return None  # signed in before the password was changed (e.g. on a lost phone)
    return user


RESET_MINUTES = 60


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_reset_link(db: Session, user: User, minutes: int = RESET_MINUTES) -> tuple[str, datetime]:
    """A one-time link to choose a new password. Only a hash of the token is stored."""
    from app.models import PasswordReset

    token = secrets.token_urlsafe(32)
    expires = now() + timedelta(minutes=minutes)
    db.add(PasswordReset(token_hash=_hash_token(token), user_id=user.id, expires_at=expires))
    db.commit()
    # The React app uses hash routing (#/reset-password), so the link has to include the "#".
    return f"{settings.frontend_origin}/#/reset-password?token={token}", expires


def reset_token_status(db: Session, token: str) -> str:
    """"valid", "expired", "used" or "invalid", so the reset page can say what to do. Only says something about the
    link itself (which the person holds), never about whether an email address has an account."""
    from app.models import PasswordReset

    r = db.get(PasswordReset, _hash_token(token)) if token else None
    if not r:
        return "invalid"
    if r.used_at:
        return "used"
    if r.expires_at < now():
        return "expired"
    user = db.get(User, r.user_id)
    return "valid" if user and not user.removed_at else "invalid"


def use_reset_token(db: Session, token: str) -> User | None:
    """The account a valid link belongs to, with that link and every other open link for the account used up."""
    from app.models import PasswordReset

    if reset_token_status(db, token) != "valid":
        return None
    r = db.get(PasswordReset, _hash_token(token))
    used = now()
    for other in db.exec(select(PasswordReset).where(PasswordReset.user_id == r.user_id, PasswordReset.used_at == None)).all():  # noqa: E711
        other.used_at = used
        db.add(other)
    return db.get(User, r.user_id)


def get_current_user(
    token: str | None = Depends(oauth2),
    db: Session = Depends(get_session),
) -> User:
    user = user_from_token(token, db) if token else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in", {"WWW-Authenticate": "Bearer"})
    return user


def require_role(*roles: str):
    """Use as `dependencies=[Depends(require_role("Admin"))]` on a route."""

    def check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Needs role: {', '.join(roles)}")
        return user

    return check
