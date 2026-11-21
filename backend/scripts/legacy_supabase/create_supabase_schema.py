# Superseded: for a new, empty database run `alembic upgrade head` instead (README: Database migrations).
# Kept for the record of how the current Supabase schema was first created.

import sys
from pathlib import Path
from getpass import getpass

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL
from sqlmodel import SQLModel

# Load the existing Family Roots models.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/

import app.models  # noqa: F401

print("=== FAMILY ROOTS: SUPABASE SCHEMA CREATION ===")
print("Enter the Supabase Session Pooler connection details.")
print("The password will not be displayed.")

host = input("Session Pooler host: ").strip()
port = input("Port [5432]: ").strip() or "5432"
database = input("Database [postgres]: ").strip() or "postgres"
username = input("Database username: ").strip()
password = getpass("Database password: ")

if not all([host, username, password]):
    raise SystemExit("Host, username and password are required.")

url = URL.create(
    drivername="postgresql+psycopg",
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
        db_name, db_user, schema = connection.execute(
            text("SELECT current_database(), current_user, current_schema()")
        ).one()

    print(f"\nConnected database: {db_name}")
    print(f"Connected user: {db_user}")
    print(f"Current schema: {schema}")

    if db_name != "postgres" or schema != "public":
        raise RuntimeError(
            "Unexpected database or schema. No tables were created."
        )

    existing_tables = set(inspect(engine).get_table_names(schema="public"))

    if existing_tables:
        raise RuntimeError(
            f"Public schema is not empty: {sorted(existing_tables)}"
        )

    print("\nCreating tables from Family Roots SQLModel definitions...")
    SQLModel.metadata.create_all(engine)

    created_tables = set(inspect(engine).get_table_names(schema="public"))
    expected_tables = set(SQLModel.metadata.tables.keys())

    print("\n=== SCHEMA CREATION RESULT ===")
    print("Expected tables:", len(expected_tables))
    print("Created tables:", len(created_tables))
    print("Missing tables:", sorted(expected_tables - created_tables))
    print("Unexpected tables:", sorted(created_tables - expected_tables))

    if created_tables != expected_tables:
        raise RuntimeError("Schema verification failed.")

    print("\nSUCCESS: All 36 Family Roots tables were created and verified.")
    print("No application records were imported.")

finally:
    engine.dispose()
