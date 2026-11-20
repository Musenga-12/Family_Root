"""What the React app (src/lib/api.js) relies on, plus server-wide behaviour: times, errors, health, start-up."""
import json
from datetime import timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.config import Settings, check_settings
from app.db import engine
from app.main import app
from app.models import User
from helpers import API, PASSWORD, bearer, login

ME_KEYS = {"id", "name", "email", "role", "family_id", "family_name", "person_id", "easy_mode", "family_code", "onboarding_done"}


def test_frontend_sign_in_contracts(client):
    r = login(client, "mary@example.com")
    assert set(r.json()) == {"access_token", "token_type"}
    me = client.get(f"{API}/me", headers=bearer(r.json()["access_token"])).json()
    assert set(me) == ME_KEYS and me["family_code"] == "MCK-8294" and me["person_id"] == "mary" and me["onboarding_done"] is True
    viewer = client.get(f"{API}/me", headers=bearer(login(client, "anna@example.com").json()["access_token"])).json()
    assert viewer["family_code"] is None  # only Admins see the code
    assert client.post(f"{API}/auth/family-code/verify", json={"code": "MCK-8294"}).json() == {"family_name": "Mackenzie family"}
    assert set(client.post(f"{API}/auth/forgot-password", json={"email": "x@example.com"}).json()) == {"detail"}
    reg = client.post(f"{API}/auth/register", json={"name": "A B", "email": "ab@example.org", "password": PASSWORD})
    assert set(reg.json()) == {"status", "access_token", "token_type", "family_name"}
    patched = client.patch(f"{API}/me", headers=bearer(reg.json()["access_token"]), json={"onboarding_done": True, "easy_mode": True}).json()
    assert set(patched) == ME_KEYS and patched["onboarding_done"] is True and patched["easy_mode"] is True


def test_frontend_invite_contracts(client, auth):
    inv = client.post(f"{API}/invites", headers=auth("mary"), json={"name": "Isla", "email": "isla2@example.org", "relation": None}).json()
    assert set(inv) == {"id", "name", "email", "relation", "role", "sent", "by", "link", "status", "emailed"}
    assert inv["emailed"] is True  # development: the console sender "sends" it
    assert inv["link"].startswith("http://localhost:5173/#/register?invite=")
    info = client.get(f"{API}/invites/by-token/{inv['link'].split('invite=')[1]}").json()
    assert set(info) == {"family_name", "name", "email", "relation"}


def test_errors_always_have_a_detail(client):
    assert client.get(f"{API}/me").json() == {"detail": "Not signed in"}
    bad = client.post(f"{API}/auth/login", json={"email": "x"})
    assert bad.status_code == 422 and isinstance(bad.json()["detail"], list)
    assert "detail" in client.get(f"{API}/no-such-route").json()


def test_times_are_utc_as_stored(client, auth):
    """The sample messages were stored at known UTC times; the API must give those back, whatever the server's time zone."""
    seed = json.loads((Path(__file__).parents[1] / "seed_data.json").read_text(encoding="utf-8"))
    c2 = next(t for t in seed["threads"] if t["id"] == "c2")
    expected = {m["id"]: m["at"] + ":00Z" for m in c2["messages"]}
    got = {m["id"]: m["at"] for m in client.get(f"{API}/threads/c2/messages", headers=auth("mary")).json()["messages"]}
    assert got == expected
    with Session(engine) as db:
        assert db.get(User, 1).created_at.tzinfo == timezone.utc  # read back as aware UTC


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "ok"}


def test_security_headers(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_cors_allows_the_app_only(client):
    ok = client.options(f"{API}/auth/login", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    twin = client.options(f"{API}/auth/login", headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST"})
    other = client.options(f"{API}/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert twin.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-origin" not in other.headers


def test_unexpected_errors_are_safe(client, monkeypatch):
    import app.routers.auth as auth_router

    def boom(*a, **k):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(auth_router, "me_out", boom)
    token = login(client, "mary@example.com").json()["access_token"]
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get(f"{API}/me", headers=bearer(token))
    assert r.status_code == 500 and r.json() == {"detail": "Something went wrong on the server. Please try again."}
    assert "secret internal detail" not in r.text


def test_conflicts_become_409(client, monkeypatch):
    import app.routers.auth as auth_router

    def clash(*a, **k):
        raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: user.email"))

    monkeypatch.setattr(auth_router, "me_out", clash)
    token = login(client, "mary@example.com").json()["access_token"]
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get(f"{API}/me", headers=bearer(token))
    assert r.status_code == 409 and "UNIQUE" not in r.text


def test_workflows_leave_no_broken_references(client, auth):
    """SQLite doesn't enforce foreign keys here (see db.py), so check that the main workflows only ever save valid ones."""
    from helpers import PNG, upload

    james, mary = auth("james"), auth("mary")
    up = upload(client, james, PNG).json()["id"]
    m = client.post(f"{API}/memories", headers=james, json={"title": "T", "date": "2026", "alt": "a", "consent": True, "upload_ids": [up]}).json()
    client.post(f"{API}/albums", headers=james, json={"title": "A", "items": [m[0]["id"]]})
    client.post(f"{API}/threads", headers=mary, json={"to": ["james", "emma"], "text": "Hi", "upload_id": None})
    client.post(f"{API}/events", headers=james, json={"title": "Lunch", "date": "2027-01-10"})
    client.post(f"{API}/join-requests/q1/approve", headers=mary, json={"role": "Viewer"})
    client.post(f"{API}/records/r1/attachments", headers=auth("sarah"), json={"upload_id": upload(client, auth("sarah"), PNG).json()["id"]})
    client.post(f"{API}/auth/register", json={"name": "New Family", "email": "nf@example.org", "password": PASSWORD})
    with engine.connect() as c:
        assert c.exec_driver_sql("PRAGMA foreign_key_check").fetchall() == []
        assert c.exec_driver_sql("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_startup_adds_missing_indexes(client):
    assert "ix_threadmember_user_id" in {i["name"] for i in inspect(engine).get_indexes("threadmember")}


def test_production_refuses_unsafe_settings():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        check_settings(Settings(_env_file=None, environment="production", secret_key="dev-only-secret-change-me"))
    with pytest.raises(RuntimeError, match="FRONTEND_ORIGIN"):
        check_settings(Settings(_env_file=None, environment="production", secret_key="s" * 40))
    check_settings(Settings(_env_file=None, environment="production", secret_key="s" * 40, frontend_origin="https://family.example",
                            api_base_url="https://api.family.example"))
    check_settings(Settings(_env_file=None))  # development: only a warning


def test_docs_are_served_in_development(client):
    assert client.get("/docs").status_code == 200 and client.get("/openapi.json").status_code == 200
