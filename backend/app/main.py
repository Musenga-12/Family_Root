"""FamilyRoots API. Run from the backend folder: fastapi dev app/main.py  →  docs at http://localhost:8000/docs"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlmodel import Session

from app import realtime
from app.config import API_PREFIX, check_settings, settings
from app.db import create_db, engine
from app.routers import (
    admin,
    albums,
    auth,
    calendar,
    legacy,
    memories,
    notifications,
    overview,
    people,
    privacy,
    stories,
    suggestions,
    threads,
    timeline,
    uploads,
)


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("familyroots")
check_settings(settings)  # stops a production server with unsafe settings before it accepts requests


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db()  # SQLite: creates missing tables. A database server: checks its migration (alembic upgrade head)
    with Session(engine) as db:
        privacy.close_due_accounts(db)  # accounts whose 30-day notice has run out
    yield


DOCS_INTRO = """
**Trying the API here**

1. Click **Authorize**, enter a demo email in *username* (e.g. `mary@example.com`, an Admin) and the password
   `familyroots123`, then **Authorize**. You stay signed in when the page reloads. Other demo accounts:
   `michael@example.com` (Custodian), `anna@example.com` (Viewer). Run `python seed.py` first if they don't exist.
2. Open an endpoint, click **Try it out**. Request bodies start from a working example: edit it, then **Execute**.
   For PATCH, send only the fields you want to change.

Sample ids from the seed data: people `mary`, `sarah`, `michael`, `robert`; memories `m1`–`m6`; albums `a1`–`a5`;
stories `s1`–`s5`; threads `c1`–`c4`; milestones `t1`–`t10`; events `e1`, `e2`; records `r1`–`r7`;
join requests `q1`, `q2`; invite `i1`; consents `k1`–`k5`. Family code: `MCK-8294`.

Files: upload with `POST /uploads`; the `url` in the response opens the file directly (no Authorize needed).
The live chat WebSocket (`/api/v1/ws?token=...`) can't be tried from this page.
"""

app = FastAPI(
    title="FamilyRoots API",
    version="0.1.0",
    description=DOCS_INTRO,
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True},
    # The try-it-out pages list the demo accounts; a real family's server doesn't publish them.
    docs_url=None if settings.production else "/docs",
    redoc_url=None if settings.production else "/redoc",
    openapi_url=None if settings.production else "/openapi.json",
)


# Errors always come back as {"detail": "..."}, the shape the React app reads (src/lib/api.js), and never include
# the server's internals. The full error is written to the server log.
@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    log.warning("Integrity error on %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse({"detail": "This conflicts with something already saved (it may have been added twice). Reload and try again."},
                        status_code=409)


@app.exception_handler(OperationalError)
async def database_unavailable(request: Request, exc: OperationalError):
    log.error("Database error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse({"detail": "The family archive is busy or unavailable right now. Please try again in a moment."},
                        status_code=503)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    log.error("Unexpected error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse({"detail": "Something went wrong on the server. Please try again."}, status_code=500)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")  # file links carry a token in the address
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


def allowed_origins() -> list[str]:
    """FRONTEND_ORIGIN and EXTRA_ORIGINS. "localhost" and "127.0.0.1" are the same computer but different origins to a
    browser, so each is allowed together with its twin; otherwise opening the app the other way looks like a dead server."""
    origins = [settings.frontend_origin, *[o.strip() for o in settings.extra_origins.split(",") if o.strip()]]
    twins = [o.replace("://localhost", "://127.0.0.1") if "://localhost" in o else o.replace("://127.0.0.1", "://localhost") for o in origins]
    return list(dict.fromkeys(o.rstrip("/") for o in origins + twins))


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = API_PREFIX
app.include_router(auth.router, prefix=API)
app.include_router(people.router, prefix=API)
app.include_router(uploads.router, prefix=API)
app.include_router(memories.router, prefix=API)
app.include_router(albums.router, prefix=API)
app.include_router(stories.router, prefix=API)
app.include_router(threads.router, prefix=API)
app.include_router(timeline.router, prefix=API)
app.include_router(calendar.router, prefix=API)
app.include_router(legacy.router, prefix=API)
app.include_router(admin.router, prefix=API)
app.include_router(privacy.router, prefix=API)
app.include_router(overview.router, prefix=API)
app.include_router(notifications.router, prefix=API)
app.include_router(suggestions.router, prefix=API)
app.include_router(realtime.router, prefix=API)


@app.get("/health", tags=["health"])
def health():
    """For uptime checks: 200 when the API and its database answer, 503 when the database doesn't."""
    try:
        with Session(engine) as db:
            db.exec(text("SELECT 1"))
    except Exception:
        log.exception("Health check: database unavailable")
        return JSONResponse({"status": "error", "database": "error"}, status_code=503)
    return {"status": "ok", "database": "ok"}
