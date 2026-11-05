// Round 4a: which characters does a recogniser emit on the photo crops (every variant, every framing)? Counts anything that is not
// plain ASCII, to see whether the multilingual v6 dictionary produces look-alikes (full-width numerals, roman numerals, CJK) in dates.
//   node --experimental-strip-types --no-warnings date-spike/charset.ts CROP_DIR DET REC DICT
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { paddleEngine } from '../src/spikes/date/engines.ts';
import { gray, VARIANTS } from '../src/spikes/date/image.ts';

const require = createRequire(import.meta.url);
const [dir, det, rec, dict] = process.argv.slice(2);
const root = new URL('..', import.meta.url).pathname;
const spec: { id: string }[] = JSON.parse(readFileSync(root + 'date-spike/photo-crops.json', 'utf8')).photos;
const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;
const engine = paddleEngine(ort, { base: root + 'public/ocr', bytes: async (p: string) => new Uint8Array(readFileSync(p)) }, { mode: 'det+rec', det, rec, dict });
await engine.init();
const seen = new Map<string, number>();
let passes = 0, withOdd = 0;
for (const f of ['tight', 'loose', 'wide']) for (const p of spec) {
  const b = readFileSync(`${dir}/${p.id}-${f}.pgm`);
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 30).toString('latin1'))!;
  const g = gray(+m[1], +m[2]);
  g.d.set(b.subarray(m[0].length));
  for (const v of VARIANTS) {
    const t = (await engine.read(v.apply(g))).text;
    passes++;
    const odd = [...t].filter((c) => c.charCodeAt(0) > 126);
    if (odd.length) withOdd++;
    for (const c of odd) seen.set(c, (seen.get(c) ?? 0) + 1);
  }
}
console.log(`${passes} passes, ${withOdd} with a non-ASCII character; characters:`, [...seen].map(([c, n]) => `${c} U+${c.codePointAt(0)!.toString(16)} x${n}`).join(', ') || 'none');
await engine.dispose();
