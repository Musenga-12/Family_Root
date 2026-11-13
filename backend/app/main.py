"""FamilyRoots API. Run from the backend folder: fastapi dev app/main.py  →  docs at http://localhost:8000/docs"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app import realtime
from app.config import settings
from app.db import create_db, engine
from app.routers import (admin, albums, auth, calendar, legacy, memories, overview, people, privacy, stories, threads,
                         timeline, uploads)


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db()  # creates missing tables; switch to Alembic migrations once the schema settles
    with Session(engine) as db:
        privacy.close_due_accounts(db)  # accounts whose 30-day notice has run out
    yield


app = FastAPI(title="FamilyRoots API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api/v1"
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
