
import sys
import json
import hashlib
import sqlite3
from pathlib import Path
from getpass import getpass
from datetime import datetime, date, time, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, JSON, Time,
    create_engine, inspect, insert, select, text, func
)
from sqlalchemy.engine import URL
from sqlmodel import SQLModel
from sqlmodel.sql.sqltypes import UTCDateTime

# Register Family Roots models without loading the application database engine.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/
import app.models  # noqa: F401

SOURCE = Path(__file__).resolve().parents[2] / "familyroots.db"
EXPECTED_RECORDS = 120



def convert_value(value, column):
    """Convert SQLite values into PostgreSQL-compatible Python values."""
    if value is None:
        return None

    column_type = column.type

    # Handle SQLModel's custom timezone-aware datetime type.
    if isinstance(column_type, UTCDateTime):
        if isinstance(value, str):
            value = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )

        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value.astimezone(timezone.utc)

    if isinstance(column_type, JSON):
        return json.loads(value) if isinstance(value, str) else value

    if isinstance(column_type, DateTime):
        if isinstance(value, str):
            value = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )

        return value

    if isinstance(column_type, Date) and not isinstance(column_type, DateTime):
        if isinstance(value, str):
            return date.fromisoformat(value)

    if isinstance(column_type, Time) and isinstance(value, str):
        return time.fromisoformat(value)

    if isinstance(column_type, Boolean):
        return bool(value)

    return value


def normalize(value):
    """Create a consistent representation for source/target comparisons."""
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc)
        return {"datetime": value.isoformat()}

    if isinstance(value, date):
        return {"date": value.isoformat()}

    if isinstance(value, time):
        return {"time": value.isoformat()}

    if isinstance(value, Decimal):
        return {"decimal": format(value.normalize(), "f")}

    if isinstance(value, float):
        return {"decimal": format(Decimal(str(value)).normalize(), "f")}

    if isinstance(value, bytes):
        return {"bytes": value.hex()}

    if isinstance(value, dict):
        return {
            str(k): normalize(v)
            for k, v in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [normalize(v) for v in value]

    return value


def fingerprint(rows):
    """Hash all rows without depending on database row order."""
    encoded_rows = [
        json.dumps(normalize(dict(row)), sort_keys=True, separators=(",", ":"))
        for row in rows
    ]

    encoded_rows.sort()

    content = "\n".join(encoded_rows).encode("utf-8")
    return hashlib.sha256(content).hexdigest()


if not SOURCE.exists():
    raise SystemExit(f"SQLite source not found: {SOURCE}")

# Read SQLite in strictly read-only mode.
sqlite_db = sqlite3.connect(
    SOURCE.as_uri() + "?mode=ro",
    uri=True
)
sqlite_db.row_factory = sqlite3.Row

try:
    print("=== FAMILY ROOTS DATA MIGRATION ===")

    integrity = sqlite_db.execute(
        "PRAGMA integrity_check"
    ).fetchone()[0]

    fk_errors = sqlite_db.execute(
        "PRAGMA foreign_key_check"
    ).fetchall()

    if integrity != "ok" or fk_errors:
        raise RuntimeError("SQLite integrity or foreign-key check failed.")

    # Use SQLModel's dependency-aware insertion order.
    ordered_tables = list(SQLModel.metadata.sorted_tables)
    model_tables = set(SQLModel.metadata.tables.keys())

    source_tables = {
        row[0]
        for row in sqlite_db.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }

    if source_tables != model_tables:
        raise RuntimeError("SQLite tables do not match application models.")

    # Read and convert all source records before opening a target transaction.
    source_data = {}
    source_hashes = {}
    source_counts = {}

    for table in ordered_tables:
        rows = sqlite_db.execute(
            f'SELECT * FROM "{table.name}"'
        ).fetchall()

        converted_rows = []

        for source_row in rows:
            converted = {}

            for column in table.columns:
                converted[column.name] = convert_value(
                    source_row[column.name],
                    column
                )

            converted_rows.append(converted)

        source_data[table.name] = converted_rows
        source_counts[table.name] = len(converted_rows)
        source_hashes[table.name] = fingerprint(converted_rows)

    total_records = sum(source_counts.values())

    print("SQLite integrity:", integrity)
    print("Foreign-key violations:", len(fk_errors))
    print("Source tables:", len(source_tables))
    print("Source records:", total_records)

    if total_records != EXPECTED_RECORDS:
        raise RuntimeError(
            f"Expected {EXPECTED_RECORDS} source records, "
            f"but found {total_records}. Stop and recheck the source."
        )

    # Collect Supabase connection details without displaying the password.
    print("\n=== SUPABASE CONNECTION ===")

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
        target_tables = set(
            inspect(engine).get_table_names(schema="public")
        )

        if target_tables != source_tables:
            raise RuntimeError("Supabase tables do not match SQLite tables.")

        print("\nChecking that every Supabase table is empty...")

        # The entire import and verification happen in one transaction.
        with engine.begin() as connection:

            existing_counts = {}

            for table in ordered_tables:
                count = connection.execute(
                    text(f'SELECT COUNT(*) FROM public."{table.name}"')
                ).scalar_one()

                existing_counts[table.name] = count

            if any(existing_counts.values()):
                raise RuntimeError(
                    "Supabase contains records. Migration stopped."
                )

            print("All 36 target tables are empty.")
            print("\nStarting data transfer...")

            for index, table in enumerate(ordered_tables, 1):
                rows = source_data[table.name]

                if rows:
                    connection.execute(insert(table), rows)

                print(
                    f"{index:02d}/36 {table.name}: "
                    f"{len(rows)} records transferred"
                )

            # Synchronize PostgreSQL-generated integer ID sequences.
            print("\nSynchronizing PostgreSQL ID sequences...")

            for table in ordered_tables:
                for column in table.primary_key.columns:
                    sequence = connection.execute(
                        text(
                            "SELECT pg_get_serial_sequence("
                            ":table_name, :column_name)"
                        ),
                        {
                            "table_name": f"public.{table.name}",
                            "column_name": column.name,
                        },
                    ).scalar_one()

                    if sequence is None:
                        continue

                    maximum = connection.execute(
                        select(func.max(column)).select_from(table)
                    ).scalar_one()

                    connection.execute(
                        text(
                            "SELECT setval("
                            "CAST(:sequence AS regclass), "
                            ":value, :called)"
                        ),
                        {
                            "sequence": sequence,
                            "value": maximum if maximum is not None else 1,
                            "called": maximum is not None,
                        },
                    )

            # Verify record counts and every row before committing.
            print("\n=== VERIFYING TRANSFER ===")

            for table in ordered_tables:
                target_rows = connection.execute(
                    select(table)
                ).mappings().all()

                target_count = len(target_rows)

                if target_count != source_counts[table.name]:
                    raise RuntimeError(
                        f"Record count mismatch in {table.name}: "
                        f"source={source_counts[table.name]}, "
                        f"target={target_count}"
                    )

                target_hash = fingerprint(target_rows)

                if target_hash != source_hashes[table.name]:
                    raise RuntimeError(
                        f"Data verification failed for {table.name}."
                    )

                print(
                    f"PASS {table.name}: "
                    f"{target_count} records; contents match"
                )

            print("\nAll table counts and contents match.")
            print("The transaction is ready to commit.")

        print("\n=== MIGRATION SUCCESSFUL ===")
        print("Tables migrated:", len(ordered_tables))
        print("Records migrated:", total_records)
        print("All table contents verified.")
        print("PostgreSQL ID sequences synchronized.")
        print("Original SQLite database was not modified.")

    finally:
        engine.dispose()

finally:
    sqlite_db.close()
