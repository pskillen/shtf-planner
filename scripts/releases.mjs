// Bakes the GitHub Releases into src/generated/releases.json for the landing page's changelog.
// Run in CI before the build (GITHUB_TOKEN is available to `gh` there). Locally, or when `gh` fails,
// it writes an empty list and warns. `--if-missing` leaves an existing file alone (the npm pre-hooks
// use it so a fresh clone builds without CI's step).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const REPO = 'pskillen/shtf-planner';
const out = new URL('../src/generated/releases.json', import.meta.url);

if (process.argv.includes('--if-missing') && existsSync(out)) process.exit(0);

let releases = [];
try {
  const raw = execFileSync('gh', ['api', `repos/${REPO}/releases`, '--paginate'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  // --paginate concatenates JSON arrays ("][" between pages).
  const pages = JSON.parse(`[${raw.trim().replace(/\]\s*\[/g, '],[')}]`).flat();
  releases = pages
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      body: r.body ?? '',
    }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
} catch (err) {
  const why = err instanceof Error ? err.message.split('\n')[0] : String(err);
  console.warn(`releases: could not read GitHub Releases (${why}); writing an empty list.`);
}

await mkdir(new URL('./', out), { recursive: true });
await writeFile(out, `${JSON.stringify(releases, null, 2)}\n`);
console.log(`releases: wrote ${releases.length} release(s) to src/generated/releases.json`);
