"""/events (family gatherings with RSVPs) and /calendar (everything on the calendar for a date range).

/calendar works out birthdays and anniversaries from the tree and the timeline, the same way Calendar.jsx does,
so nothing recurring has to be stored or kept in sync.
"""
import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import RSVP_ANSWERS, Event, EventBase, EventRsvp, Milestone, Person, User, now
from app.validation import reject_nulls
from app.visibility import Kin

router = APIRouter(tags=["calendar"])
EDITORS = ("Admin", "Custodian", "Contributor")
MODERATORS = ("Admin", "Custodian")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_RANGE_DAYS = 400


# ---------- schemas ----------

def _date(v: str | None) -> str | None:
    if v is None:
        return v
    try:
        date.fromisoformat(v)
    except ValueError:
        raise ValueError("use YYYY-MM-DD") from None
    return v


def _time(v: str | None) -> str | None:
    if v and not TIME_RE.match(v):
        raise ValueError("use 24-hour HH:MM, e.g. 14:00")
    return v or None


class EventOut(EventBase):
    id: str
    sub: str  # "Lake Highlands • 14:00", the line under the title in the UI
    attending: int  # "yes" answers plus extra guests
    maybe: int = 0
    going: bool  # the current user answered "yes"
    rsvp: str | None = None  # the current user's answer: yes | maybe | no, or None if they haven't answered
    can_edit: bool
    cancelled: bool


class RsvpIn(BaseModel):
    answer: str = "yes"  # yes | maybe | no

    model_config = {"json_schema_extra": {"examples": [{"answer": "maybe"}]}}


class EventCreate(EventBase):
    extra_guests: int = Field(0, ge=0, le=1000)

    _d = field_validator("date")(_date)
    _t = field_validator("time")(_time)

    @field_validator("title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("is required")
        return v.strip()

    model_config = {"json_schema_extra": {"examples": [{
        "title": "Sunday lunch", "date": "2026-12-06", "time": "13:00", "place": "Gran's house",
        "note": "Bring a dish", "extra_guests": 0
    }]}}


class EventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1)
    date: str | None = None
    time: str | None = None
    place: str | None = None
    note: str | None = None
    extra_guests: int | None = Field(None, ge=0, le=1000)

    _d = field_validator("date")(_date)
    _t = field_validator("time")(_time)

    model_config = {"json_schema_extra": {"examples": [{"time": "14:00"}]}}


class Attendee(BaseModel):
    user_id: int
    person_id: str | None
    name: str
    answer: str = "yes"  # yes | maybe


class CalendarItem(BaseModel):
    id: str
    kind: str  # birthday | anniversary | gathering
    date: str  # YYYY-MM-DD in the requested range
    title: str  # English fallback; the frontend can build its own from the fields below
    person_id: str | None = None  # birthdays
    name: str | None = None
    turns: int | None = None  # age reached on this birthday
    role: str | None = None
    milestone_id: str | None = None  # anniversaries
    milestone_type: str | None = None
    years: int | None = None
    place: str | None = None
    event: EventOut | None = None  # gatherings


# ---------- helpers ----------

def may_edit(user: User, e: Event) -> bool:
    return e.created_by == user.id or user.role in MODERATORS


def get_event(db: Session, user: User, eid: str) -> Event:
    e = db.get(Event, eid)
    if not e or e.family_id != user.family_id:
        raise HTTPException(404, "Event not found")
    return e


def events_out(db: Session, user: User, events: list[Event]) -> list[EventOut]:
    ids = [e.id for e in events]
    rows = db.exec(select(EventRsvp.event_id, EventRsvp.user_id, EventRsvp.answer).where(EventRsvp.event_id.in_(ids))).all() if ids else []
    yes, maybe, mine = {}, {}, {}
    for eid, uid, answer in rows:
        answer = answer or "yes"  # rows saved before answers existed
        if answer == "yes":
            yes[eid] = yes.get(eid, 0) + 1
        elif answer == "maybe":
            maybe[eid] = maybe.get(eid, 0) + 1
        if uid == user.id:
            mine[eid] = answer
    return [EventOut(**e.model_dump(), sub=" • ".join(filter(None, [e.place, e.time])), attending=yes.get(e.id, 0) + e.extra_guests,
                     maybe=maybe.get(e.id, 0), going=mine.get(e.id) == "yes", rsvp=mine.get(e.id),
                     can_edit=may_edit(user, e), cancelled=e.cancelled_at is not None) for e in events]


def one(db: Session, user: User, e: Event) -> EventOut:
    return events_out(db, user, [e])[0]


def _is_date(s: str) -> bool:
    try:
        date.fromisoformat(s[:10])
        return True
    except ValueError:
        return False


def on_year(month_day: str, year: int) -> date:
    """This year's date for a "MM-DD"; 29 February falls on the 28th in other years."""
    m, d = int(month_day[:2]), int(month_day[3:5])
    try:
        return date(year, m, d)
    except ValueError:
        return date(year, 2, 28)


def yearly(start: str, frm: date, to: date):
    """Each (date, years since `start`) in [frm, to] for something that recurs every year since `start` (YYYY-MM-DD)."""
    first = int(start[:4])
    for y in range(frm.year, to.year + 1):
        d = on_year(start[5:10], y)
        if frm <= d <= to and y > first:
            yield d, y - first


def parse_range(frm: str | None, to: str | None) -> tuple[date, date]:
    try:
        a = date.fromisoformat(frm) if frm else date.today()
        b = date.fromisoformat(to) if to else a + timedelta(days=30)
    except ValueError:
        raise HTTPException(422, "from and to must be YYYY-MM-DD") from None
    if b < a:
        raise HTTPException(422, "to must not be before from")
    if (b - a).days > MAX_RANGE_DAYS:
        raise HTTPException(422, f"Ask for at most {MAX_RANGE_DAYS} days at a time")
    return a, b


# ---------- calendar ----------

@router.get("/calendar", response_model=list[CalendarItem])
def calendar(
    frm: str | None = Query(None, alias="from", description="YYYY-MM-DD, default today"),
    to: str | None = Query(None, description="YYYY-MM-DD, default from + 30 days"),
    kinds: str = Query("birthday,anniversary,gathering", description="comma-separated"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Birthdays, anniversaries and gatherings between two dates, soonest first.
    A month grid: ?from=2026-11-01&to=2026-11-30. Upcoming (Overview): no parameters."""
    a, b = parse_range(frm, to)
    want = {k.strip() for k in kinds.split(",")}
    items: list[CalendarItem] = []

    if "birthday" in want:
        people = db.exec(select(Person).where(Person.family_id == user.family_id, Person.deleted_at == None,  # noqa: E711
                                              Person.died == None, Person.born != None)).all()  # noqa: E711
        kin = Kin(db, user.family_id)
        for p in people:
            if p.bornApprox or len(p.born) < 10 or not _is_date(p.born):
                continue  # no exact day to celebrate
            if not kin.shows(user, p.id, "birthdays"):
                continue  # their choice, or a protected minor outside your close family
            show_age = p.id == user.person_id or kin.mine(p.id, "age")
            place = p.city if p.id == user.person_id or kin.shows(user, p.id, "location") else None
            for d, n in yearly(p.born, a, b):
                items.append(CalendarItem(id=f"b-{p.id}-{d.year}", kind="birthday", date=d.isoformat(), title=f"{p.first}'s birthday",
                                          person_id=p.id, name=f"{p.first} {p.last}", turns=n if show_age else None, role=p.role, place=place))

    if "anniversary" in want:
        ms = db.exec(select(Milestone).where(Milestone.family_id == user.family_id, Milestone.deleted_at == None,  # noqa: E711
                                             Milestone.approx == False, Milestone.type.in_(["Weddings", "Memorials"]))).all()  # noqa: E712
        for m in ms:
            if len(m.date) < 10 or not _is_date(m.date):
                continue
            for d, n in yearly(m.date, a, b):
                items.append(CalendarItem(id=f"a-{m.id}-{d.year}", kind="anniversary", date=d.isoformat(),
                                          title=f"{m.title} ({n} years)", milestone_id=m.id, milestone_type=m.type, years=n, place=m.place))

    if "gathering" in want:
        evs = db.exec(select(Event).where(Event.family_id == user.family_id, Event.cancelled_at == None,  # noqa: E711
                                          Event.date >= a.isoformat(), Event.date <= b.isoformat())).all()
        for e in events_out(db, user, list(evs)):
            items.append(CalendarItem(id=e.id, kind="gathering", date=e.date, title=e.title, place=e.place, event=e))

    order = {"gathering": 0, "birthday": 1, "anniversary": 2}
    return sorted(items, key=lambda i: (i.date, order[i.kind], i.title))


# ---------- gatherings ----------

@router.get("/events", response_model=list[EventOut], tags=["calendar"])
def list_events(
    frm: str | None = Query(None, alias="from"),
    to: str | None = None,
    include_cancelled: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    stmt = select(Event).where(Event.family_id == user.family_id)
    if frm:
        stmt = stmt.where(Event.date >= frm)
    if to:
        stmt = stmt.where(Event.date <= to)
    if not include_cancelled:
        stmt = stmt.where(Event.cancelled_at == None)  # noqa: E711
    # All-day events (no time) first on each day, on every database: PostgreSQL would otherwise put them last.
    return events_out(db, user, list(db.exec(stmt.order_by(Event.date, Event.time.asc().nulls_first())).all()))


@router.get("/events/{eid}", response_model=EventOut)
def read_event(eid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return one(db, user, get_event(db, user, eid))


@router.post("/events", response_model=EventOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_event(body: EventCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """The organiser is counted as going, as in the Add gathering dialog."""
    e = Event(**body.model_dump(), family_id=user.family_id, created_by=user.id)
    db.add(e)
    db.flush()
    db.add(EventRsvp(event_id=e.id, user_id=user.id))
    db.commit()
    db.refresh(e)
    return one(db, user, e)


@router.patch("/events/{eid}", response_model=EventOut)
def update_event(eid: str, body: EventUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    e = get_event(db, user, eid)
    if not may_edit(user, e):
        raise HTTPException(403, "Only the organiser, an Admin or a Custodian can change this gathering")
    for k, v in reject_nulls(body.model_dump(exclude_unset=True), "title", "date", "extra_guests").items():
        setattr(e, k, v.strip() if isinstance(v, str) else v)
    db.add(e)
    db.commit()
    db.refresh(e)
    return one(db, user, e)


@router.delete("/events/{eid}", status_code=204)
def cancel_event(eid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Cancel a gathering (kept, so Undo and RSVPs survive)."""
    e = get_event(db, user, eid)
    if not may_edit(user, e):
        raise HTTPException(403, "Only the organiser, an Admin or a Custodian can cancel this gathering")
    e.cancelled_at = now()
    db.add(e)
    db.commit()
    return Response(status_code=204)


@router.post("/events/{eid}/restore", response_model=EventOut)
def restore_event(eid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    e = get_event(db, user, eid)
    if not may_edit(user, e):
        raise HTTPException(403, "Only the organiser, an Admin or a Custodian can restore this gathering")
    e.cancelled_at = None
    db.add(e)
    db.commit()
    db.refresh(e)
    return one(db, user, e)


@router.put("/events/{eid}/rsvp", response_model=EventOut)
def rsvp(eid: str, body: RsvpIn | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Answer yes, maybe or no (no body means yes). Answering again changes it. Anyone in the family can RSVP,
    Viewers included; DELETE takes the answer back."""
    answer = (body or RsvpIn()).answer
    if answer not in RSVP_ANSWERS:
        raise HTTPException(422, f"answer must be one of: {', '.join(RSVP_ANSWERS)}")
    e = get_event(db, user, eid)
    if e.cancelled_at:
        raise HTTPException(422, "This gathering was cancelled")
    r = db.get(EventRsvp, (eid, user.id)) or EventRsvp(event_id=eid, user_id=user.id)
    r.answer, r.at = answer, now()
    db.add(r)
    db.commit()
    return one(db, user, e)


@router.delete("/events/{eid}/rsvp", response_model=EventOut)
def un_rsvp(eid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    e = get_event(db, user, eid)
    r = db.get(EventRsvp, (eid, user.id))
    if r:
        db.delete(r)
        db.commit()
    return one(db, user, e)


@router.get("/events/{eid}/attendees", response_model=list[Attendee])
def attendees(eid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Who said yes (and who said maybe, flagged), in the order they answered."""
    get_event(db, user, eid)
    rows = db.exec(select(User, EventRsvp.answer).join(EventRsvp, EventRsvp.user_id == User.id)
                   .where(EventRsvp.event_id == eid, (EventRsvp.answer == None) | (EventRsvp.answer != "no"))  # noqa: E711
                   .order_by(EventRsvp.at)).all()
    return [Attendee(user_id=u.id, person_id=u.person_id, name=u.name, answer=a or "yes") for u, a in rows]
