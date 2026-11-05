// Calibrate the frame gate: sharpness of the photo crops, and of the same crops blurred. CROPS=crop_dir node ... date-spike/sharp.ts
import { readFileSync } from 'node:fs';
import { blur, gray, sharpness } from '../src/spikes/date/image.ts';

function loadPgm(path: string) {
  const b = readFileSync(path);
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 30).toString('latin1'))!;
  const g = gray(+m[1], +m[2]);
  g.d.set(b.subarray(m[0].length));
  return g;
}
const root = new URL('..', import.meta.url).pathname;
const spec: { id: string }[] = JSON.parse(readFileSync(root + 'date-spike/photo-crops.json', 'utf8')).photos;
for (const p of spec) {
  const row: string[] = [];
  for (const f of ['tight', 'loose', 'wide']) {
    let g = loadPgm(`${process.env.CROPS}/${p.id}-${f}.pgm`);
    const s0 = sharpness(g);
    g = blur(blur(g)); const s2 = sharpness(g);
    g = blur(blur(blur(blur(g)))); const s6 = sharpness(g);
    row.push(`${f}: ${s0.toFixed(1)} / blur2 ${s2.toFixed(1)} / blur6 ${s6.toFixed(1)}`);
  }
  console.log(p.id.padEnd(9), row.join(' | '));
}
