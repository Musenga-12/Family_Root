# FamilyRoots: security and deployment-readiness audit

Scope: the whole repository (web app, `backend/`, migrations, CI, documentation), prepared for Vercel (web app),
Render (API), Neon (PostgreSQL) and Supabase Storage (files). Work on branch `chore/deploy-readiness`, November 2026.
No live database, bucket or hosted service was connected to or changed; nothing was pushed or deployed.

## Architecture (as built)

- **Web app:** React 19 + Vite 8, hash routing, one central API client (`src/lib/api.js`). Signed in, the whole archive
  comes from the API and every change is sent back (`serverArchive.js`, `useServerSync.js`); without a server it is an
  on-device demo. Browser storage holds only the sign-in token, display preferences, form drafts, the "Recent" list,
  recordings waiting to upload (IndexedDB) and the demo archive.
- **API:** FastAPI, 152 endpoints in 16 routers (docs/API.md), SQLModel tables (36), Alembic migrations `0001`–`0003`,
  JWT sign-in, Argon2 passwords, roles (Admin, Custodian, Contributor, Viewer), per-family isolation, privacy rules
  (`visibility.py`), email (Resend/SMTP), Supabase Storage for files, in-memory rate limits and live chat (one process).

## What was checked, and what was found

### Already sound (verified, unchanged)

- **Family isolation:** every content table has `family_id`; every item lookup checks it (all `db.get` calls in the
  routers reviewed); another family's ids answer 404; tests cover it.
- **Authorization:** only 10 endpoints are public, all sign-in, sign-up or recovery (plus `/health` and file links,
  which need their own signed token); every other route needs sign-in, many a role (docs/API.md lists them).
- **Passwords and tokens:** Argon2; tokens expire and stop working when the password changes or access is removed;
  reset tokens are single-use and stored only as hashes; "forgot password" answers the same way and time either way.
- **Uploads:** type allow-list checked against the file's contents, size limits, only the uploader may attach a file,
  and only within their family; files are served through short-lived signed links, never public bucket URLs.
- **Errors and logs:** errors are plain `{"detail"}` without internals; tokens in URLs are redacted from access logs;
  reset links and addresses aren't logged in production; no secret value is logged.
- **Git history:** all branches scanned for database URLs with passwords, API keys, JWTs, AWS keys and secret keys:
  only placeholders and test values. No real `.env`, database or backup was ever committed. **No rotation needed.**

### Found and fixed

| # | Finding | Severity | Fix (commit) |
|---|---|---|---|
| 1 | Behind Render's proxy, the usual `--forwarded-allow-ips '*'` trusts the first `X-Forwarded-For` entry, which the visitor writes: anyone could dodge the sign-in limits; without it, everyone would share one limit | High | `TRUSTED_PROXY_HOPS`, counted from the right; `--no-proxy-headers`; an after-deploy check script (8f8bc58) |
| 2 | The production template's `SECRET_KEY` placeholder passed the start-up check: a server started from an unedited copy signs tokens with a published key | High | every template key and placeholder-like key refused (2dbda8a) |
| 3 | Sample accounts with a published password could exist in the live database and sign in | High | production refuses `@example.com` accounts and that password; `seed.py` never runs in production or on a non-empty database (0f9bcaf) |
| 4 | Production accepted a SQLite database (wiped on redeploy) and an out-of-date schema | High | refused at start-up (8f8bc58) |
| 5 | A Neon (or any) database address without TLS would be accepted | Medium | `sslmode=require` required in production (42871d7) |
| 6 | CORS allowed credentials and any method/header | Medium | exact origins, no credentials, only the app's methods and headers (8f8bc58) |
| 7 | Signing out left drafts, the "Recent" list and recordings (never removed after upload) on the device | Medium | cleared on sign-out, and when a different account signs in (e635b1b) |
| 8 | No Content-Security-Policy or security headers on the web app | Medium | strict CSP from `VITE_API_URL`, HSTS, frame-ancestors, Permissions-Policy (a002073) |
| 9 | Accounts due for closing (30-day notice) were only closed when the server restarted | Medium | also every 6 hours while running (0e111cc) |
| 10 | Directory crashed for any relative without a birth date (common on a real server, never in the demo) | Medium (production-only) | unknown dates sort last (a186ba4) |
| 11 | Chat search was case-sensitive on PostgreSQL (case-insensitive on SQLite) and treated `%`/`_` as wildcards | Low (production-only) | `icontains` with escaping (f379eab) |
| 12 | Gatherings without a time sorted differently on PostgreSQL | Low | explicit order (f379eab) |
| 13 | Files from Supabase were held whole in memory (up to 50 MB) and couldn't be played from the middle | Low | streamed, with `Range` (ccc5650) |
| 14 | `postgresql://` URLs (as Neon shows them) needed the missing psycopg2 driver; no pooled/direct handling | Blocker for Neon | normalised to psycopg 3; pooler-safe settings; `DATABASE_URL_DIRECT` for migrations (42871d7) |
| 15 | No Render/Vercel configuration; Python and dependencies not pinned; `.coverage` tracked | Blocker | `render.yaml`, `vercel.json`, `.python-version`, `constraints.txt` (8ac5f4f, 1d9bc7d, a002073) |
| 16 | Documentation described a Supabase database, said email wasn't built, and missed the newer settings | — | README, DEPLOY, backend README, API reference, storage and migration guides rewritten |

## Verification

- **Local (Windows):** backend 478 tests passed (SQLite), ruff clean, dependencies installed exactly from
  `constraints.txt`; frontend lint clean, 132 tests passed, default, Vercel-production and single-file builds.
- **Real browser (Chromium) against a throwaway API**, with the built app served under `vercel.json`'s headers and the
  CSP enforced: all 12 screens, sign-in, a photo upload, recording playback with `Range`, the print window; no CSP
  violations, page errors or console errors. Every HTTP method the app uses passes CORS from the app's origin and is
  blocked from any other.
- **Mutation checks:** the tests fail if the proxy logic trusts the first address, if sign-out stops clearing data,
  or if search goes back to plain `LIKE`.
- **Not run here (prepared for CI):** the suite on PostgreSQL, `alembic upgrade head`/`check` on PostgreSQL, the
  production start-up with the Render start command, and anything on Linux. Running a local PostgreSQL wasn't
  possible in this environment; `.github/workflows/ci.yml` runs all of it on Ubuntu with PostgreSQL 17 on the first
  push. The migrations were rendered as PostgreSQL SQL offline (all native types), and SQLite-only behaviour was
  searched for and fixed (11, 12).

## Open, and who decides

1. **Is there real family data in the Supabase database?** Not checked (no live access). The owner runs the read-only
   `backend/scripts/check_database.py` against it (docs/DATA_MIGRATION.md, step 1) before choosing "start Neon empty"
   or "move the data".
2. **Sample accounts in the live database:** if present, retire them with `scripts/retire_sample_accounts.py
   --apply` (reversible), with the owner's approval. They can't sign in to the new production server either way.
3. **`TRUSTED_PROXY_HOPS` on Render** is provisional (1) until measured with `scripts/check_client_ip.py`.
4. **Erasing files of closed accounts and deleted items** (they stay in the bucket today): a product/privacy decision.
5. **Sign-in token in `localStorage`:** acceptable under the strict CSP; moving it to an HttpOnly cookie would need a
   CSRF design and is a larger change.
6. Known limitations (one API instance, email needs a domain, no email confirmation, partial translations, chat
   refreshes every 20 s instead of using the existing WebSocket): DEPLOY.md → Known limitations.
