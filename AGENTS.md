# SHTF Planner: agent guide

A phone-first, offline-first PWA (Android first) for household emergency preparedness. The user
describes their home, household and risks; the app says what to have and what is missing, tracks
stores and kit, and keeps a preparedness score. One household document lives in the browser
(IndexedDB) and syncs through the user's own Google Drive. There is no server. UK-first. Sister
project of the SHTF game (`shtf-game`). Working title.

Read next: [`docs/design.md`](docs/design.md) (the design overview),
[`GLOSSARY.md`](GLOSSARY.md) (the domain words) and [`docs/decisions/`](docs/decisions/README.md)
(the rules that bind, with their reasons).

## Stack

- Vite + TypeScript (strict) + React 19; React Router (`BrowserRouter`; the PWA serves
  `index.html` for every path). Plain CSS with theme variables in `src/styles.css`, dark mode by
  `prefers-color-scheme`, 44 px minimum tap targets, no component library.
- `vite-plugin-pwa` (`registerType: 'prompt'`) for the manifest, service worker and the
  "update available" toast (`src/app/UpdateToast.tsx`). A new version waits until the user taps
  Reload; it never reloads the page by itself, so it cannot replace the app under an edit.
- Zod validates the document and the content packs. The document lives in a Yjs CRDT persisted by
  `y-indexeddb`, with a `BroadcastChannel` relay between tabs.
- Vitest (unit, React Testing Library with jsdom where a test says so) and Playwright (`e2e/`).
- Cloudflare Pages hosting, deployed by GitHub Actions. See `docs/build/README.md`.

## Layout

| Path                   | What                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `src/app/`             | React screens, routing, the shell, the `?debug=1` hook                              |
| `src/engine/`          | Pure functions over the document and packs (targets, coverage, gaps, score)         |
| `src/model/`           | TypeScript types and Zod schemas of the document and the packs                      |
| `src/packs/`           | JSON content packs and their loader                                                 |
| `src/scan/`            | Camera stream, barcode loop, Open Food Facts client, `dateLoop.ts`; `tunables.ts`   |
| `src/scan/ocr/`        | The date reader: PaddleOCR in a web worker (onnxruntime-web), images, worker client |
| `src/engine/datecode/` | Best-before parser and frame agreement (pure)                                       |
| `public/ocr/`          | Third-party model files with their notice and licence (not ours: leave them alone)  |
| `src/store/`           | The document store (CRDT + IndexedDB) and Drive sync (`sync.ts`, `drive/`)          |
| `src/util/`            | Small pure helpers                                                                  |
| `src/generated/`       | Build output of `scripts/releases.mjs` (gitignored)                                 |
| `test/`                | Unit tests that aren't next to their source, fixtures, helpers                      |
| `e2e/`                 | Playwright                                                                          |
| `scripts/`             | `releases.mjs` (bake the changelog), `icons.mjs` (PWA icons), `setup-cloudflare.sh` |
| `docs/`                | `build/` (environments, CI), `features/` (one hub per feature)                      |

## Rules

- **The lint fence** (ESLint `no-restricted-imports` per directory; `test/lint-fence.test.ts`
  proves each rule fails on a bad import). It keeps the logic testable without a browser:
  - `src/model` imports only `zod` and `src/model`.
  - `src/engine` imports only `src/model`, `src/util` and `src/engine`; never React, `src/app`,
    `src/store`, `src/packs`, `idb`, or anything Drive or Google.
  - `src/store` never imports `src/app` or React.
  - `src/scan` (camera, barcode decoding, the Open Food Facts client) imports `src/model`,
    `src/util`, `src/engine`, itself and packages (`@zxing/*`, `onnxruntime-web`); never React, `src/app`,
    `src/store`, `src/packs`, or anything Drive or Google.
  - `src/app` may import everything, but reaches the store only through `DocumentProvider` and the
    `useDocument()` / `useChange()` hooks (`src/app/state/`); it never calls `openStore` itself.
- **Screens never compute targets.** How much a household needs is the engine's job; screens
  collect facts (`useChange`) and show what the engine returns. Screens live in
  `src/app/screens/`, sheets and form controls in `src/app/components/`.
- **Packs for screens.** Screens call the engine and look up **items** through `usePacks()`
  (`src/app/usePacks.ts`): the bundled packs only. **Products**, **stock** and **minimums** live in
  the document; there are no custom items.
- **Words.** **Item** (generic, from the pack), **product** (household-specific), **stock** (a
  quantity in a place), **resource** (a named quantity targets count: water litres, food kcal…; not
  "store"), **category** (Food, Water…), **capability** (water, food, heat…). **`src/store`** is the
  document store, not a resource.
- **Packs.** Content (items, assets, guidance, plans, checklists, regions) is JSON in `src/packs/data/`,
  validated by `src/packs/loader.ts`. Every guidance rule has a `source` URL (listed in the pack's
  `sources` with the date checked) or `"assumption"`; never invent an official number. Bump a
  pack's `version` when its content changes. See `docs/features/content-packs/`.
- **The document shape is a schema.** Changing it means a `SCHEMA_VERSION` bump and an idempotent
  migration step in `src/model/migrate.ts`; the container layout of a new document is frozen per
  schema. Schema 4 started afresh (items, products, stock, minimums): older documents are refused,
  not migrated. See `docs/features/data-model/`.
- **Privacy.** Nothing leaves the browser except the user's own document to the user's own Google
  Drive, and the digits of a barcode the person scans to Open Food Facts (only while online, only
  for a barcode the household has not met, or asks to identify again, or is sorting from the queue;
  nothing else goes with it). Camera frames never leave the phone and are never stored. The only
  scope is `drive.file` (files the app created). The only third-party script is Google Identity
  Services, loaded when the user connects Drive and at start-up once connected. No analytics, no
  server, no other third-party calls at runtime. The changelog is baked at build time from GitHub
  Releases, never fetched at runtime.
- **Google client id.** `VITE_GOOGLE_CLIENT_ID` (`.env.local`, the Actions variable) is never
  committed; `.env.example` names it. Tests fake Drive (`src/store/fakeDrive.ts`, `e2e/fakeGoogle.ts`)
  and never call Google.
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

With `?debug=1`, `window.__shtf` exists (`src/app/debug.ts`) with `doc()`, `change(fn)` and
`loadFixture()` (the invented Biggar household, `src/app/state/debugStore.ts`), plus
`engine.{targets,coverage,gaps,score,preview}(asOf?, horizonDays?)` over the live document
(`src/app/state/debugEngine.ts`). Later phases hang test hooks on it; without the flag nothing is
installed.

## Git

- Branches `pskil/<slug>`, conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).
- One PR per phase. Stacked PRs are rebased, never merged up. Never commit to `main`.
- Work is tracked as GitHub issues (epics, features, labels, milestones): the `tickets` skill
  (`.claude/skills/tickets/SKILL.md`) says how to file, shape and close them.
