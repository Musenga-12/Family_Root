# FamilyRoots – Living Archive

A private archive for a family's tree, photos, stories, records and conversations (HCD Group 3).
Built with **React 19**, **Tailwind CSS v4** and **React Router**, bundled by **Vite**.

## Use it

There are three ways to use FamilyRoots. None needs an account or a server of your own.

| Way | How | Works offline | Installable |
|---|---|---|---|
| **One file** | Double-click `release/FamilyRoots.html`. Copy it to a USB stick, email it, open it on any computer. | Yes, always | No |
| **Hosted** | Upload the contents of `dist/` to any static host (GitHub Pages, Netlify, a school server…). | Yes, after the first visit | Yes: *Install FamilyRoots app* in the account menu or Settings |
| **Development** | `npm install` then `npm run dev`, open http://localhost:5173 | – | – |

**With a family server** (the FastAPI backend in `backend/`): copy `.env.example` to `.env.local`, start the backend
(see `backend/README.md`), then `npm run dev`. FamilyRoots then asks you to sign in (demo accounts such as
`mary@example.com` / `familyroots123`). Signed in, **every screen shows that family's own archive from the server**
and every change is saved there (`src/lib/serverArchive.js`, `src/lib/useServerSync.js`): a new family starts with
only its founder, never the sample family. The footer says "Saving…" / "Saved to the family archive"; a change the
server refuses is explained and the screen reloads to what is saved. Visitors who aren't signed in can choose
**Look around a sample family first** on the home page: the sample, on their device only, with a banner saying so.
Without `VITE_API_URL`, nothing changes: no sign-in, everything on the device. To deploy, see [DEPLOY.md](DEPLOY.md).

Without a server, everything you add is saved in the browser on that device (localStorage; recordings in IndexedDB). It starts with the sample
Mackenzie family; **Settings & Accessibility → Restore the sample family** brings it back (and can be undone).
Use **Settings → Download my archive** or **Privacy & Consent → Download my data** to keep a copy.

## Build it

```bash
npm install
npm run build          # hosted version            -> dist/
npm run build:single   # one-file version            -> release/FamilyRoots.html
npm run build:all      # both
npm run preview        # serve dist/ at http://localhost:4173 to try the hosted version
npm run lint
npm run fonts          # after adding an icon: refresh the self-hosted fonts (needs internet once)
```

The app never loads anything from the internet. Fonts live in `src/assets/fonts`, and the icon font contains only the icons
the app uses. If a newly added icon shows as a word (e.g. "home"), run `npm run fonts`.

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
src/
  main.jsx               app entry: providers, fonts, service worker registration
  App.jsx                routes (HashRouter, so URLs look like #/tree?person=anna)
  sw.js                  service worker template (vite.config.js fills in the file list)
  index.css              Tailwind import + design tokens (@theme) + Easy-to-Read mode
  data.js                sample archive: people, memories, stories, milestones, records, messages, members, privacy
  lib/store.jsx          StoreProvider / useStore(): state, update(), kinship helpers
  lib/format.js          dates, durations, cx() class joiner
  components/ui.jsx      Button, Tag, Chip, Card, Avatar, Photo, Field, Input …
  components/Layout.jsx  sidebar, top bar, footer
  components/Modal.jsx   useModal().open(<Dialog/>) with focus trap
  components/Toasts.jsx  useToast()(title, { sub, action, onAction })
  components/AudioPlayer.jsx
  dialogs/               shared dialogs (invite, add person, add memory, message)
  views/                 one file per screen (5.1–5.7 in the design report); views/messages/ holds the chat parts
```

## Styling notes

- Colours, fonts and radii live in `@theme` in `src/index.css`, for example `bg-pine-900`, `text-muted`, `border-line`, `rounded-card`, `text-small`.
- **Easy-to-Read** adds `class="easy"` to `<html>`. That raises the root font size from 15px to 18px and strengthens the muted colours. Because sizes are in rem, the whole UI scales. Use the `easy:` variant for extra tweaks (buttons use `easy:min-h-12`).
- **One app colour**: the whole app uses one navy blue (`#1e3a8a`; a brighter `#4065c9` in the dark theme), chosen to suit every age: over 10:1 contrast with white text, clear for the common colour-vision differences, and familiar as "clickable". Under the pointer things turn a soft slate blue with navy text; clicked or selected things are navy with white text. Nothing changes colour between sections; the highlighted menu item, page title and icon show where you are. `bg-sec`, `bg-sec-soft`, `text-sec-ink`, `border-sec-line`, the hover/press utilities (`hover-fill`, `hover-tint`, `lift`) and the `primary` button all follow it. Settings → Accent colour can swap it (Forest, Ocean, Plum, Clay) for the whole app at once. Gold and rose stay for meaning (birthdays and "in loving memory", errors and alerts), always with an icon and words.
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
