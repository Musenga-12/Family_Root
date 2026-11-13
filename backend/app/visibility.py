"""Who may see what. Admins get no exception: privacy choices apply to everyone.

Item visibility (memories, stories, records):
- "All Family Branches": everyone in the family.
- "Immediate Family": the owner, the people tagged in it, and the immediate family (spouse, parents, children, siblings)
  of the owner and of each tagged person.
- "Only Me (draft)": only the account that added it.

On top of that:
- A relative under 18 whose "only close family can see them" protection is on (the default) is visible in photos and
  stories only to their parents, siblings and grandparents, and to whoever added the item.
- Each person chooses who sees their birthday, location and contact details (UserPrivacy.categories), and whether
  their age is shown (UserPrivacy.mine["age"]).
"""
from datetime import date

from sqlmodel import Session, select

from app.models import DEFAULT_CATEGORIES, DEFAULT_MINE, MinorSetting, Person, User, UserPrivacy


def age_of(p: Person, on: date | None = None) -> int | None:
    if not p.born or len(p.born) < 4:
        return None
    on = on or date.today()
    end = date.fromisoformat(p.died) if p.died and len(p.died) == 10 else on
    y = int(p.born[:4])
    a = end.year - y
    if len(p.born) >= 10 and (end.month, end.day) < (int(p.born[5:7]), int(p.born[8:10])):
        a -= 1
    return a


def is_minor(p: Person) -> bool:
    a = age_of(p)
    return not p.died and a is not None and a < 18


class Kin:
    """Family tree, accounts and privacy settings, loaded once per request."""

    def __init__(self, db: Session, family_id: int):
        self.people = {p.id: p for p in db.exec(select(Person).where(Person.family_id == family_id)).all()}
        self.users = {u.person_id: u for u in db.exec(select(User).where(User.family_id == family_id, User.removed_at == None)).all()  # noqa: E711
                      if u.person_id}
        uids = [u.id for u in self.users.values()]
        self.privacy = {r.user_id: r for r in db.exec(select(UserPrivacy).where(UserPrivacy.user_id.in_(uids))).all()} if uids else {}
        self.minor_settings = {m.person_id: m for m in db.exec(select(MinorSetting).where(MinorSetting.person_id.in_(list(self.people)))).all()}
        self._cache: dict[str, set[str]] = {}

    # ----- relationships -----
    def immediate(self, pid: str | None) -> set[str]:
        if not pid or pid not in self.people:
            return set()
        if pid not in self._cache:
            p = self.people[pid]
            out = {pid, *p.parents}
            if p.spouse:
                out.add(p.spouse)
            for q in self.people.values():
                if pid in q.parents or q.spouse == pid:  # children, and a spouse recorded only on their side
                    out.add(q.id)
                elif p.parents and set(p.parents) & set(q.parents):  # siblings
                    out.add(q.id)
            self._cache[pid] = out
        return self._cache[pid]

    def close_to(self, user: User, pid: str | None) -> bool:
        return bool(user.person_id) and user.person_id in self.immediate(pid)

    def guardians(self, pid: str) -> list[str]:
        """A minor's parents (person ids)."""
        p = self.people.get(pid)
        return list(p.parents) if p else []

    # ----- minors -----
    def minor(self, pid: str) -> MinorSetting | None:
        """The minor's protections, or None if they're not a minor."""
        p = self.people.get(pid)
        if not p or not is_minor(p):
            return None
        return self.minor_settings.get(pid) or MinorSetting(person_id=pid)

    def minor_circle(self, pid: str) -> set[str]:
        """Who counts as close family for a protected minor: parents, siblings and grandparents."""
        p = self.people.get(pid)
        grandparents = {g for par in (p.parents if p else []) if par in self.people for g in self.people[par].parents}
        return self.immediate(pid) | grandparents

    def minor_hidden_from(self, user: User, pid: str) -> bool:
        m = self.minor(pid)
        return bool(m and m.hide and user.person_id not in self.minor_circle(pid))

    # ----- each person's own choices -----
    def _prefs(self, pid: str | None) -> UserPrivacy | None:
        u = self.users.get(pid) if pid else None
        return self.privacy.get(u.id) if u else None

    def category(self, pid: str | None, key: str) -> str:
        pr = self._prefs(pid)
        return (pr.categories if pr else DEFAULT_CATEGORIES).get(key, DEFAULT_CATEGORIES[key])

    def mine(self, pid: str | None, key: str) -> bool:
        pr = self._prefs(pid)
        return bool((pr.mine if pr else DEFAULT_MINE).get(key, DEFAULT_MINE[key]))

    def level_allows(self, user: User, level: str, pid: str) -> bool:
        """Does `level` (one of the visibility levels) let `user` see something about person `pid`?"""
        if user.person_id == pid:
            return True
        if level.startswith("Only"):
            return False
        if level == "Immediate Family":
            return self.close_to(user, pid)
        return True

    def shows(self, user: User, pid: str, key: str) -> bool:
        """May `user` see this person's birthdays / location / contact?"""
        return self.level_allows(user, self.category(pid, key), pid) and not self.minor_hidden_from(user, pid)


def can_see(user: User, kin: Kin, visibility: str, owner_user_id: int | None, owner: str | None, tagged: list[str]) -> bool:
    if owner_user_id is not None and owner_user_id == user.id:
        return True
    if visibility.startswith("Only"):
        return False
    if any(kin.minor_hidden_from(user, t) for t in tagged):
        return False
    if visibility == "Immediate Family":
        circle: set[str] = set()
        for pid in [owner, *tagged]:
            circle |= kin.immediate(pid)
        return user.person_id in circle
    return True
