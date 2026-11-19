"""The privacy rules in app/visibility.py, as each screen and export applies them."""
from helpers import API

DRAFT = {"title": "Private draft", "date": "2026-05", "alt": "A draft", "visibility": "Only Me (draft)"}


def ids(client, path, headers):
    return {x["id"] for x in client.get(API + path, headers=headers).json()}


def test_immediate_family_items(client, auth):
    # m4 is shared with the immediate family of Anna and Mary. James is Mary's son; Emma only married into the family.
    assert client.get(f"{API}/memories/m4", headers=auth("james")).status_code == 200
    assert client.get(f"{API}/memories/m4", headers=auth("emma")).status_code == 404
    assert "m4" not in ids(client, "/memories", auth("emma"))
    assert "m4" not in client.get(f"{API}/albums/a5", headers=auth("emma")).json()["items"]
    assert client.get(f"{API}/records/r5", headers=auth("sarah")).status_code == 200
    assert client.get(f"{API}/records/r5", headers=auth("emma")).status_code == 404


def test_only_me_drafts_are_private_even_from_admins(client, auth):
    m = client.post(f"{API}/memories", headers=auth("james"), json=DRAFT).json()[0]
    assert client.get(f"{API}/memories/{m['id']}", headers=auth("james")).status_code == 200
    for who in ("mary", "michael", "emma"):
        assert client.get(f"{API}/memories/{m['id']}", headers=auth(who)).status_code == 404
        assert client.patch(f"{API}/memories/{m['id']}", headers=auth(who), json={"title": "x"}).status_code == 404
    assert client.get(f"{API}/records/r4", headers=auth("sarah")).status_code == 404
    # Sharing a draft with the family needs the consent box.
    assert client.patch(f"{API}/memories/{m['id']}", headers=auth("james"), json={"visibility": "All Family Branches"}).status_code == 422
    r = client.patch(f"{API}/memories/{m['id']}", headers=auth("james"), json={"visibility": "All Family Branches", "consent": True})
    assert r.status_code == 200 and client.get(f"{API}/memories/{m['id']}", headers=auth("emma")).status_code == 200


def test_protected_minor(client, auth):
    # Grace (10) is protected: outside her parents, siblings and grandparents she is a name in the tree only.
    outsider = client.get(f"{API}/people/grace", headers=auth("james")).json()
    assert outsider["restricted"] is True and outsider["born"] is None and outsider["city"] is None
    assert client.get(f"{API}/people/grace", headers=auth("michael")).json()["restricted"] is False  # her father
    assert client.get(f"{API}/people/grace", headers=auth("mary")).json()["restricted"] is False  # her grandmother
    assert "m6" not in ids(client, "/memories", auth("james"))  # a photo she's tagged in
    assert "m6" in ids(client, "/memories", auth("michael"))


def test_only_a_parent_can_tag_a_minor(client, auth):
    body = {"title": "Park", "date": "2026-05", "alt": "At the park", "consent": True, "tagged": ["grace"]}
    r = client.post(f"{API}/memories", headers=auth("james"), json=body)
    assert r.status_code == 422 and "only a parent" in r.json()["detail"]
    assert client.post(f"{API}/memories", headers=auth("michael"), json=body).status_code == 201


def test_only_a_guardian_or_admin_changes_minor_protections(client, auth):
    assert client.patch(f"{API}/privacy/minors/grace", headers=auth("james"), json={"hide": False}).status_code == 403
    assert client.patch(f"{API}/privacy/minors/mary", headers=auth("mary"), json={"hide": False}).status_code == 404  # not a minor
    assert client.patch(f"{API}/privacy/minors/anna", headers=auth("james"), json={"hide": True}).status_code == 403
    r = client.patch(f"{API}/privacy/minors/anna", headers=auth("sarah"), json={"hide": True})  # her mother
    assert r.status_code == 200 and r.json()["hide"] is True


def test_personal_choices_about_birthday_and_location(client, auth):
    assert client.get(f"{API}/people/mary", headers=auth("emma")).json()["city"] is None  # location: Immediate Family
    assert client.get(f"{API}/people/mary", headers=auth("james")).json()["city"] is not None
    r = client.patch(f"{API}/privacy/categories", headers=auth("mary"), json={"birthdays": "Only Me (draft)"})
    assert r.status_code == 200
    seen = client.get(f"{API}/people/mary", headers=auth("james")).json()
    assert seen["born"] is None and seen["birthday"] is None
    assert client.get(f"{API}/people/mary", headers=auth("mary")).json()["born"] == "1946-02-19"
    assert client.patch(f"{API}/privacy/categories", headers=auth("mary"), json={"shoe_size": "Only Me (draft)"}).status_code == 422
    assert client.patch(f"{API}/privacy/categories", headers=auth("mary"), json={"birthdays": "Everyone"}).status_code == 422


def test_withdrawing_consent_makes_the_photo_private(client, auth):
    m = client.post(f"{API}/memories", headers=auth("james"),
                    json={"title": "Fishing", "date": "2026-04", "alt": "Two men by a river", "consent": True, "tagged": ["michael"]}).json()[0]
    c = client.post(f"{API}/consents", headers=auth("james"), json={"person": "michael", "item": "Fishing photo", "memory_id": m["id"]}).json()
    assert c["can_decide"] is False
    assert client.patch(f"{API}/consents/{c['id']}", headers=auth("james"), json={"status": "withdrawn"}).status_code == 403
    r = client.patch(f"{API}/consents/{c['id']}", headers=auth("michael"), json={"status": "withdrawn"})
    assert r.status_code == 200 and r.json()["status"] == "withdrawn"
    assert client.get(f"{API}/memories/{m['id']}", headers=auth("mary")).status_code == 404
    assert client.get(f"{API}/memories/{m['id']}", headers=auth("james")).json()["visibility"] == "Only Me (draft)"
    assert "consent.requested" in [n["kind"] for n in client.get(f"{API}/notifications", headers=auth("michael")).json()["items"]]


def test_consents_are_seen_only_by_those_involved(client, auth):
    assert ids(client, "/consents", auth("mary")) == {"k1", "k2", "k3", "k4", "k5"}  # an Admin, who asked for them
    assert ids(client, "/consents", auth("emma")) == {"k5"}
    assert client.get(f"{API}/consents/k1", headers=auth("emma")).status_code == 405  # no single-item read route
    assert client.patch(f"{API}/consents/k1", headers=auth("emma"), json={"status": "given"}).status_code == 404


def test_access_log_records_profile_views_once_a_day(client, auth):
    before = len(client.get(f"{API}/access-log", headers=auth("mary")).json())
    for _ in range(3):
        client.get(f"{API}/people/mary", headers=auth("james"))
    log = client.get(f"{API}/access-log", headers=auth("mary")).json()
    assert len(log) == before + 1 and log[0]["action"] == "viewedProfile" and log[0]["who"] == "james"
    assert client.get(f"{API}/access-log", headers=auth("james")).json() == []


def test_admin_export_follows_privacy_rules(client, auth):
    draft = client.post(f"{API}/memories", headers=auth("james"), json=DRAFT).json()[0]
    out = client.get(f"{API}/admin/export", headers=auth("sarah")).json()
    memories, records = {m["id"] for m in out["memories"]}, {r["id"] for r in out["records"]}
    assert draft["id"] not in memories and "m6" not in memories  # James's draft; a photo of protected Grace
    assert "r4" not in records and "r5" in records  # Mary's draft; shared with Mary's immediate family (Sarah's mother)
    grace = next(p for p in out["people"] if p["id"] == "grace")
    assert grace["restricted"] is True and grace["born"] is None
    assert "password_hash" not in str(out) and "email" not in str(out["members"])
    # The author of the draft still finds it in their own data download.
    assert draft["id"] in {m["id"] for m in client.get(f"{API}/me/export", headers=auth("james")).json()["memories"]}


def test_my_data_export(client, auth):
    out = client.get(f"{API}/me/export", headers=auth("mary")).json()
    assert out["account"]["email"] == "mary@example.com" and out["profile"]["id"] == "mary"
    assert {r["id"] for r in out["records"]} >= {"r2", "r4", "r5"}
    assert "password_hash" not in str(out)


def test_account_closing_can_be_cancelled(client, auth):
    r = client.post(f"{API}/me/deletion-request", headers=auth("james"))
    assert r.status_code == 200 and r.json()["closes_on"] > r.json()["requested"]
    assert client.get(f"{API}/privacy", headers=auth("james")).json()["deletion"] is not None
    assert client.delete(f"{API}/me/deletion-request", headers=auth("james")).status_code == 204
    assert client.get(f"{API}/privacy", headers=auth("james")).json()["deletion"] is None


def test_last_admin_cannot_close_their_account(client, auth):
    assert client.post(f"{API}/me/deletion-request", headers=auth("sarah")).status_code == 200  # Mary is still an Admin
    assert client.post(f"{API}/me/deletion-request", headers=auth("mary")).status_code == 422


def test_my_own_privacy_choices(client, auth):
    before = client.get(f"{API}/privacy", headers=auth("james")).json()["mine"]
    r = client.patch(f"{API}/privacy/mine", headers=auth("james"), json={"age": True, "voice": False})
    assert r.status_code == 200
    assert r.json()["mine"] == {**before, "age": True, "voice": False}
    # Leaving a choice out keeps it.
    assert client.patch(f"{API}/privacy/mine", headers=auth("james"), json={"tagging": False}).json()["mine"]["age"] is True


def test_consent_requests_are_checked(client, auth):
    james = auth("james")
    assert ids(client, "/consents?status=pending", auth("mary")) == {"k3"}
    assert client.post(f"{API}/consents", headers=james, json={"person": "nobody", "item": "Photo"}).status_code == 422
    assert client.post(f"{API}/consents", headers=james, json={"person": "michael", "item": "Photo", "memory_id": "nope"}).status_code == 422
    assert client.post(f"{API}/consents", headers=james, json={"person": "michael", "item": ""}).status_code == 422
    # For a minor, the request goes to a parent.
    c = client.post(f"{API}/consents", headers=james, json={"person": "grace", "item": "School play", "kind": "Voice"}).json()
    assert c["guardian"] in {"michael", "emma"} and c["can_remind"] is True
    assert client.patch(f"{API}/consents/{c['id']}", headers=auth("michael"), json={"status": "given"}).json()["status"] == "given"


def test_reminding_about_a_pending_consent(client, auth):
    # k3 asks James about a photo; Mary asked for it.
    assert client.post(f"{API}/consents/k3/remind", headers=auth("james")).status_code == 403
    assert client.post(f"{API}/consents/k1/remind", headers=auth("mary")).status_code == 422  # already given
    assert client.post(f"{API}/consents/k3/remind", headers=auth("emma")).status_code == 404  # not hers to see
    r = client.post(f"{API}/consents/k3/remind", headers=auth("mary"))
    assert r.status_code == 200 and r.json()["status"] == "pending"
    kinds = [n["kind"] for n in client.get(f"{API}/notifications", headers=auth("james")).json()["items"]]
    assert "consent.reminder" in kinds


def test_listening_and_downloading_show_in_the_owners_access_log(client, auth):
    mary = auth("mary")
    before = len(client.get(f"{API}/access-log", headers=mary).json())
    assert client.post(f"{API}/activity", headers=auth("james"), json={"action": "listened", "kind": "story", "id": "s1"}).status_code == 204
    log = client.get(f"{API}/access-log", headers=mary).json()
    assert len(log) == before + 1 and (log[0]["action"], log[0]["who"]) == ("listened", "james")
    assert log[0]["title"] == "Crossing the Atlantic in 1968"

    # Your own plays, and sample items nobody owns, aren't logged.
    assert client.post(f"{API}/activity", headers=mary, json={"action": "listened", "kind": "story", "id": "s1"}).status_code == 204
    assert client.post(f"{API}/activity", headers=auth("james"), json={"action": "downloaded", "kind": "memory", "id": "m1"}).status_code == 204
    assert len(client.get(f"{API}/access-log", headers=mary).json()) == before + 1
    assert client.post(f"{API}/activity", headers=mary, json={"action": "listened", "kind": "story", "id": "nope"}).status_code == 404
    assert client.post(f"{API}/activity", headers=mary, json={"action": "shared", "kind": "story", "id": "s1"}).status_code == 422


def test_accounts_close_after_the_grace_period(client, auth):
    from datetime import timedelta

    from sqlmodel import Session, select

    from app.db import engine
    from app.models import Message, ThreadMember, User, UserPrivacy, now
    from app.routers.privacy import GRACE_DAYS, close_due_accounts
    from helpers import login

    james = auth("james")
    client.patch(f"{API}/privacy/mine", headers=james, json={"age": True})  # James has saved privacy choices
    assert client.post(f"{API}/me/deletion-request", headers=james).status_code == 200
    assert client.post(f"{API}/me/deletion-request", headers=auth("emma")).status_code == 200  # still within her 30 days

    with Session(engine) as db:
        assert close_due_accounts(db) == 0  # nobody's time is up yet
        u = db.exec(select(User).where(User.email == "james@example.com")).one()
        uid = u.id
        u.deletion_requested_at = now() - timedelta(days=GRACE_DAYS + 1)
        db.add(u)
        db.commit()
        assert db.exec(select(Message).where(Message.sender_id == uid, Message.deleted_at == None)).all()  # noqa: E711

        assert close_due_accounts(db) == 1

        u = db.get(User, uid)
        assert u.removed_at is not None and u.name == "Former member" and u.email.endswith("@closed.invalid")
        assert all(m.deleted_at and m.text == "" for m in db.exec(select(Message).where(Message.sender_id == uid)).all())
        assert all(tm.left_at for tm in db.exec(select(ThreadMember).where(ThreadMember.user_id == uid)).all())
        assert db.get(UserPrivacy, uid) is None
        assert db.exec(select(User).where(User.email == "emma@example.com")).one().removed_at is None

    assert login(client, "james@example.com").status_code == 401
    assert client.get(f"{API}/people/james", headers=auth("mary")).status_code == 200  # the tree keeps the person
