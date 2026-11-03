# FamilyRoots – React + Tailwind

The FamilyRoots HCD demo (Group 3), rebuilt with **React 19**, **Tailwind CSS v4** and **React Router**, bundled by **Vite**.
It is a port of the vanilla-JS demo in `../familyroots-demo`, with the same screens, data and behaviour.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Demo data is saved in the browser's localStorage. **Settings & Accessibility → Reset demo data** restores the sample Mackenzie family.

## Project layout

```
src/
  main.jsx               routes (HashRouter, so URLs look like #/tree?person=anna)
  index.css              Tailwind import + design tokens (@theme) + Easy-to-Read mode
  data.js                seed data: people, memories, stories, milestones
  lib/store.jsx          StoreProvider / useStore(): state, update(), kinship helpers
  lib/format.js          dates, durations, cx() class joiner
  components/ui.jsx      Button, Tag, Chip, Card, Avatar, Photo, Field, Input …
  components/Layout.jsx  sidebar, top bar, footer
  components/Modal.jsx   useModal().open(<Dialog/>) with focus trap
  components/Toasts.jsx  useToast()(title, { sub, action, onAction })
  components/AudioPlayer.jsx
  dialogs/               shared dialogs (invite, add person, add memory, message)
  views/                 one file per screen (5.1–5.7 in the design report)
```

## Styling notes

- Colours, fonts and radii live in `@theme` in `src/index.css`, for example `bg-pine-900`, `text-muted`, `border-line`, `rounded-card`, `text-small`.
- **Easy-to-Read** adds `class="easy"` to `<html>`. That raises the root font size from 15px to 18px and strengthens the muted colours. Because sizes are in rem, the whole UI scales. Use the `easy:` variant for extra tweaks (buttons use `easy:min-h-12`).
- Breakpoints match the original CSS: `sm` = 700px, `md` = 980px, `lg` = 1200px.
- When you override a component's default class from outside, add the `!` modifier (for example `className="p-0!"`). Two Tailwind classes that set the same property are resolved by stylesheet order, not by their order in `className`.
