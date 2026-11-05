// Photo bench: the owner's phone photos, hand-picked crops (photo-crops.json), the app's reader, both engines.
//   python3 date-spike/photo-crops.py PHOTO_DIR CROP_DIR      (once; the photos and crops stay outside the repo)
//   node --experimental-strip-types --no-warnings date-spike/photo-bench.ts CROP_DIR [engine...]
// env: FRAMINGS=tight,loose,wide  LEGACY=1 (round-1 reader and Tesseract psm 7)  ROTS=0,180
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { paddleEngine, tesseractEngine, type Engine } from '../src/spikes/date/engines.ts';
import { gray } from '../src/spikes/date/image.ts';
import { fmtMY } from '../src/spikes/date/parse.ts';
import { readDate } from '../src/spikes/date/reader.ts';
import { readDateLegacy } from './legacy-reader.ts';

const require = createRequire(import.meta.url);
const dir = process.argv[2];
const which = process.argv.slice(3).length ? process.argv.slice(3) : ['paddle', 'tesseract'];
const framings = (process.env.FRAMINGS ?? 'tight,loose,wide').split(',');
const legacy = !!process.env.LEGACY;
const rots = process.env.ROTS ? (process.env.ROTS.split(',').map(Number) as (0 | 90 | 180 | 270)[]) : undefined;
const NOW = new Date(2026, 10, 5); // the day the photos were taken
const root = new URL('..', import.meta.url).pathname;
const spec: { id: string; truth: string; tight: number[] }[] = JSON.parse(readFileSync(root + 'date-spike/photo-crops.json', 'utf8')).photos;

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
const make = (name: string): Engine =>
  name === 'tesseract'
    ? tesseractEngine(() => import('tesseract.js'), { workerOpts: { langPath: root + 'public/ocr/tess', cachePath: '/tmp/claude-1000/tess-cache' }, psm: legacy ? '7' : '6' })
    : paddleEngine(ort, assets, { mode: 'det+rec' });

const cell = (s: string) => s.replace(/\s*\n\s*/g, ' / ').replace(/\|/g, '/');
for (const name of which) {
  const e = make(name);
  await e.init();
  await e.read(loadPgm(`${dir}/${spec[0].id}-tight.pgm`)); // warm-up, not timed
  console.log(`\n### ${name}${legacy ? ' (round-1 reader, psm 7)' : ''}`);
  for (const f of framings) {
    console.log(`\n${f} crops\n\nphoto | truth | raw text | parsed | verdict | ms | passes`);
    console.log('--- | --- | --- | --- | --- | --- | ---');
    let right = 0, wrong = 0, none = 0;
    const ms: number[] = [];
    for (const p of spec) {
      const g = loadPgm(`${dir}/${p.id}-${f}.pgm`);
      let value: string | null, text: string, t: number, passes: number, assumed = false;
      if (legacy) {
        const r = await readDateLegacy(e, g, NOW);
        value = r.value ? fmtMY(r.value) : null; text = r.text; t = r.ms; passes = r.passes;
      } else {
        const r = await readDate(e, g, { now: NOW, ...(rots ? { rotations: rots } : {}) });
        value = r.value ? fmtMY(r.value) : null; text = r.text; t = r.ms; passes = r.variants; assumed = r.yearAssumed;
      }
      const verdict = value === null ? 'none' : value === p.truth ? 'right' : 'WRONG';
      if (verdict === 'right') right++; else if (verdict === 'none') none++; else wrong++;
      ms.push(t);
      console.log(`${p.id} | ${p.truth} | ${cell(text) || '(nothing)'} | ${value ?? '-'}${assumed ? ' (year assumed)' : ''} | ${verdict} | ${Math.round(t)} | ${passes}`);
    }
    const s = [...ms].sort((a, b) => a - b);
    console.log(`\n${f}: right ${right}/${spec.length}, wrong ${wrong}, none ${none}; compute median ${Math.round(s[Math.floor(s.length / 2)])} ms, max ${Math.round(s[s.length - 1])} ms`);
  }
  await e.dispose();
}
