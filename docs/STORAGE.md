# Photos, recordings and scans: Supabase Storage

Uploaded files live in a **private Supabase Storage bucket**. Everything about them that decides who may see them
(which family, who uploaded it, which memory, story or message it belongs to, and that item's visibility) lives in
PostgreSQL (Neon). Render's disk is never used for them: it is wiped on every deploy.

Supabase is used **only for storage** here. The app talks to the Storage REST API with a server-side key; it never
uses Supabase's database, Auth or client libraries, so moving the database to Neon changes nothing for files.

Code: `backend/app/storage.py` (the bucket), `backend/app/routers/uploads.py` (upload, checks, signed links).

## Setting it up (once)

1. Supabase → **Storage → New bucket**: name `family-files` (or set `SUPABASE_BUCKET`), **Public bucket: off**.
   Leave its policies empty: only the server touches it, with the service key, which bypasses policies.
2. Supabase → Project settings → API: copy the **Project URL** and the **service_role** key.
3. On Render (never on Vercel, never in a file in the repository):

   | Variable | Value |
   |---|---|
   | `STORAGE` | `supabase` |
   | `SUPABASE_URL` | the Project URL, e.g. `https://abcd1234.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | the service_role key (**secret**: full access to the project's storage) |
   | `SUPABASE_BUCKET` | `family-files` |

A production server refuses to start with `STORAGE=supabase` but no URL or key.

## How a file goes in

`POST /api/v1/uploads` (multipart, signed in as Admin, Custodian or Contributor):

- **Types:** JPEG, PNG, WebP, GIF, PDF scans, and WebM, Ogg, MP3, M4A or WAV audio. The browser's stated type is
  only a claim: the first bytes must match it (a "photo" that isn't one is refused with 415).
- **Size:** `MAX_IMAGE_MB` (10) for images and scans, `MAX_AUDIO_MB` (50) for recordings, checked while reading, so
  an oversized file is stopped early (413).
- **Where:** `<family id>/<upload id>.<ext>` in the bucket. The upload id is random (`u` + 40 random bits).
- The `upload` row (family, owner, type, size, key) is written after the file is stored; if that fails, the stored
  file is deleted again, so there are no files without a row.

## Who can see a file

1. A file is only ever attached to an item in the **same family** as its uploader, and memories, stories and legacy
   records only take files **their author uploaded** (`family_upload` in `uploads.py`). Another family's upload id
   answers 404, like one that doesn't exist.
2. The API returns a file's link only inside an item the person may see (the item's visibility, minors'
   protections and consent decide; `app/visibility.py`).
3. The link is `<API_BASE_URL>/api/v1/uploads/<id>/file?token=…`: the token is signed with `SECRET_KEY`, names that
   one file, and expires after `FILE_LINK_MINUTES` (12 hours). It can't sign anyone in. `<img>` and `<audio>` can
   open it without the sign-in header; the API checks the token and passes the file on from the bucket.
4. The bucket itself is never exposed: there are no public or Supabase-signed URLs, and the browser never talks to
   Supabase (the web app's Content-Security-Policy doesn't even allow it).

Files are passed on as they arrive (never held whole in the server's memory), with `Range` support so recordings can
be played from the middle, `Cache-Control: private` (the browser may keep a copy for an hour; shared caches may not)
and `nosniff`. Server logs show `token=[hidden]` instead of the token.

Things to know:

- A link works for anyone holding it until it expires (12 hours): like a photo shared in a message, it can be
  forwarded. Shorten `FILE_LINK_MINUTES` for more caution; the app fetches fresh links when it loads.
- Chat messages may attach any image from the **same family** (used to share a photo someone can see into a chat);
  memories, stories and records only their author's own uploads.
- **Files are never removed from the bucket.** Deleting an item hides it (soft delete, so Undo works), and closing an
  account keeps the family's archive; in both cases the file stays stored (only a failed upload is cleaned up).
  Whether closing an account should also erase that person's own uploads is a product and privacy decision that
  hasn't been made yet; until then, removing a file for good is a manual step in Supabase → Storage.

## Backups

Supabase Storage keeps a single copy. Download the bucket regularly and keep it with the database backup of the same
day (docs/DATA_MIGRATION.md → Backups from now on).
