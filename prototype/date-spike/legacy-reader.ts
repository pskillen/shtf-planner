// The round-1 reader, kept only so the bench can show before/after compute time: 4 variants x 2 rotations, stop on two agreeing reads.
import type { Engine } from '../src/spikes/date/engines.ts';
import { type Gray, VARIANTS_V1, rotate } from '../src/spikes/date/image.ts';
import { type MonthYear, parseDates } from '../src/spikes/date/parse.ts';

export async function readDateLegacy(engine: Engine, crop: Gray, now?: Date) {
  const t0 = performance.now();
  let passes = 0;
  const tally = new Map<number, { v: MonthYear; votes: number; text: string }>();
  let winner: { v: MonthYear; votes: number; text: string } | undefined;
  outer: for (const rot of [0, 180] as const) {
    for (const v of VARIANTS_V1) {
      if (performance.now() - t0 > 4000) break outer;
      const out = await engine.read(v.apply(rotate(crop, rot)));
      passes++;
      const p = parseDates(out.text, now);
      if (!p.best) continue;
      const k = p.best.year * 12 + p.best.month;
      const e = tally.get(k) ?? { v: { month: p.best.month, year: p.best.year }, votes: 0, text: out.text };
      e.votes++;
      tally.set(k, e);
      winner = [...tally.values()].sort((a, b) => b.votes - a.votes)[0];
      if (winner.votes >= 2 && tally.size === 1) break outer;
    }
    if (winner && winner.votes >= 2) break;
  }
  return { value: winner?.v ?? null, text: winner?.text ?? '', ms: performance.now() - t0, passes };
}
