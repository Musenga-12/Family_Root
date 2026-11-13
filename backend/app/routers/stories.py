"""/stories: written memories and recorded oral histories, plus loves and reflections.

Saving a recording, either way works:
  A. One request:  POST /stories/audio  (multipart: file + title, transcript, duration, ...)
  B. Two requests: POST /uploads  ->  POST /stories with upload_id and duration
"""
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import STORY_CATEGORIES, VISIBILITY, Family, Reflection, Story, StoryBase, StoryLove, User, now
from app.routers.uploads import family_upload, file_url, save_upload
from app.visibility import Kin, can_see

router = APIRouter(prefix="/stories", tags=["stories"])
EDITORS = ("Admin", "Custodian", "Contributor")
MODERATORS = ("Admin", "Custodian")
MAX_SECONDS = 4 * 60 * 60

# The Recording Studio's audience labels, mapped to the archive's visibility levels.
AUDIENCE_ALIASES = {"Only Me (private draft)": "Only Me (draft)", "Family circle": "All Family Branches"}


def normalize_visibility(v: str | None, family_name: str | None = None, default: str = "All Family Branches") -> str:
    v = (v or default).strip()
    v = AUDIENCE_ALIASES.get(v, v)
    if v.endswith("Kinship Circle") or (family_name and v == family_name):  # "Mackenzie Kinship Circle"
        v = "All Family Branches"
    if v not in VISIBILITY:
        raise HTTPException(422, f"visibility must be one of: {', '.join(VISIBILITY)}")
    return v


def check_category(c: str) -> str:
    if c not in STORY_CATEGORIES:
        raise HTTPException(422, f"category must be one of: {', '.join(STORY_CATEGORIES)}")
    return c


def make_excerpt(text: str, n: int) -> str:
    text = text.strip()
    return text[:n] + ("…" if len(text) > n else "")


# ---------- schemas ----------

class StoryOut(StoryBase):
    id: str
    by: str | None
    upload_id: str | None
    audio_url: str | None  # signed link for <audio src>
    loves: int
    reflections: int
    loved: bool = False  # did the current user love it
    can_edit: bool = False


class StoryCreate(BaseModel):
    """A written story, or an audio story whose file was already sent to POST /uploads."""
    title: str = Field(min_length=1)
    text: str = ""  # the written story, or the recording's transcript
    category: str | None = None
    visibility: str | None = None
    tag: str | None = None
    prompt: str | None = None
    recorded: date | None = None  # defaults to today; set it for older tapes being digitised
    upload_id: str | None = None
    duration: int | None = Field(default=None, ge=1, le=MAX_SECONDS)

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("is required")
        return v.strip()


class StoryUpdate(BaseModel):
    title: str | None = None
    text: str | None = None  # edit the written story or correct the transcript
    category: str | None = None
    visibility: str | None = None
    tag: str | None = None
    excerpt: str | None = None


class ReflectionIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ReflectionOut(BaseModel):
    id: str
    by: str | None
    text: str
    created_at: str
    can_delete: bool


# ---------- helpers ----------

def may_edit(user: User, s: Story) -> bool:
    return s.owner_user_id == user.id or user.role in MODERATORS


def visible(user: User, kin: Kin, s: Story) -> bool:
    return can_see(user, kin, s.visibility, s.owner_user_id, s.by, [])


def get_story(db: Session, user: User, sid: str, include_deleted: bool = False) -> Story:
    s = db.get(Story, sid)
    if not s or s.family_id != user.family_id or (s.deleted_at and not include_deleted) \
            or not visible(user, Kin(db, user.family_id), s):
        raise HTTPException(404, "Story not found")
    return s


def loved_ids(db: Session, user: User) -> set[str]:
    return set(db.exec(select(StoryLove.story_id).where(StoryLove.user_id == user.id)).all())


def out(user: User, s: Story, loved: set[str]) -> StoryOut:
    return StoryOut(**s.model_dump(), audio_url=file_url(s.upload_id), loved=s.id in loved, can_edit=may_edit(user, s))


def build_story(user: User, *, title: str, text: str, category: str | None, visibility: str, tag: str | None,
                prompt: str | None, recorded: date | None, upload_id: str | None, duration: int | None) -> Story:
    audio = upload_id is not None
    if audio and not duration:
        raise HTTPException(422, "duration (seconds) is required for a recording")
    if not audio and not text.strip():
        raise HTTPException(422, "Write the story, or attach a recording")
    if audio:
        excerpt = make_excerpt(text, 160) if text.strip() else (f"A recorded answer to: “{prompt}”" if prompt else "")
    else:
        excerpt = make_excerpt(text, 180)
    return Story(
        family_id=user.family_id, by=user.person_id, owner_user_id=user.id, title=title,
        kind="audio" if audio else "written",
        category=check_category(category or ("Spoken Audio" if audio else "Written Memories")),
        recorded=(recorded or date.today()).isoformat(), duration=duration if audio else None,
        tag=tag, excerpt=excerpt, transcript=text.strip(), prompt=prompt, visibility=visibility, upload_id=upload_id,
    )


def my_default(db: Session, user: User) -> str:
    """The person's own default for new stories (Privacy: "Voice recordings and stories")."""
    return Kin(db, user.family_id).category(user.person_id, "stories")


def family_name(db: Session, user: User) -> str | None:
    f = db.get(Family, user.family_id)
    return f.name if f else None


# ---------- stories ----------

@router.get("", response_model=list[StoryOut])
def list_stories(
    category: str | None = None,
    kind: str | None = Query(None, description="audio or written"),
    by: str | None = Query(None, description="person id of the storyteller"),
    q: str | None = Query(None, description="search title, excerpt and transcript"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    stmt = select(Story).where(Story.family_id == user.family_id, Story.deleted_at == None)  # noqa: E711
    if category:
        stmt = stmt.where(Story.category == category)
    if kind:
        stmt = stmt.where(Story.kind == kind)
    if by:
        stmt = stmt.where(Story.by == by)
    kin, loved = Kin(db, user.family_id), loved_ids(db, user)
    needle = (q or "").strip().lower()
    result = []
    for s in db.exec(stmt.order_by(Story.created_at.desc(), Story.recorded.desc())).all():
        if not visible(user, kin, s):
            continue
        if needle and needle not in f"{s.title} {s.excerpt} {s.transcript}".lower():
            continue
        result.append(out(user, s, loved))
    return result


@router.get("/{sid}", response_model=StoryOut)
def read_story(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return out(user, get_story(db, user, sid), loved_ids(db, user))


@router.post("", response_model=StoryOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_story(body: StoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if body.upload_id:
        family_upload(db, user, body.upload_id, kind="audio")
    s = build_story(user, title=body.title, text=body.text, category=body.category,
                    visibility=normalize_visibility(body.visibility, family_name(db, user), my_default(db, user)), tag=body.tag,
                    prompt=body.prompt, recorded=body.recorded, upload_id=body.upload_id, duration=body.duration)
    db.add(s)
    db.commit()
    db.refresh(s)
    return out(user, s, set())


@router.post("/audio", response_model=StoryOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
async def create_audio_story(
    file: UploadFile = File(..., description="the recording (WebM, Ogg, MP3, M4A or WAV)"),
    title: str = Form(..., min_length=1),
    duration: int = Form(..., ge=1, le=MAX_SECONDS),
    transcript: str = Form(""),
    category: str | None = Form(None),
    visibility: str | None = Form(None, description="a visibility level, or a Recording Studio audience"),
    prompt: str | None = Form(None),
    tag: str | None = Form(None),
    recorded: date | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """The Recording Studio's Save button: the audio and its details in one request."""
    if not title.strip():
        raise HTTPException(422, "title is required")
    vis = normalize_visibility(visibility, family_name(db, user), my_default(db, user))  # check before storing the file
    if category:
        check_category(category)
    up = await save_upload(file, user, db, kind="audio")
    s = build_story(user, title=title.strip(), text=transcript, category=category, visibility=vis, tag=tag,
                    prompt=prompt, recorded=recorded, upload_id=up.id, duration=duration)
    db.add(s)
    db.commit()
    db.refresh(s)
    return out(user, s, set())


@router.patch("/{sid}", response_model=StoryOut)
def update_story(sid: str, body: StoryUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = get_story(db, user, sid)
    if not may_edit(user, s):
        raise HTTPException(403, "Only the storyteller, an Admin or a Custodian can change this story")
    data = body.model_dump(exclude_unset=True)
    if "category" in data:
        check_category(data["category"])
    if "visibility" in data:
        data["visibility"] = normalize_visibility(data["visibility"], family_name(db, user))
    if "text" in data:
        text = data.pop("text") or ""
        if s.kind == "written" and not text.strip():
            raise HTTPException(422, "A written story can't be empty")
        s.transcript = text.strip()
        if "excerpt" not in data:
            data["excerpt"] = make_excerpt(text, 180 if s.kind == "written" else 160) or s.excerpt
    for k, v in data.items():
        setattr(s, k, v)
    db.add(s)
    db.commit()
    db.refresh(s)
    return out(user, s, loved_ids(db, user))


@router.post("/{sid}/verify", response_model=StoryOut, dependencies=[Depends(require_role(*MODERATORS))])
def verify_story(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Mark a story as checked by the family's curators (the "verified" badge)."""
    s = get_story(db, user, sid)
    s.verified = True
    db.add(s)
    db.commit()
    db.refresh(s)
    return out(user, s, loved_ids(db, user))


@router.delete("/{sid}", status_code=204)
def delete_story(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = get_story(db, user, sid)
    if not may_edit(user, s):
        raise HTTPException(403, "Only the storyteller, an Admin or a Custodian can remove this story")
    s.deleted_at = now()
    db.add(s)
    db.commit()
    return Response(status_code=204)


@router.post("/{sid}/restore", response_model=StoryOut)
def restore_story(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = get_story(db, user, sid, include_deleted=True)
    if not may_edit(user, s):
        raise HTTPException(403, "Only the storyteller, an Admin or a Custodian can restore this story")
    s.deleted_at = None
    db.add(s)
    db.commit()
    db.refresh(s)
    return out(user, s, loved_ids(db, user))


# ---------- loves ----------

@router.put("/{sid}/love", response_model=StoryOut)
def love(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = get_story(db, user, sid)
    if not db.get(StoryLove, (user.id, sid)):
        db.add(StoryLove(user_id=user.id, story_id=sid))
        db.execute(update(Story).where(Story.id == sid).values(loves=Story.loves + 1))
        db.commit()
    db.refresh(s)
    return out(user, s, loved_ids(db, user))


@router.delete("/{sid}/love", response_model=StoryOut)
def unlove(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = get_story(db, user, sid)
    row = db.get(StoryLove, (user.id, sid))
    if row:
        db.delete(row)
        db.execute(update(Story).where(Story.id == sid, Story.loves > 0).values(loves=Story.loves - 1))
        db.commit()
    db.refresh(s)
    return out(user, s, loved_ids(db, user))


# ---------- reflections ----------

def reflection_out(user: User, r: Reflection) -> ReflectionOut:
    return ReflectionOut(id=r.id, by=r.by, text=r.text, created_at=r.created_at.isoformat(),
                         can_delete=r.user_id == user.id or user.role in MODERATORS)


@router.get("/{sid}/reflections", response_model=list[ReflectionOut])
def list_reflections(sid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_story(db, user, sid)
    rows = db.exec(select(Reflection).where(Reflection.story_id == sid, Reflection.deleted_at == None)  # noqa: E711
                   .order_by(Reflection.created_at)).all()
    return [reflection_out(user, r) for r in rows]


@router.post("/{sid}/reflections", response_model=ReflectionOut, status_code=201)
def add_reflection(sid: str, body: ReflectionIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Anyone who can see a story may reply to it, Viewers included."""
    get_story(db, user, sid)
    if not body.text.strip():
        raise HTTPException(422, "Write something first")
    r = Reflection(story_id=sid, user_id=user.id, by=user.person_id, text=body.text.strip())
    db.add(r)
    db.execute(update(Story).where(Story.id == sid).values(reflections=Story.reflections + 1))
    db.commit()
    db.refresh(r)
    return reflection_out(user, r)


@router.delete("/{sid}/reflections/{rid}", status_code=204)
def delete_reflection(sid: str, rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_story(db, user, sid)
    r = db.get(Reflection, rid)
    if not r or r.story_id != sid or r.deleted_at:
        raise HTTPException(404, "Reflection not found")
    if r.user_id != user.id and user.role not in MODERATORS:
        raise HTTPException(403, "You can only remove your own reflections")
    r.deleted_at = now()
    db.add(r)
    db.execute(update(Story).where(Story.id == sid, Story.reflections > 0).values(reflections=Story.reflections - 1))
    db.commit()
    return Response(status_code=204)
