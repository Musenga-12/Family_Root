"""The sample family (seed.py): its accounts share a published password, so production never lets them in, nobody may
choose that password there, and seed.py only ever fills an empty development database."""
import pytest
from sqlmodel import Session, func, select

from app.config import settings
from app.db import engine
from app.models import Family
from helpers import API, PASSWORD, bearer, login

WRONG = {"detail": "Email or password is incorrect"}


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")


def test_sample_accounts_sign_in_during_development(client):
    assert login(client, "mary@example.com").status_code == 200


def test_production_refuses_sample_accounts_like_a_wrong_password(client, production):
    r = login(client, "mary@example.com")
    assert r.status_code == 401 and r.json() == WRONG
    assert login(client, "  MARY@Example.com ").json() == WRONG  # however it is typed


def test_production_refuses_sample_accounts_even_after_a_password_change(client, auth, monkeypatch):
    h = auth("mary")  # signed in during development, then the account's password was changed
    assert client.post(f"{API}/auth/change-password", headers=h,
                       json={"current_password": PASSWORD, "new_password": "a-new-long-password"}).status_code == 200
    monkeypatch.setattr(settings, "environment", "production")
    assert login(client, "mary@example.com", "a-new-long-password").json() == WRONG


def test_production_refuses_the_published_password_for_any_account(client, production):
    r = client.post(f"{API}/auth/register", json={"name": "Real Person", "email": "real@family.example", "password": PASSWORD})
    assert r.status_code == 422 and "published" in r.json()["detail"]
    assert client.post(f"{API}/auth/register", json={"name": "Real Person", "email": "real@family.example",
                                                     "password": "a-good-long-password"}).status_code == 201
    # A real account that somehow has the published password (set before this rule) can't use it either.
    assert login(client, "real@family.example", PASSWORD).json() == WRONG


def test_production_refuses_changing_or_resetting_to_the_published_password(client, monkeypatch):
    r = client.post(f"{API}/auth/register", json={"name": "Real Person", "email": "real@family.example",
                                                  "password": "a-good-long-password"})
    h = bearer(r.json()["access_token"])
    monkeypatch.setattr(settings, "environment", "production")
    r = client.post(f"{API}/auth/change-password", headers=h,
                    json={"current_password": "a-good-long-password", "new_password": PASSWORD})
    assert r.status_code == 422 and "published" in r.json()["detail"]
    assert login(client, "real@family.example", "a-good-long-password").status_code == 200  # unchanged


def test_seed_never_runs_in_production(client, production):
    import seed

    with pytest.raises(SystemExit, match="never runs with ENVIRONMENT=production"):
        seed.main()


def test_seed_never_adds_the_sample_family_to_a_database_with_families(client):
    import seed

    with Session(engine) as db:
        mck = db.exec(select(Family).where(Family.code == "MCK-8294")).one()
        mck.code = "ROSS-1234"  # a database holding some other family
        db.add(mck)
        db.commit()
        before = db.exec(select(func.count()).select_from(Family)).one()
    with pytest.raises(SystemExit, match="only fills an empty database"):
        seed.main()
    with Session(engine) as db:
        assert db.exec(select(func.count()).select_from(Family)).one() == before
