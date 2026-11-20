"""Alembic migrations: they build exactly the schema in app/models.py, and data migrations change only what they should.
Each test uses its own throwaway SQLite file, never the app's databases."""
import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, event, text
from sqlmodel import SQLModel

from app.db import ALEMBIC_INI


@pytest.fixture
def migrate(tmp_path):
    """Returns (engine, run) where run("upgrade", "head") runs Alembic against a fresh database with foreign keys on."""
    engine = create_engine(f"sqlite:///{(tmp_path / 'm.db').as_posix()}")
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))

    def run(cmd, rev):
        cfg = Config(str(ALEMBIC_INI))
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn
            getattr(command, cmd)(cfg, rev)

    yield engine, run
    engine.dispose()


def test_migrations_build_exactly_the_models(migrate):
    engine, run = migrate
    run("upgrade", "head")
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), SQLModel.metadata)
        assert diff == [], diff
        assert set(SQLModel.metadata.tables) <= set(conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").scalars())


def test_there_is_one_line_of_history(migrate):
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    assert len(script.get_heads()) == 1  # two heads would mean two migrations both claim to come next


def test_the_baseline_refuses_to_drop_everything(migrate):
    _, run = migrate
    run("upgrade", "0001")
    with pytest.raises(RuntimeError, match="delete every table"):
        run("downgrade", "base")


def add(conn, table, **row):
    cols = ", ".join(f'"{k}"' for k in row)
    conn.execute(text(f'INSERT INTO "{table}" ({cols}) VALUES ({", ".join(":" + k for k in row)})'), row)


def account(conn, uid, family_id, name, role="Admin", person_id=None, removed=False):
    add(conn, "user", id=uid, family_id=family_id, email=f"u{uid}@example.org", name=name, password_hash="$argon2id$x",
        role=role, person_id=person_id, easy_mode=False, created_at="2026-11-01 00:00:00",
        removed_at="2026-11-02 00:00:00" if removed else None)


def tree_person(conn, pid, family_id):
    add(conn, "person", id=pid, family_id=family_id, first="Old", last="Tree", gen=1, bornApprox=False, pending=False,
        verified=False, minor=False, parents="[]", tags="[]")


def test_founders_of_empty_trees_are_linked_and_nothing_else_changes(migrate):
    engine, run = migrate
    run("upgrade", "0001")
    with engine.begin() as conn:
        for fid in range(1, 6):
            add(conn, "family", id=fid, name=f"F{fid}", code=f"FAM-{1000 + fid}", created_at="2026-11-01 00:00:00")
        account(conn, 1, 1, "Ada Ross")                    # founder, empty tree: linked
        account(conn, 2, 1, "Ben Ross", role="Viewer")     # not the founder: untouched
        account(conn, 3, 2, "Musa")                        # one-word name, empty tree: linked
        tree_person(conn, "p_old", 3)
        account(conn, 4, 3, "Cy Old")                      # tree already has people: untouched (no duplicates)
        tree_person(conn, "p_me", 4)
        account(conn, 5, 4, "Di Linked", person_id="p_me")  # already linked: untouched
        account(conn, 6, 5, "Ed Gone", removed=True)       # removed account: untouched
    run("upgrade", "0002")
    with engine.connect() as conn:
        links = dict(conn.execute(text('SELECT id, person_id FROM "user"')).all())
        people = {r.id: r for r in conn.execute(text("SELECT id, family_id, first, last FROM person")).all()}
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall() == []
    assert links[2] is None and links[4] is None and links[6] is None and links[5] == "p_me"
    ada, musa = people[links[1]], people[links[3]]
    assert (ada.family_id, ada.first, ada.last) == (1, "Ada", "Ross")
    assert (musa.family_id, musa.first, musa.last) == (2, "Musa", "")
    assert len(people) == 4  # the two existing ones plus exactly one per linked founder


def test_running_the_data_migration_again_changes_nothing(migrate):
    engine, run = migrate
    run("upgrade", "0001")
    with engine.begin() as conn:
        add(conn, "family", id=1, name="F", code="FAM-1001", created_at="2026-11-01 00:00:00")
        account(conn, 1, 1, "Ada Ross")
    run("upgrade", "head")
    run("downgrade", "0001")  # leaves the person in place, by design
    run("upgrade", "head")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM person")).scalar() == 1


def test_a_database_server_is_only_checked_at_startup(client, monkeypatch, caplog):
    """On Supabase, startup never creates or alters tables; it reports a database that is behind instead."""
    import app.db as db

    changed = []
    monkeypatch.setattr(db, "SQLITE", False)
    monkeypatch.setattr(db.SQLModel.metadata, "create_all", lambda *a, **k: changed.append("create_all"))
    monkeypatch.setattr(db, "add_missing_columns", lambda: changed.append("columns"))
    monkeypatch.setattr(db, "migration_status", lambda: (None, "0002"))
    with caplog.at_level("ERROR", logger="familyroots"):
        db.create_db()
    assert changed == []
    assert "alembic upgrade head" in caplog.text


def test_migration_status_reads_the_database(client):
    from app.db import migration_status

    current, head = migration_status()
    assert current is None and head == "0003"  # the test database is built from models.py, never stamped
