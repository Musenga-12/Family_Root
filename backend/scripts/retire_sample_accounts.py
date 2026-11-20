"""Stop the sample accounts from seed.py (…@example.com, published password) from signing in to this database.

Reversible and non-destructive: each account is marked "access removed" (the same as Family Administration → Remove
access), so nothing is deleted and an Admin can restore it. Real accounts are never touched.

By default it only lists what it would do. Run from backend/:

    .venv\\Scripts\\python scripts/retire_sample_accounts.py            # preview
    .venv\\Scripts\\python scripts/retire_sample_accounts.py --apply    # make the change (needs the owner's approval)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.engine import make_url  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import Family, User, now  # noqa: E402


def main(apply: bool) -> int:
    url = make_url(settings.database_url)
    print(f"Database: {url.get_backend_name()} on {url.host or url.database}")
    with Session(engine) as db:
        sample = db.exec(select(User).where(User.email.like("%@example.com"), User.removed_at == None)).all()  # noqa: E711
        if not sample:
            print("No sample accounts can sign in. Nothing to do.")
            return 0
        families = {f.id: f.name for f in db.exec(select(Family)).all()}
        for u in sample:
            print(f"  {'removing access' if apply else 'would remove access'}: user {u.id} ({u.role}, {families.get(u.family_id, '?')})")
            if apply:
                u.removed_at = now()
                db.add(u)
        if apply:
            db.commit()
            print(f"Done: {len(sample)} sample accounts can no longer sign in. Restore one from Family Administration if needed.")
        else:
            print(f"\n{len(sample)} sample accounts. Nothing was changed; add --apply to make the change.")
    return 0


if __name__ == "__main__":
    sys.exit(main("--apply" in sys.argv[1:]))
