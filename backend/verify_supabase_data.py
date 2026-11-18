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
    create_engine, inspect, select
)
from sqlalchemy.engine import URL
from sqlmodel import SQLModel
from sqlmodel.sql.sqltypes import UTCDateTime

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app.models  # noqa: F401

SOURCE = Path(__file__).resolve().parent / "familyroots.db"
EXPECTED_RECORDS = 120


def convert_value(value, column):
    if value is None:
        return None

    column_type = column.type

    if isinstance(column_type, UTCDateTime):
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    if isinstance(column_type, JSON):
        return json.loads(value) if isinstance(value, str) else value

    if isinstance(column_type, DateTime):
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
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
        return {str(k): normalize(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [normalize(v) for v in value]

    return value


def fingerprint(rows):
    encoded_rows = [
        json.dumps(normalize(dict(row)), sort_keys=True, separators=(",", ":"))
        for row in rows
    ]
    encoded_rows.sort()
    return hashlib.sha256(
        "\n".join(encoded_rows).encode("utf-8")
    ).hexdigest()


if not SOURCE.exists():
    raise SystemExit(f"SQLite source not found: {SOURCE}")

sqlite_db = sqlite3.connect(
    SOURCE.as_uri() + "?mode=ro",
    uri=True
)
sqlite_db.row_factory = sqlite3.Row

engine = None

try:
    print("=== FAMILY ROOTS POST-MIGRATION VERIFICATION ===")

    integrity = sqlite_db.execute("PRAGMA integrity_check").fetchone()[0]
    fk_errors = sqlite_db.execute("PRAGMA foreign_key_check").fetchall()

    if integrity != "ok" or fk_errors:
        raise RuntimeError("SQLite integrity or foreign-key check failed.")

    ordered_tables = list(SQLModel.metadata.sorted_tables)
    model_tables = set(SQLModel.metadata.tables.keys())

    source_tables = {
        row[0] for row in sqlite_db.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }

    if source_tables != model_tables:
        raise RuntimeError("SQLite tables do not match application models.")

    source_counts = {}
    source_hashes = {}

    for table in ordered_tables:
        source_rows = sqlite_db.execute(
            f'SELECT * FROM "{table.name}"'
        ).fetchall()

        converted_rows = []

        for source_row in source_rows:
            converted_rows.append({
                column.name: convert_value(source_row[column.name], column)
                for column in table.columns
            })

        source_counts[table.name] = len(converted_rows)
        source_hashes[table.name] = fingerprint(converted_rows)

    total_records = sum(source_counts.values())

    print("SQLite integrity:", integrity)
    print("SQLite foreign-key violations:", len(fk_errors))
    print("SQLite tables:", len(source_tables))
    print("SQLite records:", total_records)

    if total_records != EXPECTED_RECORDS:
        raise RuntimeError(
            f"Expected {EXPECTED_RECORDS} source records, found {total_records}."
        )

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

    print("\n=== READ-ONLY SUPABASE VERIFICATION ===")

    with engine.connect() as connection:
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")

        target_tables = set(
            inspect(connection).get_table_names(schema="public")
        )

        if target_tables != source_tables:
            missing = source_tables - target_tables
            unexpected = target_tables - source_tables
            raise RuntimeError(
                f"Table mismatch. Missing: {missing}; unexpected: {unexpected}"
            )

        print("Supabase tables:", len(target_tables))
        print("\n=== COMPARING TABLE CONTENTS ===")

        total_target_records = 0

        for index, table in enumerate(ordered_tables, 1):
            target_rows = connection.execute(
                select(table)
            ).mappings().all()

            target_count = len(target_rows)
            total_target_records += target_count

            if target_count != source_counts[table.name]:
                raise RuntimeError(
                    f"COUNT MISMATCH in {table.name}: "
                    f"SQLite={source_counts[table.name]}, "
                    f"Supabase={target_count}"
                )

            target_hash = fingerprint(target_rows)

            if target_hash != source_hashes[table.name]:
                raise RuntimeError(
                    f"CONTENT MISMATCH in table {table.name}"
                )

            print(
                f"PASS {index:02d}/36 {table.name}: "
                f"{target_count} records; contents match"
            )

        if total_target_records != EXPECTED_RECORDS:
            raise RuntimeError(
                f"Expected {EXPECTED_RECORDS} target records, "
                f"found {total_target_records}."
            )

        print("\n=== FINAL RESULT ===")
        print("SQLite records:", total_records)
        print("Supabase records:", total_target_records)
        print("Tables compared:", len(ordered_tables))
        print("Content comparisons: ALL PASSED")
        print("Database access: READ ONLY")
        print("SUCCESS: Independent post-migration verification passed.")

finally:
    if engine is not None:
        engine.dispose()
    sqlite_db.close()
