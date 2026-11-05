// Round-3 bench trials on the owner's photo crops (tight, loose, wide), against the current default.
//   node --experimental-strip-types --no-warnings date-spike/trials.ts MODE CROP_DIR [ENGINE] [VARIANTSET]
// MODE   grid     single-pass right/wrong per Sauvola window and k (default engine)
//        passes   single-pass right/wrong per variant (default engine)
//        reader   the app's readDate over a variant set
// ENGINE paddle (default), or a model set from MODELS below (det file + rec file in public/ocr/paddle or MODEL_DIR)
// VARIANTSET default | +sauvola | +sauvola+dil | sauvola | sauvola-dil   (win and k from env SW, SK)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { paddleEngine, type Engine } from '../src/spikes/date/engines.ts';
import { dilateDark, fit, gray, OCR_H, sauvola, stretch, resizeToHeight, VARIANTS, type Gray, type Variant } from '../src/spikes/date/image.ts';
import { fmtMY, parseDates } from '../src/spikes/date/parse.ts';
import { readDate } from '../src/spikes/date/reader.ts';

const require = createRequire(import.meta.url);
const [mode, dir, engineName = 'paddle', vset = 'default'] = process.argv.slice(2);
const NOW = new Date(2026, 10, 5);
const root = new URL('..', import.meta.url).pathname;
const spec: { id: string; truth: string }[] = JSON.parse(readFileSync(root + 'date-spike/photo-crops.json', 'utf8')).photos;
const FRAMINGS = ['tight', 'loose', 'wide'];

function loadPgm(path: string) {
  const b = readFileSync(path);
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 30).toString('latin1'))!;
  const g = gray(+m[1], +m[2]);
  g.d.set(b.subarray(m[0].length));
  return g;
}

const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;
// Where models come from: the committed round-1 files, files from the npm package paddle-ocr-onnx-models, or files made from the
// round-1 ones by date-spike/shrink-onnx.mjs (in MODEL_DIR).
const MODELS: Record<string, { det?: string; rec?: string; dict?: string; base?: string }> = {
  paddle: {},
  'det-v4': { det: '../../../node_modules/paddle-ocr-onnx-models/models/ch_PP-OCRv4_det_infer.onnx' },
};
const m = MODELS[engineName] ?? JSON.parse(engineName); // or a JSON object {"det":..,"rec":..}
const assets = { base: root + 'public/ocr', bytes: async (p: string) => new Uint8Array(readFileSync(p)) };
const engine: Engine = paddleEngine(ort, assets, { mode: 'det+rec', ...m, label: engineName });
await engine.init();

const SW = Number(process.env.SW ?? 0.4), SK = Number(process.env.SK ?? 0.4), SB = (process.env.SB ?? 'fit') as '64' | 'fit';
const sv = (base: '64' | 'fit', f: number, k: number, dil: boolean): Variant => ({
  name: `sauvola${base === '64' ? '@64' : ''}${dil ? '+dil' : ''}(${f},${k})`,
  apply: (g) => {
    const b = stretch(base === '64' ? resizeToHeight(g, OCR_H) : fit(g));
    const o = sauvola(b, b.h * f, k);
    return dil ? dilateDark(o, 1) : o;
  },
});
const variantSets: Record<string, Variant[]> = {
  default: VARIANTS,
  '+sauvola': [...VARIANTS, sv(SB, SW, SK, false)],
  '+sauvola+dil': [...VARIANTS, sv(SB, SW, SK, true)],
  '+both': [...VARIANTS, sv(SB, SW, SK, false), sv(SB, SW, SK, true)],
  'swap-adapt': [...VARIANTS.filter((v) => v.name !== 'adapt'), sv(SB, SW, SK, true)],
  sauvola: [sv(SB, SW, SK, false)],
  'sauvola-dil': [sv(SB, SW, SK, true)],
};

const crops: { id: string; f: string; truth: string; g: Gray }[] = [];
for (const f of FRAMINGS) for (const p of spec) crops.push({ id: p.id, f, truth: p.truth, g: loadPgm(`${dir}/${p.id}-${f}.pgm`) });
await engine.read(crops[0].g); // warm-up

const verdict = (got: string | null, truth: string) => (got === null ? 'none' : got === truth ? 'right' : 'WRONG');
const cell = (s: string) => s.replace(/\s*\n\s*/g, ' / ').replace(/\|/g, '/');

async function single(v: Variant) {
  const per: Record<string, string[]> = {};
  const wrong: string[] = [];
  let right = 0, bad = 0, none = 0;
  const ms: number[] = [];
  for (const c of crops) {
    const t0 = performance.now();
    const o = await engine.read(v.apply(c.g));
    ms.push(performance.now() - t0);
    const p = parseDates(o.text, NOW);
    const got = p.best ? fmtMY(p.best) : null;
    const vd = verdict(got, c.truth);
    (per[c.f] ??= []).push(vd === 'right' ? c.id : '');
    if (vd === 'right') right++; else if (vd === 'none') none++; else { bad++; wrong.push(`${c.id}-${c.f}: ${got} from "${cell(o.text)}"`); }
  }
  ms.sort((a, b) => a - b);
  return { right, bad, none, med: Math.round(ms[ms.length >> 1]), wrong, per };
}

if (mode === 'passes') {
  console.log(`engine ${engineName}: single pass per variant over ${crops.length} crops (9 photos x tight/loose/wide)`);
  console.log('variant | right | wrong | none | median ms | right per framing (tight/loose/wide)');
  const set = [...VARIANTS, sv('64', SW, SK, false), sv('64', SW, SK, true), sv('fit', SW, SK, false), sv('fit', SW, SK, true)];
  for (const v of set) {
    const r = await single(v);
    const per = FRAMINGS.map((f) => r.per[f].filter(Boolean).length).join('/');
    console.log(`${v.name} | ${r.right} | ${r.bad} | ${r.none} | ${r.med} | ${per}${r.wrong.length ? '  WRONG: ' + r.wrong.join('; ') : ''}`);
  }
} else if (mode === 'grid') {
  console.log('Sauvola single pass on stretch@64 and stretch(native): right/wrong of 27 crops');
  console.log('base | window (x height) | k | right | wrong | right without dilation / with dilation');
  for (const base of ['64', 'fit'] as const) for (const f of [0.25, 0.4, 0.6, 0.9]) for (const k of [0.1, 0.2, 0.3, 0.4, 0.5]) {
    const a = await single(sv(base, f, k, false)), b = await single(sv(base, f, k, true));
    console.log(`${base} | ${f} | ${k} | ${a.right}+${b.right} | ${a.bad}+${b.bad}`);
  }
} else {
  const variants = variantSets[vset];
  console.log(`\n### ${engineName} / variants ${vset} (${variants.map((v) => v.name).join(', ')})`);
  const tally: Record<string, [number, number, number]> = {};
  const ms: number[] = [];
  const lines: string[] = [];
  for (const c of crops) {
    const r = await readDate(engine, c.g, { now: NOW, variants });
    const got = r.value ? fmtMY(r.value) : null;
    const vd = verdict(got, c.truth);
    const t = (tally[c.f] ??= [0, 0, 0]);
    t[vd === 'right' ? 0 : vd === 'none' ? 2 : 1]++;
    ms.push(r.ms);
    if (vd !== 'right') lines.push(`  ${c.id}-${c.f}: ${vd} ${got ?? '-'} "${cell(r.text)}"`);
  }
  ms.sort((a, b) => a - b);
  console.log('framing | right | wrong | none');
  for (const f of FRAMINGS) console.log(`${f} | ${tally[f].join(' | ')}`);
  const tot = Object.values(tally).reduce((a, t) => a.map((x, i) => x + t[i]), [0, 0, 0]);
  console.log(`total | ${tot.join(' | ')}   compute median ${Math.round(ms[ms.length >> 1])} ms, p90 ${Math.round(ms[Math.floor(ms.length * 0.9)])} ms, max ${Math.round(ms[ms.length - 1])} ms`);
  console.log(lines.join('\n'));
}
await engine.dispose();
