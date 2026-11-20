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
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | email through Resend: see [Email](#email). Without them "Forgot password" says it can't send, and invitations are shared by link |

The server refuses to start in production with the sample `SECRET_KEY`, with `localhost` addresses, with
`STORAGE=supabase` but no key, or with email half set up (or set to the console), and it logs a warning while sample accounts can sign in or files go to a local disk.

Commands, from `backend/`:

```bash
pip install -r requirements.txt
alembic upgrade head                                  # only after reviewing new migrations; never on a test database
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers
```

Health check for the host: `GET /health`.

## Email

FamilyRoots sends: the link to choose a new password, invitations, a welcome note, and "your password was changed".
It uses [Resend](https://resend.com) (`app/mail.py`; another provider can be added there).

1. **Use a domain you control** (Resend can't send from Gmail or other shared addresses). A subdomain such as
   `mail.your-domain.org` keeps this mail separate from your normal email.
2. In Resend → **Domains → Add domain**, enter it. Resend then lists the DNS records to add at your DNS provider
   (where the domain is managed). Copy the exact values Resend shows; typically:

   | Type | Name (host) | Purpose |
   |---|---|---|
   | `TXT` | `resend._domainkey.mail` | **DKIM**: proves the mail really comes from your domain |
   | `MX` | `send.mail` | return path for bounces (**SPF** alignment) |
   | `TXT` | `send.mail` | **SPF**: `v=spf1 include:amazonses.com ~all` (use Resend's value) |
   | `TXT` | `_dmarc` (optional, recommended) | **DMARC**, e.g. `v=DMARC1; p=none; rua=mailto:you@your-domain.org` |

   Wait until Resend shows the domain as **Verified** (minutes to a few hours).
3. Resend → **API Keys → Create**: "Sending access", limited to that domain. Put it in `RESEND_API_KEY` on the server.
4. Set `EMAIL_PROVIDER=resend` and `EMAIL_FROM=FamilyRoots <no-reply@mail.your-domain.org>` (an address on the
   verified domain). Optionally `EMAIL_REPLY_TO` to a mailbox someone reads.
5. Test: "Forgot password?" with your own account; the email arrives within a minute, its link opens the reset page,
   and Resend → Emails shows it as delivered. Check the spam folder the first time.

Security: reset links work once, for 60 minutes, and only a hash is stored; using one (or changing the password)
cancels every other open link. "Forgot password" answers the same way and in about the same time whether or not an
account exists, is limited to 5 requests per 15 minutes, and only says "check your email" when the email really went
to Resend. Production logs never contain reset links or addresses. Automated tests never send email.

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
6. "Forgot password?" with your own address: the email arrives and its link lets you choose a new password.

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
