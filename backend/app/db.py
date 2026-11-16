"""Database engine and the per-request session dependency."""
from collections.abc import Generator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# check_same_thread is only needed for SQLite.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


def add_missing_columns() -> None:
    """create_all makes new tables but never changes existing ones. Until Alembic migrations are set up, add any
    new *nullable* column to an existing table, so an existing familyroots.db keeps working after an update."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in have and col.nullable and not col.primary_key:
                    ctype = col.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ctype}'))


def create_db() -> None:
    from app import models  # noqa: F401  (registers the tables)

    SQLModel.metadata.create_all(engine)
    add_missing_columns()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
