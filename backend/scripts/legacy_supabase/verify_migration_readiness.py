
import sqlite3
import sys
from pathlib import Path
from getpass import getpass

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL
from sqlmodel import SQLModel

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/
import app.models  # noqa: F401

source = Path(__file__).resolve().parents[2] / "familyroots.db"

if not source.exists():
    raise SystemExit(f"SQLite database not found: {source}")

# Open SQLite strictly in read-only mode.
sqlite_uri = source.as_uri() + "?mode=ro"
sqlite_db = sqlite3.connect(sqlite_uri, uri=True)

integrity = sqlite_db.execute("PRAGMA integrity_check").fetchone()[0]
foreign_key_errors = sqlite_db.execute(
    "PRAGMA foreign_key_check"
).fetchall()

source_tables = {
    row[0]
    for row in sqlite_db.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
}

model_tables = set(SQLModel.metadata.tables.keys())

source_counts = {
    table: sqlite_db.execute(
        f'SELECT COUNT(*) FROM "{table}"'
    ).fetchone()[0]
    for table in sorted(source_tables)
}

print("=== SQLITE SOURCE CHECK ===")
print("Integrity:", integrity)
print("Foreign-key violations:", len(foreign_key_errors))
print("Source tables:", len(source_tables))
print("Source records:", sum(source_counts.values()))

print("\n=== SOURCE RECORD COUNTS ===")
for table, count in source_counts.items():
    print(f"{table}: {count}")

if integrity != "ok":
    raise SystemExit("SQLite integrity check failed.")

if foreign_key_errors:
    raise SystemExit("SQLite has foreign-key violations.")

if source_tables != model_tables:
    raise SystemExit("SQLite tables do not match application models.")

# Collect Supabase connection details without displaying the password.
print("\n=== SUPABASE READ-ONLY CHECK ===")
host = input("Session Pooler host: ").strip()
port = input("Port [5432]: ").strip() or "5432"
database = input("Database [postgres]: ").strip() or "postgres"
username = input("Database username: ").strip()
password = getpass("Database password: ")

if not all([host, username, password]):
    raise SystemExit("Connection details are incomplete.")

url = URL.create(
    "postgresql+psycopg",
    username=username,
    password=password,
    host=host,
    port=int(port),
    database=database,
)

engine = create_engine(
    url,
    connect_args={"sslmode": "require"},
    pool_pre_ping=True,
)

try:
    with engine.connect() as connection:
        database_name, schema = connection.execute(
            text("SELECT current_database(), current_schema()")
        ).one()

    if database_name != "postgres" or schema != "public":
        raise SystemExit("Unexpected Supabase database or schema.")

    target_tables = set(
        inspect(engine).get_table_names(schema="public")
    )

    target_counts = {}

    with engine.connect() as connection:
        for table in sorted(target_tables):
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM public."{table}"')
            ).scalar_one()
            target_counts[table] = count

    print("Database:", database_name)
    print("Schema:", schema)
    print("Target tables:", len(target_tables))
    print("Target records:", sum(target_counts.values()))

    print("\n=== SUPABASE TABLE COUNTS ===")
    for table, count in target_counts.items():
        print(f"{table}: {count}")

    print("\n=== MIGRATION READINESS ===")
    print("Missing target tables:", sorted(source_tables - target_tables))
    print("Unexpected target tables:", sorted(target_tables - source_tables))

    nonempty = {
        table: count
        for table, count in target_counts.items()
        if count != 0
    }

    print("Non-empty target tables:", nonempty or "None")

    if source_tables != target_tables:
        raise SystemExit("Source and target table names differ.")

    if nonempty:
        raise SystemExit(
            "Supabase contains records. Stop before migration."
        )

    print("\nSUCCESS: Both databases are ready for data migration.")
    print("Source records remain untouched.")
    print("Supabase contains no application records.")

finally:
    engine.dispose()
    sqlite_db.close()
