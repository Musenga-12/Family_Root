"""FamilyRoots API. Run from the backend folder: fastapi dev app/main.py  →  docs at http://localhost:8000/docs"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app import realtime
from app.config import API_PREFIX, settings
from app.db import create_db, engine
from app.routers import (
    admin,
    albums,
    auth,
    calendar,
    legacy,
    memories,
    overview,
    people,
    privacy,
    stories,
    threads,
    timeline,
    uploads,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db()  # creates missing tables; switch to Alembic migrations once the schema settles
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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
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
app.include_router(realtime.router, prefix=API)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
