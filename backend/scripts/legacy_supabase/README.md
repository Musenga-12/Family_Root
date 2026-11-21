# Legacy: the one-time move from SQLite to Supabase (November 2026)

These scripts moved the original `familyroots.db` into the Supabase database and checked the result. That move is
finished, and none of them is used by the app, the tests or CI. They are kept as a record of how the current data
got there, and as a starting point if a similar one-time copy is ever needed again.

| Script | What it did |
|---|---|
| `create_supabase_schema.py` | Created the tables directly from `models.py`. Superseded: a new database is built with `alembic upgrade head`. |
| `verify_migration_readiness.py` | Compared `familyroots.db` with the target database before copying. |
| `migrate_sqlite_to_supabase.py` | Copied every row from `familyroots.db` into the target database. |
| `verify_supabase_data.py` | Compared row counts and checksums between the two afterwards. |
| `verify_supabase_connection_manual.py` | Asked for a connection string and checked that it connects. |

Each one asks for the database password when run (nothing is stored). `migrate_sqlite_to_supabase.py` writes to the
database it is given, but refuses to start if any of its tables already holds rows. Don't run any of them against a
live database without a backup and a reason.

Run from `backend/`, e.g. `python scripts/legacy_supabase/verify_supabase_connection_manual.py`.
