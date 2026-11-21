"""Alembic environment: migrates the database the app is configured for (DATABASE_URL in backend/.env).
The tables come from app/models.py, so `alembic revision --autogenerate` compares the database with the models."""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlmodel import SQLModel

from app import models  # noqa: F401  (registers the tables)
from app.config import settings

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata
# A connection handed in by the caller (tests, app/db.py) wins over the configured address. On Neon, migrations use
# the direct connection (DATABASE_URL_DIRECT) when it is set, not the pooled one the app uses.
url = context.config.attributes.get("url") or settings.database_url_direct or settings.database_url
OPTIONS = dict(target_metadata=target_metadata, compare_type=True,
               render_as_batch=url.startswith("sqlite"))  # SQLite can only change a table by copying it


def run_migrations_offline() -> None:
    """`alembic upgrade head --sql`: print the SQL for review instead of running it."""
    context.configure(url=url, literal_binds=True, dialect_opts={"paramstyle": "named"}, **OPTIONS)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = context.config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, **OPTIONS)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = create_engine(url, poolclass=pool.NullPool, **({} if url.startswith("sqlite") else {"connect_args": {"connect_timeout": 10}}))
    with engine.connect() as connection:
        context.configure(connection=connection, **OPTIONS)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
