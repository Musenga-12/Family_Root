# FamilyRoots — production readiness audit

Branch `feature/public-experience`, 20 November 2026. Nothing has been committed, pushed or deployed. The live Supabase
database was only **read** (read-only transaction); nothing in it was changed.

## 1. Initial audit (before this work)

| Area | Status found | Evidence |
|---|---|---|
| Public site (home, about, features, how it works, FAQ, contact, privacy policy, terms) | Fully functional | `src/views/Landing.jsx`, `src/views/public/*`; Landing tests pass |
| Registration, sign in, family code, invitations, forgot / reset password | Fully functional (server) | `src/views/Auth.jsx` uses `authApi`; Auth tests (4 files) pass; backend `test_auth.py` |
| Welcome steps after sign-up | Fully functional | `src/views/Welcome.jsx` (hello, profile, family, discover + privacy, done) |
| **Overview, Tree, Directory, Memories, Stories, Timeline, Legacy, Messages, Calendar, Admin, Privacy, Settings** | **Broken for real users: placeholder (sample) data** | Read `state` from `src/data.js` SEED in localStorage even when signed in; only Auth, Welcome, GettingStarted and the bell called the API (`grep "lib/api" src`). A new family saw the Mackenzie family as theirs. |
| Backend endpoints for all of the above | Fully functional, unused by the screens | 15 routers; 359 tests passing |
| Authentication, authorization, family isolation | Fully functional | `app/auth.py`, `app/visibility.py`; `test_access.py`, `test_privacy.py` |
| File uploads | Partially functional for production | Content-type checked by file signature, size limits, signed expiring links; but stored only on the server's local disk |
| Live database contents | **Needs security review** | 8 sample accounts with the published password can sign in (see §4) |

## 2. Homepage and data authenticity

| Displayed content | Source | Actual or sample | Action taken |
|---|---|---|---|
| Hero headline, description, buttons | `i18n-public.js` | E. Static marketing | Kept; added "Look around a sample family first" for visitors |
| Hero and topic photos | bundled `src/assets/photos` (Unsplash, credited) | E. Static marketing, labelled with credits | Kept |
| "Grandma's voice", "Wedding, 1978" floating cards | static | E. Illustrative | Kept (decorative, not presented as anyone's data) |
| Features, how it works, trust points, FAQ | `i18n-public.js`, `lib/site.js` | E. Static; every feature listed exists | Kept |
| Statistics, testimonials, user counts | none exist | — | None invented (verified) |
| Header / CTA for signed-in members | session `me` from `GET /me` | A. Real | Kept |
| **Overview** greeting, relatives count | was SEED | was B/C | Now `/people` (A) |
| Overview mini tree (John, Sarah, Michael…) | hard-coded ids in `Overview.jsx` | B | Built from the member's own relationships |
| Overview "Annual Summer Reunion, 18 going" | hard-coded | B/D | Next real event from `/events`, or "No gatherings planned yet" |
| Overview poll and weekly question | `i18n` strings | B | `/polls/current`, `/prompts/current`; Admins/Custodians can create them; hidden when none |
| Overview "Guardian: Sarah Mackenzie", "14 Restored Photographs" | hard-coded | B | Real Admins' names; real counts |
| Overview mood check-in | local only | D | Saved with `PUT /mood` |
| All other app screens | SEED | B/C | Server data via `serverArchive.js` |
| Interface text naming the sample family ("All Mackenzie Relatives", "Recommended for Mary", recording prompts, timeline spotlight, tree highlights) | `i18n-ui.js`, views | B | Made family-neutral or data-driven |
| Sample family in the demo / "Look around" mode | `src/data.js` | C, clearly labelled | Kept, with a banner: "Nothing you do here is saved or shared" |
| Mackenzie family in the Supabase database | `seed.py` | C. Seeded demo data in production | Not deleted; reversible removal script prepared (needs approval) |

Rule checks: no fake statistics (verified); public visitors see no family data (the archive is behind `RequireSession`,
which waits for the member's own archive and never shows the sample to a signed-in member, `RequireSession.test.jsx`);
empty, loading and error states exist on every screen (`EmptyFamily.test.jsx` opens all 12 for a founder-only family
and fails on any sample name).

## 3. What changed

**Frontend**
- `src/lib/serverArchive.js` (new): loads the whole archive from the API and turns every change into the matching
  API call (create, edit, delete, restore, favourite, verify, RSVP, messages, reactions, roles, invites, privacy, poll,
  prompt). Photos and recordings are uploaded. Undo after a delete restores the same item.
- `src/lib/useServerSync.js` (new): ordered save queue, temporary-id → server-id mapping, save status, reload after a
  refused change, refresh when the tab returns and every 20 s on Messages.
- `StoreProvider`, `SessionProvider`, `RequireSession`, `data.js` (`ME` follows the account), `Layout` (save status,
  trial banner, refused-change notice; the "screens still show the sample" note is gone).
- Screens: Overview rewritten to real data with first-time states; Tree, Directory, Privacy cope with unknown or
  private birth dates; Timeline, Recording studio, Settings (server export, no "restore sample" on a server), Privacy
  (server export), Landing (try the sample), Getting started (ticks steps as soon as they're done), Welcome (records idea).

**Backend**
- `app/storage.py` (new): `STORAGE=local` or a private Supabase Storage bucket; uploads stream through it.
- `app/main.py`: tokens hidden in access logs; production warning while sample accounts can sign in.
- `app/config.py`: storage settings and start-up checks.
- `scripts/check_database.py`, `scripts/retire_sample_accounts.py`, `scripts/live_sync_check.py` (new).

**Database**: no schema change, no migration, no data change.

**Configuration**: `backend/.env.production.example`, `.env.production.example`, `.gitignore` (all `.env.*` except
templates, `.coverage`), CI job for the end-to-end check, `DEPLOY.md`, README.

## 4. Live database (read-only check)

`backend/scripts/check_database.py` against the configured Supabase database:
- PostgreSQL on Supabase (EU Central pooler); every table and column in `app/models.py` exists; migration `0003` = code `0003`.
- 4 families, 10 accounts: **8 sample (`@example.com`), 2 real**; 0 uploads.
- `retire_sample_accounts.py` (preview only) lists exactly the 8 Mackenzie accounts.

## 5. Security

| Check | Result |
|---|---|
| Passwords | Argon2 (`pwdlib`), 10+ characters, constant-time response for unknown emails |
| Tokens | JWT with expiry; file links can't sign in; removed members and changed passwords end sessions |
| Family isolation and roles | every query filtered by `family_id`; role checks; covered by 36 tests |
| Privacy visibility, minors | `visibility.py`; `test_privacy.py` |
| Files | type checked by content, size limits, signed 12 h links, private cache headers, `nosniff` |
| CORS | only `FRONTEND_ORIGIN` / `EXTRA_ORIGINS` |
| Rate limits | sign-in, sign-up, reset, family code, invite links (in memory, one instance) |
| API docs | hidden in production |
| Secrets in Git | none tracked, none in history; `.gitignore` tightened |
| **Fixed**: file-link tokens in access logs | redacted (`RedactTokens`, `tests/test_logging.py`) |
| **Open**: sample accounts in the live database | removal script ready, needs approval |
| NOT VERIFIED | penetration testing; Content-Security-Policy header (not added: needs testing on the real host) |

## 6. Files and media

Files were stored on the server's disk (`UPLOAD_DIR`), which most hosts wipe on deploy. Added `STORAGE=supabase`:
a private bucket, files still served only through the signed link check. Tested against a stand-in for Supabase
(`tests/test_storage.py`). **NOT VERIFIED** against a real Supabase bucket (needs a bucket and the service key).

## 7. Test results (run 20 Nov 2026)

| Command | Result |
|---|---|
| `npm test` | 97 passed, 2 skipped (the live tests, run separately below) |
| `npm run lint` | no problems |
| `npm run build:all` | `dist/` and `release/FamilyRoots.html` built |
| `backend\.venv\Scripts\python.exe -m pytest backend\tests --cov=app --cov-report=term-missing -q` | 366 passed, 8 skipped, 99 % coverage |
| `ruff check .` (backend) | all checks passed |
| `python scripts/live_sync_check.py` | 2 passed: every kind of change saved to a real (throwaway) server; a new family sees only its founder |
| Layout at 375 px and 820 px (headless Chrome: home, overview, tree, messages) | no horizontal scrolling, controls usable |

NOT VERIFIED: the signed-in app in a real browser against a running server (tests cover it with jsdom and the live
API test); screen-reader pass; real email delivery (not built).

## 8. Remaining blockers before release

1. **Approve and run** `scripts/retire_sample_accounts.py --apply` on the live database (or remove the sample family another way).
2. Create a private Supabase Storage bucket and set `STORAGE=supabase` (or use a persistent disk).
3. Choose hosts (`DEPLOY.md` → Choosing hosts) and set the production variables from the templates.
4. Email sending is not built: invitations and resets rely on copied links.
5. New interface text is English-only in French, Kinyarwanda and Swahili.

## 9. Next steps

1. Review this branch; approve a commit.
2. Approve step 8.1 (I can run it).
3. Create the bucket; deploy the server, then the web app (`DEPLOY.md` §1–2).
4. Run the checklist in `DEPLOY.md` §3.
