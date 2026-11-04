// Desktop bench: node --experimental-strip-types --no-warnings date-spike/bench.ts SETDIR [engine...]
// engines: tesseract paddle paddle-rec   (default: all). env: LIMIT=n, ROTS=0,180, SINGLE=1 (first variant only)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { paddleEngine, tesseractEngine, type Engine } from '../src/spikes/date/engines.ts';
import { gray } from '../src/spikes/date/image.ts';
import { readDate } from '../src/spikes/date/reader.ts';
import { fmtMY } from '../src/spikes/date/parse.ts';

const require = createRequire(import.meta.url);
const dir = process.argv[2];
const which = process.argv.slice(3).length ? process.argv.slice(3) : ['tesseract', 'paddle', 'paddle-rec'];
const labels: { id: string; cat: string; expect: string; text: string }[] = JSON.parse(readFileSync(`${dir}/labels.json`, 'utf8')).slice(0, Number(process.env.LIMIT ?? 1e9));
const rots = (process.env.ROTS ?? '0,180').split(',').map(Number) as (0 | 90 | 180 | 270)[];

function loadPgm(path: string) {
  const b = readFileSync(path);
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 30).toString('latin1'))!;
  const g = gray(+m[1], +m[2]);
  g.d.set(b.subarray(m[0].length));
  return g;
}

const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;
const root = new URL('..', import.meta.url).pathname;
const assets = { base: root + 'public/ocr', bytes: async (p: string) => new Uint8Array(readFileSync(p)) };

function make(name: string): Engine {
  if (name === 'tesseract') {
    return tesseractEngine(() => import('tesseract.js'), { workerOpts: { langPath: root + 'public/ocr/tess', cachePath: '/tmp/claude-1000/tess-cache' } });
  }
  return paddleEngine(ort, assets, { mode: name === 'paddle-rec' ? 'rec' : 'det+rec' });
}

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const summary: string[] = [];
const detail: any[] = [];

for (const name of which) {
  const e = make(name);
  const t0 = performance.now();
  await e.init();
  const loadMs = performance.now() - t0;
  const rows: { id: string; cat: string; got: string | null; want: string; ms: number; conf: number; text: string; votes: number }[] = [];
  for (const l of labels) {
    const img = loadPgm(`${dir}/${l.id}.pgm`);
    const r = await readDate(e, img, { rotations: rots, maxMs: 6000 });
    rows.push({ id: l.id, cat: l.cat, got: r.value ? fmtMY(r.value) : null, want: l.expect, ms: r.ms, conf: r.confidence, text: r.text.replace(/\n/g, ' / '), votes: r.votes });
  }
  detail.push({ engine: name, rows });
  const row = (rs: typeof rows) => {
    const right = rs.filter((r) => r.got === r.want).length, none = rs.filter((r) => r.got === null).length;
    const ms = rs.map((r) => r.ms);
    return `${(100 * right / rs.length).toFixed(0)}% right | ${(100 * (rs.length - right - none) / rs.length).toFixed(0)}% wrong | ${(100 * none / rs.length).toFixed(0)}% none | median ${pct(ms, .5).toFixed(0)} ms | p90 ${pct(ms, .9).toFixed(0)} ms (n=${rs.length})`;
  };
  summary.push(`## ${name}  (init ${loadMs.toFixed(0)} ms)`, `ALL: ${row(rows)}`);
  const conf = rows.filter((r) => r.conf >= 0.7);
  summary.push(`conf>=0.7: ${conf.length ? row(conf) : 'none'}`);
  for (const c of [...new Set(rows.map((r) => r.cat))]) summary.push(`  ${c}: ${row(rows.filter((r) => r.cat === c))}`);
  summary.push('  wrong reads: ' + rows.filter((r) => r.got && r.got !== r.want).map((r) => `${r.id}:${r.got}!=${r.want} [${r.text}]`).join('; '));
  await e.dispose();
}
const out = summary.join('\n');
console.log(out);
writeFileSync(process.env.OUT ?? `${dir}/bench-${Date.now()}.txt`, out + '\n\n' + JSON.stringify(detail));
