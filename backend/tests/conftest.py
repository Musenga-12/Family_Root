"""Every test gets a fresh copy of the seeded sample family in a temporary database and upload folder.
The real familyroots.db and uploads/ are never opened. Run from backend/:  python -m pytest

On PostgreSQL (as in production): set TEST_DATABASE_URL to a throwaway database whose name ends in "_test", e.g.
    TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/familyroots_test python -m pytest
It is dropped and rebuilt with the Alembic migrations (so they are tested too), seeded once and kept as a template
database ("<name>_template") that each test's copy is made from. The server needs no other databases of that name."""
import os
import shutil
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix="familyroots-tests-"))
DB = TMP / "test.db"
TEMPLATE = TMP / "template.db"
PG_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
UPLOADS = TMP / "uploads"

# Before the app is imported: settings are read once, and these take precedence over backend/.env.
os.environ.update(
    ENVIRONMENT="development",
    DATABASE_URL=PG_URL or f"sqlite:///{DB.as_posix()}",
    DATABASE_URL_DIRECT="",  # never a migration address from backend/.env: Alembic would prefer it
    UPLOAD_DIR=str(UPLOADS),
    SECRET_KEY="test-only-secret-" + "k" * 40,
    FRONTEND_ORIGIN="http://localhost:5173",
    API_BASE_URL="http://testserver",
    RATE_LIMIT_ENABLED="true",
    # Email: never real. No provider key, so development's console sender is used unless a test fakes one.
    EMAIL_PROVIDER="",
    RESEND_API_KEY="",
    EMAIL_FROM="",
    EMAIL_MIN_RESPONSE_MS="0",
)
sys.path.insert(0, str(BACKEND))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

assert settings.database_url_direct == "", "tests must never migrate the real database"
POSTGRES = bool(PG_URL)
if POSTGRES:
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    TEST_DB = make_url(PG_URL).database or ""
    assert TEST_DB.endswith("_test"), "TEST_DATABASE_URL must name a throwaway database ending in _test"
    assert make_url(settings.database_url).database == TEST_DB, "tests must never use the real database"
    TEMPLATE_DB = f"{TEST_DB}_template"
    # CREATE / DROP DATABASE run outside a transaction, on the server's maintenance database.
    admin = create_engine(make_url(PG_URL).set(database="postgres"), isolation_level="AUTOCOMMIT")

    def recreate(name: str, template: str | None = None) -> None:
        engine.dispose()  # the app's connections to the old copy
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
            conn.execute(text(f'CREATE DATABASE "{name}"' + (f' TEMPLATE "{template}"' if template else "")))
else:
    assert Path(settings.database_url.split("///", 1)[1]).resolve() == DB.resolve(), "tests must never use the real database"


def _seed_template() -> None:
    import seed

    if POSTGRES:
        from alembic import command
        from alembic.config import Config

        from app.db import ALEMBIC_INI

        recreate(TEST_DB)
        command.upgrade(Config(str(ALEMBIC_INI)), "head")  # the real migrations build the schema, as in production
        seed.main()
        recreate(TEMPLATE_DB, template=TEST_DB)
        return
    seed.main()
    engine.dispose()
    shutil.copy(DB, TEMPLATE)


_seed_template()


@pytest.fixture(autouse=True)
def _fresh_email_state():
    """Each test starts with the configured (console) sender and no remembered provider outage."""
    from app import mail

    mail.set_sender(None)
    mail.outage.clear()
    yield
    mail.set_sender(None)
    mail.outage.clear()


@pytest.fixture
def client():
    engine.dispose()  # let go of the previous test's database file before replacing it
    if POSTGRES:
        recreate(TEST_DB, template=TEMPLATE_DB)
    else:
        shutil.copy(TEMPLATE, DB)
    shutil.rmtree(UPLOADS, ignore_errors=True)
    limiter.reset()
    with TestClient(app) as c:  # runs start-up (create_db, closing due accounts) like the real server
        yield c
    engine.dispose()


@pytest.fixture
def auth(client):
    """auth("mary") -> headers for that sample account (mary Admin, sarah Admin, michael Custodian,
    james/emma/david/daniel Contributors, anna Viewer)."""
    from helpers import bearer, login

    cache: dict[str, dict] = {}

    def headers(who: str) -> dict:
        if who not in cache:
            r = login(client, f"{who}@example.com")
            assert r.status_code == 200, r.text
            cache[who] = bearer(r.json()["access_token"])
        return cache[who]

    return headers
