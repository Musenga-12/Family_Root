"""Fill an empty database with the Mackenzie sample family from seed_data.json (exported from src/data.js).

Run from the backend folder:  python seed.py
Each member in `members` gets an account: <id>@example.com / familyroots123 (e.g. mary@example.com).
"""
import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlmodel import Session, select

from app.auth import SAMPLE_PASSWORD, hash_password
from app.config import settings
from app.models import now
from app.db import create_db, engine
from app.models import (AccessLog, Album, AlbumBase, Consent, Event, Family, Invite, JoinRequest, LegacyRecord, Memory,
                        MemoryBase, Message, MessageReaction, MessageStar, Milestone, MilestoneBase, MinorSetting, Person,
                        PersonBase, Poll, Prompt, PromptReply, RecordBase, Story, StoryBase, Thread, ThreadMember, User,
                        UserPrivacy)

DEMO_PASSWORD = SAMPLE_PASSWORD  # published: a production server refuses it (app/auth.py)
SEED = json.loads((Path(__file__).parent / "seed_data.json").read_text(encoding="utf-8"))
PERSON_FIELDS = set(PersonBase.model_fields) | {"id", "parents", "spouse", "tags"}
MEMORY_FIELDS = set(MemoryBase.model_fields) | {"id", "tagged"}
ALBUM_FIELDS = set(AlbumBase.model_fields) | {"id", "items"}
STORY_FIELDS = set(StoryBase.model_fields) | {"id", "by", "loves", "reflections"}
RECORD_FIELDS = set(RecordBase.model_fields) | {"id", "icon", "status"}
MILESTONE_FIELDS = set(MilestoneBase.model_fields) | {"id", "icon", "people", "p1", "p2"}


def main() -> None:
    # The sample family's accounts share a published password: a development and test database only.
    if settings.production:
        raise SystemExit("seed.py adds sample accounts with a published password. It never runs with ENVIRONMENT=production.")
    create_db()
    with Session(engine) as db:
        if db.exec(select(Family).where(Family.code == "MCK-8294")).first():
            print("Already seeded. Delete familyroots.db to start again.")
            return
        # Only ever into an empty database, so sample people never mix with a real family's archive.
        if db.exec(select(Family)).first():
            raise SystemExit("This database already holds a family. seed.py only fills an empty database; nothing was changed.")

        family = Family(name="Mackenzie family", code="MCK-8294")
        db.add(family)
        db.flush()

        for p in SEED["people"]:
            db.add(Person(**{k: v for k, v in p.items() if k in PERSON_FIELDS}, family_id=family.id))
        db.flush()

        people = {p["id"]: p for p in SEED["people"]}
        password = hash_password(DEMO_PASSWORD)
        for m in SEED["members"]:
            p = people[m["id"]]
            db.add(User(family_id=family.id, email=f"{m['id']}@example.com", name=f"{p['first']} {p['last']}",
                        password_hash=password, role=m["role"], person_id=m["id"]))
        for m in SEED["memories"]:
            db.add(Memory(**{k: v for k, v in m.items() if k in MEMORY_FIELDS}, family_id=family.id))
        for a in SEED["albums"]:
            db.add(Album(**{k: v for k, v in a.items() if k in ALBUM_FIELDS}, family_id=family.id))
        users = {u.person_id: u.id for u in db.exec(select(User).where(User.family_id == family.id)).all()}
        for st in SEED["stories"]:
            db.add(Story(**{k: v for k, v in st.items() if k in STORY_FIELDS}, family_id=family.id,
                         owner_user_id=users.get(st["by"])))  # sample audio stories have no file yet
        seed_threads(db, family.id, users, me=users["mary"])
        for r in SEED["records"]:
            # The custodian counts as the author (so "Only Me" drafts stay theirs), except for sealed capsules:
            # John wrote the sample one, so nobody living can open it early.
            author = None if r.get("sealedUntil") else users.get(r.get("custodian"))
            db.add(LegacyRecord(**{k: v for k, v in r.items() if k in RECORD_FIELDS}, family_id=family.id, owner_user_id=author))
        for q in SEED["requests"]:  # sample requests have no password; once approved they'd use a reset link
            db.add(JoinRequest(id=q["id"], family_id=family.id, name=q["name"], email=q["name"].lower().replace(" ", ".") + "@example.com",
                               relation=q.get("relation"), note=q.get("note"), vouched_by=q.get("vouchedBy"), created_at=at(q["date"] + "T09:00")))
        for i in SEED["invites"]:
            db.add(Invite(id=i["id"], family_id=family.id, name=i["name"], email=i["email"], relation=i.get("relation"),
                          token=secrets.token_urlsafe(24), invited_by=users.get(i.get("by")), sent_at=at(i["sent"] + "T09:00")))
        for m in SEED["milestones"]:
            db.add(Milestone(**{k: v for k, v in m.items() if k in MILESTONE_FIELDS}, family_id=family.id))
        for e in SEED["events"]:
            if e.get("date"):  # birthdays in the sample are worked out from people, not stored
                place, time = split_sub(e.get("sub", ""))
                db.add(Event(id=e["id"], family_id=family.id, title=e["title"], date=e["date"], place=place, time=time,
                             extra_guests=e.get("attending", 0), created_by=users["sarah"]))
        seed_privacy_and_overview(db, family.id, users)
        db.commit()
        print(f"Seeded {len(SEED['stories'])} stories, {len(SEED['threads'])} conversations, "
              f"{len(SEED['milestones'])} milestones, {len(SEED['records'])} records, "
              f"{len(SEED['requests'])} join requests, {len(SEED['invites'])} invites and {sum(1 for e in SEED['events'] if e.get('date'))} gatherings.")
        print(f"Seeded {len(SEED['people'])} people, {len(SEED['members'])} accounts, "
              f"{len(SEED['memories'])} memories and {len(SEED['albums'])} albums.")
        print(f"Sign in as mary@example.com / {DEMO_PASSWORD}")


# The Overview's sample poll and prompt (English text from src/lib/i18n.js).
POLL = ("Where should we hold the winter gathering?",
        ["Rose Cottage, Stirling", "Edinburgh flat (Mary's)", "Video call for everyone", "Lake Highlands lodge"], [7, 4, 9, 3])
PROMPT = ("What was your favorite childhood tradition during the winter holidays?", "sarah")
WHEN = {"Yesterday": 1, "2 days ago": 2}


def seed_privacy_and_overview(db: Session, family_id: int, users: dict[str, int]) -> None:
    pv = SEED["privacy"]
    db.add(UserPrivacy(user_id=users["mary"], categories=pv["categories"], mine=pv["mine"]))  # Mary's own choices
    for pid, m in pv["minors"].items():
        db.add(MinorSetting(person_id=pid, hide=m["hide"], guardian=m["guardian"]))
    for k in SEED["consents"]:
        db.add(Consent(id=k["id"], family_id=family_id, person=k["person"], item=k["item"], kind=k["kind"], status=k["status"],
                       date=k["date"], guardian=k.get("guardian"), requested_by=users["mary"]))
    for e in SEED["accessLog"]:  # things that happened to Mary's items
        db.add(AccessLog(id=e["id"], family_id=family_id, subject_user_id=users["mary"], who=e["who"], who_user_id=users[e["who"]],
                         action=e["action"], title=e.get("title"), at=at(e["at"])))
    question, options, votes = POLL
    db.add(Poll(id="po1", family_id=family_id, question=question, options=options, base_votes=votes, created_by=users["sarah"]))
    question, by = PROMPT
    db.add(Prompt(id="pr1", family_id=family_id, question=question, by=by, created_by=users[by], created_at=now() - timedelta(days=7)))
    for i, r in enumerate(SEED["replies"]):
        db.add(PromptReply(id=f"re{i + 1}", prompt_id="pr1", user_id=users[r["by"]], by=r["by"], text=r["text"],
                           created_at=now() - timedelta(days=WHEN.get(r["when"], 1))))


def split_sub(sub: str) -> tuple[str | None, str | None]:
    """"Lake Highlands • Park Veranda • 2:00 PM" -> ("Lake Highlands • Park Veranda", "14:00")."""
    parts = [x.strip() for x in sub.split("•") if x.strip()]
    if parts and parts[-1].upper().endswith(("AM", "PM")):
        clock, half = parts.pop().rsplit(" ", 1)
        h, mnt = (int(x) for x in clock.split(":"))
        h = h % 12 + (12 if half.upper() == "PM" else 0)
        return " • ".join(parts) or None, f"{h:02d}:{mnt:02d}"
    return " • ".join(parts) or None, None


def at(s: str) -> datetime:
    """Sample times like "2026-11-08T18:02", read as UTC."""
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def seed_threads(db: Session, family_id: int, users: dict[str, int], me: int) -> None:
    """Conversations as Mary (the demo's signed-in user) sees them: her unread counts, pins, stars and read ticks."""
    for t in SEED["threads"]:
        msgs = sorted(t["messages"], key=lambda m: m["at"])
        last_at = at(msgs[-1]["at"])
        db.add(Thread(id=t["id"], family_id=family_id, group=bool(t.get("group")), title=t["title"] if t.get("group") else None,
                      created_by=me, created_at=at(msgs[0]["at"]), last_message_at=last_at))
        others = [m for m in msgs if m["by"] != "mary"]
        n = t.get("unread", 0)
        mary_read = at(others[-n]["at"]) - timedelta(seconds=1) if n and len(others) >= n else last_at
        for pid in t["members"]:
            mine = users[pid] == me
            db.add(ThreadMember(thread_id=t["id"], user_id=users[pid], joined_at=at(msgs[0]["at"]),
                                last_read_at=mary_read if mine else last_at,
                                pinned=bool(t.get("pinned")) and mine, muted=bool(t.get("muted")) and mine))
        for m in msgs:
            db.add(Message(id=m["id"], thread_id=t["id"], sender_id=users[m["by"]], at=at(m["at"]),
                           text=m.get("text", ""), reply_to=m.get("replyTo")))
            for pid, emoji in (m.get("reactions") or {}).items():
                db.add(MessageReaction(message_id=m["id"], user_id=users[pid], emoji=emoji))
            if m.get("starred"):
                db.add(MessageStar(message_id=m["id"], user_id=me))


if __name__ == "__main__":
    main()
