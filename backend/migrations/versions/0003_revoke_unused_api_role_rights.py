"""Take away table rights the Supabase API roles never need.

Supabase gives its API roles (anon: anyone holding the project's public key; authenticated: Supabase Auth users)
TRUNCATE, REFERENCES and TRIGGER on every table in `public` by default. FamilyRoots doesn't use Supabase's API or
Auth: only the backend reads and writes, with its own database user. Row level security blocks those roles from
reading or changing rows, but it doesn't cover TRUNCATE, so the rights are removed, for tables made later too.
Only on a Supabase database (where the roles exist); elsewhere this does nothing.

Revision ID: 0003
Revises: 0002
Created: 2026-11-20
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RIGHTS = "TRUNCATE, REFERENCES, TRIGGER"


def _for_api_roles(action: str) -> None:
    if op.get_context().dialect.name != "postgresql":
        return
    op.execute(f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
             AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            {action}
          END IF;
        END $$;
    """)


def upgrade() -> None:
    _for_api_roles(f"""
            REVOKE {RIGHTS} ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE {RIGHTS} ON TABLES FROM anon, authenticated;""")


def downgrade() -> None:
    _for_api_roles(f"""
            GRANT {RIGHTS} ON ALL TABLES IN SCHEMA public TO anon, authenticated;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT {RIGHTS} ON TABLES TO anon, authenticated;""")
