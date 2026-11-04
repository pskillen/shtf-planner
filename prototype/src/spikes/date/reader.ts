// Read a best-before month-year from one cropped frame: try preprocessing variants and rotations,
// parse each OCR text, and accept on agreement. Used by the UI and by the desktop bench.
import type { Engine } from './engines.ts';
import { type Gray, VARIANTS, rotate } from './image.ts';
import { type DateHit, type MonthYear, parseDates } from './parse.ts';

export type Try = { variant: string; rot: number; text: string; conf: number; hit: DateHit | null; ms: number };
export type ReadResult = {
  value: MonthYear | null;
  confidence: number; // 0..1, combined
  text: string; // raw OCR text of the winning try (or the first non-empty)
  votes: number;
  tries: Try[];
  ms: number;
  engine: string;
};

export type ReadOpts = {
  now?: Date;
  rotations?: (0 | 90 | 180 | 270)[];
  maxMs?: number; // stop trying after this
  needVotes?: number; // agreeing reads before early exit
};

export async function readDate(engine: Engine, crop: Gray, o: ReadOpts = {}): Promise<ReadResult> {
  const t0 = performance.now();
  const rotations = o.rotations ?? [0, 180];
  const maxMs = o.maxMs ?? 4000;
  const need = o.needVotes ?? 2;
  const tries: Try[] = [];
  const tally = new Map<number, { v: MonthYear; votes: number; conf: number; text: string }>();
  let winner: { v: MonthYear; votes: number; conf: number; text: string } | undefined;

  outer: for (const rot of rotations) {
    for (const v of VARIANTS) {
      if (performance.now() - t0 > maxMs) break outer;
      const t1 = performance.now();
      const img = v.apply(rotate(crop, rot));
      const out = await engine.read(img);
      const p = parseDates(out.text, o.now);
      tries.push({ variant: v.name, rot, text: out.text, conf: out.conf, hit: p.best, ms: performance.now() - t1 });
      if (!p.best) continue;
      const k = p.best.year * 12 + p.best.month;
      const e = tally.get(k) ?? { v: { month: p.best.month, year: p.best.year }, votes: 0, conf: 0, text: out.text };
      e.votes++;
      e.conf = Math.max(e.conf, p.confidence * (0.5 + 0.5 * Math.min(1, out.conf + 0.2)));
      tally.set(k, e);
      winner = [...tally.values()].sort((a, b) => b.votes - a.votes || b.conf - a.conf)[0];
      if (winner.votes >= need && tally.size === 1) break outer;
    }
    if (winner && winner.votes >= need) break;
  }
  const ms = performance.now() - t0;
  const first = tries.find((t) => t.text)?.text ?? '';
  if (!winner) return { value: null, confidence: 0, text: first, votes: 0, tries, ms, engine: engine.name };
  // Disagreeing reads: lower the confidence. A single unconfirmed read is capped.
  let c = winner.conf;
  if (winner.votes >= 2) c = Math.min(0.97, c + 0.1 * (winner.votes - 1));
  else c = Math.min(c, 0.6);
  if (tally.size > 1) c *= 0.6;
  return { value: winner.v, confidence: c, text: winner.text, votes: winner.votes, tries, ms, engine: engine.name };
}
