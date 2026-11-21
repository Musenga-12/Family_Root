"""Database engine and the per-request session dependency."""
import logging
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import event, inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

log = logging.getLogger("familyroots")
SQLITE = settings.database_url.startswith("sqlite")
ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"
# check_same_thread is only needed for SQLite; pre_ping replaces dropped connections on a database server.
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False} if SQLITE else {},
                       pool_pre_ping=not SQLITE)

if SQLITE:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record) -> None:
        # Wait a moment instead of failing when another request is writing. Foreign keys are deliberately not switched
        # on here: the models have no relationship()s, so SQLAlchemy may insert a child row before its parent within
        # one flush (seed.py does), which SQLite would then refuse. tests/test_contract.py checks integrity instead.
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()


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


def add_missing_indexes() -> None:
    """Like add_missing_columns, for indexes added to models.py after a table was made. Only ever adds an index."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {i["name"] for i in insp.get_indexes(table.name)}
            for index in table.indexes:
                if index.name not in have:
                    index.create(conn, checkfirst=True)


def migration_status() -> tuple[str | None, str]:
    """(revision the database is at, latest revision in migrations/). The first is None before `alembic stamp`."""
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    head = ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision(), head


def create_db() -> None:
    """At startup. A database server (Supabase) is only ever changed by reviewed migrations (`alembic upgrade head`,
    see README), so here it is just checked. SQLite (tests, the on-device copy) is still set up directly."""
    from app import models  # noqa: F401  (registers the tables)

    if not SQLITE:
        current, head = migration_status()
        if current != head:
            problem = (f"Database schema is at migration {current or '(none)'}, but the code expects {head}. Run `alembic "
                       "upgrade head` in backend/ after reviewing it (README: Database migrations).")
            # A production server on the wrong schema would fail on some requests or save data in the wrong shape, so it
            # doesn't start. Development only reports it, so a developer can still look around.
            if settings.production:
                raise RuntimeError(problem)
            log.error(problem)
        return
    SQLModel.metadata.create_all(engine)
    add_missing_columns()
    add_missing_indexes()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
