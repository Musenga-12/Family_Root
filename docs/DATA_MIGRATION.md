# Moving the family data from Supabase's database to Neon

The relational data moves from the Supabase PostgreSQL database to Neon. **Files stay where they are**, in the private
Supabase Storage bucket: the database only holds each file's key (`upload.path`, e.g. `3/u1a2b3c4d5.jpg`), so as long
as the new server uses the same `SUPABASE_URL` and `SUPABASE_BUCKET`, every photo, recording and scan keeps working.

**Nobody has checked yet whether the Supabase database holds real families.** Step 1 answers that. Until then, treat
it as holding real, private family information: never change it, and keep it as the fallback until Neon is verified.

Every step here is done by the owner, by hand. Nothing in the app or CI connects to either live database.

## What has to arrive intact

- **36 tables** in the `public` schema (and `alembic_version`, which records the schema version: it must read `0003`).
  In dependency order: family, album, person, minorsetting, user, accesslog, event, invite, joinrequest,
  moodcheckin, notification, passwordreset, personfavorite, poll, prompt, record, suggestion, thread, upload,
  userprefs, userprivacy, eventrsvp, memory, message, milestone, pollvote, promptreply, recordattachment, story,
  threadmember, consent, memoryfavorite, messagereaction, messagestar, reflection, storylove.
- **76 foreign keys** and every index (`alembic check` compares them with the code afterwards).
- **The two id sequences** (`family.id`, `user.id`): new families and accounts must continue after the highest id.
  `pg_dump` / `pg_restore` carry them over.
- **File references:** `upload.path`, and the `upload_id` columns of memory, message, milestone, recordattachment and
  story.
- **Sensitive columns**, copied as they are and never printed: `user.password_hash`, `joinrequest.password_hash`,
  `invite.token`, `passwordreset.token_hash`. Passwords keep working; nobody has to reset theirs.

## You need

- PostgreSQL 17 client tools (`pg_dump`, `pg_restore`, `psql`), at least as new as both servers.
- The Supabase **database** connection string (Project settings → Database → Connection string; "Session pooler"
  works from any network). It contains the database password: type it into the commands, never into a file in
  this repository, a chat or a ticket.
- The Neon project from DEPLOY.md step 1, with its **direct** connection string (the host without `-pooler`).
- An hour without changes to the archive: tell the family, and stop any server still writing to Supabase.

## 1. Look before you move (read-only)

From `backend/`, point the backend at Supabase **for this command only** and run the read-only check. It runs inside
a `READ ONLY` transaction, changes nothing, and prints the host (never the user or password), the migration, the
rows in every table, and how many accounts are sample (`@example.com`) or real:

```powershell
$env:DATABASE_URL = "<Supabase connection string>"   # this PowerShell window only
python scripts/check_database.py > supabase-before.txt
Remove-Item Env:DATABASE_URL
```

Keep `supabase-before.txt` outside the repository (it has row counts, not personal data). It tells you:

- **Real accounts = 0 and only the sample family:** there is nothing to move. Start Neon empty (DEPLOY.md step 1)
  and skip to "Afterwards".
- **Real accounts > 0:** follow the rest of this page.
- **Migration isn't `0003`:** stop and ask: the schema differs from what this code expects.

## 2. Back up Supabase (and keep the backup)

```bash
pg_dump "<Supabase connection string>" --schema=public --no-owner --no-privileges \
        --format=custom --file familyroots-supabase-YYYY-MM-DD.dump
```

`--schema=public` leaves out Supabase's own schemas (auth, storage, …), which FamilyRoots doesn't use. Store the file
somewhere private and encrypted (it contains everyone's data, including password hashes), **not** in the repository
folder (`*.dump` is in `.gitignore` as a safety net, but a backup doesn't belong next to the code). Check it can be read: `pg_restore --list familyroots-supabase-YYYY-MM-DD.dump`
lists the tables.

## 3. Restore into the empty Neon database

Use the **direct** Neon connection, and a database nothing has been written to yet (don't run `alembic upgrade head`
first: the dump brings the schema with it):

```bash
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
           --dbname "<Neon DIRECT connection string>" familyroots-supabase-YYYY-MM-DD.dump
```

`--single-transaction`: either everything arrives, or nothing does. `--no-owner`/`--no-privileges`: the tables
belong to Neon's user, and Supabase's roles (`anon`, `authenticated`) aren't carried over.

If it stops on a **row-level security policy** or a role that doesn't exist on Neon (Supabase can add those), restore
without policies; the server connects as the tables' owner, so they aren't needed:

```bash
pg_restore --list familyroots-supabase-YYYY-MM-DD.dump | grep -v " POLICY " > restore.list
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --use-list restore.list \
           --dbname "<Neon DIRECT connection string>" familyroots-supabase-YYYY-MM-DD.dump
```

## 4. Verify before switching over

From `backend/`, with the Neon direct string for these commands only:

```powershell
$env:DATABASE_URL = "<Neon DIRECT connection string>"
$env:DATABASE_URL_DIRECT = "<Neon DIRECT connection string>"   # Alembic prefers this one
python scripts/check_database.py > neon-after.txt
python -m alembic current      # must say 0003 (head)
python -m alembic check        # "No new upgrade operations detected."
Remove-Item Env:DATABASE_URL, Env:DATABASE_URL_DIRECT
```

Checklist:

- [ ] `neon-after.txt` shows the **same row count in every table** as `supabase-before.txt`.
- [ ] Migration `0003 (head)`; `alembic check` reports nothing to change.
- [ ] The restore reported no errors (foreign keys are checked as they are restored: a broken reference stops it).
- [ ] After deploying (DEPLOY.md), a real member signs in with their **existing password**.
- [ ] Their photos and recordings open (same bucket, so the stored keys still match).
- [ ] Something new (a memory, a message) saves, and gets a new id (sequences continued).
- [ ] The number of rows in `upload` is close to the number of files in the bucket (Supabase → Storage); files
      without a row can exist after interrupted uploads, rows without a file shouldn't.

## Afterwards

- **Sample accounts.** If `neon-after.txt` lists sample (`@example.com`) accounts, they can't sign in on the
  production server, but shouldn't stay. Preview with `python scripts/retire_sample_accounts.py`, then, with the
  owner's approval, `--apply`: it marks them "access removed" (reversible; nothing is deleted).
- **New `SECRET_KEY`.** The new server gets its own (Render generates it), so everyone signs in once more. Passwords
  are unchanged.
- **Keep Supabase's database as it is** (read-only) for a few weeks as the fallback: to go back, point the server's
  `DATABASE_URL` at it again. Delete it only once Neon has run without problems and a Neon backup exists. Supabase
  Storage stays in use: never delete the bucket.

## Backups from now on

- **Neon** keeps a history you can restore to a point in time (the window depends on the plan; see the project's
  Backup & Restore settings), and can branch a copy to inspect safely.
- In addition, take a regular `pg_dump` (as in step 2, against Neon's direct string) and keep it off Neon.
- **Files:** Supabase Storage keeps one copy. Download the bucket regularly (Supabase dashboard or its Storage API)
  and keep it with the database dump from the same day: a database row without its file shows a broken photo.
