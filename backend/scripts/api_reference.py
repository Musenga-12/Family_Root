"""Write docs/API.md, the API reference, from the app itself: every route's method, path, purpose (its docstring), who
may call it (read from its dependencies), attempt limits, request body and response. Run from backend/:

    python scripts/api_reference.py          # rewrite docs/API.md
    python scripts/api_reference.py --check  # exit 1 if docs/API.md is out of date (tests/test_api_reference.py)
"""
import inspect
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND.parent / "docs" / "API.md"
sys.path.insert(0, str(BACKEND))
# Only the routes are needed: never backend/.env's database or file storage, whatever it says.
os.environ.update(ENVIRONMENT="development", DATABASE_URL="sqlite://", DATABASE_URL_DIRECT="", STORAGE="local")

from fastapi.routing import APIRoute, APIWebSocketRoute  # noqa: E402

INTRO = """# FamilyRoots API reference

Generated from the code by `backend/scripts/api_reference.py`. Don't edit by hand: change the code (route docstrings,
dependencies, models), then run `python scripts/api_reference.py` in `backend/`. A test fails while this file is out
of date. In development the same API is browsable, with request and response schemas, at `http://localhost:8000/docs`
(hidden in production).

## Conventions

- **Base address:** `<API_BASE_URL>/api/v1`, e.g. `https://api.example.org/api/v1` (the web app's `VITE_API_URL`).
- **Signing in:** `POST /auth/login` returns `{"access_token": "…", "token_type": "bearer"}`. Send it on every other
  call as `Authorization: Bearer <token>`. It lasts `ACCESS_TOKEN_MINUTES` (a day by default), and stops working at
  once when the password is changed or the member's access is removed.
- **Family isolation:** every signed-in call only ever sees and changes the caller's own family. An id from another
  family answers 404, exactly like an id that doesn't exist.
- **Roles:** Admin, Custodian, Contributor, Viewer. "Signed in" means any role; a role list means only those.
  Privacy choices (who may see an item, a minor's protections) apply on top of roles, to Admins too.
- **Attempt limits** in the table are per visitor address. Signing in is also limited to 10 attempts per account
  (email address) per 15 minutes, whatever the address.
- **Bodies** are JSON unless marked *multipart* (file uploads). PATCH bodies hold only the fields to change.
- **Files:** responses hold short-lived signed links (`…/uploads/{id}/file?token=…`, `FILE_LINK_MINUTES`) that a
  browser can open directly in `<img>` / `<audio>`. They support `Range` requests (seeking in recordings).
- **Errors** are always `{"detail": "a plain sentence"}` (or, for 422, FastAPI's list of field problems), never
  server internals:

| Status | Meaning |
|---|---|
| 400 | The request can't be done as asked (e.g. an expired reset link) |
| 401 | Not signed in, or the sign-in has expired: sign in again |
| 403 | Signed in, but this role (or this person's privacy choice) doesn't allow it |
| 404 | No such item in your family (also for another family's ids) |
| 409 | Conflicts with something already saved (e.g. an email that already has an account) |
| 413 / 415 | File too large / not an accepted type, or its contents don't match its type |
| 422 | A field is missing or invalid |
| 429 | Too many attempts: wait (`Retry-After` seconds) |
| 502 / 503 | File storage or the database is unavailable right now: try again |
"""


def first_line(doc: str | None) -> str:
    return " ".join((doc or "").strip().split("\n\n")[0].split()) if doc else ""


def walk(dependant):
    for d in dependant.dependencies:
        yield d
        yield from walk(d)


def access(route) -> tuple[str, list[str]]:
    """(who may call it, attempt limits) from the route's dependencies."""
    auth, roles, limits = False, None, []
    for d in walk(route.dependant):
        call = d.call
        name = getattr(call, "__qualname__", "")
        if name == "get_current_user":
            auth = True
        elif name == "require_role.<locals>.check":
            auth, roles = True, inspect.getclosurevars(call).nonlocals["roles"]
        elif name == "limit.<locals>.check":
            v = inspect.getclosurevars(call).nonlocals
            limits.append(f"{v['times']} per {v['seconds'] // 60} min")
    if route.path.endswith("/file"):
        return "Signed file link (`?token=`)", limits
    who = ", ".join(roles) if roles else ("Signed in" if auth else "Public")
    return who, limits


def model_name(m) -> str:
    if m is None:
        return ""
    args = getattr(m, "__args__", None)
    if args and getattr(m, "__origin__", None) is list:
        return f"list of `{model_name(args[0]).strip('`')}`"
    return f"`{getattr(m, '__name__', str(m))}`"


def body_of(route) -> str:
    body = route.dependant.body_params
    if not body:
        return ""
    if any(type(p.field_info).__name__ in ("File", "Form") for p in body):
        return "multipart: " + ", ".join(f"`{p.name}`" for p in body)
    return ", ".join(model_name(p.field_info.annotation) for p in body)


def all_routes(routes):
    """Every route, including those of included routers (FastAPI keeps those inside a wrapper, original_router)."""
    for route in routes:
        inner = getattr(route, "original_router", None)
        if inner is not None:
            yield from all_routes(inner.routes)
        else:
            yield route


def build() -> str:
    from app.config import API_PREFIX
    from app.main import app

    rows: dict[str, list[str]] = {}
    for route in all_routes(app.routes):
        if isinstance(route, APIWebSocketRoute):
            tag = "realtime"
            line = (f"| WS | `{route.path.removeprefix(API_PREFIX)}` | Live chat events (`message.new`, `message.updated`, "
                    f"`thread.read`); the browser sends `ping`, the server answers `pong` | Signed in (`?token=`) |  |  |  |")
        elif isinstance(route, APIRoute) and route.include_in_schema:
            tag = (route.tags or ["other"])[0]
            who, limits = access(route)
            path = route.path.removeprefix(API_PREFIX)
            purpose = first_line(route.description) or route.summary or route.name.replace("_", " ").capitalize()
            ok = str(route.status_code or 200)
            line = (f"| {', '.join(sorted(route.methods))} | `{path}` | {purpose.replace('|', '/')} | {who} | "
                    f"{body_of(route)} | {model_name(route.response_model)} {ok} | {', '.join(limits)} |")
        else:
            continue
        rows.setdefault(tag, []).append(line)
    out = [INTRO]
    total = sum(len(v) for v in rows.values())
    out.append(f"## Endpoints ({total})\n")
    out.append("Paths are relative to the base address (`/health` is at the server's root).\n")
    for tag in sorted(rows):
        out.append(f"### {tag}\n")
        out.append("| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |")
        out.append("|---|---|---|---|---|---|---|")
        out.extend(rows[tag])
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("docs/API.md is out of date: run `python scripts/api_reference.py` in backend/")
            return 1
        print("docs/API.md is up to date")
        return 0
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(BACKEND.parent)} ({text.count(chr(10))} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
