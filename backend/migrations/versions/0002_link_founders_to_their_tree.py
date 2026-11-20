"""Link each family's founder to a place in its tree.

Registering a new family now adds the founder as the tree's first person and links the account to it, so that
"Immediate family" sharing and the founder's own privacy choices apply to them. Families started before that have
an Admin with no person. This does the same for them, but only where it can't create a duplicate: the family's tree
must still be empty, and the account must be the family's first (its founder). Nothing else is changed.

Revision ID: 0002
Revises: 0001
Created: 2026-11-20
"""
import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Only the columns this revision reads or writes, as they are at this point in the history (not app/models.py,
# which will keep changing).
user = sa.table("user", sa.column("id", sa.Integer), sa.column("family_id", sa.Integer), sa.column("name", sa.String),
                sa.column("role", sa.String), sa.column("person_id", sa.String), sa.column("removed_at", sa.DateTime))
person = sa.table("person", sa.column("id", sa.String), sa.column("family_id", sa.Integer), sa.column("first", sa.String),
                  sa.column("last", sa.String), sa.column("gen", sa.Integer), sa.column("bornApprox", sa.Boolean),
                  sa.column("pending", sa.Boolean), sa.column("verified", sa.Boolean), sa.column("minor", sa.Boolean),
                  sa.column("parents", sa.JSON), sa.column("tags", sa.JSON), sa.column("deleted_at", sa.DateTime))


def founders_without_a_person(conn) -> list:
    """Active Admins with no person, who are their family's first account, in a family with no people at all."""
    u, other = user.alias("u"), user.alias("other")
    first_account = sa.select(sa.func.min(other.c.id)).where(other.c.family_id == u.c.family_id).scalar_subquery()
    any_person = sa.select(person.c.id).where(person.c.family_id == u.c.family_id).exists()
    return conn.execute(sa.select(u.c.id, u.c.family_id, u.c.name).where(
        u.c.role == "Admin", u.c.person_id.is_(None), u.c.removed_at.is_(None),
        u.c.id == first_account, ~any_person,
    ).order_by(u.c.id)).all()


def upgrade() -> None:
    conn = op.get_bind()
    for uid, family_id, name in founders_without_a_person(conn):
        *first, last = (name or "").split() or ["Me"]
        pid = f"p{secrets.token_hex(5)}"  # same form as app.models.new_id("p")
        conn.execute(person.insert().values(id=pid, family_id=family_id, first=" ".join(first) or last, last=last if first else "",
                                            gen=1, bornApprox=False, pending=False, verified=False, minor=False, parents=[], tags=[]))
        conn.execute(user.update().where(user.c.id == uid, user.c.person_id.is_(None)).values(person_id=pid))


def downgrade() -> None:
    # Left in place on purpose: by now the founder may have edited their person, been tagged in memories or had
    # relatives linked to them, and removing it would break those. Unlink by hand if it is ever really needed.
    pass
