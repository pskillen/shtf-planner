# SHTF Planner (working title)

A gamified household preparedness planner. Describe your home, your household and the risks where you
live; it tells you what to have, what to do, and keeps score. Track your stores and kit, get reminded to
rotate and maintain them, and keep scenario checklists to hand for the day something happens.

Sister project of the SHTF game (`shtf-game`): the game simulates living through a disaster with what you
prepped; this is the tool for actually prepping.

Status: skeleton. An installable app shell with a landing page; no product behaviour yet.

## Principles

- Works offline, installable as a PWA. Your data is a file you own (YAML/JSON), synced via Google Drive.
- Guidance comes from real sources (UK Gov, FEMA/Ready.gov, …), imported and kept current.
- Quick to maintain: fast entry, periodic review modes, and a preparedness score that makes it a game.

## Run

Node 22 (`.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173
```

## Check

```bash
npm run check                          # format, lint, typecheck, unit tests, build
npm run build && npm run test:e2e      # Playwright against the built app (E2E_PORT to change 4173)
```

## Deploy and environments

Cloudflare Pages via GitHub Actions: `prod` (a published release), `staging` (a pre-release), `next`
(push to `main`), `dev` (push to `dev`), plus a preview per pull request. Deploys skip with a notice
until the Cloudflare secrets are set; `scripts/setup-cloudflare.sh` walks the owner through it. See
[docs/build/README.md](docs/build/README.md).

## Contributing

Agents and humans: see [AGENTS.md](AGENTS.md). Design notes live in `tmp/` (gitignored) until they
settle into docs; feature docs are in [docs/features/](docs/features/README.md).
