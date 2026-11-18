"""Registration, sign-in, tokens, passwords and attempt limits."""
import logging
import re
import time
from datetime import timedelta

from sqlmodel import Session

from helpers import API, PASSWORD, bearer, login, make_token, member_id


def register(client, **body):
    return client.post(f"{API}/auth/register", json={"name": "New Person", "password": "long-enough-pw", **body})


# ---------- registration ----------

def test_register_new_family_makes_an_admin(client):
    r = register(client, email="New.Person@Example.org", family_name="Ross family")
    assert r.status_code == 201
    assert r.json()["status"] == "active" and r.json()["family_name"] == "Ross family"
    me = client.get(f"{API}/me", headers=bearer(r.json()["access_token"])).json()
    assert me["role"] == "Admin" and me["email"] == "new.person@example.org"
    assert re.fullmatch(r"PER-\d{4}", me["family_code"]) and me["onboarding_done"] is False


def test_register_rejects_duplicate_email_and_short_password(client):
    assert register(client, email="MARY@example.com").status_code == 409
    r = client.post(f"{API}/auth/register", json={"name": "X", "email": "x@example.org", "password": "short"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], list)


def test_join_with_family_code_waits_for_an_admin(client, auth):
    r = register(client, email="ian@example.org", family_code=" mck-8294 ", relation="Cousin")
    assert r.status_code == 202 and r.json() == {"status": "pending", "access_token": None, "token_type": "bearer", "family_name": "Mackenzie family"}
    r = login(client, "ian@example.org", "long-enough-pw")
    assert r.status_code == 403 and "waiting for an Admin" in r.json()["detail"]
    assert register(client, email="ian@example.org", family_code="MCK-8294").status_code == 409  # asked already
    requests = client.get(f"{API}/join-requests", headers=auth("mary")).json()
    assert "ian@example.org" in [q["email"] for q in requests]
    bell = client.get(f"{API}/notifications", headers=auth("mary")).json()
    assert bell["unread"] >= 1 and bell["items"][0]["kind"] == "join.requested"


def test_unknown_family_code(client):
    assert register(client, email="x@example.org", family_code="ZZZ-0000").status_code == 404
    assert client.post(f"{API}/auth/family-code/verify", json={"code": "ZZZ-0000"}).status_code == 404
    assert client.post(f"{API}/auth/family-code/verify", json={"code": "mck-8294"}).json() == {"family_name": "Mackenzie family"}


def test_invitation_flow(client, auth):
    inv = client.post(f"{API}/invites", headers=auth("mary"), json={"name": "Isla", "email": "Isla@Example.org", "role": "Contributor"}).json()
    token = inv["link"].split("invite=", 1)[1]
    info = client.get(f"{API}/invites/by-token/{token}").json()
    assert info == {"family_name": "Mackenzie family", "name": "Isla", "email": "isla@example.org", "relation": None}

    assert register(client, email="someone.else@example.org", invite_token=token).status_code == 422  # sent to another address
    r = register(client, email="isla@example.org", invite_token=token)
    assert r.status_code == 201 and r.json()["status"] == "active"
    assert client.get(f"{API}/me", headers=bearer(r.json()["access_token"])).json()["role"] == "Contributor"
    # Used now: neither the link nor the sign-up work again.
    assert client.get(f"{API}/invites/by-token/{token}").status_code == 404
    assert register(client, email="isla2@example.org", invite_token=token).status_code == 404


def test_cancelled_invitation_stops_working(client, auth):
    inv = client.post(f"{API}/invites", headers=auth("mary"), json={"name": "Ross", "email": "ross@example.org"}).json()
    token = inv["link"].split("invite=", 1)[1]
    assert client.delete(f"{API}/invites/{inv['id']}", headers=auth("mary")).status_code == 204
    assert register(client, email="ross@example.org", invite_token=token).status_code == 404
    assert client.get(f"{API}/invites/by-token/nonsense").status_code == 404


# ---------- signing in ----------

def test_login(client):
    r = login(client, " Mary@Example.com ")
    assert r.status_code == 200 and r.json()["token_type"] == "bearer"
    wrong, unknown = login(client, "mary@example.com", "wrong-password"), login(client, "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()  # same answer: doesn't reveal who has an account


def test_swagger_token_endpoint(client):
    r = client.post(f"{API}/auth/token", data={"username": "mary@example.com", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["access_token"]


def test_removed_member_loses_access_at_once(client, auth):
    anna = auth("anna")
    assert client.delete(f"{API}/members/{member_id(client, auth('mary'), 'anna')}", headers=auth("mary")).status_code == 204
    assert client.get(f"{API}/me", headers=anna).status_code == 401
    r = login(client, "anna@example.com")
    assert r.status_code == 403 and "removed" in r.json()["detail"]


def test_bad_tokens_are_refused(client, auth):
    good = auth("mary")["Authorization"].split()[1]
    for token in ["garbage", good[:-2] + ("AA" if not good.endswith("AA") else "BB"),
                  make_token({"sub": "1", "typ": "access"}, expires_in=timedelta(minutes=-1)),  # expired
                  make_token({"sub": "1", "typ": "file"}),  # a file link isn't a sign-in
                  make_token({"sub": "not-a-number", "typ": "access"}),
                  make_token({"typ": "access"}),
                  make_token({"sub": "999999", "typ": "access"})]:
        r = client.get(f"{API}/me", headers=bearer(token))
        assert r.status_code == 401, token
        assert r.json() == {"detail": "Not signed in"}
    assert client.get(f"{API}/me").status_code == 401


# ---------- passwords ----------

def reset_link_from_log(caplog, client, email: str) -> str:
    with caplog.at_level(logging.WARNING, logger="familyroots"):
        r = client.post(f"{API}/auth/forgot-password", json={"email": email})
    assert r.status_code == 202
    return re.search(r"token=(\S+)", caplog.text).group(1)


def test_forgot_and_reset_password(client, caplog):
    token = reset_link_from_log(caplog, client, "james@example.com")
    r = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "a-brand-new-password"})
    assert r.status_code == 200 and r.json()["access_token"]
    assert login(client, "james@example.com").status_code == 401
    assert login(client, "james@example.com", "a-brand-new-password").status_code == 200
    again = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "another-new-password"})
    assert again.status_code == 400  # one use only


def test_forgot_password_answers_the_same_for_unknown_emails(client):
    a = client.post(f"{API}/auth/forgot-password", json={"email": "nobody@example.com"})
    b = client.post(f"{API}/auth/forgot-password", json={"email": "mary@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()


def test_expired_reset_link(client):
    from app.auth import create_reset_link
    from app.db import engine
    from app.models import User

    with Session(engine) as db:
        link, _ = create_reset_link(db, db.get(User, 1), minutes=-1)
    r = client.post(f"{API}/auth/reset-password", json={"token": link.split("token=")[1], "password": "a-brand-new-password"})
    assert r.status_code == 400


def test_reset_link_is_not_logged_in_production(client, caplog, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    with caplog.at_level(logging.WARNING, logger="familyroots"):
        client.post(f"{API}/auth/forgot-password", json={"email": "james@example.com"})
    assert "token=" not in caplog.text and "james@example.com" not in caplog.text


def test_changing_password_signs_out_other_devices(client):
    old = bearer(login(client, "david@example.com").json()["access_token"])
    time.sleep(1.1)  # token times have one-second precision
    assert client.post(f"{API}/auth/change-password", headers=old,
                       json={"current_password": "wrong", "new_password": "a-brand-new-password"}).status_code == 400
    r = client.post(f"{API}/auth/change-password", headers=old, json={"current_password": PASSWORD, "new_password": "a-brand-new-password"})
    assert r.status_code == 200
    assert client.get(f"{API}/me", headers=old).status_code == 401
    assert client.get(f"{API}/me", headers=bearer(r.json()["access_token"])).status_code == 200


def test_new_email_needs_current_password(client, auth):
    h = auth("emma")
    assert client.patch(f"{API}/me", headers=h, json={"email": "emma.new@example.com"}).status_code == 400
    assert client.patch(f"{API}/me", headers=h, json={"email": "mary@example.com", "current_password": PASSWORD}).status_code == 409
    r = client.patch(f"{API}/me", headers=h, json={"email": "Emma.New@example.com", "current_password": PASSWORD, "name": " Emma R "})
    assert r.status_code == 200 and r.json()["email"] == "emma.new@example.com" and r.json()["name"] == "Emma R"
    assert client.patch(f"{API}/me", headers=h, json={"name": ""}).status_code == 422


def test_preferences_round_trip(client, auth):
    h = auth("emma")
    body = {"lang": "rw", "notify": {"birthdays": False, "stories": True, "digest": "monthly"}}
    assert client.put(f"{API}/me/preferences", headers=h, json=body).json() == body
    assert client.get(f"{API}/me/preferences", headers=h).json() == body
    assert client.put(f"{API}/me/preferences", headers=h, json={"lang": "xx"}).status_code == 422


# ---------- attempt limits ----------

def test_too_many_sign_in_attempts(client):
    codes = [login(client, "mary@example.com", f"guess-{i}").status_code for i in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429
    assert login(client, "mary@example.com").status_code == 429  # even the right password, until the window passes


def test_too_many_family_code_guesses(client):
    codes = [client.post(f"{API}/auth/family-code/verify", json={"code": f"ABC-{1000 + i}"}) for i in range(11)]
    assert [c.status_code for c in codes[:10]] == [404] * 10
    assert codes[10].status_code == 429 and int(codes[10].headers["Retry-After"]) > 0
    assert "Too many attempts" in codes[10].json()["detail"]
