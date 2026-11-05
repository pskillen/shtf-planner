// Read a best-before month-year from one cropped frame: try preprocessing variants (cheapest likely first),
// parse each OCR text, stop at the first confident parse. Used by the UI and by the desktop bench.
import type { Engine } from './engines.ts';
import { type Gray, VARIANTS, type Variant, rotate } from './image.ts';
import { type DateHit, type MonthYear, parseDates } from './parse.ts';

export type Try = { variant: string; rot: number; text: string; conf: number; hit: DateHit | null; ms: number };
export type ReadResult = {
  value: MonthYear | null;
  yearAssumed: boolean; // day and month were printed, the year was filled in
  confidence: number; // 0..1, combined
  text: string; // raw OCR text of the winning try (or the first non-empty)
  votes: number;
  tries: Try[];
  variants: number; // OCR passes made on this frame (variants x rotations)
  rotations: number;
  ms: number; // compute: OCR + parse of this one frame
  engine: string;
};

export type ReadOpts = {
  now?: Date;
  /** Only 0 by default. Add 90/270/180 only when the owner asks for it: each one doubles the work. */
  rotations?: (0 | 90 | 180 | 270)[];
  variants?: Variant[];
  maxMs?: number; // stop trying after this
  needVotes?: number; // agreeing reads before early exit, when no single read is confident
};

/** A single read is trusted outright when the parser is sure of the shape and the engine is sure of the characters. */
const confident = (parserConf: number, engineConf: number, assumed: boolean) => !assumed && parserConf >= 0.7 && engineConf >= 0.75;

export async function readDate(engine: Engine, crop: Gray, o: ReadOpts = {}): Promise<ReadResult> {
  const t0 = performance.now();
  const rotations = o.rotations ?? [0];
  const variants = (o.variants ?? VARIANTS).filter((v) => !v.redundant?.(crop));
  const maxMs = o.maxMs ?? 4000;
  const need = o.needVotes ?? 2;
  const tries: Try[] = [];
  const tally = new Map<number, { v: MonthYear; votes: number; conf: number; text: string; assumed: boolean; sure: boolean }>();
  let winner: { v: MonthYear; votes: number; conf: number; text: string; assumed: boolean; sure: boolean } | undefined;

  outer: for (const rot of rotations) {
    for (const v of variants) {
      if (performance.now() - t0 > maxMs) break outer;
      const t1 = performance.now();
      const img = v.apply(rotate(crop, rot));
      const out = await engine.read(img);
      const p = parseDates(out.text, o.now);
      tries.push({ variant: v.name, rot, text: out.text, conf: out.conf, hit: p.best, ms: performance.now() - t1 });
      if (!p.best) continue;
      const k = p.best.year * 12 + p.best.month;
      const sure = confident(p.confidence, out.conf, !!p.best.yearAssumed);
      const e = tally.get(k) ?? { v: { month: p.best.month, year: p.best.year }, votes: 0, conf: 0, text: out.text, assumed: !!p.best.yearAssumed, sure: false };
      e.votes++;
      e.sure ||= sure;
      e.conf = Math.max(e.conf, p.confidence * (0.5 + 0.5 * Math.min(1, out.conf + 0.2)));
      tally.set(k, e);
      winner = [...tally.values()].sort((a, b) => b.votes - a.votes || b.conf - a.conf)[0];
      if (sure && tally.size === 1) break outer; // first confident parse: stop
      if (winner.votes >= need && tally.size === 1) break outer;
    }
    if (winner && winner.votes >= need) break;
  }
  const ms = performance.now() - t0;
  const first = tries.find((t) => t.text)?.text ?? '';
  const base = { tries, variants: tries.length, rotations: rotations.length, ms, engine: engine.name };
  if (!winner) return { value: null, yearAssumed: false, confidence: 0, text: first, votes: 0, ...base };
  // Disagreeing reads: lower the confidence. A single unconfirmed, unsure read is capped.
  let c = winner.conf;
  if (winner.votes >= 2) c = Math.min(0.97, c + 0.1 * (winner.votes - 1));
  else if (!winner.sure) c = Math.min(c, 0.6);
  else c = Math.min(c, 0.9);
  if (tally.size > 1) c *= 0.6;
  return { value: winner.v, yearAssumed: winner.assumed, confidence: c, text: winner.text, votes: winner.votes, ...base };
}
