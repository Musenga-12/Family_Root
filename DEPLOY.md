# Deploying FamilyRoots

FamilyRoots is two parts:

| Part | What it is | Needs |
|---|---|---|
| **Web app** | static files built into `dist/` | any static host; HTTPS |
| **Family server** | `backend/`, FastAPI | Python 3.12, a PostgreSQL database (Supabase), somewhere to keep uploaded files |

Families sign in to the server; everything they add is stored there. The repository has no hosting configuration yet,
so the choice of host is still open (see [Choosing hosts](#choosing-hosts)).

## 0. Before the first deployment: the database

The Supabase database already holds the app's tables (migration `0003`, checked with `scripts/check_database.py`).
It also holds the **sample Mackenzie family**, whose 8 accounts (`…@example.com`) share the published password
`familyroots123`. Anyone could sign in with them. Before inviting families:

```bash
cd backend
.venv\Scripts\python scripts/retire_sample_accounts.py           # lists what it would change (changes nothing)
.venv\Scripts\python scripts/retire_sample_accounts.py --apply   # removes their access; reversible, deletes nothing
```

Never run `python seed.py` against the production database.

## 1. The family server (backend)

Settings: copy `backend/.env.production.example` into the host's environment variables and replace every placeholder.

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production`: start-up safety checks on, `/docs` hidden |
| `SECRET_KEY` | long random value: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | Supabase connection string (Session pooler), driver `postgresql+psycopg://` |
| `FRONTEND_ORIGIN` | the web app's address, e.g. `https://familyroots.example.org` (only this origin may call the API) |
| `API_BASE_URL` | the server's own public address (photo and audio links are built from it) |
| `STORAGE` | `supabase` (recommended) or `local` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | for `STORAGE=supabase`: create a **private** bucket (Storage → New bucket, Public off). The service key stays on the server. |
| `UPLOAD_DIR` | for `STORAGE=local`: a folder on a **persistent** disk |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | leave unset until you have a domain (see [Email](#email)): "Forgot password" then points to an Admin reset link, and invitations are shared by link |

The server refuses to start in production with the sample `SECRET_KEY`, with `localhost` addresses, with
`STORAGE=supabase` but no key, or with email half set up (or set to the console), and it logs a warning while sample accounts can sign in or files go to a local disk.

Commands, from `backend/`:

```bash
pip install -r requirements.txt -c constraints.txt
alembic upgrade head                                  # only after reviewing new migrations; never on a test database
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers
```

Health check for the host: `GET /health`.

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
  (The app has no email-confirmation step at sign-up yet, so nothing had to be switched off; see Not yet built.)

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

## 2. The web app (frontend)

Build with the server's address (template: `.env.production.example`), then upload `dist/`. Addresses use `#/…`,
so no rewrite rules are needed.

```bash
VITE_API_URL=https://api.familyroots.example.org/api/v1 npm run build
# Windows PowerShell:  $env:VITE_API_URL="https://api.familyroots.example.org/api/v1"; npm run build
```

## 3. Check it before inviting families

1. `backend/scripts/check_database.py` reports "No problems found".
2. Open the web app in a private window: the home page loads; **Look around a sample family first** shows the sample
   with the "nothing is saved" banner.
3. **Create account** with a real email: welcome steps, then an Overview with only yourself in the tree.
4. Add a relative, a photo and a story; reload; they are still there. Sign in on another device: they are there too.
5. The footer reads "Saved to the family archive". Restart (redeploy) the server and check the photo still opens.
6. Email: with no domain yet, "Forgot password?" shows the Admin reset link steps, and an Admin's **Reset link** lets
   you choose a new password. With email configured, the email arrives and its link works.

`backend/scripts/live_sync_check.py` runs the app against a throwaway server; CI runs it on every push.

## Choosing hosts

| Option | Good | Watch out for |
|---|---|---|
| **Render** (web service) + static site | simple, `/health` checks, free tier | free services sleep (first request slow); disk is wiped on deploy unless you pay for one → use `STORAGE=supabase` |
| **Railway** | simple, volumes available | usage-based billing |
| **Fly.io** | volumes, regions near users | more setup (Dockerfile) |
| A **VPS** (e.g. a university server) | full control, disk persists | you patch, back up and run HTTPS yourself |
| Web app: **Netlify / Vercel / Cloudflare Pages / GitHub Pages** | free, HTTPS, global | set `VITE_API_URL` in the build settings |

Whatever the host: HTTPS for both parts, one server instance (sign-in attempt limits are kept in memory, per instance),
and `STORAGE=supabase` unless the disk is persistent.

## Not yet built

- **Email address confirmation** at sign-up: the email template exists (`mail_templates.verify_email`), but asking for
  it needs a new database column and migration, which should be reviewed and approved first.
- **Translations** of the newest interface text: French, Kinyarwanda and Swahili show English for it until translated.
