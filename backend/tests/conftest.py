"""Every test gets a fresh copy of the seeded sample family in a temporary database and upload folder.
The real familyroots.db and uploads/ are never opened. Run from backend/:  python -m pytest"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix="familyroots-tests-"))
DB = TMP / "test.db"
TEMPLATE = TMP / "template.db"
UPLOADS = TMP / "uploads"

# Before the app is imported: settings are read once, and these take precedence over backend/.env.
os.environ.update(
    ENVIRONMENT="development",
    DATABASE_URL=f"sqlite:///{DB.as_posix()}",
    UPLOAD_DIR=str(UPLOADS),
    SECRET_KEY="test-only-secret-" + "k" * 40,
    FRONTEND_ORIGIN="http://localhost:5173",
    API_BASE_URL="http://testserver",
    RATE_LIMIT_ENABLED="true",
)
sys.path.insert(0, str(BACKEND))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

assert Path(settings.database_url.split("///", 1)[1]).resolve() == DB.resolve(), "tests must never use the real database"


def _seed_template() -> None:
    import seed

    seed.main()
    engine.dispose()
    shutil.copy(DB, TEMPLATE)


_seed_template()


@pytest.fixture
def client():
    engine.dispose()  # let go of the previous test's database file before replacing it
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
