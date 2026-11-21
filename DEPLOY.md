# Deploying FamilyRoots

```
 Browser ──HTTPS──▶ Vercel: the web app (static files from dist/)
    │
    └──HTTPS──▶ Render: the API (FastAPI, backend/) ──TLS──▶ Neon: PostgreSQL (all records)
                                    │
                                    └──HTTPS, service key──▶ Supabase Storage: private bucket (photos, recordings, scans)
```

| Part | Service | Configured by | Holds |
|---|---|---|---|
| Web app | **Vercel** | `vercel.json`, `VITE_API_URL` | nothing private: HTML, JavaScript, fonts |
| API | **Render** (web service) | `render.yaml` | no data of its own; one process |
| Database | **Neon** PostgreSQL | `DATABASE_URL`, `DATABASE_URL_DIRECT` | every record, account and file's metadata |
| Files | **Supabase Storage** | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | the files themselves, in a private bucket |
| Checks | **GitHub Actions** | `.github/workflows/ci.yml` | runs on every push (Ubuntu): see README → Tests |

Browsers only ever talk to Vercel and to the API. The API is the only thing that talks to Neon and Supabase.

## The order, and why

1. **Neon** first: the API can't start without its database.
2. **Supabase Storage** bucket: the API refuses to start in production with `STORAGE=supabase` and no key.
3. **Migrations** on Neon: the API refuses to start on a database that isn't at the latest migration.
4. **Render**: gives the API its address (`https://<name>.onrender.com`), which the web app needs.
5. **Vercel**, built with that API address. It gives the web app its address, which the API needs (CORS).
6. Back on **Render**: set `FRONTEND_ORIGIN` to the Vercel address, redeploy.
7. **Measure** `TRUSTED_PROXY_HOPS`, then **check** everything (section 8) before inviting families.

If the old Supabase database holds real families, move their data before step 3 (docs/DATA_MIGRATION.md) instead
of starting Neon empty.

**Secrets** (only ever typed into the Render dashboard; never into Vercel, a file in the repository, a chat or a
ticket): `SECRET_KEY` (Render generates it), `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SUPABASE_SERVICE_KEY`,
`RESEND_API_KEY`, `SMTP_PASSWORD`. Everything else is public configuration. The web app has exactly one setting,
`VITE_API_URL`, and it is public: it ends up in the JavaScript every visitor downloads.

## 1. The database on Neon

1. neon.tech → **New project**: PostgreSQL 17, region **AWS Europe Central (Frankfurt)** (the same region as the API
   in `render.yaml`; choose another pair if your families are elsewhere, but keep them together).
2. Create a database named `familyroots` (or keep the default) and note its owner role.
3. **Connect** → copy two connection strings, both ending `?sslmode=require&channel_binding=require`:
   - **Pooled** (host contains `-pooler`): the app's `DATABASE_URL`. Neon's PgBouncer lets many short requests share a
     few connections; the app turns off prepared statements there and reconnects when Neon wakes from idle
     (`backend/app/db.py`).
   - **Direct** (same host without `-pooler`): `DATABASE_URL_DIRECT`, used only by migrations and by `pg_dump` /
     `pg_restore`. Schema changes and long sessions belong on a direct connection.
   Paste them as Neon shows them; the `postgresql://` prefix is fine (the app picks its driver). A production server
   refuses a database address without `sslmode=require` (except on the same computer).

## 2. Files on Supabase Storage

Follow **docs/STORAGE.md → Setting it up**: a private bucket `family-files`, and its Project URL and service_role
key for Render. Only Supabase **Storage** is used; its database is not (and, once the data has moved, isn't needed).

## 3. Database migrations

The production database is only ever changed by the reviewed migrations in `backend/migrations/versions/`, run by a
person, before the API starts (the API never changes the schema itself, and refuses to start on the wrong one).

From `backend/` on your computer (Python 3.12, `pip install -r requirements.txt -c constraints.txt`), with the
**direct** Neon string for these commands only:

```powershell
$env:DATABASE_URL = "<Neon DIRECT connection string>"
$env:DATABASE_URL_DIRECT = "<Neon DIRECT connection string>"
python -m alembic upgrade 0001 --sql | more   # optional: read the tables' SQL first (0002 needs data, so not offline)
python -m alembic upgrade head                # a new, empty database: builds every table
python -m alembic current                     # 0003 (head)
python -m alembic check                       # "No new upgrade operations detected."
Remove-Item Env:DATABASE_URL, Env:DATABASE_URL_DIRECT
```

Later releases: when a deploy brings a new file in `migrations/versions/`, run the same commands (after reading the
migration) **before** that deploy goes live. If you forget, the new version fails Render's health check and the
previous version keeps running (section 4). On a paid Render plan, `preDeployCommand: alembic upgrade head` in
`render.yaml` can do this automatically instead.

Never run `python seed.py` against it: it refuses in production anyway, and only fills an empty database.

## 4. The API on Render

1. Render → **New → Blueprint** → this GitHub repository. Render reads `render.yaml`: a Python web service from
   `backend/`, installed with `requirements.txt -c constraints.txt` on Python 3.12, started with uvicorn, one
   instance, health check `GET /health`, `SECRET_KEY` generated for you.
2. It asks for the `sync: false` values:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** string |
   | `DATABASE_URL_DIRECT` | Neon **direct** string (optional on the server; used by migrations) |
   | `FRONTEND_ORIGIN` | for now `https://example.invalid`; set the Vercel address in step 6 |
   | `API_BASE_URL` | `https://<service-name>.onrender.com` (shown once the service exists; set it, then redeploy) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | from step 2 |

   Already set by the Blueprint: `ENVIRONMENT=production`, `STORAGE=supabase`, `SUPABASE_BUCKET=family-files`,
   `TRUSTED_PROXY_HOPS=1` (provisional, section 7), `PYTHON_VERSION`.
3. Deploy. The log ends with `Application startup complete`, and `https://<service>.onrender.com/health` answers
   `{"status":"ok","database":"ok"}`. `/docs` answers 404 (hidden in production).

If it doesn't start, the log says why in plain words. The server refuses to start in production with: a sample or
short `SECRET_KEY` (including the templates' placeholders); `localhost` addresses; origins that aren't exact
`https://` addresses; a SQLite database; a database address without `sslmode=require`; a database that isn't at the
latest migration; `STORAGE=supabase` without its key; email half set up or set to the console. It logs a warning (and
starts) while sample accounts are in the database or `TRUSTED_PROXY_HOPS` is 0.

Plan: `free` sleeps after 15 idle minutes (the next visit waits about a minute) and has 512 MB; `starter` stays
awake. Files are streamed through the API, never held whole in memory, so either works. Keep **one instance**: live
chat and the sign-in attempt limits are kept in that process's memory.

Start command (from `render.yaml`): `uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers ...`.
`--no-proxy-headers` is deliberate: see section 7. Logs go to Render's log view; sign-in tokens in file links are
shown as `token=[hidden]`, and reset links and email addresses are never logged in production.

## 5. The web app on Vercel

1. Vercel → **Add New → Project** → this repository, root directory `/` (the default). `vercel.json` sets the rest:
   `npm ci`, `npm run build`, output `dist`, Node 24 (`package.json` → engines).
2. **Settings → Environment Variables**, environment **Production**:
   `VITE_API_URL = https://<service>.onrender.com/api/v1` (https, ending in `/api/v1`).
   A production build stops with a clear message if it is missing, not https, or points at localhost, so a deployed
   app can never quietly be the offline demo.
3. Deploy, and note the address (`https://<project>.vercel.app`, or your own domain).

What the build and `vercel.json` add: a strict **Content-Security-Policy** generated from `VITE_API_URL` (the app may
load and call only itself and that API; no other sites, no inline scripts, no eval), `frame-ancestors 'none'`, HSTS,
`nosniff`, `Referrer-Policy: no-referrer`, a Permissions-Policy that allows only the microphone (recordings, voice
search), year-long caching for the content-hashed `assets/`, and no caching of `index.html`, `sw.js` and the manifest
(so updates arrive at once). There are no rewrites: the app uses `#/` addresses, so every page is `index.html`.

Preview deployments (other branches) are built the same way but don't require `VITE_API_URL`. To try one against the
API, add its exact address to the API's `EXTRA_ORIGINS`.

## 6. Connect the two

On Render: `FRONTEND_ORIGIN = https://<project>.vercel.app` (exactly, no trailing slash; a custom domain later
replaces it, or goes in `EXTRA_ORIGINS` as well). Redeploy. Only these origins may call the API from a browser.

## 7. Visitor addresses behind a proxy

Sign-in, sign-up and password-reset attempts are limited per visitor address. On Render (and most hosts) requests
reach the server through the host's proxy, so the connection always comes from the proxy, and the visitor's address
is in `X-Forwarded-For`. Each proxy *adds* to that header; whatever the visitor sent stays at the front. So the app
trusts only the last `TRUSTED_PROXY_HOPS` entries, those added by the host's own proxies, and never the rest:

| `TRUSTED_PROXY_HOPS` | Too low (e.g. 0 behind a proxy) | Right | Too high |
|---|---|---|---|
| Effect | every visitor shares one limit: 20 wrong passwords anywhere lock everyone out for 5 minutes | each visitor has their own limit | visitors can dodge the limit by sending a made-up address each time |

`--no-proxy-headers` keeps uvicorn from rewriting addresses itself: with `--forwarded-allow-ips '*'` it would take
the *first* entry, which visitors can write. How many proxies Render adds isn't documented reliably (reports
differ), so the Blueprint starts with `1`, and you check it from the outside after the first deploy, from `backend/`:

```bash
python scripts/check_client_ip.py https://<service>.onrender.com            # step 1: 21 failed sign-ins, unknown emails
python scripts/check_client_ip.py https://<service>.onrender.com --single   # step 2, within 5 min, from ANOTHER network
```

Step 1 must say PASSED (otherwise lower the number by one); step 2, run from e.g. a phone's mobile data, must say
PASSED (otherwise raise it). Change the variable, redeploy, wait 5 minutes and repeat both steps until both pass. Your
own address can't sign in for 5 minutes after step 1; no account is affected.

## 8. Check it before inviting families

1. `/health` answers `{"status":"ok","database":"ok"}`; `/docs` answers 404.
2. Section 7 passed (both steps).
3. In a private window, open the Vercel address. Browser developer tools → Console shows no errors and no
   "Content-Security-Policy" messages; Network shows calls only to the Vercel address and the API.
4. **Create account** with a real email: welcome steps, then an Overview with only yourself in the tree.
5. Add a relative (with and without a birth date), a photo and a recording; reload: they are there. Play the
   recording and jump to its middle. Sign in on another device: everything is there too.
6. Redeploy the API (Render → Manual deploy) and check the photo and recording still open (they live in Supabase).
7. **Privacy:** from a second account in a *different* family, nothing of the first family appears anywhere; an item
   set to "Only me" isn't visible to another member of the same family.
8. **Sample accounts:** `mary@example.com` with the published sample password is refused.
9. Sign out: the drafts you typed are gone from the device; sign in again: everything on the server is still there.
10. Email: with no domain yet, "Forgot password?" shows the Admin reset link steps, and an Admin's **Reset link** lets
    you choose a new password. With email configured, the email arrives and its link works.

`backend/scripts/check_database.py` (read-only) shows the migration, row counts and whether sample accounts exist;
`backend/scripts/live_sync_check.py` runs the app against a throwaway server (CI runs it on every push).

## Email

FamilyRoots sends the link to choose a new password, invitations, a welcome note and "your password was changed"
(`backend/app/mail.py`; templates in `app/mail_templates.py`). The server is always in one of three states, shown at
start-up in the log and to the app by `GET /api/v1/auth/email-status`:

| State | When | What people see |
|---|---|---|
| `development` | `ENVIRONMENT` isn't `production` | messages go to a test destination: the console, Mailpit, or Resend's test inbox |
| `production-not-configured` | production with no real way to deliver (no domain yet) | "Forgot password" says email can't be sent and explains the **Admin reset link**; invitations show "Copy link". Nothing ever claims an email was sent. |
| `production-configured` | production with Resend on a verified domain, or an SMTP service | emails arrive in people's inboxes |

### Now: no domain bought yet

Leave `EMAIL_PROVIDER`, `RESEND_API_KEY` and `EMAIL_FROM` unset in production. The state is
`production-not-configured`, and:

- **Forgotten password:** the person asks an Admin. The Admin opens **Family Administration**, chooses the
  **Reset link** button next to their name, and sends them the link by phone, message or in person. It works once,
  for 3 days, and is a normal reset link (only its hash is stored; using it, or changing the password, cancels it).
- **Invitations:** "Copy link" in the invite message and in Family Administration.
- Account security is unchanged: sign-in, password rules, single-use reset links and rate limits all stay on.
  (The app has no email-confirmation step at sign-up yet, so nothing had to be switched off; see Known limitations.)

Why not send from Resend without a domain? Resend's shared sender `onboarding@resend.dev` only delivers to Resend's
test inboxes and to the address the Resend account was opened with. It can't reach relatives, so the server never
treats it as real delivery in production (it reports `production-not-configured`).

### Testing email without a domain

- **On your computer: Mailpit** (a local inbox). Install it (https://mailpit.axllent.org, e.g. `mailpit.exe`), run it,
  then in `backend/.env`: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`. Every message, with
  working links, appears at http://localhost:8025.
- **The Resend integration: test mode.** Create a free Resend account and an API key, then on a development server:
  `EMAIL_PROVIDER=resend-test`, `RESEND_API_KEY=…`, `EMAIL_TEST_RECIPIENT=delivered@resend.dev` (or
  `bounced@resend.dev` / `complained@resend.dev` to simulate problems, or your own Resend sign-up address).
  Every message is sent from `onboarding@resend.dev` to that address only, subject marked `[Test]`, and appears in
  Resend → Emails. `scripts/send_test_email.py` sends one sample by hand.

Automated tests never send email (they replace the sender and Resend's API).

### Later: real email with a domain

Moving over is a settings change; no code changes.

1. Buy a domain and use a subdomain for mail, e.g. `mail.your-domain.org`.
2. Resend → **Domains → Add domain**. Add the DNS records Resend lists at your DNS provider, copying its exact values.
   Typically:

   | Type | Name (host) | Purpose |
   |---|---|---|
   | `TXT` | `resend._domainkey.mail` | **DKIM**: proves the mail really comes from your domain |
   | `MX` | `send.mail` | bounce handling for the return path |
   | `TXT` | `send.mail` | **SPF** for the return path (Resend's value) |
   | `TXT` | `_dmarc` (recommended) | **DMARC**, e.g. `v=DMARC1; p=none; rua=mailto:you@your-domain.org` |

   Wait until Resend shows **Verified**.
3. Resend → **API Keys → Create**: "Sending access", limited to that domain.
4. On the server: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM=FamilyRoots <no-reply@mail.your-domain.org>`,
   optionally `EMAIL_REPLY_TO`. Restart: the log says `Email: production-configured (resend)`.
5. Test with "Forgot password?" on your own account (check spam the first time), or `scripts/send_test_email.py --to you@…`.

Alternative without a domain: an SMTP service whose account you may send from (`EMAIL_PROVIDER=smtp`, see
`backend/.env.production.example`, option C). It sends as that account's own address; check the service's sending
limits and terms first.

Security in every state: reset links work once, for 60 minutes (Admin links: 3 days), and only a hash is stored;
using one or changing the password cancels the others. "Forgot password" answers the same way and in about the same
time whether or not an account exists, allows 5 requests per 15 minutes, and only says "check your email" when the
email was really handed over for delivery. Production logs never contain reset links or addresses, and the server
refuses to start with `EMAIL_PROVIDER=console` in production.

## Environment variables

**API (Render).** All are read by `backend/app/config.py`; `backend/.env.production.example` has every one with a
placeholder.

| Variable | Secret | Production value |
|---|---|---|
| `ENVIRONMENT` | | `production` (Blueprint): start-up safety checks, `/docs` hidden |
| `SECRET_KEY` | **yes** | generated by Render; 32+ random characters. Changing it signs everyone out |
| `DATABASE_URL` | **yes** | Neon pooled string, `?sslmode=require` |
| `DATABASE_URL_DIRECT` | **yes** | Neon direct string (migrations) |
| `FRONTEND_ORIGIN` | | the Vercel address, exactly `https://host` |
| `EXTRA_ORIGINS` | | optional: more exact `https://` addresses, comma-separated |
| `API_BASE_URL` | | the API's own address (file links are built from it) |
| `TRUSTED_PROXY_HOPS` | | measured in section 7 (Blueprint: 1) |
| `STORAGE` | | `supabase` (Blueprint) |
| `SUPABASE_URL` | | the Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | **yes** | service_role key: storage only, server only |
| `SUPABASE_BUCKET` | | `family-files` (Blueprint) |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | | see Email; unset until a domain is verified |
| `RESEND_API_KEY` / `SMTP_PASSWORD` | **yes** | see Email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_STARTTLS`, `SMTP_SSL` | | only with `EMAIL_PROVIDER=smtp` |
| `ACCESS_TOKEN_MINUTES` (1440), `FILE_LINK_MINUTES` (720), `MAX_IMAGE_MB` (10), `MAX_AUDIO_MB` (50), `RATE_LIMIT_ENABLED` (true), `EMAIL_TIMEOUT_SECONDS` (10), `EMAIL_MIN_RESPONSE_MS` (1500) | | defaults are fine |
| `PYTHON_VERSION` | | for Render itself (Blueprint) |

`UPLOAD_DIR` and `EMAIL_TEST_RECIPIENT` are for development only.

**Web app (Vercel):** `VITE_API_URL` only (public). **Supabase:** nothing to set; it provides `SUPABASE_URL` and the
service key. **Neon:** provides the two connection strings. **GitHub Actions:** needs no secrets.

## Backups and recovery

- **Database:** Neon's point-in-time restore (window depends on the plan), plus a regular `pg_dump` kept elsewhere.
- **Files:** download the bucket regularly, together with the database dump of the same day.
- **A bad release:** Render → the service → Deploys → **Rollback** to the previous one. If that release ran a
  migration, roll the database back with Neon's restore to just before it (migrations are designed to keep data, and
  `0001` can't be undone).
- Commands and checklists: docs/DATA_MIGRATION.md.

## Known limitations

- **One API instance** (live chat and attempt limits live in memory). More would need Redis or similar.
- **Email** needs a verified sending domain; until then resets go through an Admin's reset link (see Email).
- **No email confirmation** at sign-up yet (the template exists; it needs a reviewed migration).
- **Translations:** the newest interface text is English in French, Kinyarwanda and Swahili.
- **Files are kept** when an item is deleted or an account closed (docs/STORAGE.md); erasing them is manual for now.
- **The web app refreshes chats every 20 seconds**; the API's live WebSocket (`/api/v1/ws`) exists but the web app
  doesn't use it yet.
- Render's `free` plan sleeps when idle (the first visit then waits about a minute).
