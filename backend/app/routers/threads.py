"""/threads: private and group conversations.

Members are accounts (users). In responses they are named by person id where the account is linked to the tree
(e.g. "mary"), otherwise "u<user id>", matching how the frontend refers to people.
Everything personal (pinned, muted, unread, starred, cleared, hidden) is stored per member, so one person's
choices never change anyone else's view.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Message, MessageReaction, MessageStar, Thread, ThreadMember, User, iso, now
from app.realtime import hub
from app.routers.uploads import family_upload, file_url

router = APIRouter(prefix="/threads", tags=["messages"])
MAX_TEXT = 4000


# ---------- schemas ----------

class MemberOut(BaseModel):
    key: str  # person id, or "u<user id>"
    user_id: int
    person_id: str | None
    name: str


class MessageOut(BaseModel):
    id: str
    thread_id: str
    by: str  # sender key
    sender_id: int
    at: str  # UTC ISO time
    text: str
    reply_to: str | None
    img: str | None  # signed link to an attached photo
    reactions: dict[str, str]  # member key -> emoji
    starred: bool
    deleted: bool
    status: str | None  # your own messages only: "delivered" or "read"


class ThreadOut(BaseModel):
    id: str
    title: str
    group: bool
    members: list[str]
    member_details: list[MemberOut]
    pinned: bool
    muted: bool
    unread: int
    last: MessageOut | None
    last_message_at: str


class NewThreadIn(BaseModel):
    to: list[str] = Field(min_length=1, description="person ids of the other members")
    title: str | None = None  # groups only; defaults to the members' first names
    text: str = Field("", max_length=MAX_TEXT)
    upload_id: str | None = None

    model_config = {"json_schema_extra": {"examples": [{"to": ["sarah"], "text": "Hi Sarah, are you coming on Sunday?"}]}}


class SendIn(BaseModel):
    text: str = Field("", max_length=MAX_TEXT)
    reply_to: str | None = None
    upload_id: str | None = None

    model_config = {"json_schema_extra": {"examples": [{"text": "See you on Sunday!"}]}}


class ThreadUpdate(BaseModel):
    pinned: bool | None = None
    muted: bool | None = None
    unread: bool | None = None  # true = "Mark as unread", false = mark as read
    title: str | None = Field(None, min_length=1, max_length=120)  # groups only

    model_config = {"json_schema_extra": {"examples": [{"pinned": True}]}}


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)

    model_config = {"json_schema_extra": {"examples": [{"emoji": "❤️"}]}}


class MessagePage(BaseModel):
    messages: list[MessageOut]
    has_more: bool


# ---------- helpers ----------

def key(u: User) -> str:
    return u.person_id or f"u{u.id}"


class Ctx:
    """Family accounts, loaded once per request."""

    def __init__(self, db: Session, user: User):
        self.db, self.user = db, user
        self.users = {u.id: u for u in db.exec(select(User).where(User.family_id == user.family_id)).all()}


def active_members(db: Session, tid: str) -> list[ThreadMember]:
    return list(db.exec(select(ThreadMember).where(ThreadMember.thread_id == tid, ThreadMember.left_at == None)).all())  # noqa: E711


def get_membership(db: Session, user: User, tid: str, allow_gone: bool = False) -> tuple[Thread, ThreadMember]:
    t = db.get(Thread, tid)
    mem = db.get(ThreadMember, (tid, user.id)) if t else None
    if not t or t.family_id != user.family_id or not mem or (not allow_gone and (mem.left_at or mem.hidden_at)):
        raise HTTPException(404, "Conversation not found")
    return t, mem


def get_message(db: Session, tid: str, mid: str) -> Message:
    m = db.get(Message, mid)
    if not m or m.thread_id != tid:
        raise HTTPException(404, "Message not found")
    return m


def read_cutoff(db: Session, user: User, members: list[ThreadMember]) -> datetime | None:
    """Your messages up to this time have been read by everyone else in the thread."""
    others = [m.last_read_at for m in members if m.user_id != user.id]
    if not others or any(x is None for x in others):
        return None
    return min(others)


def messages_out(ctx: Ctx, msgs: list[Message], members: list[ThreadMember]) -> list[MessageOut]:
    db, user = ctx.db, ctx.user
    ids = [m.id for m in msgs]
    reacts: dict[str, dict[str, str]] = {}
    stars: set[str] = set()
    if ids:
        for r in db.exec(select(MessageReaction).where(MessageReaction.message_id.in_(ids))).all():
            if r.user_id in ctx.users:
                reacts.setdefault(r.message_id, {})[key(ctx.users[r.user_id])] = r.emoji
        stars = set(db.exec(select(MessageStar.message_id).where(MessageStar.user_id == user.id, MessageStar.message_id.in_(ids))).all())
    cutoff = read_cutoff(db, user, members)
    out = []
    for m in msgs:
        sender = ctx.users.get(m.sender_id)
        gone = m.deleted_at is not None
        status = None
        if m.sender_id == user.id and not gone:
            status = "read" if cutoff and m.at <= cutoff else "delivered"
        out.append(MessageOut(
            id=m.id, thread_id=m.thread_id, by=key(sender) if sender else f"u{m.sender_id}", sender_id=m.sender_id,
            at=iso(m.at), text="" if gone else m.text, reply_to=m.reply_to, img=None if gone else file_url(m.upload_id),
            reactions={} if gone else reacts.get(m.id, {}), starred=m.id in stars and not gone, deleted=gone, status=status,
        ))
    return out


def thread_title(ctx: Ctx, t: Thread, members: list[ThreadMember]) -> str:
    if t.group:
        return t.title or "Group"
    other = next((ctx.users[m.user_id] for m in members if m.user_id != ctx.user.id and m.user_id in ctx.users), None)
    return other.name if other else "Conversation"


def unread_count(db: Session, mem: ThreadMember) -> int:
    since = max(filter(None, [mem.last_read_at, mem.cleared_at]), default=None)
    stmt = select(func.count()).select_from(Message).where(
        Message.thread_id == mem.thread_id, Message.sender_id != mem.user_id, Message.deleted_at == None)  # noqa: E711
    if since:
        stmt = stmt.where(Message.at > since)
    n = db.exec(stmt).one()
    return max(n, 1) if mem.marked_unread else n


def thread_out(ctx: Ctx, t: Thread, mem: ThreadMember) -> ThreadOut:
    db = ctx.db
    members = active_members(db, t.id)
    stmt = select(Message).where(Message.thread_id == t.id)
    if mem.cleared_at:
        stmt = stmt.where(Message.at > mem.cleared_at)
    # Preview: the latest message that wasn't deleted, else the latest one (shown as "deleted").
    last = db.exec(stmt.where(Message.deleted_at == None).order_by(Message.at.desc())).first() \
        or db.exec(stmt.order_by(Message.at.desc())).first()  # noqa: E711
    details = [MemberOut(key=key(u), user_id=u.id, person_id=u.person_id, name=u.name)
               for m in members if (u := ctx.users.get(m.user_id))]
    return ThreadOut(
        id=t.id, title=thread_title(ctx, t, members), group=t.group, members=[d.key for d in details], member_details=details,
        pinned=mem.pinned, muted=mem.muted, unread=unread_count(db, mem),
        last=messages_out(ctx, [last], members)[0] if last else None, last_message_at=iso(t.last_message_at),
    )


def broadcast(db: Session, tid: str, event: dict, exclude: int | None = None) -> None:
    hub.notify([m.user_id for m in active_members(db, tid) if m.user_id != exclude], {**event, "thread_id": tid})


def post_message(ctx: Ctx, t: Thread, mem: ThreadMember, body: SendIn) -> Message:
    db, user = ctx.db, ctx.user
    text = body.text.strip()
    if not text and not body.upload_id:
        raise HTTPException(422, "Write a message or attach a photo")
    if body.upload_id:
        up = family_upload(db, user, body.upload_id, kind="image")
        if up.owner_user_id != user.id:
            raise HTTPException(422, "You can only attach photos you uploaded")
    if body.reply_to:
        get_message(db, t.id, body.reply_to)

    m = Message(thread_id=t.id, sender_id=user.id, text=text, reply_to=body.reply_to, upload_id=body.upload_id)
    t.last_message_at = m.at
    mem.last_read_at, mem.marked_unread = m.at, False  # you've read up to your own message
    db.add_all([m, t, mem])
    for other in active_members(db, t.id):
        if other.hidden_at and other.user_id != user.id:  # a deleted 1-to-1 chat reappears with the new message
            other.hidden_at = None
            db.add(other)
    db.commit()
    db.refresh(m)
    members = active_members(db, t.id)
    out = messages_out(ctx, [m], members)[0]
    broadcast(db, t.id, {"type": "message.new", "message": out.model_dump() | {"status": None}}, exclude=user.id)
    return m


def message_changed(ctx: Ctx, tid: str, m: Message) -> MessageOut:
    """Return the message as the caller sees it, and tell the other members it changed."""
    members = active_members(ctx.db, tid)
    out = messages_out(ctx, [m], members)[0]
    broadcast(ctx.db, tid, {"type": "message.updated", "message": out.model_dump() | {"starred": False, "status": None}},
              exclude=ctx.user.id)
    return out


# ---------- threads ----------

@router.get("", response_model=list[ThreadOut])
def list_threads(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Your conversations: pinned first, then most recent."""
    ctx = Ctx(db, user)
    rows = db.exec(select(Thread, ThreadMember).join(ThreadMember, ThreadMember.thread_id == Thread.id).where(
        ThreadMember.user_id == user.id, ThreadMember.left_at == None, ThreadMember.hidden_at == None)  # noqa: E711
        .order_by(ThreadMember.pinned.desc(), Thread.last_message_at.desc())).all()
    return [thread_out(ctx, t, mem) for t, mem in rows]


@router.post("/read-all", status_code=204)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    ts = now()
    for mem in db.exec(select(ThreadMember).where(ThreadMember.user_id == user.id, ThreadMember.left_at == None)).all():  # noqa: E711
        mem.last_read_at, mem.marked_unread = ts, False
        db.add(mem)
        broadcast(db, mem.thread_id, {"type": "thread.read", "user_id": user.id}, exclude=user.id)
    db.commit()
    return Response(status_code=204)


@router.post("", response_model=ThreadOut, status_code=201)
def start_thread(body: NewThreadIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Send a first message. With one recipient, the existing private chat is reused (and un-hidden) if there is one."""
    ctx = Ctx(db, user)
    active = {uid: u for uid, u in ctx.users.items() if not u.removed_at}  # removed members can't sign in to read it
    by_person = {u.person_id: u for u in active.values() if u.person_id}
    recipients: list[User] = []
    for pid in dict.fromkeys(body.to):
        u = by_person.get(pid) or (active.get(int(pid[1:])) if pid.startswith("u") and pid[1:].isdigit() else None)
        if not u:
            raise HTTPException(422, f"{pid} doesn't have a FamilyRoots account yet, so they can't receive messages")
        if u.id != user.id:
            recipients.append(u)
    if not recipients:
        raise HTTPException(422, "Choose at least one other person")

    t = mem = None
    if len(recipients) == 1:
        other = recipients[0]
        mine = select(ThreadMember.thread_id).where(ThreadMember.user_id == user.id)
        theirs = select(ThreadMember.thread_id).where(ThreadMember.user_id == other.id)
        t = db.exec(select(Thread).where(Thread.family_id == user.family_id, Thread.group == False,  # noqa: E712
                                         Thread.id.in_(mine), Thread.id.in_(theirs))).first()
        if t:
            mem = db.get(ThreadMember, (t.id, user.id))
            mem.hidden_at = None
    if not t:
        group = len(recipients) > 1
        title = (body.title or ", ".join(u.name.split()[0] for u in [user, *recipients])).strip() if group else None
        t = Thread(family_id=user.family_id, group=group, title=title, created_by=user.id)
        db.add(t)
        db.flush()
        mem = ThreadMember(thread_id=t.id, user_id=user.id)
        db.add_all([mem, *[ThreadMember(thread_id=t.id, user_id=u.id) for u in recipients]])
        db.flush()
    post_message(ctx, t, mem, SendIn(text=body.text, upload_id=body.upload_id))
    db.refresh(t)
    db.refresh(mem)
    return thread_out(ctx, t, mem)


@router.get("/{tid}", response_model=ThreadOut)
def read_thread(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    t, mem = get_membership(db, user, tid)
    return thread_out(Ctx(db, user), t, mem)


@router.patch("/{tid}", response_model=ThreadOut)
def update_thread(tid: str, body: ThreadUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    t, mem = get_membership(db, user, tid)
    if body.pinned is not None:
        mem.pinned = body.pinned
    if body.muted is not None:
        mem.muted = body.muted
    if body.unread is True:
        mem.marked_unread = True
    elif body.unread is False:
        mem.last_read_at, mem.marked_unread = now(), False
    if body.title is not None:
        if not t.group:
            raise HTTPException(422, "Only group chats can be renamed")
        t.title = body.title.strip()
        db.add(t)
    db.add(mem)
    db.commit()
    if body.title is not None:
        broadcast(db, tid, {"type": "thread.updated", "title": t.title}, exclude=user.id)
    db.refresh(t)
    db.refresh(mem)
    return thread_out(Ctx(db, user), t, mem)


@router.post("/{tid}/read", status_code=204)
def mark_read(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Call when a chat is opened; turns the sender's ticks to "read" once everyone has seen a message."""
    _, mem = get_membership(db, user, tid)
    mem.last_read_at, mem.marked_unread = now(), False
    db.add(mem)
    db.commit()
    broadcast(db, tid, {"type": "thread.read", "user_id": user.id}, exclude=user.id)
    return Response(status_code=204)


@router.delete("/{tid}", status_code=204)
def leave_or_delete(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Group: leave it. Private chat: delete it for you (it returns, empty, if they write again)."""
    t, mem = get_membership(db, user, tid)
    if t.group:
        mem.left_at = now()
    else:
        mem.hidden_at = now()
        mem.prev_cleared_at, mem.cleared_at = mem.cleared_at, now()
    db.add(mem)
    db.commit()
    if t.group:
        broadcast(db, tid, {"type": "thread.updated", "left": key(user)})
    return Response(status_code=204)


@router.post("/{tid}/restore", response_model=ThreadOut)
def restore_thread(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Undo for leaving a group or deleting a chat."""
    t, mem = get_membership(db, user, tid, allow_gone=True)
    if mem.left_at:
        mem.left_at = None
    if mem.hidden_at:
        mem.hidden_at = None
        mem.cleared_at = mem.prev_cleared_at
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return thread_out(Ctx(db, user), t, mem)


# ---------- messages ----------

@router.get("/{tid}/messages", response_model=MessagePage)
def list_messages(
    tid: str,
    before: str | None = Query(None, description="message id: return older messages than this one"),
    limit: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, description="search text in this chat"),
    starred: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Oldest first. Load more with ?before=<id of the oldest message you have>."""
    t, mem = get_membership(db, user, tid)
    stmt = select(Message).where(Message.thread_id == tid)
    if mem.cleared_at:
        stmt = stmt.where(Message.at > mem.cleared_at)
    if before:
        b = get_message(db, tid, before)
        stmt = stmt.where((Message.at < b.at) | ((Message.at == b.at) & (Message.id < b.id)))
    if q:
        # Case-insensitive on every database (PostgreSQL's LIKE isn't), and % or _ typed in the box are just characters.
        stmt = stmt.where(Message.text.icontains(q.strip(), autoescape=True), Message.deleted_at == None)  # noqa: E711
    if starred:
        stmt = stmt.where(Message.id.in_(select(MessageStar.message_id).where(MessageStar.user_id == user.id)),
                          Message.deleted_at == None)  # noqa: E711
    rows = list(db.exec(stmt.order_by(Message.at.desc(), Message.id.desc()).limit(limit + 1)).all())
    has_more = len(rows) > limit
    rows = rows[:limit][::-1]
    return MessagePage(messages=messages_out(Ctx(db, user), rows, active_members(db, tid)), has_more=has_more)


@router.post("/{tid}/messages", response_model=MessageOut, status_code=201)
def send(tid: str, body: SendIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    t, mem = get_membership(db, user, tid)
    ctx = Ctx(db, user)
    m = post_message(ctx, t, mem, body)
    return messages_out(ctx, [m], active_members(db, tid))[0]


@router.delete("/{tid}/messages", status_code=204)
def clear_chat(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """"Clear chat": hides the history for you only. Undo with POST /threads/{tid}/messages/restore."""
    _, mem = get_membership(db, user, tid)
    mem.prev_cleared_at, mem.cleared_at = mem.cleared_at, now()
    db.add(mem)
    db.commit()
    return Response(status_code=204)


@router.post("/{tid}/messages/restore", status_code=204)
def unclear_chat(tid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    _, mem = get_membership(db, user, tid)
    mem.cleared_at = mem.prev_cleared_at
    db.add(mem)
    db.commit()
    return Response(status_code=204)


@router.delete("/{tid}/messages/{mid}", response_model=MessageOut)
def delete_message(tid: str, mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """"Delete for everyone": sender only. Everyone then sees "This message was deleted"."""
    get_membership(db, user, tid)
    m = get_message(db, tid, mid)
    if m.sender_id != user.id:
        raise HTTPException(403, "You can only delete your own messages")
    m.deleted_at = m.deleted_at or now()
    db.add(m)
    db.commit()
    db.refresh(m)
    return message_changed(Ctx(db, user), tid, m)


@router.post("/{tid}/messages/{mid}/restore", response_model=MessageOut)
def restore_message(tid: str, mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_membership(db, user, tid)
    m = get_message(db, tid, mid)
    if m.sender_id != user.id:
        raise HTTPException(403, "You can only restore your own messages")
    m.deleted_at = None
    db.add(m)
    db.commit()
    db.refresh(m)
    return message_changed(Ctx(db, user), tid, m)


@router.put("/{tid}/messages/{mid}/reaction", response_model=MessageOut)
def react(tid: str, mid: str, body: ReactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """One reaction per person per message; sending a new emoji replaces the old one."""
    get_membership(db, user, tid)
    m = get_message(db, tid, mid)
    if m.deleted_at:
        raise HTTPException(422, "Can't react to a deleted message")
    r = db.get(MessageReaction, (mid, user.id)) or MessageReaction(message_id=mid, user_id=user.id, emoji=body.emoji)
    r.emoji = body.emoji.strip()
    db.add(r)
    db.commit()
    return message_changed(Ctx(db, user), tid, m)


@router.delete("/{tid}/messages/{mid}/reaction", response_model=MessageOut)
def unreact(tid: str, mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_membership(db, user, tid)
    m = get_message(db, tid, mid)
    r = db.get(MessageReaction, (mid, user.id))
    if r:
        db.delete(r)
        db.commit()
    return message_changed(Ctx(db, user), tid, m)


@router.put("/{tid}/messages/{mid}/star", status_code=204)
def star(tid: str, mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_membership(db, user, tid)
    get_message(db, tid, mid)
    if not db.get(MessageStar, (mid, user.id)):
        db.add(MessageStar(message_id=mid, user_id=user.id))
        db.commit()
    return Response(status_code=204)


@router.delete("/{tid}/messages/{mid}/star", status_code=204)
def unstar(tid: str, mid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_membership(db, user, tid)
    s = db.get(MessageStar, (mid, user.id))
    if s:
        db.delete(s)
        db.commit()
    return Response(status_code=204)
