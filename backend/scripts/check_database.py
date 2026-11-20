"""Read-only health check of the database the backend is configured to use (backend/.env DATABASE_URL).

Answers: which database is this (host only, never the user or password), is it at the latest migration, do its tables
and columns match app/models.py, how many rows does each table hold, and are the sample accounts from seed.py in it.
Runs inside a READ ONLY transaction and changes nothing. Run from backend/:

    .venv\\Scripts\\python scripts/check_database.py
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import inspect, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import app.models  # noqa: E402,F401  (registers every table)
from app.config import settings  # noqa: E402
from app.db import engine, migration_status  # noqa: E402


def main() -> int:
    url = make_url(settings.database_url)
    print(f"Database: {url.get_backend_name()} on {url.host or url.database} (environment: {settings.environment})")
    problems = []
    with engine.connect() as conn:
        if url.get_backend_name() == "postgresql":
            conn.execute(text("SET TRANSACTION READ ONLY"))
        insp = inspect(conn)
        have = set(insp.get_table_names())
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in have:
                problems.append(f"missing table: {table.name}")
                continue
            cols = {c["name"] for c in insp.get_columns(table.name)}
            missing = [c.name for c in table.columns if c.name not in cols]
            if missing:
                problems.append(f"{table.name}: missing columns {', '.join(missing)}")
        print("\nRows per table:")
        for table in SQLModel.metadata.sorted_tables:
            if table.name in have:
                n = conn.execute(text(f'SELECT COUNT(*) FROM "{table.name}"')).scalar()
                print(f"  {table.name:<16} {n}")
        if "user" in have:
            sample = conn.execute(text("""SELECT COUNT(*) FROM "user" WHERE email LIKE '%@example.com' AND removed_at IS NULL""")).scalar()
            real = conn.execute(text("""SELECT COUNT(*) FROM "user" WHERE email NOT LIKE '%@example.com'""")).scalar()
            print(f"\nAccounts: {real} real, {sample} sample (@example.com, can sign in with the published demo password)")
            if sample:
                problems.append(f"{sample} sample accounts can sign in")
        conn.rollback()
    try:
        current, latest = migration_status()
        print(f"\nMigration: database at {current}, code at {latest}")
        if current != latest:
            problems.append("database is not at the latest migration (run: alembic upgrade head)")
    except Exception as e:  # noqa: BLE001  (SQLite development databases aren't migrated)
        print(f"\nMigration: could not be read ({e.__class__.__name__})")
    print("\n" + ("Problems:\n- " + "\n- ".join(problems) if problems else "No problems found."))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
