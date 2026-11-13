"""The Overview screen: the family poll, the prompt of the week, and /overview, which gathers the dashboard in one call."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, func, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import Person, Poll, PollVote, Prompt, PromptReply, ThreadMember, User, iso, now

router = APIRouter(tags=["overview"])
MODERATORS = ("Admin", "Custodian")


# ---------- schemas ----------

class PollOut(BaseModel):
    id: str
    question: str
    options: list[str]
    votes: list[int]
    total: int
    mine: int | None  # index of your choice, or None if you haven't voted


class PollCreate(BaseModel):
    question: str = Field(min_length=1, max_length=200)
    options: list[str] = Field(min_length=2, max_length=6)

    @field_validator("options")
    @classmethod
    def clean(cls, v: list[str]) -> list[str]:
        v = [o.strip() for o in v]
        if any(not o for o in v) or len(set(v)) != len(v):
            raise ValueError("options must be filled in and different from each other")
        return v

    model_config = {"json_schema_extra": {"examples": [{
        "question": "Where should we meet next summer?", "options": ["Edinburgh", "Glasgow", "Inverness"]
    }]}}


class VoteIn(BaseModel):
    choice: int = Field(ge=0)

    model_config = {"json_schema_extra": {"examples": [{"choice": 0}]}}


class ReplyOut(BaseModel):
    id: str
    by: str | None
    text: str
    created_at: str
    can_delete: bool


class PromptOut(BaseModel):
    id: str
    question: str
    by: str | None
    created_at: str
    replies: list[ReplyOut]
    count: int


class PromptCreate(BaseModel):
    question: str = Field(min_length=1, max_length=300)

    model_config = {"json_schema_extra": {"examples": [{"question": "What did your family do on rainy Sundays?"}]}}


class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    model_config = {"json_schema_extra": {"examples": [{"text": "We played cards with Gran by the fire."}]}}


# ---------- poll ----------

def current_poll(db: Session, user: User) -> Poll | None:
    return db.exec(select(Poll).where(Poll.family_id == user.family_id, Poll.closed_at == None)  # noqa: E711
                   .order_by(Poll.created_at.desc())).first()


def poll_out(db: Session, user: User, p: Poll) -> PollOut:
    votes = list(p.base_votes) + [0] * (len(p.options) - len(p.base_votes))
    for choice in db.exec(select(PollVote.choice).where(PollVote.poll_id == p.id)).all():
        if 0 <= choice < len(votes):
            votes[choice] += 1
    mine = db.get(PollVote, (p.id, user.id))
    return PollOut(id=p.id, question=p.question, options=p.options, votes=votes, total=sum(votes), mine=mine.choice if mine else None)


def get_poll(db: Session, user: User, pid: str) -> Poll:
    p = db.get(Poll, pid)
    if not p or p.family_id != user.family_id:
        raise HTTPException(404, "Poll not found")
    return p


@router.get("/polls/current", response_model=PollOut | None)
def read_current_poll(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = current_poll(db, user)
    return poll_out(db, user, p) if p else None


@router.post("/polls", response_model=PollOut, status_code=201, dependencies=[Depends(require_role(*MODERATORS))])
def create_poll(body: PollCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Start a new poll; the previous one closes."""
    if (old := current_poll(db, user)):
        old.closed_at = now()
        db.add(old)
    p = Poll(family_id=user.family_id, question=body.question.strip(), options=body.options, created_by=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return poll_out(db, user, p)


@router.put("/polls/{pid}/vote", response_model=PollOut)
def vote(pid: str, body: VoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """One vote per person; voting again changes it. Viewers can vote."""
    p = get_poll(db, user, pid)
    if p.closed_at:
        raise HTTPException(422, "This poll has closed")
    if body.choice >= len(p.options):
        raise HTTPException(422, f"choice must be between 0 and {len(p.options) - 1}")
    v = db.get(PollVote, (pid, user.id)) or PollVote(poll_id=pid, user_id=user.id, choice=body.choice)
    v.choice = body.choice
    db.add(v)
    db.commit()
    return poll_out(db, user, p)


@router.delete("/polls/{pid}/vote", response_model=PollOut)
def unvote(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = get_poll(db, user, pid)
    if (v := db.get(PollVote, (pid, user.id))):
        db.delete(v)
        db.commit()
    return poll_out(db, user, p)


@router.post("/polls/{pid}/close", response_model=PollOut, dependencies=[Depends(require_role(*MODERATORS))])
def close_poll(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = get_poll(db, user, pid)
    p.closed_at = p.closed_at or now()
    db.add(p)
    db.commit()
    return poll_out(db, user, p)


# ---------- prompt of the week ----------

def current_prompt(db: Session, user: User) -> Prompt | None:
    return db.exec(select(Prompt).where(Prompt.family_id == user.family_id).order_by(Prompt.created_at.desc())).first()


def prompt_out(db: Session, user: User, p: Prompt) -> PromptOut:
    rows = db.exec(select(PromptReply).where(PromptReply.prompt_id == p.id, PromptReply.deleted_at == None)  # noqa: E711
                   .order_by(PromptReply.created_at)).all()
    replies = [ReplyOut(id=r.id, by=r.by, text=r.text, created_at=iso(r.created_at),
                        can_delete=r.user_id == user.id or user.role in MODERATORS) for r in rows]
    return PromptOut(id=p.id, question=p.question, by=p.by, created_at=iso(p.created_at), replies=replies, count=len(replies))


def get_prompt(db: Session, user: User, pid: str) -> Prompt:
    p = db.get(Prompt, pid)
    if not p or p.family_id != user.family_id:
        raise HTTPException(404, "Prompt not found")
    return p


@router.get("/prompts/current", response_model=PromptOut | None)
def read_current_prompt(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = current_prompt(db, user)
    return prompt_out(db, user, p) if p else None


@router.post("/prompts", response_model=PromptOut, status_code=201, dependencies=[Depends(require_role(*MODERATORS))])
def create_prompt(body: PromptCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Set this week's question."""
    p = Prompt(family_id=user.family_id, question=body.question.strip(), by=user.person_id, created_by=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return prompt_out(db, user, p)


@router.post("/prompts/{pid}/replies", response_model=ReplyOut, status_code=201)
def reply(pid: str, body: ReplyIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Share a memory in answer to the prompt. Everyone can reply, Viewers included."""
    get_prompt(db, user, pid)
    if not body.text.strip():
        raise HTTPException(422, "Write something first")
    r = PromptReply(prompt_id=pid, user_id=user.id, by=user.person_id, text=body.text.strip())
    db.add(r)
    db.commit()
    db.refresh(r)
    return ReplyOut(id=r.id, by=r.by, text=r.text, created_at=iso(r.created_at), can_delete=True)


@router.delete("/prompts/{pid}/replies/{rid}", status_code=204)
def delete_reply(pid: str, rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_prompt(db, user, pid)
    r = db.get(PromptReply, rid)
    if not r or r.prompt_id != pid or r.deleted_at:
        raise HTTPException(404, "Reply not found")
    if r.user_id != user.id and user.role not in MODERATORS:
        raise HTTPException(403, "You can only remove your own replies")
    r.deleted_at = now()
    db.add(r)
    db.commit()
    return Response(status_code=204)


# ---------- dashboard ----------

@router.get("/overview")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Everything the Overview shows, in one request. Each part follows the same privacy rules as its own endpoint."""
    # Imported here so this module doesn't depend on the others at import time.
    from app.routers.calendar import calendar
    from app.routers.memories import list_memories
    from app.routers.stories import list_stories
    from app.routers.threads import unread_count

    fid = user.family_id
    upcoming = calendar(frm=None, to=None, kinds="birthday,anniversary,gathering", user=user, db=db)
    memories = list_memories(type=None, tagged=None, q=None, fav=False, user=user, db=db)
    stories = list_stories(category=None, kind=None, by=None, q=None, user=user, db=db)
    unread = sum(unread_count(db, m) for m in db.exec(select(ThreadMember).where(
        ThreadMember.user_id == user.id, ThreadMember.left_at == None, ThreadMember.hidden_at == None)).all())  # noqa: E711
    poll, prompt = current_poll(db, user), current_prompt(db, user)
    return {
        "counts": {
            "people": db.exec(select(func.count()).select_from(Person).where(Person.family_id == fid, Person.deleted_at == None)).one(),  # noqa: E711
            "memories": len(memories),
            "stories": len(stories),
            "unread_messages": unread,
        },
        "upcoming": [i.model_dump() for i in upcoming[:6]],
        "next_birthday": next((i.model_dump() for i in upcoming if i.kind == "birthday" and i.person_id != user.person_id), None),
        "recent_memories": [m.model_dump() for m in sorted(memories, key=lambda m: m.date, reverse=True)[:3]],
        "recent_stories": [s.model_dump() for s in stories[:3]],
        "poll": poll_out(db, user, poll).model_dump() if poll else None,
        "prompt": prompt_out(db, user, prompt).model_dump() if prompt else None,
    }
