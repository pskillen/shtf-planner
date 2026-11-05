// Try OCR settings (page segmentation mode, whitelist, height, preprocessing) on the photo crops, without the reader:
//   CROPS=crop_dir CFG=configs.json [ENGINE=paddle] [FRAMING=tight] [V=1] node --experimental-strip-types --no-warnings date-spike/explore.ts
// configs.json: [{name, psm, wl, h, prep}]  prep: stretch|adapt|inv-stretch|inv-adapt|raw|adapt+dilate, h 0 = native
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { paddleEngine, tesseractEngine } from '../src/spikes/date/engines.ts';
import { gray, resizeToHeight, stretch, adaptive, invert, dilateDark, type Gray } from '../src/spikes/date/image.ts';
import { parseDates, fmtMY } from '../src/spikes/date/parse.ts';

const root = new URL('..', import.meta.url).pathname;
const dir = process.env.CROPS + '/';
const spec = JSON.parse(readFileSync(root + 'date-spike/photo-crops.json', 'utf8')).photos;
const framing = process.env.FRAMING ?? 'tight';
function loadPgm(path: string) {
  const b = readFileSync(path);
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 30).toString('latin1'))!;
  const g = gray(+m[1], +m[2]);
  g.d.set(b.subarray(m[0].length));
  return g;
}
const require = createRequire(import.meta.url);
const ort = process.env.ENGINE === 'paddle' ? require('onnxruntime-web') : null;
if (ort) ort.env.wasm.numThreads = 1;
const NOW = new Date(2026, 10, 5);
const rs = (g: Gray, h: number) => (h ? resizeToHeight(g, h) : g);
const preps: Record<string, (g: Gray, h: number) => Gray> = {
  stretch: (g, h) => stretch(rs(g, h)),
  adapt: (g, h) => adaptive(stretch(rs(g, h))),
  'inv-stretch': (g, h) => invert(stretch(rs(g, h))),
  'inv-adapt': (g, h) => adaptive(invert(stretch(rs(g, h)))),
  raw: (g, h) => rs(g, h),
  'adapt+dilate': (g, h) => dilateDark(adaptive(stretch(rs(g, h))), 1),
};
const configs: { name: string; psm: string; wl: boolean; h: number; prep: string }[] = JSON.parse(readFileSync(process.env.CFG!, 'utf8'));
for (const c of configs) {
  const e = process.env.ENGINE === 'paddle' ? paddleEngine(ort, { base: root + 'public/ocr', bytes: async (p: string) => new Uint8Array(readFileSync(p)) }, { mode: 'det+rec' }) : tesseractEngine(() => import('tesseract.js'), { workerOpts: { langPath: root + 'public/ocr/tess', cachePath: '/tmp/claude-1000/tess-cache' }, psm: c.psm, noWhitelist: !c.wl } as any);
  await e.init();
  let right = 0, wrong = 0; const lines: string[] = []; let ms = 0;
  for (const p of spec) {
    const g = loadPgm(`${dir}${p.id}-${framing}.pgm`);
    const t = performance.now();
    const out = await e.read(preps[c.prep](g, c.h));
    ms += performance.now() - t;
    const r = parseDates(out.text, NOW);
    const got = r.best ? fmtMY(r.best) : null;
    if (got === p.truth) right++; else if (got) wrong++;
    lines.push(`   ${p.id.padEnd(9)} ${got === p.truth ? 'RIGHT' : got ? 'WRONG' : 'none '} ${got ?? ''} | ${out.text.replace(/\n/g, ' / ')}`);
  }
  console.log(`${c.name} psm=${c.psm} wl=${c.wl} h=${c.h} prep=${c.prep} (${framing}): right ${right}/9 wrong ${wrong} avg ${(ms / 9).toFixed(0)} ms`);
  if (process.env.V) console.log(lines.join('\n'));
  await e.dispose();
}
