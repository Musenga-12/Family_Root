"""/notifications: what the bell in the top bar shows. Other routers create them with `notify(...)`; each one is
stored (so it waits until it is read) and also pushed to any open tab as {"type": "notification.new", ...}."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Notification, User, iso, now
from app.realtime import hub

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    body: str | None
    link: str | None
    created_at: str
    read: bool


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


def to_out(n: Notification) -> NotificationOut:
    return NotificationOut(id=n.id, kind=n.kind, title=n.title, body=n.body, link=n.link, created_at=iso(n.created_at),
                           read=n.read_at is not None)


def notify(db: Session, family_id: int, user_ids, kind: str, title: str, body: str | None = None,
           link: str | None = None, exclude: int | None = None) -> None:
    """Store a notification for each of these accounts (skipping `exclude`, usually whoever caused it) and push it live.
    Commits. Call it after the change it reports has been committed."""
    ids = sorted({u for u in user_ids if u and u != exclude})
    rows = [Notification(family_id=family_id, user_id=u, kind=kind, title=title, body=body, link=link) for u in ids]
    if not rows:
        return
    db.add_all(rows)
    db.commit()
    for n in rows:
        db.refresh(n)
        hub.notify([n.user_id], {"type": "notification.new", "notification": to_out(n).model_dump()})


def family_users(db: Session, family_id: int, roles: tuple[str, ...] | None = None) -> list[int]:
    """Active accounts in a family, optionally only those with one of `roles`."""
    stmt = select(User.id).where(User.family_id == family_id, User.removed_at == None)  # noqa: E711
    if roles:
        stmt = stmt.where(User.role.in_(roles))
    return list(db.exec(stmt).all())


def get_mine(db: Session, user: User, nid: str) -> Notification:
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    return n


@router.get("", response_model=NotificationList)
def list_notifications(unread_only: bool = False, limit: int = Query(50, ge=1, le=200),
                       user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Newest first, with the number still unread (for the badge on the bell)."""
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at == None)  # noqa: E711
    items = db.exec(stmt.order_by(Notification.created_at.desc()).limit(limit)).all()
    unread = db.exec(select(func.count()).select_from(Notification)
                     .where(Notification.user_id == user.id, Notification.read_at == None)).one()  # noqa: E711
    return NotificationList(items=[to_out(n) for n in items], unread=unread)


@router.post("/{nid}/read", response_model=NotificationOut)
def mark_read(nid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    n = get_mine(db, user, nid)
    n.read_at = n.read_at or now()
    db.add(n)
    db.commit()
    db.refresh(n)
    return to_out(n)


@router.post("/{nid}/unread", response_model=NotificationOut)
def mark_unread(nid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    n = get_mine(db, user, nid)
    n.read_at = None
    db.add(n)
    db.commit()
    db.refresh(n)
    return to_out(n)


@router.post("/read-all", status_code=204)
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    for n in db.exec(select(Notification).where(Notification.user_id == user.id, Notification.read_at == None)).all():  # noqa: E711
        n.read_at = now()
        db.add(n)
    db.commit()
    return Response(status_code=204)
