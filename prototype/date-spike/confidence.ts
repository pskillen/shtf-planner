// Where should "very confident" sit? Runs every variant on every crop (no early stop) and writes, per pass,
// whether the parse was right with the parser's and the engine's confidence, plus the frame-level readDate result.
//   node --experimental-strip-types --no-warnings date-spike/confidence.ts OUT.json engine PHOTO_CROP_DIR [SYNTH_DIR]
// engine: paddle | tesseract.   Photos use photo-crops.json truths ("today" 5 Nov 2026); the synthetic set uses its labels.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { paddleEngine, tesseractEngine, type Engine } from '../src/spikes/date/engines.ts';
import { gray, VARIANTS } from '../src/spikes/date/image.ts';
import { fmtMY, parseDates } from '../src/spikes/date/parse.ts';
import { readDate } from '../src/spikes/date/reader.ts';

const require = createRequire(import.meta.url);
const [out, which, photoDir, synthDir] = process.argv.slice(2);
const NOW = new Date(2026, 10, 5);
const root = new URL('..', import.meta.url).pathname;
const spec: { id: string; truth: string }[] = JSON.parse(readFileSync(root + 'date-spike/photo-crops.json', 'utf8')).photos;

function loadPgm(path: string) {
  const b = readFileSync(path);
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 30).toString('latin1'))!;
  const g = gray(+m[1], +m[2]);
  g.d.set(b.subarray(m[0].length));
  return g;
}
const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;
const assets = { base: root + 'public/ocr', bytes: async (p: string) => new Uint8Array(readFileSync(p)) };
const e: Engine = which === 'tesseract'
  ? tesseractEngine(() => import('tesseract.js'), { workerOpts: { langPath: root + 'public/ocr/tess', cachePath: '/tmp/claude-1000/tess-cache' } })
  : paddleEngine(ort, assets, { mode: 'det+rec' });
await e.init();

const items: { id: string; set: string; path: string; truth: string }[] = [];
for (const f of ['tight', 'loose', 'wide']) for (const p of spec) items.push({ id: `${p.id}-${f}`, set: 'photo-' + f, path: `${photoDir}/${p.id}-${f}.pgm`, truth: p.truth });
if (synthDir) for (const l of JSON.parse(readFileSync(`${synthDir}/labels.json`, 'utf8'))) items.push({ id: l.id, set: 'synth-' + l.cat, path: `${synthDir}/${l.id}.pgm`, truth: l.expect });

const rows: unknown[] = [];
for (const it of items) {
  const g = loadPgm(it.path);
  const passes: unknown[] = [];
  for (const v of VARIANTS.filter((v) => !v.redundant?.(g))) {
    const o = await e.read(v.apply(g));
    const p = parseDates(o.text, NOW);
    passes.push({ variant: v.name, text: o.text, engConf: o.conf, got: p.best ? fmtMY(p.best) : null, parserConf: p.confidence, assumed: !!p.best?.yearAssumed });
  }
  const r = await readDate(e, g, { now: NOW });
  rows.push({ ...it, passes, frame: { got: r.value ? fmtMY(r.value) : null, conf: r.confidence, votes: r.votes, assumed: r.yearAssumed, variants: r.variants } });
}
writeFileSync(out, JSON.stringify(rows));
console.log('wrote', rows.length);
await e.dispose();
