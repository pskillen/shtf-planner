// Run: npm run test:loop   (node --experimental-strip-types)
// The scan loop with a scripted camera and engine: frame agreement, one confident read, assumed years.
import { type Gray, gray } from './image.ts';
import { scanUntil, type LoopOut, type ScanStatus } from './read-loop.ts';
import type { Engine } from './engines.ts';

// scanUntil waits for a paint between frames; there is no screen here
(globalThis as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 0);

/** A striped frame (so it has edges and counts as something to read). `level` brightens it; `sat` of the box is blown out to 255. */
function frame(i: number, sat = 0): Gray {
  const g = gray(96, 48);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.d[y * g.w + x] = ((x >> 2) & 1) ? 200 : 40;
  const blown = Math.round(g.d.length * sat);
  for (let k = 0; k < blown; k++) g.d[k] = 255;
  return g;
}

/** texts[n] is what every pass of the engine "sees" on the n-th frame (repeats the last one). `conf` is the engine's confidence. */
function run(texts: string[], opts: { needAgree: boolean; conf?: number; timeoutMs?: number; sat?: number[] }) {
  let n = -1;
  const cam: any = { captureBox: () => { n++; return frame(n, opts.sat?.[Math.min(n, opts.sat.length - 1)] ?? 0); } };
  const engine: Engine = {
    name: 'script', init: async () => {}, dispose: async () => {},
    read: async () => ({ text: texts[Math.min(Math.max(n, 0), texts.length - 1)], conf: opts.conf ?? 0.95 }),
  };
  const statuses: ScanStatus[] = [];
  const texts2: string[] = [];
  return scanUntil(cam, engine, opts.timeoutMs ?? 4000, () => false, (s, i) => { statuses.push(s); if (i.seen) texts2.push(i.seen); }, { needAgree: opts.needAgree })
    .then((out) => ({ out, statuses, seen: texts2 }));
}

const fails: string[] = [];
const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails.push(`  ${name} ${detail}`); };
const brief = (o: LoopOut) => `${o.outcome} ${o.res?.value ? o.res.value.month + '/' + o.res.value.year : '-'} agreed ${o.agreed} stop ${o.stop} frames ${o.frames}`;

const NOW_YEAR = new Date().getFullYear();
const Y = String(NOW_YEAR + 2); // a printed year clear of the parser's limits

{ // agreement off: the first date read is the answer
  const { out } = await run(['06/10/' + Y.slice(2) + ' junk'], { needAgree: false });
  check('off: first read', out.outcome === 'got' && out.stop === 'single' && out.agreed === 1, brief(out));
}
{ // a plain unlabelled date read twice in a row: needs the second frame
  const { out, statuses, seen } = await run(['L2314B 06/10/' + Y.slice(2)], { needAgree: true, conf: 0.8 });
  check('on: two frames agree', out.outcome === 'got' && out.stop === 'agreement' && out.agreed === 2, brief(out));
  check('on: status says checking after the first', statuses.includes('checking') && seen[0] === '10/' + Y, `${statuses.join(',')} ${seen}`);
}
{ // a labelled, clean read passes alone
  const { out } = await run(['BEST BEFORE 06 10 ' + Y], { needAgree: true, conf: 0.99 });
  check('on: one confident read', out.outcome === 'got' && out.stop === 'confident' && out.agreed === 1, brief(out));
}
{ // day and month only: the year is assumed, so it always needs two
  const { out } = await run(['BEST BEFORE 11 NOV'], { needAgree: true, conf: 0.99 });
  check('on: assumed year needs two', out.outcome === 'got' && out.stop === 'agreement' && out.agreed === 2 && out.res?.yearAssumed === true, brief(out));
}
{ // two frames that disagree never settle: none, with the first reported as seen once
  const { out } = await run(Array.from({ length: 40 }, (_, i) => 'BB ' + String((i % 12) + 1).padStart(2, '0') + '/' + Y), { needAgree: true, conf: 0.9, timeoutMs: 700 });
  check('on: disagreeing frames give none', out.outcome === 'none' && out.res?.value === null && !!out.lone, brief(out) + ' lone ' + JSON.stringify(out.lone));
}
{ // no frame reads anything: none
  const { out } = await run(['nothing here'], { needAgree: true, timeoutMs: 800 });
  check('on: nothing to read', out.outcome === 'none' && !out.lone, brief(out));
}
{ // a single tapped read (timeout 0) is one frame: agreement cannot apply
  const { out } = await run(['BB 06/' + Y], { needAgree: true, conf: 0.8, timeoutMs: 0 });
  check('one tapped read stands alone', out.outcome === 'got' && out.stop === 'single', brief(out));
}
console.log(`loop: ${fails.length ? 'FAILED' : 'ok'}`);
for (const f of fails) console.log(f);
if (fails.length) throw new Error('loop cases failed');
