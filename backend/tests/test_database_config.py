"""Connecting to Neon (PostgreSQL) in production: the address as Neon shows it, encryption, the pooled connection for
the app and the direct one for migrations."""
import io

import pytest
from alembic import command
from alembic.config import Config

from app.config import Settings, check_settings, normalize_database_url, settings
from app.db import ALEMBIC_INI, engine_options

POOLED = "postgresql://fr_owner:pw@ep-calm-sea-123456-pooler.eu-central-1.aws.neon.tech/familyroots?sslmode=require&channel_binding=require"
DIRECT = "postgresql://fr_owner:pw@ep-calm-sea-123456.eu-central-1.aws.neon.tech/familyroots?sslmode=require&channel_binding=require"


@pytest.mark.parametrize(("given", "used"), [
    ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
    ("postgres://u:p@h/db", "postgresql+psycopg://u:p@h/db"),          # Render / Heroku style
    ("  postgresql://u:p@h/db  ", "postgresql+psycopg://u:p@h/db"),
    ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),  # already right
    ("sqlite:///./familyroots.db", "sqlite:///./familyroots.db"),
])
def test_database_addresses_use_the_installed_driver(given, used):
    assert normalize_database_url(given) == used
    assert Settings(_env_file=None, database_url=given).database_url == used


def production(**changes) -> Settings:
    return Settings(_env_file=None, **{"environment": "production", "secret_key": "s" * 40, "database_url": POOLED,
                                       "database_url_direct": DIRECT, "frontend_origin": "https://family.example",
                                       "api_base_url": "https://api.family.example", "trusted_proxy_hops": 1, **changes})


def test_neon_addresses_as_shown_by_neon_are_accepted_in_production():
    check_settings(production())


@pytest.mark.parametrize("field", ["database_url", "database_url_direct"])
@pytest.mark.parametrize("url", [
    "postgresql://u:p@ep-x.neon.tech/db",                     # no sslmode at all
    "postgresql://u:p@ep-x.neon.tech/db?sslmode=prefer",      # may silently fall back to unencrypted
    "postgresql://u:p@ep-x.neon.tech/db?sslmode=disable",
])
def test_production_requires_an_encrypted_database_connection(field, url):
    with pytest.raises(RuntimeError, match="sslmode=require"):
        check_settings(production(**{field: url}))


def test_a_database_on_the_same_computer_needs_no_encryption():
    check_settings(production(database_url="postgresql://u:p@localhost/db", database_url_direct=""))


@pytest.mark.parametrize("url", ["mysql://u:p@h/db", "not a url at all"])
def test_production_needs_postgresql(url):
    with pytest.raises(RuntimeError, match="PostgreSQL|valid database"):
        check_settings(production(database_url=url))


def test_the_direct_address_is_optional():
    check_settings(production(database_url_direct=""))


def test_connection_options_for_neon():
    pooled = engine_options(normalize_database_url(POOLED))
    assert pooled["pool_pre_ping"] and pooled["pool_recycle"] == 300
    assert pooled["connect_args"] == {"connect_timeout": 10, "prepare_threshold": None}  # PgBouncer transaction mode
    direct = engine_options(normalize_database_url(DIRECT))
    assert direct["connect_args"] == {"connect_timeout": 10}  # prepared statements are fine on a direct connection
    assert engine_options("sqlite:///x.db") == {"connect_args": {"check_same_thread": False}}


def test_migrations_use_the_direct_address_when_it_is_set(monkeypatch):
    """Rendered as SQL (nothing connects): the PostgreSQL dialect shows the direct address was used, not DATABASE_URL."""
    monkeypatch.setattr(settings, "database_url_direct", normalize_database_url(DIRECT))
    out = io.StringIO()
    command.upgrade(Config(str(ALEMBIC_INI), output_buffer=out), "0001", sql=True)
    assert "id SERIAL NOT NULL" in out.getvalue()  # PostgreSQL; the tests' own DATABASE_URL is SQLite
