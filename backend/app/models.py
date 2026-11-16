"""Database tables. Field names match the React app's data (src/data.js) so the frontend needs few changes."""
import secrets
from datetime import datetime, timezone

from sqlmodel import JSON, Column, Field, SQLModel


def new_id(prefix: str) -> str:
    return f"{prefix}{secrets.token_hex(5)}"


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    """UTC time for API responses, e.g. "2026-11-13T09:30:00Z"."""
    return dt.astimezone(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z" if dt else None


class Family(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    code: str = Field(unique=True, index=True)  # invite code shown on the Auth screen, e.g. MCK-8294
    created_at: datetime = Field(default_factory=now)


class User(SQLModel, table=True):
    """An account that can sign in. `person_id` links it to its node in the family tree."""
    id: int | None = Field(default=None, primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    email: str = Field(unique=True, index=True)
    name: str
    password_hash: str
    role: str = "Contributor"  # Admin | Custodian | Contributor | Viewer
    person_id: str | None = Field(default=None, foreign_key="person.id")
    easy_mode: bool = False
    created_at: datetime = Field(default_factory=now)
    last_active: datetime | None = None
    removed_at: datetime | None = None  # access removed by an Admin; can't sign in
    deletion_requested_at: datetime | None = None  # account closes 30 days later unless cancelled
    password_changed_at: datetime | None = None  # sign-in tokens issued before this stop working


class PersonBase(SQLModel):
    first: str
    last: str
    born: str | None = None  # "YYYY-MM-DD"
    died: str | None = None
    gen: int = 1
    city: str | None = None
    role: str | None = None  # relationship label, e.g. "Daughter"
    occupation: str | None = None
    branch: str | None = None
    color: str | None = None
    note: str | None = None
    married: int | None = None
    bornApprox: bool = False
    pending: bool = False
    verified: bool = False
    minor: bool = False


class Person(PersonBase, table=True):
    id: str = Field(default_factory=lambda: new_id("p"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    parents: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    spouse: str | None = None
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    deleted_at: datetime | None = None  # soft delete, so Undo can restore


class PersonFavorite(SQLModel, table=True):
    """Per-user star in the Directory (the old `fav` flag)."""
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    person_id: str = Field(foreign_key="person.id", primary_key=True)


# ---------- Uploads, memories and albums ----------

VISIBILITY = ("All Family Branches", "Immediate Family", "Only Me (draft)")


class Upload(SQLModel, table=True):
    """A stored file (photo or audio). The bytes live on disk under backend/uploads/<family_id>/."""
    id: str = Field(default_factory=lambda: new_id("u"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    owner_user_id: int = Field(foreign_key="user.id")
    filename: str
    content_type: str
    size: int
    path: str  # relative to the uploads folder
    created_at: datetime = Field(default_factory=now)


class MemoryBase(SQLModel):
    title: str
    date: str  # "YYYY-MM" or "YYYY-MM-DD"
    approx: bool = False
    type: str = "photo"  # photo | document
    place: str | None = None
    label: str | None = None
    visibility: str = "All Family Branches"
    caption: str | None = None
    alt: str  # description for screen readers; the Add memory dialog requires it
    p1: str | None = None  # placeholder gradient colours when there is no image
    p2: str | None = None
    icon: str | None = None
    audio: bool = False


class Memory(MemoryBase, table=True):
    id: str = Field(default_factory=lambda: new_id("m"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    tagged: list[str] = Field(default_factory=list, sa_column=Column(JSON))  # person ids
    upload_id: str | None = Field(default=None, foreign_key="upload.id")
    owner: str | None = None  # person id of whoever added it (None for the archive's own items)
    owner_user_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    deleted_at: datetime | None = None


class MemoryFavorite(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    memory_id: str = Field(foreign_key="memory.id", primary_key=True)


STORY_CATEGORIES = ("Elder Oral Histories", "Spoken Audio", "Written Memories", "Traditions & Recipes")


class StoryBase(SQLModel):
    title: str
    kind: str = "written"  # audio | written
    category: str = "Written Memories"
    recorded: str  # "YYYY-MM-DD"
    duration: int | None = None  # seconds, audio only
    tag: str | None = None
    excerpt: str = ""
    transcript: str = ""
    prompt: str | None = None  # the Recording Studio question that was answered
    visibility: str = "All Family Branches"
    verified: bool = False


class Story(StoryBase, table=True):
    id: str = Field(default_factory=lambda: new_id("s"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    by: str | None = None  # person id of the storyteller
    owner_user_id: int | None = Field(default=None, foreign_key="user.id")
    upload_id: str | None = Field(default=None, foreign_key="upload.id")  # the audio file
    loves: int = 0  # counters kept on the row so lists don't need to count joins
    reflections: int = 0
    created_at: datetime = Field(default_factory=now)
    deleted_at: datetime | None = None


class StoryLove(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    story_id: str = Field(foreign_key="story.id", primary_key=True)


class Reflection(SQLModel, table=True):
    """A family member's reply to a story."""
    id: str = Field(default_factory=lambda: new_id("rf"), primary_key=True)
    story_id: str = Field(foreign_key="story.id", index=True)
    user_id: int = Field(foreign_key="user.id")
    by: str | None = None  # person id
    text: str
    created_at: datetime = Field(default_factory=now)
    deleted_at: datetime | None = None


# ---------- Timeline and calendar ----------

MILESTONE_TYPES = {"Births": "child_care", "Weddings": "favorite", "Journeys": "sailing",
                   "Memorials": "local_florist", "Milestones": "celebration"}  # type -> icon, as in Timeline.jsx


class MilestoneBase(SQLModel):
    type: str = "Milestones"
    title: str
    date: str  # "YYYY", "YYYY-MM" or "YYYY-MM-DD"
    approx: bool = False  # date is an estimate ("c. 1918")
    verified: bool = False  # backed by a record
    source: str | None = None  # e.g. "National Records of Scotland #ED-2016-8932"
    place: str | None = None
    text: str = ""


class Milestone(MilestoneBase, table=True):
    id: str = Field(default_factory=lambda: new_id("t"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    icon: str = "celebration"
    people: list[str] = Field(default_factory=list, sa_column=Column(JSON))  # person ids
    upload_id: str | None = Field(default=None, foreign_key="upload.id")  # optional photo
    p1: str | None = None
    p2: str | None = None
    owner_user_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    deleted_at: datetime | None = None


class EventBase(SQLModel):
    title: str
    date: str  # "YYYY-MM-DD"
    time: str | None = None  # "14:00"
    place: str | None = None
    note: str | None = None


class Event(EventBase, table=True):
    """A family gathering. Birthdays and anniversaries are not stored: they come from people and milestones."""
    id: str = Field(default_factory=lambda: new_id("e"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    created_by: int | None = Field(default=None, foreign_key="user.id")
    extra_guests: int = 0  # people coming who have no account (counted in `attending`)
    created_at: datetime = Field(default_factory=now)
    cancelled_at: datetime | None = None


RSVP_ANSWERS = ("yes", "maybe", "no")


class EventRsvp(SQLModel, table=True):
    event_id: str = Field(foreign_key="event.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    at: datetime = Field(default_factory=now)
    answer: str | None = None  # yes | maybe | no; rows from before answers existed (None) count as yes


# ---------- Legacy archive ----------

RECORD_CATEGORIES = {"Certificates": "badge", "Wills & Legal": "gavel", "Letters": "mail", "Time capsules": "hourglass_top"}


class RecordBase(SQLModel):
    title: str
    category: str = "Certificates"
    date: str  # "YYYY", "YYYY-MM" or "YYYY-MM-DD"
    approx: bool = False
    custodian: str | None = None  # person id of whoever holds the original
    source: str | None = None
    text: str
    visibility: str = "All Family Branches"
    sealedUntil: str | None = None  # time capsules: "YYYY-MM-DD"; the text stays hidden until then


class LegacyRecord(RecordBase, table=True):
    __tablename__ = "record"
    id: str = Field(default_factory=lambda: new_id("r"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    icon: str = "badge"
    status: str = "review"  # review | verified
    verified_by: int | None = Field(default=None, foreign_key="user.id")
    owner_user_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    deleted_at: datetime | None = None


class RecordAttachment(SQLModel, table=True):
    """A scan or photo of the original document (a certificate, a will), kept with its record."""
    record_id: str = Field(foreign_key="record.id", primary_key=True)
    upload_id: str = Field(foreign_key="upload.id", primary_key=True)
    added_by: int | None = Field(default=None, foreign_key="user.id")
    added_at: datetime = Field(default_factory=now)


# ---------- Family administration ----------

ROLES = ("Admin", "Custodian", "Contributor", "Viewer")


class JoinRequest(SQLModel, table=True):
    """Someone who signed up with the family code and is waiting for an Admin."""
    id: str = Field(default_factory=lambda: new_id("q"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    name: str
    email: str = Field(index=True)
    password_hash: str | None = None
    easy_mode: bool = False
    relation: str | None = None  # "Cousin (Campbell side)"
    note: str | None = None
    vouched_by: str | None = None  # person id
    status: str = "pending"  # pending | approved | declined
    user_id: int | None = Field(default=None, foreign_key="user.id")  # the account made on approval
    decided_by: int | None = Field(default=None, foreign_key="user.id")
    decided_at: datetime | None = None
    created_at: datetime = Field(default_factory=now)


class Invite(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("i"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    name: str
    email: str = Field(index=True)
    relation: str | None = None
    role: str = "Contributor"
    token: str = Field(index=True, unique=True)  # secret part of the invitation link
    invited_by: int | None = Field(default=None, foreign_key="user.id")
    sent_at: datetime = Field(default_factory=now)
    accepted_at: datetime | None = None
    cancelled_at: datetime | None = None


# ---------- Privacy and consent ----------

PRIVACY_CATEGORIES = ("memories", "stories", "contact", "birthdays", "location")
DEFAULT_CATEGORIES = {"memories": "All Family Branches", "stories": "All Family Branches", "contact": "Immediate Family",
                      "birthdays": "All Family Branches", "location": "Immediate Family"}
DEFAULT_MINE = {"tagging": True, "voice": True, "books": True, "age": False}


class UserPrivacy(SQLModel, table=True):
    """Each person's choices about their own information (the Privacy & Consent screen)."""
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    categories: dict = Field(default_factory=lambda: dict(DEFAULT_CATEGORIES), sa_column=Column(JSON))
    mine: dict = Field(default_factory=lambda: dict(DEFAULT_MINE), sa_column=Column(JSON))


DEFAULT_PREFS = {"lang": "en", "notify": {"birthdays": True, "stories": True, "digest": "weekly"}}


class UserPrefs(SQLModel, table=True):
    """Account settings that follow you to every device (Settings: language, notifications).
    Display choices such as theme and text size stay on each device."""
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    data: dict = Field(default_factory=lambda: {**DEFAULT_PREFS, "notify": dict(DEFAULT_PREFS["notify"])}, sa_column=Column(JSON))


class MinorSetting(SQLModel, table=True):
    """Protections for a relative under 18. Missing row = both on (the safe default)."""
    person_id: str = Field(foreign_key="person.id", primary_key=True)
    hide: bool = True  # only close family see their photos, stories and profile
    guardian: bool = True  # only a guardian (parent) can tag them


class Consent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("k"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    person: str = Field(foreign_key="person.id")  # whose consent is asked
    item: str  # "Treehouse photo (1982)"
    kind: str = "Photo"  # Photo | Voice
    status: str = "pending"  # pending | given | withdrawn
    date: str  # last change or reminder, YYYY-MM-DD
    guardian: str | None = None  # person id of the parent who decides for a minor
    memory_id: str | None = Field(default=None, foreign_key="memory.id")  # withdrawing makes this memory private again
    requested_by: int | None = Field(default=None, foreign_key="user.id")


class AccessLog(SQLModel, table=True):
    """Who looked at your things: "Daniel listened to 'Crossing the Atlantic'"."""
    id: str = Field(default_factory=lambda: new_id("l"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    subject_user_id: int = Field(foreign_key="user.id", index=True)  # whose item or profile
    who: str | None = None  # person id of the viewer
    who_user_id: int = Field(foreign_key="user.id")
    action: str  # listened | viewedProfile | downloaded | askedDeclined
    title: str | None = None
    at: datetime = Field(default_factory=now, index=True)


class PasswordReset(SQLModel, table=True):
    token_hash: str = Field(primary_key=True)  # only a hash is stored, like a password
    user_id: int = Field(foreign_key="user.id")
    expires_at: datetime
    used_at: datetime | None = None


# ---------- Overview: poll and weekly prompt ----------

class Poll(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("po"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    question: str
    options: list[str] = Field(sa_column=Column(JSON))
    base_votes: list[int] = Field(default_factory=list, sa_column=Column(JSON))  # votes from before accounts existed
    created_by: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    closed_at: datetime | None = None


class PollVote(SQLModel, table=True):
    poll_id: str = Field(foreign_key="poll.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    choice: int


class Prompt(SQLModel, table=True):
    """The "prompt of the week" question on the Overview."""
    id: str = Field(default_factory=lambda: new_id("pr"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    question: str
    by: str | None = None  # person id of who asked
    created_by: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


class PromptReply(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("re"), primary_key=True)
    prompt_id: str = Field(foreign_key="prompt.id", index=True)
    user_id: int = Field(foreign_key="user.id")
    by: str | None = None
    text: str
    created_at: datetime = Field(default_factory=now)
    deleted_at: datetime | None = None


MOODS = ("joyful", "nostalgic", "grateful", "tired", "missing")  # the order of the Overview's mood chips ("Missing someone")


class MoodCheckin(SQLModel, table=True):
    """"How are you feeling today?" on the Overview: one answer per person per day; answering again changes it."""
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    day: str = Field(primary_key=True)  # YYYY-MM-DD
    family_id: int = Field(foreign_key="family.id", index=True)
    mood: str
    at: datetime = Field(default_factory=now)


# ---------- Corrections and notifications ----------

SUGGESTION_FIELDS = ("Birth date", "Birth place", "Relationship", "Occupation", "Other")


class Suggestion(SQLModel, table=True):
    """"Suggest a correction" on a tree profile. An Admin or Custodian makes the change, then closes it."""
    id: str = Field(default_factory=lambda: new_id("sg"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    person_id: str = Field(foreign_key="person.id", index=True)
    field: str
    value: str
    source: str | None = None
    by_user_id: int = Field(foreign_key="user.id")
    status: str = "open"  # open | accepted | dismissed
    decided_by: int | None = Field(default=None, foreign_key="user.id")
    decided_at: datetime | None = None
    created_at: datetime = Field(default_factory=now)


class Notification(SQLModel, table=True):
    """One item in someone's notifications (the bell): a request to look at, a reply, a decision."""
    id: str = Field(default_factory=lambda: new_id("n"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # who it is for
    kind: str  # e.g. consent.requested, join.requested, suggestion.new, suggestion.decided, story.reflection
    title: str
    body: str | None = None
    link: str | None = None  # app route, e.g. "/privacy" or "/tree?person=anna"
    created_at: datetime = Field(default_factory=now, index=True)
    read_at: datetime | None = None


# ---------- Messages ----------

class Thread(SQLModel, table=True):
    """A conversation. A 1-to-1 chat has no stored title: each side sees the other person's name."""
    id: str = Field(default_factory=lambda: new_id("c"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    group: bool = False
    title: str | None = None
    created_by: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    last_message_at: datetime = Field(default_factory=now, index=True)


class ThreadMember(SQLModel, table=True):
    """One account's place in a thread, with everything that is personal to them."""
    thread_id: str = Field(foreign_key="thread.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    joined_at: datetime = Field(default_factory=now)
    pinned: bool = False
    muted: bool = False
    last_read_at: datetime | None = None
    marked_unread: bool = False  # "Mark as unread" from the chat menu
    cleared_at: datetime | None = None  # "Clear chat": hides older messages for this member only
    prev_cleared_at: datetime | None = None  # lets the Undo toast put them back
    hidden_at: datetime | None = None  # a deleted 1-to-1 chat; it comes back when a new message arrives
    left_at: datetime | None = None  # left a group


class Message(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("x"), primary_key=True)
    thread_id: str = Field(foreign_key="thread.id", index=True)
    sender_id: int = Field(foreign_key="user.id")
    at: datetime = Field(default_factory=now, index=True)
    text: str = ""
    reply_to: str | None = None
    upload_id: str | None = Field(default=None, foreign_key="upload.id")  # an attached photo
    deleted_at: datetime | None = None  # "Delete for everyone"


class MessageReaction(SQLModel, table=True):
    message_id: str = Field(foreign_key="message.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    emoji: str


class MessageStar(SQLModel, table=True):
    message_id: str = Field(foreign_key="message.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)


class AlbumBase(SQLModel):
    title: str
    tag: str | None = None
    meta: str | None = None
    note: str | None = None
    p1: str | None = None
    p2: str | None = None
    icon: str | None = "photo_album"


class Album(AlbumBase, table=True):
    id: str = Field(default_factory=lambda: new_id("a"), primary_key=True)
    family_id: int = Field(foreign_key="family.id", index=True)
    items: list[str] = Field(default_factory=list, sa_column=Column(JSON))  # memory ids, in order
    created_at: datetime = Field(default_factory=now)
