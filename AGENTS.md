# SHTF Planner: agent guide

A phone-first, offline-first PWA (Android first) for household emergency preparedness. The user
describes their home, household and risks; the app says what to have and what is missing, tracks
stores and kit, and keeps a preparedness score. One household document lives in the browser
(IndexedDB) and syncs through the user's own Google Drive. There is no server. UK-first. Sister
project of the SHTF game (`shtf-game`). Working title.

## Stack

- Vite + TypeScript (strict) + React 19; React Router (`BrowserRouter`; the PWA serves
  `index.html` for every path). Plain CSS with theme variables in `src/styles.css`, dark mode by
  `prefers-color-scheme`, 44 px minimum tap targets, no component library.
- `vite-plugin-pwa` (`registerType: 'autoUpdate'`) for the manifest, service worker and the
  "update available" toast (`src/app/UpdateToast.tsx`).
- Zod validates the document and the content packs. `idb` wraps IndexedDB.
- Vitest (unit, React Testing Library with jsdom where a test says so) and Playwright (`e2e/`).
- Cloudflare Pages hosting, deployed by GitHub Actions. See `docs/build/README.md`.

## Layout

| Path             | What                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| `src/app/`       | React screens, routing, the shell, the `?debug=1` hook                              |
| `src/engine/`    | Pure functions over the document and packs (targets, coverage, gaps, score)         |
| `src/model/`     | TypeScript types and Zod schemas of the document and the packs                      |
| `src/packs/`     | JSON content packs and their loader                                                 |
| `src/store/`     | The document store (CRDT + IndexedDB) and later Drive sync                          |
| `src/util/`      | Small pure helpers                                                                  |
| `src/generated/` | Build output of `scripts/releases.mjs` (gitignored)                                 |
| `test/`          | Unit tests that aren't next to their source, fixtures, helpers                      |
| `e2e/`           | Playwright                                                                          |
| `scripts/`       | `releases.mjs` (bake the changelog), `icons.mjs` (PWA icons), `setup-cloudflare.sh` |
| `docs/`          | `build/` (environments, CI), `features/` (one hub per feature)                      |

## Rules

- **The lint fence** (ESLint `no-restricted-imports` per directory; `test/lint-fence.test.ts`
  proves each rule fails on a bad import). It keeps the logic testable without a browser:
  - `src/model` imports only `zod` and `src/model`.
  - `src/engine` imports only `src/model`, `src/util` and `src/engine`; never React, `src/app`,
    `src/store`, `src/packs`, `idb`, or anything Drive or Google.
  - `src/store` never imports `src/app` or React.
  - `src/app` may import everything.
- **Privacy.** Nothing leaves the browser except the user's own document to the user's own Google
  Drive. No analytics, no server, no third-party calls at runtime. The changelog is baked at build
  time from GitHub Releases, never fetched at runtime.
- **Never commit the owner's household data.** Fixtures and examples use an invented family in
  Biggar.
- **No status, progress or changelog files in the repo.** Release notes live in GitHub Releases;
  planning notes live in `tmp/` (gitignored, shared across worktrees).
- Docs ship in the same PR as the behaviour (`docs/features/`).

## Checks

- `npm run check`: format:check, lint, typecheck, test, build. Must be green before a PR.
- `npm run test:e2e`: Playwright against `vite preview` (build first). Port 4173, or `E2E_PORT`;
  a server already on the port is reused locally, so parallel worktrees each set their own port.
  Locally it uses system Chrome; CI installs Chromium.
- `npm run releases` bakes `src/generated/releases.json`. The `pre*` npm hooks create an empty one
  if missing, so a fresh clone builds.

## Build constants and the debug hook

`__BUILD_ENV__` (`'local' | 'preview' | 'dev' | 'next' | 'staging' | 'prod'`; the `main` workflow
passes `BUILD_ENV=main`, which `src/util/build-env.ts` maps to `next`; `preview` is a PR deploy) and `__BUILD_VERSION__`
(`local`, a short SHA for continuous builds, a bare SemVer tag for releases) are defined in
`vite.config.ts` and declared in `src/vite-env.d.ts`. The footer shows both.

With `?debug=1`, `window.__shtf` exists (`src/app/debug.ts`). Later phases hang test hooks on it;
without the flag nothing is installed.

## Git

- Branches `pskil/<slug>`, conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).
- One PR per phase. Stacked PRs are rebased, never merged up. Never commit to `main`.
