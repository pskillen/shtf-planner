# Platform and build

**Status:** Accepted. See [AGENTS.md](../../AGENTS.md) and the [build docs](../build/README.md).

**The stack.** Vite, TypeScript strict, React, Zod, Vitest, Playwright, `vite-plugin-pwa`, hosted on
Cloudflare Pages. Differs from the original plan: there is no Cloudflare Pages Function proxy and no
server of any kind; a proxy would arrive only with AI review
([#66](https://github.com/pskillen/shtf-planner/issues/66)). [D12]

**Updates wait for a tap.** The PWA uses `registerType: 'prompt'` with an update toast, never
`autoUpdate`: a new version must never reload the page under an edit. [D67]

**Environments.** dev (push to `dev`), next (push to `main`), staging (pre-release), prod
(release), plus `preview` for pull requests and `local`. The build-env vocabulary is
`local | preview | dev | next | staging | prod`; `main` builds map to `next`. The footer shows the
env and version. [D43 → D68]

**Routes.** `/` is the landing page and `/app/*` the app shell. [D60]

**No CHANGELOG.md.** The landing page's changelog is baked at build time from GitHub Releases; no
status, progress or changelog files are committed. The `pre*` npm hooks create an empty releases
file if it is missing, so a fresh clone builds. [D47, D50, D58]

**The lint fence.** Each layer's imports are fenced by ESLint and a test proves each rule fails on
a bad import: `src/model` imports only Zod; `src/engine` never React, the store, the packs or
Drive; `src/scan` may import model, util, engine and packages, never React, app, store or packs.
Why: the logic stays testable without a browser. [D154]

**Heavy work runs in a worker.** The date reader runs in a web worker so the screen stays smooth,
and its model and wasm files are precached so it works offline. [D133]
