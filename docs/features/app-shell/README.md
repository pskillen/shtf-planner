# App shell

**Status:** Done
**Tracking:** none (no tickets yet)

The frame the screens live in. The Home and More tabs hold the setup screens (see [Setup screens](../setup/README.md)); Stores, Gaps and Score are the [inventory](../inventory/README.md) and [gaps and score](../gaps-and-score/README.md) screens.

The frame every later screen lives in: an installable offline PWA, a landing page and a build footer.

## Map

| Piece        | Where                          | Behaviour                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page | `/` (`src/app/Landing.tsx`)    | Name, a beta note, a Start button to `/app`, an Android install hint and the Changelog. Shows the footer.                                                                                                                                                            |
| Shell        | `/app/*` (`src/app/Shell.tsx`) | Top bar (app name and the [sync status pill](../drive-sync/README.md)), a bottom nav with Home, Stores, Gaps, Score and More, and the footer.                                                                                                                        |
| Footer       | `src/app/Footer.tsx`           | `SHTF Planner · {env} · {version}`. `local · local` on a dev machine; a short SHA on continuous builds; the bare tag on releases.                                                                                                                                    |
| PWA          | `vite.config.ts`               | Manifest (standalone, 192 and 512 px icons plus a padded maskable one), service worker precaching the built app (about 27 MB since the date reader: its wasm runtime, models and worker; the per-file limit is 24 MiB, under Cloudflare's 25 MiB), `prompt` updates. |
| Toast region | `src/app/components/Toast.tsx` | Every toast (undo, sync, update) is drawn into one fixed region above the tab bar that stacks whatever is showing, newest last, with no overlap and no gap when one goes.                                                                                            |
| Update toast | `src/app/UpdateToast.tsx`      | "Update available" with Reload / Later when a new service worker is waiting. Reload applies it; the page is never reloaded without the user asking, so an edit in progress is safe.                                                                                  |
| Changelog    | `scripts/releases.mjs`         | GitHub Releases baked into `src/generated/releases.json` at build time; bodies shown as plain paragraphs; "No releases yet." if none.                                                                                                                                |
| Debug hook   | `src/app/debug.ts`             | `?debug=1` installs `window.__shtf` for tests (see the data model doc).                                                                                                                                                                                              |

## Notes

- Routing is client-side (`BrowserRouter`); the service worker falls back to `index.html`, so deep
  links like `/app/stores` work offline.
- Styling is `src/styles.css`: theme variables, dark mode by `prefers-color-scheme`, tap targets of
  at least 44 px, safe-area insets for the bottom nav.
- Icons are generated from `public/favicon.svg` by `npm run icons` and committed.

## Known gaps

Markdown rendering of release bodies; any caching beyond the app bundle (content packs will ship
inside the bundle when they land).
