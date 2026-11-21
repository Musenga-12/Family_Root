# FamilyRoots – Living Archive

A private archive for a family's tree, photos, stories, records and conversations (HCD Group 3).

| Part | Technology | Where it runs in production |
|---|---|---|
| Web app (this folder) | React 19, React Router 7 (hash routing), Tailwind CSS 4, Vite 8; Node 24 | **Vercel** (static files) |
| API (`backend/`) | Python 3.12, FastAPI, SQLModel/SQLAlchemy 2, Alembic, JWT + Argon2 | **Render** (one web service) |
| Database | PostgreSQL 17 | **Neon** |
| Photos, recordings, scans | private bucket | **Supabase Storage** |
| Checks | GitHub Actions on Ubuntu | every push |

## Repository branches

- `main` - complete, stable, integrated application and production branch.
- `frontend` - React, Vite, Tailwind, responsive UI, theme, API integration and frontend tests.
- `backend` - FastAPI, SQLModel/SQLAlchemy, migrations, authentication, storage, email and backend tests.

## Use it


How they fit, what to set where, and the exact order: [DEPLOY.md](DEPLOY.md). Every endpoint:
[docs/API.md](docs/API.md). Files: [docs/STORAGE.md](docs/STORAGE.md). Moving the old Supabase database to Neon:
[docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md). Security review and what's still open: [AUDIT.md](AUDIT.md).

## Ways to use it

| Way | How | Data lives |
|---|---|---|
| **With a family server** (production) | the deployed web app; sign in or create an account | on the server (Neon + Supabase Storage), shared by the family |
| **Demo** | any build without `VITE_API_URL`, or *Look around a sample family first* | in that browser only (localStorage; recordings in IndexedDB) |
| **One file** | double-click `release/FamilyRoots.html` (`npm run build:single`) | in that browser only; works offline, never uses a server |

Signed in, **every screen shows that family's own archive from the server** and every change is saved there
(`src/lib/serverArchive.js`, `src/lib/useServerSync.js`); a new family starts with only its founder, never the sample
family. Signing out removes the account's drafts, "Recent" list and saved recordings from the device
(`src/lib/deviceData.js`). In the demo, **Settings → Restore the sample family** brings the sample back, and
**Settings → Download my archive** / **Privacy → Download my data** keep a copy.

## Run it on your computer

Needs Node 24 and, for the API, Python 3.12.

```bash
npm ci
npm run dev                      # http://localhost:5173 — the demo, no server needed
```

With the API (two terminals; the API's own setup, including the sample family, is in [backend/README.md](backend/README.md)):

```bash
cp .env.example .env.local       # VITE_API_URL=http://localhost:8000/api/v1
npm run dev                      # sign in as mary@example.com / familyroots123 (sample accounts: development only)
```

The web app has one setting, **`VITE_API_URL`**: the API's address ending in `/api/v1`, or unset for the demo. It is
public (it ends up in the JavaScript), so it never holds a secret; all secrets belong to the API (DEPLOY.md →
Environment variables). Real `.env` files are git-ignored; only `*.example` templates are committed.

## Commands

```bash
npm run dev            # development server
npm run lint           # oxlint
npm test               # Vitest (jsdom): components, session and device data, Directory sorting, CSP, vercel.json
npm run build          # dist/ for Vercel: adds the Content-Security-Policy built from VITE_API_URL
npm run build:single   # release/FamilyRoots.html (offline demo)
npm run preview        # serve dist/ at http://localhost:4173
npm run fonts          # after adding an icon: refresh the self-hosted fonts (needs internet once)
```

A Vercel **production** build stops unless `VITE_API_URL` is an `https://…/api/v1` address that isn't localhost.
The app never loads anything from other sites: fonts live in `src/assets/fonts`, and the icon font contains only the
icons the app uses (if a new icon shows as a word, e.g. "home", run `npm run fonts`).

## Tests

| Where | Command | What |
|---|---|---|
| Web app | `npm run lint`, `npm test`, `npm run build` | components, sign-in and session handling, device clean-up on sign-out, Directory sorting, the CSP and `vercel.json` |
| API | `cd backend; python -m pytest; ruff check .` | about 480 tests: see backend/README.md → Tests and lint |
| API on PostgreSQL | `TEST_DATABASE_URL=… python -m pytest` | the same suite with the schema built by the migrations |
| Both together | `python backend/scripts/live_sync_check.py` | the real app against a throwaway API |

CI (`.github/workflows/ci.yml`, Ubuntu) runs all of these on every push, plus PostgreSQL 17 migrations
(`alembic upgrade head` + `alembic check`), the production start-up with the Render start command, and a Vercel-style
production build.

## Security in brief

Each family sees only its own archive (checked on every request, and tested). Passwords are hashed with Argon2;
sign-ins are signed tokens that stop working when the password changes. Photos and recordings are in a private bucket
and reach the browser only through short-lived signed links. Sign-in, sign-up and reset attempts are limited per
visitor. The web app runs under a strict Content-Security-Policy. A production API refuses to start with unsafe
settings (sample keys, SQLite, unencrypted database, out-of-date schema…) and refuses the sample accounts. Details,
and what remains open: [AUDIT.md](AUDIT.md).

## Screens

| Screen | Route | What you can do |
|---|---|---|
| Overview | `#/overview` | Greeting, quick actions, poll, mood check-in, a memory to revisit |
| Family Tree | `#/tree` | Visual tree or accessible list (Alt+L), profiles, verify records |
| Family Directory | `#/directory` | Search and filter; grid, list or sortable table; **export roster (CSV)** |
| Memories | `#/memories` | Upload photos, filter by person and decade, **albums** (choose keepsakes, slideshow) |
| Stories & Audio | `#/stories` | Record (audio kept on the device), write, listen, read aloud |
| Timeline | `#/timeline` | Milestones by era, confirmed vs. approximate dates |
| **Legacy Archive** | `#/legacy` | Certificates, wills, letters with source and custodian; review and verify; **sealed time capsules** |
| **Messages** | `#/messages` | Header with filters (All, Unread, Groups, Private, Starred) and live counts; chat list with pin, mute and mark read/unread; conversations with day separators, an "unread messages" marker, replies that quote the original, reactions, star, copy, delete with undo, read aloud, search in chat; composer with reply bar, emoji, photos, quick replies, dictation and per-chat drafts |
| Calendar | `#/calendar` | Birthdays, anniversaries, gatherings |
| **Family Administration** | `#/admin` | Approve or decline join requests with a role, change roles (the last Admin is protected), invitations, verification queue |
| **Privacy & Consent** | `#/privacy` | Who sees each kind of information (with a "what a cousin sees" preview), protections for under-18s, consent records, access log, download or delete your data |
| Settings & Accessibility | `#/settings` | Theme, accent, text size, Easy-to-Read, motion, language, sound/vibration, read-aloud speed, tour, install |
| Sign in / Join | `#/auth` | Sign in, create account, join with a family code |

## Project layout

```
index.html, vite.config.js   page shell; build: service worker list, CSP (security-headers.js), single-file mode
security-headers.js          the Content-Security-Policy and the production check of VITE_API_URL
vercel.json                  Vercel build, security headers and caching
render.yaml                  Render Blueprint for the API (backend/)
src/
  main.jsx               app entry: providers, fonts, service worker registration
  App.jsx                routes (HashRouter, so URLs look like #/tree?person=anna)
  sw.js                  service worker template (caches this site's own files only, never the API)
  index.css              Tailwind import + design tokens (@theme), dark theme, Easy-to-Read mode
  data.js                the demo's sample archive
  lib/api.js             the only place that calls the API: address, sign-in token, errors
  lib/serverArchive.js   load the family's archive from the API, and turn each change into API calls
  lib/useServerSync.js   keeps the store in step with the server while signed in
  lib/StoreProvider.jsx, lib/store.js        the archive state, undo/redo, kinship helpers
  lib/SessionProvider.jsx, lib/session.js    who is signed in; sign-in, sign-out
  lib/deviceData.js      what an account leaves on the device, and clearing it on sign-out or account change
  lib/useDraft.js        autosaved form drafts
  lib/audioStore.js      recordings in IndexedDB until they are uploaded
  lib/peopleSort.js      the Directory's sort orders
  lib/printStyle.js      the Legacy Archive print window's stylesheet (hashed into the CSP)
  lib/i18n*.js           English, French, Kinyarwanda, Swahili
  components/            shared UI (ui.jsx: Button, Card, Field…), Layout (sidebar, top bar), Modal, Toasts, Tour…
  dialogs/               shared dialogs (invite, add person, add memory, message)
  views/                 one file per screen; views/public/ the public pages; views/messages/ the chat parts
  test/                  Vitest tests
backend/                 the API: see backend/README.md
docs/                    API.md (generated), STORAGE.md, DATA_MIGRATION.md
.github/workflows/ci.yml checks on every push
```

## Styling notes

- Colours, fonts and radii live in `@theme` in `src/index.css`, for example `bg-pine-900`, `text-muted`, `border-line`, `rounded-card`, `text-small`.
- **Easy-to-Read** adds `class="easy"` to `<html>`. That raises the root font size from 15px to 18px and strengthens the muted colours. Because sizes are in rem, the whole UI scales. Use the `easy:` variant for extra tweaks (buttons use `easy:min-h-12`).
- **One app colour** for everything clickable: Family green (`#245b4a`) by default, muted gold (`#c6a66b`, with charcoal text) in the dark theme. Under the pointer things turn a soft tint with coloured text; selected things are filled. Nothing changes colour between sections; the highlighted menu item, page title and icon show where you are. `bg-sec`, `bg-sec-soft`, `text-sec-ink`, `border-sec-line`, the hover/press utilities (`hover-fill`, `hover-tint`, `lift`) and the `primary` button all follow it. Settings → Accent colour swaps it (Heritage, Blue, Ocean, Plum, Clay) for the whole app at once, in both themes. Gold and rose stay for meaning (birthdays and "in loving memory", errors and alerts), always with an icon and words.
- Breakpoints match the original CSS: `sm` = 700px, `md` = 980px, `lg` = 1200px.
- When you override a component's default class from outside, add the `!` modifier (for example `className="p-0!"`). Two Tailwind classes that set the same property are resolved by stylesheet order, not by their order in `className`.

## Interactive features and the HCI principles they serve

| Feature | Where | Principle (lecture) |
| --- | --- | --- |
| **Undo / Redo** (Ctrl+Z / Ctrl+Y, top-bar buttons). Greyed out when there is nothing to undo; the tooltip names the step | Top bar, quick search | Recoverability, liveness (L4–L5) |
| **Activity history**: every change this session, newest first, with "Undo N steps" | History button, account menu | Synthesizability, recoverability (L5) |
| **Breadcrumbs + back / forward** (only the current page, e.g. "Family Tree › Anna") | Above every screen | Observability, "you are here" (L5) |
| **Recent items** in quick search (Ctrl+K), clearable | Command palette, Settings | Recognition over recall (L2) |
| **Alt + letter accelerators**: Alt+M memory, Alt+P person, Alt+R record, Alt+I invite, Alt+A read aloud; grouped shortcut sheet (?) | Everywhere | Efficiency, keyboard accelerators (L3–L4) |
| **Read aloud** (page, selected text, story, memory caption) with adjustable speed | Speaker button, story reader, card menu | Speech output, dyslexia support (L2–L3) |
| **Voice search**: say a name and it searches the Directory | Mic in the search box | Speech input, substitutivity (L3, L5) |
| **Sound and vibration cues**: rising chime for success, low double tone for errors (opt-in) | Settings → Feedback & speech | Multimodal feedback, haptics (L2, L6) |
| **Toasts that wait for you**: pause on hover or focus, time-left bar, errors stay until dismissed | All confirmations | Persistence (L5) |
| **Autosaved drafts** for memory, person and story forms ("Draft restored · Start over") | Dialogs | Recoverability, autosave (L5) |
| **Busy states**: spinner, duplicate clicks ignored, "Preparing 2 photos…"; remove one photo without starting over | Upload dialog, `Button busy` | Responsiveness, avoiding "icon wars" (L3) |
| **Offline banner + live sync status** (icon + words, not colour alone) | Top of page, footer | Observability, colour rules (L2, L5) |
| **Guided tour** that spotlights the real controls; skippable, can be restarted | First visit; account menu / Settings | Learnability, learn by doing (L2, L5) |
| **Context menu** on memory cards (right-click, Menu key or ⋮): favourite, read aloud, copy link, remove… | Memories | Contextual / pop-up menus (L4) |
| **Table view** with sortable column headers (`aria-sort`) | Directory | Representation multiplicity (L5) |
| **Decade chart** that also sets the era filter (slider *or* bars) | Memories | Representation multiplicity, substitutivity (L5) |

Speech features use the browser's Web Speech API (best in Chrome and Edge). Where it is missing, the buttons hide themselves and Settings explains why.
New interface text is in English; the French, Kinyarwanda and Swahili dictionaries fall back to English for these keys until they are translated.
