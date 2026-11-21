# FamilyRoots API (FastAPI)

The backend for the FamilyRoots React app in the parent folder.

## First-time setup (Windows, PowerShell)

```powershell
cd backend
py -3.12 -m venv .venv       # the Python version in .python-version (CI and the server use it too)
.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt -c constraints.txt   # dev: tests and lint
copy .env.example .env      # then edit SECRET_KEY
python seed.py              # optional: loads the Mackenzie sample family
```

## Run

```powershell
cd backend
.venv\Scripts\Activate.ps1
fastapi dev app/main.py
```

- API: http://localhost:8000/api/v1
- Interactive docs: http://localhost:8000/docs: click **Authorize**, put a demo email (e.g. `mary@example.com`) in *username* and `familyroots123` as the password. Every request body starts from a working example; the page lists sample ids.

Run the frontend at the same time in a second terminal (`npm run dev` in the project root).

## Demo accounts (after `python seed.py`)

`mary@example.com` (Admin), `michael@example.com` (Custodian), `anna@example.com` (Viewer) and the other
members, all with password `familyroots123`.

**Development only.** The password is published, so a production server (`ENVIRONMENT=production`) refuses every
`@example.com` account and that password at sign-in, and nobody can choose it there. `seed.py` refuses to run in
production and only ever fills an empty database (one without any family yet).

## Layout

```
app/
  main.py        app, CORS, routers
  config.py      settings from .env
  db.py          engine + get_session
  models.py      tables (field names match src/data.js)
  auth.py        password hashing, JWT, get_current_user, require_role
  routers/
    auth.py      /auth/register, /auth/login, /auth/family-code/verify, /me
    people.py    /people (tree + directory)
    uploads.py   /uploads (photos and audio, signed file links)
    memories.py  /memories
    albums.py    /albums
    stories.py   /stories (written and recorded), loves, reflections
    threads.py   /threads (conversations and messages)
    timeline.py  /milestones (the family timeline)
    calendar.py  /calendar (birthdays, anniversaries, gatherings) and /events (gatherings + RSVPs)
    legacy.py    /records (Legacy Archive, sealed time capsules)
    admin.py     /admin/summary, /members, /join-requests, /invites
    privacy.py   /privacy, /consents, /access-log, /activity, /me/export, /admin/export, /me/deletion-request
    overview.py  /overview, /polls, /prompts, /mood
    notifications.py  /notifications (the bell) and notify(), used by the other routers
    suggestions.py    /people/{id}/suggestions, /suggestions ("Suggest a correction")
  realtime.py    /ws live updates for open chats
  visibility.py  who can see "All Family Branches" / "Immediate Family" / "Only Me (draft)" items
  ratelimit.py   attempt limits on sign-in, sign-up and password reset; visitor addresses behind a proxy
  storage.py     where files are kept: local folder, or a private Supabase Storage bucket (docs/STORAGE.md)
  mail.py, mail_templates.py   email (Resend, SMTP, console) and its messages (DEPLOY.md, Email)
  validation.py  shared checks for PATCH bodies
migrations/      Alembic migrations (the only way the production schema changes)
scripts/
  check_database.py          read-only report on the configured database (migration, row counts, sample accounts)
  check_client_ip.py         after deploying: is TRUSTED_PROXY_HOPS right? (DEPLOY.md, section 7)
  api_reference.py           writes docs/API.md from the routes
  live_sync_check.py         the React app against a throwaway server (CI)
  retire_sample_accounts.py  remove the sample accounts' access on a database (preview first; reversible)
  send_test_email.py         send one sample email by hand
  legacy_supabase/           the finished one-time move from SQLite to Supabase (kept for the record)
tests/           pytest suite (a temporary copy of the sample family; SQLite, or PostgreSQL with TEST_DATABASE_URL)
uploads/         stored files in development (git-ignored)
seed.py          sample data loader (development only)
seed_data.json   copy of SEED from src/data.js
requirements.txt, requirements-dev.txt, constraints.txt   dependencies; install with -c constraints.txt
.python-version  3.12 (CI and render.yaml follow it)
```

## Uploading a photo and creating a memory

```js
// 1. upload the file (do NOT set Content-Type yourself; the browser adds the multipart boundary)
const form = new FormData();
form.append("file", fileOrBlob, "garden.jpg");
const up = await fetch(`${API}/uploads`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }).then((r) => r.json());

// 2. create the memory with the upload id
await fetch(`${API}/memories`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ title, date: "2026-06", alt, visibility, tagged: ["sarah"], consent: true, upload_ids: [up.id] }),
});
```

Each memory in a response has `img`: a signed link you can put straight into `<img src>`. Links expire after
`FILE_LINK_MINUTES` (12 hours by default), so re-fetch the list rather than storing them.

## Saving a recording (Recording Studio)

```js
const form = new FormData();
form.append("file", blob, "recording.webm");        // the MediaRecorder blob
form.append("title", title);
form.append("duration", String(Math.round(seconds)));
form.append("transcript", transcript);              // may be empty
form.append("visibility", audience);                // studio labels like "Only Me (private draft)" are accepted
form.append("prompt", prompt);
const story = await fetch(`${API}/stories/audio`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }).then((r) => r.json());
// story.audio_url goes straight into <audio src>
```

## Live chat updates

```js
const ws = new WebSocket(`ws://localhost:8000/api/v1/ws?token=${token}`);
ws.onmessage = (e) => {
  if (e.data === "pong") return;
  const ev = JSON.parse(e.data); // { type: "message.new" | "message.updated" | "thread.read" | "thread.updated", thread_id, ... }
};
setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000); // keep-alive
```

Times in API responses are UTC (`...Z`). Show them with `new Date(at).toLocaleTimeString()`, not by slicing the string.

## Joining a family

`POST /auth/register` has three paths:

| Body includes | Result |
|---|---|
| `invite_token` (from an invitation link `/auth?invite=...`) | Account created with the invited role; returns `status: "active"` and a token |
| `family_code` (e.g. `MCK-8294`) | A join request for an Admin; returns **202** with `status: "pending"` and no token |
| neither | A new family with you as its Admin |

Invitation emails are not sent yet: the API returns the invitation `link` for the sender to share.

## Privacy rules the server enforces

All in `app/visibility.py`, applied by every endpoint that returns the data:

- **Item visibility** (memories, stories, records): All Family Branches / Immediate Family / Only Me (draft).
- **Protected minors** (on by default): outside parents, siblings and grandparents, a minor appears in the tree by
  name only (`restricted: true`), and photos or stories they're tagged in are hidden.
- **Each person's own choices** (`/privacy`): who sees their birthday (calendar), location (`city`) and contact;
  whether their age is shown (if not, `born` is empty and `birthday` gives day and month); whether they can be tagged.
  New memories and stories default to the person's own choice when no visibility is sent.
- **Guardians**: only a parent can tag a minor, change a minor's protections, or decide consent for them.
- **Consent**: withdrawing consent for a photo makes that memory private to whoever added it.

## Passwords

- `POST /auth/forgot-password` writes the reset link to the **server console** (no email sending yet).
- Admins can create a 3-day link for a relative with `POST /members/{id}/reset-link`.
- Changing or resetting a password signs out every other device.

## Newer endpoints

| Endpoint | What it's for |
|---|---|
| `PATCH /me` | Change your name, email (needs `current_password`) or Easy-to-Read |
| `GET`/`PUT /me/preferences` | Language and notification choices that follow the account |
| `GET /notifications`, `POST /notifications/{id}/read`, `/{id}/unread`, `/read-all` | The bell. Filled by join requests (Admins), consent requests and reminders, corrections and replies to your stories |
| `POST /people/{id}/suggestions`, `GET /suggestions`, `PATCH /suggestions/{id}` | Suggest a correction; Admins and Custodians close it (`accepted`, `dismissed`, or `open` to undo) |
| `GET`/`PUT`/`DELETE /mood` | Today's mood check-in on the Overview, with the family's counts |
| `PUT /events/{id}/rsvp` `{answer: yes\|maybe\|no}` | No body still means yes, as before |
| `POST /records/{id}/attachments`, `DELETE /records/{id}/attachments/{upload_id}` | Attach a scan (image or PDF from `POST /uploads`); hidden with the text while a capsule is sealed |
| `POST /records/{id}/reopen`, `/milestones/{id}/reopen`, `/stories/{id}/reopen` | Undo "verified" |

On start-up the server adds any new nullable column to an existing `familyroots.db`, so you don't need to delete it
after updating.

## Adding a resource

Copy `routers/people.py`: add the table to `models.py`, create `routers/<name>.py`, and register it in `main.py`.
Always filter by `user.family_id` so one family can never see another's data.
Then add a migration for the new table (next section).

## Database migrations (Alembic)

The database server (Neon in production) is changed only by migrations in `migrations/versions/`, never at startup. On start the
server just checks the database is at the latest migration: in production it refuses to start if it isn't; in
development it logs an error and carries on. SQLite (the tests and the
on-device `familyroots.db`) is still set up directly from `models.py`.

The database address comes from `DATABASE_URL_DIRECT` if it is set, otherwise `DATABASE_URL` (in `.env` or the
environment); it is never written into `alembic.ini`. On Neon, use the **direct** connection for migrations (the
app itself uses the pooled one): DEPLOY.md, section 3.

```powershell
cd backend
.venv\Scripts\Activate.ps1
alembic current                          # where the database is
alembic history                          # every migration
alembic upgrade 0001 --sql               # print a schema migration's SQL without running it (0002 needs data)
alembic upgrade head                     # apply (take a backup first: Neon restore point or pg_dump)
alembic check                            # the database matches models.py exactly
```

Changing the schema:

1. Change `app/models.py`.
2. `alembic revision --autogenerate -m "what changed"`, then **read the new file** in `migrations/versions/`:
   autogenerate can miss renames (it sees a drop plus an add) and never knows how to fill a new NOT NULL column.
3. `python -m pytest tests/test_migrations.py` checks the migrations still build exactly the models.
4. CI also runs them on PostgreSQL (`alembic upgrade head` + `alembic check`, and the whole suite).
5. Back up the production database, then `alembic upgrade head` there (DEPLOY.md, section 3).

Never edit a migration that has already been applied somewhere; add a new one instead.

**Migrations so far:** `0001` the baseline schema; `0002` links each founder of an empty tree to a first person in
it (data); `0003` removes rights from Supabase's API roles, and does nothing on any other PostgreSQL (Neon). The
existing Supabase database was at `0003` when last checked (read-only, before this work); moving its data to Neon,
after checking it again: docs/DATA_MIGRATION.md.

A **new, empty** database: `alembic upgrade head` builds everything (instead of the superseded
`scripts/legacy_supabase/create_supabase_schema.py`).

`0001` can't be downgraded: that would drop every table.

## Dependencies

`requirements.txt` (the server) and `requirements-dev.txt` (tests and lint) list what the app needs, with minimum
versions. `constraints.txt` pins the exact versions of everything they install, so CI, the server and every
developer get the set the tests passed with. Always install with `-c constraints.txt`.

To upgrade, in a fresh venv: install without `-c`, run the tests and `ruff check`, then write the new pins with
`pip freeze` (keep the header and the hand-pinned `uvloop` line, which Windows never installs) and commit both files.

## Tests and lint

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m pytest -q      # about 480 tests, 1-3 minutes
ruff check .
```

Every test runs on a fresh copy of the sample family in a temporary folder; `familyroots.db`, `uploads/` and the
database in `.env` are never opened. Tests cover sign-in and tokens, roles on every route, other families, the
privacy rules, uploads and file links, messages, the archive's create/change/remove/restore flows, administration,
the production start-up checks, visitor addresses behind a proxy, the sample accounts, `render.yaml`, the API
reference (`docs/API.md`) and every API call the React app makes.

**On PostgreSQL**, as in production (CI does this on every push): with a PostgreSQL server you may write to,

```powershell
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/familyroots_test"
python -m pytest -q
```

The database named there must end in `_test`; it (and `<name>_template`) is dropped and rebuilt by the migrations.

## Running for other people (production)

Set `ENVIRONMENT=production` in `.env`. The server then refuses to start until:

- `SECRET_KEY` is a long random value: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
  Changing it signs everyone out once.
- `FRONTEND_ORIGIN` and `API_BASE_URL` are the real public addresses (not localhost), and `FRONTEND_ORIGIN` /
  `EXTRA_ORIGINS` are exact `https://` addresses (no path, no wildcard).
- `DATABASE_URL` (and `DATABASE_URL_DIRECT`, if set) is PostgreSQL with `?sslmode=require` (not a SQLite file), at
  the latest migration (`alembic upgrade head`).
- `SECRET_KEY` isn't one of the templates' placeholders; `STORAGE=supabase` has its URL and key; email isn't half set
  up or the console.

In production `/docs` is switched off, password-reset links and addresses are never written to the log, and the
sample accounts and their published password are refused. Without a sending domain, "Forgot password" points to an
Admin-made reset link (`POST /members/{id}/reset-link`; DEPLOY.md, Email). `GET /health` reports
`{"status": "ok", "database": "ok"}`, or 503 if the database doesn't answer.

Single process only, for now: the live chat (`realtime.py`) and the attempt limits (`ratelimit.py`) keep their state
in memory. Behind a proxy, set `TRUSTED_PROXY_HOPS` so limits apply per visitor, not per proxy, and start uvicorn with
`--no-proxy-headers` (DEPLOY.md → Visitor addresses behind a proxy).
In production, uploaded files live in a private Supabase Storage bucket (`STORAGE=supabase`, docs/STORAGE.md), never
on the server's disk. Accounts whose 30-day closing notice has run out are closed at start-up and every 6 hours.

## Limits and rules worth knowing

- **Attempt limits** (per visitor, answered with 429 and `Retry-After`): sign-in 20 per 5 minutes and 10 per
  15 minutes per email address; sign-up 10 an hour; forgot password 5 and reset 10 per 15 minutes; family-code check
  10 per 5 minutes; invitation links 20 per 5 minutes. `RATE_LIMIT_ENABLED=false` turns them off.
- **Uploads** are checked by their contents, not only the type the browser names. A memory, story, milestone, record
  or message can only use a file **you** uploaded. `GET /uploads/{id}` answers for your own uploads; everyone else
  gets a file's link with the item it belongs to, so the item's visibility decides who can open it.
- **The archive export** (`/admin/export`) follows the same privacy rules as the screens.
- **PATCH** can't empty a required field (`{"title": null}` is a 422 naming the field).
- **Errors** are always JSON `{"detail": ...}`, never a stack trace; the details go to the server log.
