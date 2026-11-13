"""/people: the family tree and directory. Every query is limited to the signed-in user's family."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.auth import get_current_user, require_role
from app.db import get_session
from app.models import AccessLog, Person, PersonBase, PersonFavorite, User, now
from app.visibility import Kin, age_of

router = APIRouter(prefix="/people", tags=["people"])
EDITORS = ("Admin", "Custodian", "Contributor")


class PersonOut(PersonBase):
    id: str
    parents: list[str]
    spouse: str | None
    tags: list[str]
    fav: bool = False
    age: int | None = None  # None when they've chosen not to show it
    birthday: str | None = None  # "MM-DD", when the birthday may be shown but the year may not
    restricted: bool = False  # a protected minor seen by someone outside their close family: name and place in the tree only


class PersonCreate(PersonBase):
    tags: list[str] = []
    relation: Literal["parent", "child", "spouse"] | None = None
    relative_id: str | None = None  # the person the new one is related to


class PersonUpdate(PersonBase):
    # Every field optional: send only what changed.
    first: str | None = None
    last: str | None = None
    gen: int | None = None
    bornApprox: bool | None = None
    pending: bool | None = None
    verified: bool | None = None
    minor: bool | None = None
    tags: list[str] | None = None
    parents: list[str] | None = None
    spouse: str | None = None


def get_person(db: Session, user: User, pid: str) -> Person:
    p = db.get(Person, pid)
    if not p or p.family_id != user.family_id or p.deleted_at:
        raise HTTPException(404, "Person not found")
    return p


def out(db: Session, user: User, p: Person, favs: set[str], kin: Kin | None = None) -> PersonOut:
    """The person as `user` may see them, after the person's own privacy choices and minors' protection."""
    kin = kin or Kin(db, user.family_id)
    data = p.model_dump()
    me = user.person_id == p.id
    if not me and kin.minor_hidden_from(user, p.id):
        keep = {"id", "first", "last", "gen", "parents", "spouse", "role", "branch", "color", "minor", "family_id"}
        data = {k: (v if k in keep else None) for k, v in data.items()}
        data.update(tags=[], bornApprox=False, pending=False, verified=False, minor=True)
        return PersonOut(**data, fav=p.id in favs, restricted=True)
    living = not p.died
    if living and not me and not kin.shows(user, p.id, "location"):
        data["city"] = None
    show_birthday = not living or me or kin.shows(user, p.id, "birthdays")
    show_age = not living or me or kin.mine(p.id, "age")
    birthday = p.born[5:10] if p.born and len(p.born) >= 10 and show_birthday else None
    if not show_birthday:
        data["born"] = None
    elif not show_age:
        data["born"] = None  # the year would give the age away; `birthday` keeps day and month
    return PersonOut(**data, fav=p.id in favs, age=age_of(p) if show_age and show_birthday else None,
                     birthday=birthday, restricted=False)


def log_profile_view(db: Session, user: User, kin: Kin, p: Person) -> None:
    """Add "viewed your profile" to the person's access log, at most once a day per viewer."""
    subject = kin.users.get(p.id)
    if not subject or subject.id == user.id:
        return
    recent = db.exec(select(AccessLog).where(AccessLog.subject_user_id == subject.id, AccessLog.who_user_id == user.id,
                                             AccessLog.action == "viewedProfile", AccessLog.at > now() - timedelta(days=1))).first()
    if not recent:
        db.add(AccessLog(family_id=user.family_id, subject_user_id=subject.id, who=user.person_id, who_user_id=user.id, action="viewedProfile"))
        db.commit()


def fav_ids(db: Session, user: User) -> set[str]:
    return set(db.exec(select(PersonFavorite.person_id).where(PersonFavorite.user_id == user.id)).all())


@router.get("", response_model=list[PersonOut])
def list_people(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    people = db.exec(select(Person).where(Person.family_id == user.family_id, Person.deleted_at == None)).all()  # noqa: E711
    favs, kin = fav_ids(db, user), Kin(db, user.family_id)
    return [out(db, user, p, favs, kin) for p in people]


@router.get("/{pid}", response_model=PersonOut)
def read_person(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p, kin = get_person(db, user, pid), Kin(db, user.family_id)
    result = out(db, user, p, fav_ids(db, user), kin)  # before logging: the commit there expires `p`
    log_profile_view(db, user, kin, p)
    return result


@router.post("", response_model=PersonOut, status_code=201, dependencies=[Depends(require_role(*EDITORS))])
def create_person(body: PersonCreate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    data = body.model_dump(exclude={"relation", "relative_id"})
    p = Person(**data, family_id=user.family_id)
    if body.relation:
        if not body.relative_id:
            raise HTTPException(422, "relative_id is required with relation")
        rel = get_person(db, user, body.relative_id)
        if body.relation == "child":
            p.parents = [rel.id] + ([rel.spouse] if rel.spouse else [])
            p.gen = rel.gen + 1
        elif body.relation == "parent":
            rel.parents = [*rel.parents, p.id]
            p.gen = rel.gen - 1
        else:  # spouse
            p.spouse, rel.spouse = rel.id, p.id
            p.gen = rel.gen
        db.add(rel)
    db.add(p)
    db.commit()
    db.refresh(p)
    return out(db, user, p, set())


@router.patch("/{pid}", response_model=PersonOut, dependencies=[Depends(require_role(*EDITORS))])
def update_person(pid: str, body: PersonUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = get_person(db, user, pid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.add(p)
    db.commit()
    db.refresh(p)
    return out(db, user, p, fav_ids(db, user))


@router.delete("/{pid}", status_code=204, dependencies=[Depends(require_role("Admin", "Custodian"))])
def delete_person(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = get_person(db, user, pid)
    p.deleted_at = now()
    db.add(p)
    db.commit()
    return Response(status_code=204)


@router.post("/{pid}/restore", response_model=PersonOut, dependencies=[Depends(require_role("Admin", "Custodian"))])
def restore_person(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    p = db.get(Person, pid)
    if not p or p.family_id != user.family_id:
        raise HTTPException(404, "Person not found")
    p.deleted_at = None
    db.add(p)
    db.commit()
    db.refresh(p)
    return out(db, user, p, fav_ids(db, user))


@router.post("/{pid}/verify", response_model=PersonOut, dependencies=[Depends(require_role("Admin", "Custodian"))])
def verify_person(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return update_person(pid, PersonUpdate(pending=False), user, db)


@router.post("/{pid}/reopen", response_model=PersonOut, dependencies=[Depends(require_role("Admin", "Custodian"))])
def reopen_person(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return update_person(pid, PersonUpdate(pending=True), user, db)


@router.put("/{pid}/favorite", status_code=204)
def star(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    get_person(db, user, pid)
    if not db.get(PersonFavorite, (user.id, pid)):
        db.add(PersonFavorite(user_id=user.id, person_id=pid))
        db.commit()
    return Response(status_code=204)


@router.delete("/{pid}/favorite", status_code=204)
def unstar(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    fav = db.get(PersonFavorite, (user.id, pid))
    if fav:
        db.delete(fav)
        db.commit()
    return Response(status_code=204)
