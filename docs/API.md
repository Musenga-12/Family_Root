# FamilyRoots API reference

Generated from the code by `backend/scripts/api_reference.py`. Don't edit by hand: change the code (route docstrings,
dependencies, models), then run `python scripts/api_reference.py` in `backend/`. A test fails while this file is out
of date. In development the same API is browsable, with request and response schemas, at `http://localhost:8000/docs`
(hidden in production).

## Conventions

- **Base address:** `<API_BASE_URL>/api/v1`, e.g. `https://api.example.org/api/v1` (the web app's `VITE_API_URL`).
- **Signing in:** `POST /auth/login` returns `{"access_token": "…", "token_type": "bearer"}`. Send it on every other
  call as `Authorization: Bearer <token>`. It lasts `ACCESS_TOKEN_MINUTES` (a day by default), and stops working at
  once when the password is changed or the member's access is removed.
- **Family isolation:** every signed-in call only ever sees and changes the caller's own family. An id from another
  family answers 404, exactly like an id that doesn't exist.
- **Roles:** Admin, Custodian, Contributor, Viewer. "Signed in" means any role; a role list means only those.
  Privacy choices (who may see an item, a minor's protections) apply on top of roles, to Admins too.
- **Attempt limits** in the table are per visitor address. Signing in is also limited to 10 attempts per account
  (email address) per 15 minutes, whatever the address.
- **Bodies** are JSON unless marked *multipart* (file uploads). PATCH bodies hold only the fields to change.
- **Files:** responses hold short-lived signed links (`…/uploads/{id}/file?token=…`, `FILE_LINK_MINUTES`) that a
  browser can open directly in `<img>` / `<audio>`. They support `Range` requests (seeking in recordings).
- **Errors** are always `{"detail": "a plain sentence"}` (or, for 422, FastAPI's list of field problems), never
  server internals:

| Status | Meaning |
|---|---|
| 400 | The request can't be done as asked (e.g. an expired reset link) |
| 401 | Not signed in, or the sign-in has expired: sign in again |
| 403 | Signed in, but this role (or this person's privacy choice) doesn't allow it |
| 404 | No such item in your family (also for another family's ids) |
| 409 | Conflicts with something already saved (e.g. an email that already has an account) |
| 413 / 415 | File too large / not an accepted type, or its contents don't match its type |
| 422 | A field is missing or invalid |
| 429 | Too many attempts: wait (`Retry-After` seconds) |
| 502 / 503 | File storage or the database is unavailable right now: try again |

## Endpoints (152)

Paths are relative to the base address (`/health` is at the server's root).

### admin

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/admin/summary` | The counts at the top of the Family Administration screen. | Admin |  | `Summary` 200 |  |
| GET | `/members` | Everyone with access and their role. Email addresses are shown to Admins only. | Signed in |  | list of `MemberOut` 200 |  |
| PATCH | `/members/{uid}` | Change role | Admin | `RoleIn` | `MemberOut` 200 |  |
| DELETE | `/members/{uid}` | Remove access. Their stories, photos and messages stay in the archive. Undo with /restore. | Admin |  |  204 |  |
| POST | `/members/{uid}/restore` | Restore member | Admin |  | `MemberOut` 200 |  |
| POST | `/members/{uid}/reset-link` | Help a relative who can't sign in (or a newly approved member without a password): a one-time link, valid for 3 days, to pass on in person or by phone. | Admin |  | `ResetLinkOut` 200 |  |
| GET | `/join-requests` | List requests | Admin |  | list of `RequestOut` 200 |  |
| POST | `/join-requests/{rid}/approve` | Approve | Admin | `ApproveIn` | `MemberOut` 200 |  |
| POST | `/join-requests/{rid}/decline` | Decline | Admin |  |  204 |  |
| POST | `/join-requests/{rid}/reopen` | Undo an approval or a decline. Undoing an approval removes the new account's access again. | Admin |  | `RequestOut` 200 |  |
| GET | `/invites` | Admins see every invitation; others see the ones they sent. Pending only, unless include_all. | Signed in |  | list of `InviteOut` 200 |  |
| POST | `/invites` | Create invite | Admin, Custodian, Contributor | `InviteIn` | `InviteOut` 201 |  |
| POST | `/invites/{iid}/resend` | Resend invite | Signed in |  | `InviteOut` 200 |  |
| DELETE | `/invites/{iid}` | The link stops working at once. Undo with /restore. | Signed in |  |  204 |  |
| POST | `/invites/{iid}/restore` | Restore invite | Signed in |  | `InviteOut` 200 |  |
| GET | `/invites/by-token/{token}` | Public: lets the sign-up page greet the invited person and fill in their name and email. | Public |  | `InviteInfo` 200 | 20 per 5 min |

### albums

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/albums` | List albums | Signed in |  | list of `AlbumOut` 200 |  |
| GET | `/albums/{aid}` | Read album | Signed in |  | `AlbumOut` 200 |  |
| POST | `/albums` | Create album | Admin, Custodian, Contributor | `AlbumCreate` | `AlbumOut` 201 |  |
| PATCH | `/albums/{aid}` | Update album | Admin, Custodian, Contributor | `AlbumUpdate` | `AlbumOut` 200 |  |
| PUT | `/albums/{aid}/items` | Replace the album's contents (the "Edit album" picker). Items this user can't see are kept, so editing an album never silently drops someone else's private memory. | Admin, Custodian, Contributor | `ItemsIn` | `AlbumOut` 200 |  |
| DELETE | `/albums/{aid}` | Deletes the album only; its memories stay in the archive. | Admin, Custodian |  |  204 |  |

### auth

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | Register | Public | `RegisterIn` | `RegisterOut` 201 | 10 per 60 min |
| POST | `/auth/login` | Login | Public | `LoginIn` | `TokenOut` 200 | 20 per 5 min |
| POST | `/auth/token` | The same as /auth/login, but as an OAuth2 password form so Swagger UI can call it. Put the email address in `username`. The React app uses /auth/login. | Public |  | `TokenOut` 200 | 20 per 5 min |
| POST | `/auth/family-code/verify` | Verify code | Public | `CodeIn` |  200 | 10 per 5 min |
| GET | `/me` | Me | Signed in |  | `MeOut` 200 |  |
| PATCH | `/me` | Update me | Signed in | `MeUpdate` | `MeOut` 200 |  |
| GET | `/me/preferences` | Read prefs | Signed in |  | `PrefsIO` 200 |  |
| PUT | `/me/preferences` | Save prefs | Signed in | `PrefsIO` | `PrefsIO` 200 |  |
| GET | `/auth/email-status` | Whether this server can email people, so the sign-in pages can be honest before anyone types. `state` is development, production-configured or production-not-configured; nothing about the provider's settings is shown. | Public |  |  200 |  |
| POST | `/auth/forgot-password` | Emails a one-time link to choose a new password. Answers the same way, and takes about as long, whether or not the address has an account, so nobody can use it to find out who is registered. It only says a link is on its way when an email really was handed to the provider; when sending isn't possible it says so to everyone. | Public | `ForgotIn` |  202 | 5 per 15 min |
| GET | `/auth/reset-password/status` | Whether a reset link can still be used: valid, expired, used or invalid. Says nothing about any account. | Public |  |  200 | 30 per 15 min |
| POST | `/auth/reset-password` | Reset password | Public | `ResetIn` | `TokenOut` 200 | 10 per 15 min |
| POST | `/auth/change-password` | Returns a fresh token for this device; other devices are signed out. | Signed in | `ChangeIn` | `TokenOut` 200 | 10 per 15 min |

### calendar

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/calendar` | Birthdays, anniversaries and gatherings between two dates, soonest first. A month grid: ?from=2026-11-01&to=2026-11-30. Upcoming (Overview): no parameters. | Signed in |  | list of `CalendarItem` 200 |  |
| GET | `/events` | List events | Signed in |  | list of `EventOut` 200 |  |
| GET | `/events/{eid}` | Read event | Signed in |  | `EventOut` 200 |  |
| POST | `/events` | The organiser is counted as going, as in the Add gathering dialog. | Admin, Custodian, Contributor | `EventCreate` | `EventOut` 201 |  |
| PATCH | `/events/{eid}` | Update event | Signed in | `EventUpdate` | `EventOut` 200 |  |
| DELETE | `/events/{eid}` | Cancel a gathering (kept, so Undo and RSVPs survive). | Signed in |  |  204 |  |
| POST | `/events/{eid}/restore` | Restore event | Signed in |  | `EventOut` 200 |  |
| PUT | `/events/{eid}/rsvp` | Answer yes, maybe or no (no body means yes). Answering again changes it. Anyone in the family can RSVP, Viewers included; DELETE takes the answer back. | Signed in | `app.routers.calendar.RsvpIn | None` | `EventOut` 200 |  |
| DELETE | `/events/{eid}/rsvp` | Un rsvp | Signed in |  | `EventOut` 200 |  |
| GET | `/events/{eid}/attendees` | Who said yes (and who said maybe, flagged), in the order they answered. | Signed in |  | list of `Attendee` 200 |  |

### health

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/health` | For uptime checks: 200 when the API and its database answer, 503 when the database doesn't. | Public |  |  200 |  |

### legacy

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/records` | List records | Signed in |  | list of `RecordOut` 200 |  |
| GET | `/records/{rid}` | Read record | Signed in |  | `RecordOut` 200 |  |
| POST | `/records` | New records start "awaiting review". Setting sealedUntil makes it a time capsule. | Admin, Custodian, Contributor | `RecordCreate` | `RecordOut` 201 |  |
| PATCH | `/records/{rid}` | Update record | Signed in | `RecordUpdate` | `RecordOut` 200 |  |
| POST | `/records/{rid}/verify` | Verify record | Admin, Custodian |  | `RecordOut` 200 |  |
| POST | `/records/{rid}/reopen` | Undo "verified": the record goes back to awaiting review. | Admin, Custodian |  | `RecordOut` 200 |  |
| POST | `/records/{rid}/attachments` | Add a scan or photo of the original (image or PDF). Changes what was checked, so the record needs reviewing again. | Signed in | `AttachmentIn` | `RecordOut` 201 |  |
| DELETE | `/records/{rid}/attachments/{upload_id}` | Remove a file from the record. The file itself is kept, so attaching it again undoes this. | Signed in |  | `RecordOut` 200 |  |
| DELETE | `/records/{rid}` | Delete record | Signed in |  |  204 |  |
| POST | `/records/{rid}/restore` | Restore record | Signed in |  | `RecordOut` 200 |  |

### memories

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/memories` | List memories | Signed in |  | list of `MemoryOut` 200 |  |
| GET | `/memories/{mid}` | Read memory | Signed in |  | `MemoryOut` 200 |  |
| POST | `/memories` | Create memories | Admin, Custodian, Contributor | `MemoryCreate` | list of `MemoryOut` 201 |  |
| PATCH | `/memories/{mid}` | Update memory | Signed in | `MemoryUpdate` | `MemoryOut` 200 |  |
| DELETE | `/memories/{mid}` | Delete memory | Signed in |  |  204 |  |
| POST | `/memories/{mid}/restore` | Undo for a removal. | Signed in |  | `MemoryOut` 200 |  |
| PUT | `/memories/{mid}/favorite` | Favorite | Signed in |  |  204 |  |
| DELETE | `/memories/{mid}/favorite` | Unfavorite | Signed in |  |  204 |  |

### messages

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/threads` | Your conversations: pinned first, then most recent. | Signed in |  | list of `ThreadOut` 200 |  |
| POST | `/threads/read-all` | Read all | Signed in |  |  204 |  |
| POST | `/threads` | Send a first message. With one recipient, the existing private chat is reused (and un-hidden) if there is one. | Signed in | `NewThreadIn` | `ThreadOut` 201 |  |
| GET | `/threads/{tid}` | Read thread | Signed in |  | `ThreadOut` 200 |  |
| PATCH | `/threads/{tid}` | Update thread | Signed in | `ThreadUpdate` | `ThreadOut` 200 |  |
| POST | `/threads/{tid}/read` | Call when a chat is opened; turns the sender's ticks to "read" once everyone has seen a message. | Signed in |  |  204 |  |
| DELETE | `/threads/{tid}` | Group: leave it. Private chat: delete it for you (it returns, empty, if they write again). | Signed in |  |  204 |  |
| POST | `/threads/{tid}/restore` | Undo for leaving a group or deleting a chat. | Signed in |  | `ThreadOut` 200 |  |
| GET | `/threads/{tid}/messages` | Oldest first. Load more with ?before=<id of the oldest message you have>. | Signed in |  | `MessagePage` 200 |  |
| POST | `/threads/{tid}/messages` | Send | Signed in | `SendIn` | `MessageOut` 201 |  |
| DELETE | `/threads/{tid}/messages` | "Clear chat": hides the history for you only. Undo with POST /threads/{tid}/messages/restore. | Signed in |  |  204 |  |
| POST | `/threads/{tid}/messages/restore` | Unclear chat | Signed in |  |  204 |  |
| DELETE | `/threads/{tid}/messages/{mid}` | "Delete for everyone": sender only. Everyone then sees "This message was deleted". | Signed in |  | `MessageOut` 200 |  |
| POST | `/threads/{tid}/messages/{mid}/restore` | Restore message | Signed in |  | `MessageOut` 200 |  |
| PUT | `/threads/{tid}/messages/{mid}/reaction` | One reaction per person per message; sending a new emoji replaces the old one. | Signed in | `ReactionIn` | `MessageOut` 200 |  |
| DELETE | `/threads/{tid}/messages/{mid}/reaction` | Unreact | Signed in |  | `MessageOut` 200 |  |
| PUT | `/threads/{tid}/messages/{mid}/star` | Star | Signed in |  |  204 |  |
| DELETE | `/threads/{tid}/messages/{mid}/star` | Unstar | Signed in |  |  204 |  |

### notifications

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/notifications` | Newest first, with the number still unread (for the badge on the bell). | Signed in |  | `NotificationList` 200 |  |
| POST | `/notifications/{nid}/read` | Mark read | Signed in |  | `NotificationOut` 200 |  |
| POST | `/notifications/{nid}/unread` | Mark unread | Signed in |  | `NotificationOut` 200 |  |
| POST | `/notifications/read-all` | Mark all read | Signed in |  |  204 |  |

### overview

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/polls/current` | Read current poll | Signed in |  | `app.routers.overview.PollOut | None` 200 |  |
| POST | `/polls` | Start a new poll; the previous one closes. | Admin, Custodian | `PollCreate` | `PollOut` 201 |  |
| PUT | `/polls/{pid}/vote` | One vote per person; voting again changes it. Viewers can vote. | Signed in | `VoteIn` | `PollOut` 200 |  |
| DELETE | `/polls/{pid}/vote` | Unvote | Signed in |  | `PollOut` 200 |  |
| POST | `/polls/{pid}/close` | Close poll | Admin, Custodian |  | `PollOut` 200 |  |
| GET | `/prompts/current` | Read current prompt | Signed in |  | `app.routers.overview.PromptOut | None` 200 |  |
| POST | `/prompts` | Set this week's question. | Admin, Custodian | `PromptCreate` | `PromptOut` 201 |  |
| POST | `/prompts/{pid}/replies` | Share a memory in answer to the prompt. Everyone can reply, Viewers included. | Signed in | `ReplyIn` | `ReplyOut` 201 |  |
| DELETE | `/prompts/{pid}/replies/{rid}` | Delete reply | Signed in |  |  204 |  |
| GET | `/mood` | Read mood | Signed in |  | `MoodOut` 200 |  |
| PUT | `/mood` | "How are you feeling today?" One answer per person per day; answering again changes it. Viewers can answer. | Signed in | `MoodIn` | `MoodOut` 200 |  |
| DELETE | `/mood` | Take back today's answer (Undo). | Signed in |  | `MoodOut` 200 |  |
| GET | `/overview` | Everything the Overview shows, in one request. Each part follows the same privacy rules as its own endpoint. | Signed in |  |  200 |  |

### people

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/people` | List people | Signed in |  | list of `PersonOut` 200 |  |
| GET | `/people/{pid}` | Read person | Signed in |  | `PersonOut` 200 |  |
| POST | `/people` | Create person | Admin, Custodian, Contributor | `PersonCreate` | `PersonOut` 201 |  |
| PATCH | `/people/{pid}` | Update person | Admin, Custodian, Contributor | `PersonUpdate` | `PersonOut` 200 |  |
| DELETE | `/people/{pid}` | Delete person | Admin, Custodian |  |  204 |  |
| POST | `/people/{pid}/restore` | Restore person | Admin, Custodian |  | `PersonOut` 200 |  |
| POST | `/people/{pid}/verify` | Verify person | Admin, Custodian |  | `PersonOut` 200 |  |
| POST | `/people/{pid}/reopen` | Reopen person | Admin, Custodian |  | `PersonOut` 200 |  |
| PUT | `/people/{pid}/favorite` | Star | Signed in |  |  204 |  |
| DELETE | `/people/{pid}/favorite` | Unstar | Signed in |  |  204 |  |
| POST | `/people/{pid}/suggestions` | Suggest | Signed in | `SuggestionIn` | `SuggestionOut` 201 |  |
| GET | `/suggestions` | Admins and Custodians see the family's suggestions; everyone else sees their own. | Signed in |  | list of `SuggestionOut` 200 |  |
| PATCH | `/suggestions/{sid}` | Decide | Admin, Custodian | `DecisionIn` | `SuggestionOut` 200 |  |

### privacy

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/privacy` | Read privacy | Signed in |  | `PrivacyOut` 200 |  |
| PATCH | `/privacy/categories` | Who can see each kind of your information, e.g. {"birthdays": "Immediate Family"}. | Signed in | `dict` | `PrivacyOut` 200 |  |
| PATCH | `/privacy/mine` | Set mine | Signed in | `MineIn` | `PrivacyOut` 200 |  |
| PATCH | `/privacy/minors/{pid}` | Parents (guardians) and Admins can change a minor's protections. | Signed in | `MinorIn` | `MinorOut` 200 |  |
| GET | `/consents` | Admins see every record; others see the ones about them, their children, or that they asked for. | Signed in |  | list of `ConsentOut` 200 |  |
| POST | `/consents` | Request consent | Admin, Custodian, Contributor | `ConsentCreate` | `ConsentOut` 201 |  |
| PATCH | `/consents/{cid}` | Give or withdraw consent. Withdrawing consent for a photo makes that memory private to whoever added it. | Signed in | `ConsentDecision` | `ConsentOut` 200 |  |
| POST | `/consents/{cid}/remind` | Remind | Signed in |  | `ConsentOut` 200 |  |
| GET | `/access-log` | Who opened, listened to or downloaded your things, newest first. | Signed in |  | list of `LogOut` 200 |  |
| POST | `/activity` | Call when someone plays a recording or downloads a photo, so its owner can see it in their access log. | Signed in | `ActivityIn` |  204 |  |
| GET | `/me/export` | Everything about you, as a JSON download ("Download my data"). | Signed in |  |  200 |  |
| GET | `/admin/export` | The whole family archive (Settings: "Export the archive"). Admins only. Files are listed, not included. Privacy choices still apply (see visibility.py: Admins get no exception): others' drafts and items shared with someone else's immediate family are left out, and people appear as the Admin sees them in the tree. | Admin |  |  200 |  |
| POST | `/me/deletion-request` | Close your account in 30 days. Until then you can change your mind. | Signed in |  | `DeletionOut` 200 |  |
| DELETE | `/me/deletion-request` | Cancel deletion | Signed in |  |  204 |  |

### realtime

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| WS | `/ws` | Live chat events (`message.new`, `message.updated`, `thread.read`); the browser sends `ping`, the server answers `pong` | Signed in (`?token=`) |  |  |  |

### stories

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/stories` | List stories | Signed in |  | list of `StoryOut` 200 |  |
| GET | `/stories/{sid}` | Read story | Signed in |  | `StoryOut` 200 |  |
| POST | `/stories` | Create story | Admin, Custodian, Contributor | `StoryCreate` | `StoryOut` 201 |  |
| POST | `/stories/audio` | The Recording Studio's Save button: the audio and its details in one request. | Admin, Custodian, Contributor | multipart: `file`, `title`, `duration`, `transcript`, `category`, `visibility`, `prompt`, `tag`, `recorded` | `StoryOut` 201 |  |
| PATCH | `/stories/{sid}` | Update story | Signed in | `StoryUpdate` | `StoryOut` 200 |  |
| POST | `/stories/{sid}/verify` | Mark a story as checked by the family's curators (the "verified" badge). | Admin, Custodian |  | `StoryOut` 200 |  |
| POST | `/stories/{sid}/reopen` | Undo "verified": the story goes back to unchecked. | Admin, Custodian |  | `StoryOut` 200 |  |
| DELETE | `/stories/{sid}` | Delete story | Signed in |  |  204 |  |
| POST | `/stories/{sid}/restore` | Restore story | Signed in |  | `StoryOut` 200 |  |
| PUT | `/stories/{sid}/love` | Love | Signed in |  | `StoryOut` 200 |  |
| DELETE | `/stories/{sid}/love` | Unlove | Signed in |  | `StoryOut` 200 |  |
| GET | `/stories/{sid}/reflections` | List reflections | Signed in |  | list of `ReflectionOut` 200 |  |
| POST | `/stories/{sid}/reflections` | Anyone who can see a story may reply to it, Viewers included. | Signed in | `ReflectionIn` | `ReflectionOut` 201 |  |
| DELETE | `/stories/{sid}/reflections/{rid}` | Delete reflection | Signed in |  |  204 |  |

### timeline

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| GET | `/milestones` | Newest first. `from_year`/`to_year` match the Timeline's era filter. | Signed in |  | list of `MilestoneOut` 200 |  |
| GET | `/milestones/{mid}` | Read milestone | Signed in |  | `MilestoneOut` 200 |  |
| POST | `/milestones` | Create milestone | Admin, Custodian, Contributor | `MilestoneCreate` | `MilestoneOut` 201 |  |
| PATCH | `/milestones/{mid}` | Update milestone | Signed in | `MilestoneUpdate` | `MilestoneOut` 200 |  |
| POST | `/milestones/{mid}/verify` | Confirm the date against a record. An estimated date can't be verified until it is exact. | Admin, Custodian |  | `MilestoneOut` 200 |  |
| POST | `/milestones/{mid}/reopen` | Undo "verified": the date shows as reported again until it is checked. | Admin, Custodian |  | `MilestoneOut` 200 |  |
| DELETE | `/milestones/{mid}` | Delete milestone | Signed in |  |  204 |  |
| POST | `/milestones/{mid}/restore` | Restore milestone | Signed in |  | `MilestoneOut` 200 |  |

### uploads

| Method | Path | Purpose | Who may call it | Request body | Response | Attempt limit |
|---|---|---|---|---|---|---|
| POST | `/uploads` | Upload file | Admin, Custodian, Contributor | multipart: `file` | `UploadOut` 201 |  |
| GET | `/uploads/{upload_id}` | Your own uploads. Everyone else gets a file's link with the memory, story or message it belongs to, so the item's visibility decides who can open it. | Signed in |  | `UploadOut` 200 |  |
| GET | `/uploads/{upload_id}/file` | Download | Signed file link (`?token=`) |  |  200 |  |
