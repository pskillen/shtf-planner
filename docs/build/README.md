# Build and deploy

SHTF Planner is a static Vite SPA and PWA deployed to **Cloudflare Pages** by GitHub Actions (direct
upload with Wrangler, not the dashboard's Git integration). Base path `/`.

| Environment | URL (placeholder)                 | Trigger                       | `BUILD_ENV`              | `BUILD_VERSION`       | CF branch           |
| ----------- | --------------------------------- | ----------------------------- | ------------------------ | --------------------- | ------------------- |
| **prod**    | `https://prep.mm9pdy.net`         | Full GitHub release published | `prod`                   | the tag, `X.Y.Z`      | `main` (production) |
| **staging** | `https://staging.prep.mm9pdy.net` | Pre-release published         | `staging`                | the tag, `X.Y.Z-rc.N` | `staging`           |
| **next**    | `https://next.prep.mm9pdy.net`    | Push to `main`                | `main` (shown as `next`) | short SHA             | `next`              |
| **dev**     | `https://dev.prep.mm9pdy.net`     | Push to `dev`                 | `dev`                    | short SHA             | `dev`               |
| **preview** | the `*.pages.dev` branch alias    | Pull request                  | `preview`                | short SHA             | the PR's branch     |

`BUILD_ENV` is one of `local | preview | dev | next | staging | prod`; the `main` workflow passes
`main`, and `src/util/build-env.ts` maps it to `next`. An unknown value fails the build.

Tags are bare SemVer (no `v`). The footer shows `SHTF Planner · {env} · {version}`; local builds show
`local`. The hostnames are placeholders for the owner to attach in the Cloudflare dashboard.

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173/`). `?debug=1` installs `window.__shtf`.

On a fresh clone run one hooked script (`npm run dev`, `build`, `test` or `typecheck`) before calling
`vitest` or `tsc` directly: the `pre*` hooks create the baked `src/generated/releases.json` they need.
`test:e2e` reuses a server already on its port, so if something else holds 4173 set `E2E_PORT`.

## Scripts

| Script                            | Purpose                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server                                                                    |
| `npm run build`                   | Typecheck + production bundle (and the service worker)                             |
| `npm run preview`                 | Serve `dist/`                                                                      |
| `npm run test` / `test:e2e`       | Vitest / Playwright (build first; `E2E_PORT` overrides 4173)                       |
| `npm run lint` / `typecheck`      | ESLint (including the import fence) / `tsc -b`                                     |
| `npm run format` / `format:check` | Prettier                                                                           |
| `npm run check`                   | format:check, lint, typecheck, test, build                                         |
| `npm run releases`                | Bake GitHub Releases into `src/generated/releases.json`                            |
| `npm run icons`                   | Regenerate the PWA icons (incl. the padded maskable one) from `public/favicon.svg` |

## The changelog

The landing page lists GitHub Releases. `scripts/releases.mjs` calls `gh api repos/pskillen/shtf-planner/releases`
in CI before the build and writes `src/generated/releases.json` (gitignored). Locally, or if `gh`
fails, it writes `[]` and the page says "No releases yet". Nothing is fetched at runtime.

## CI

- [`pull-request.yaml`](../../.github/workflows/pull-request.yaml): `check` (format, lint, typecheck,
  test with a JUnit report, build) and `e2e` (build, Chromium, Playwright), then a preview deploy.
- [`cloudflare-pages.yaml`](../../.github/workflows/cloudflare-pages.yaml): the reusable deploy. Its
  `secrets` job skips the deploy with a notice while `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`
  is unset, so a repo without them stays green. It creates the Pages project `shtf-planner` if missing.
- [`dev.yaml`](../../.github/workflows/dev.yaml), [`main.yaml`](../../.github/workflows/main.yaml),
  [`staging.yaml`](../../.github/workflows/staging.yaml), [`prod.yaml`](../../.github/workflows/prod.yaml):
  thin wrappers for the table above.

## Owner setup

Run `scripts/setup-cloudflare.sh`: it collects the account id and an API token (Pages edit rights),
sets the two repo secrets with `gh secret set -R pskillen/shtf-planner`, and lists the custom domains
to attach.

**Unverified:** Cloudflare Pages normally attaches a custom domain to a project's production
deployment only. Whether `next.`, `staging.` and `dev.` hostnames can be pointed at the branch aliases
(`<branch>.shtf-planner.pages.dev`) of this one project, or need a Pages project each, has not been
tried. Confirm it on the first real deploy and update this section.
