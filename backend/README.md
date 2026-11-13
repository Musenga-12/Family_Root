# FamilyRoots API (FastAPI)

The backend for the FamilyRoots React app in the parent folder.

## First-time setup (Windows, PowerShell)

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
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
    overview.py  /overview, /polls, /prompts
  realtime.py    /ws live updates for open chats
  visibility.py  who can see "All Family Branches" / "Immediate Family" / "Only Me (draft)" items
uploads/         stored files (git-ignored)
seed.py          sample data loader
seed_data.json   copy of SEED from src/data.js
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

## Adding a resource

Copy `routers/people.py`: add the table to `models.py`, create `routers/<name>.py`, and register it in `main.py`.
Always filter by `user.family_id` so one family can never see another's data.
