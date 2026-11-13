"""Database engine and the per-request session dependency."""
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# check_same_thread is only needed for SQLite.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


def create_db() -> None:
    from app import models  # noqa: F401  (registers the tables)

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
