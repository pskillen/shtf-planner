import type { Cam } from './camera.ts';
import type { Engine } from './engines.ts';
import { type Gray, frameDiff, saturatedShare, sharpness, thumb } from './image.ts';
import { type MonthYear, type Suggestion, fmtMY } from './parse.ts';
import { type ReadResult, readDate } from './reader.ts';

/** What the one status line says. Exactly one at a time. */
export type ScanStatus = 'ready' | 'looking' | 'reading' | 'hold' | 'glare' | 'checking' | 'got' | 'none';
/** `seen` is the date read once and waiting for a second frame to agree ("10/2028"). */
export type StatusInfo = { frames: number; skipped: number; seen?: string };

/** Why the loop stopped on a date. */
export type StopReason = 'agreement' | 'confident' | 'single';

export type LoopOut = {
  outcome: 'got' | 'none' | 'stopped';
  res: ReadResult | null; // on 'got' the frame that completed the answer; otherwise the last frame read, with no value
  crop: Gray | null; // the exact frame that produced the result (or the last one read)
  frames: number; // frames actually read (OCR run)
  skipped: number; // frames skipped as blurred or moving (= skippedMotion + skippedBlur)
  skippedMotion: number; // ...of which for motion (the first frame after the tap counts here)
  skippedBlur: number; // ...of which for blur
  glare: number; // frames not read because the box was washed out by a reflection
  totalMs: number; // from the READ tap to the end
  aimMs: number; // from the READ tap to the start of the first frame that went into the answer
  computeMs: number; // OCR + parse of the frames from there to the answer (all of them, so agreement shows as compute)
  ms: number; // = totalMs, kept for older callers
  aborted: boolean;
  agreed: number; // frames that gave the answer's month and year (1 for a lone confident or unchecked read)
  stop: StopReason | null;
  lone: { value: MonthYear; text: string } | null; // on 'none': a date read once and never confirmed
  suggestions: (Suggestion & { why: 'seen once' | 'weak read' })[]; // on 'none': up to three plausible month-years to offer as one-tap choices
};

export type ScanOpts = {
  rotations?: (0 | 90 | 180 | 270)[];
  /** Round 3: "Got it" only when two frames give the same month and year, unless one read is very confident. */
  needAgree?: boolean;
};

/**
 * A single frame is trusted alone only above this. Picked from the bench: over 103 crops (27 photo crops, 76 synthetic)
 * and two engines, every wrong single pass had a parser confidence of 0.6 or less (no label, or year assumed), which
 * the reader turns into a frame confidence of 0.7 at most even when two variants agree on it. 0.85 sits clear above that
 * and still lets about a third of the right Paddle frames through alone. Year-assumed reads never pass alone.
 */
export const CONFIDENT_ALONE = 0.85;

/**
 * Glare: when at least GLARE_MIN and at most GLARE_MAX of the box is blown out (250+ grey levels) the status line says to
 * tilt the phone, and the frame is not read. From the bench: none of the 27 photo crops as shot has more than 0.7% (the
 * milk and curry labels 0.0%); a label washed out to ~90% (the synthetic white backgrounds) is paper, not a reflection,
 * so above the upper bound a frame is read as usual. A reflection over a fifth to two thirds of the box is what hides print.
 */
export const GLARE_MIN = 0.2;
export const GLARE_MAX = 0.65;
/** Read a frame anyway after this many glare frames in a row, so a label that really is that bright can't lock the loop. */
const MAX_GLARE_RUN = 25;

/** A frame is "moving" when its thumbnail differs this much from the last one (mean grey levels, 0..255). */
export const MOVING_DIFF = 18; // round 4a: was 12; the owner's Chrome stocktake skipped 11-29 frames an item
/** A frame is "blurred" when it is this much less sharp than the sharpest frame so far in this scan. */
export const BLUR_RATIO = 0.5; // round 4a: was 0.65
/** Mean edge strength below this means there is nothing to read in the box. */
export const FLAT_SHARPNESS = 2;
/** Never skip more than this many frames in a row: read one anyway so a shaky hand can't starve the loop. */
const MAX_SKIPS = 4; // round 4a: was 12

/** Resolves after the next paint (or 60 ms, in a background tab where rAF does not fire). */
const paint = () => new Promise<void>((r) => { const t = setTimeout(r, 60); requestAnimationFrame(() => { clearTimeout(t); setTimeout(r, 0); }); });

/**
 * Look at the framed region again and again until a date is settled, the timeout passes or `abort()` is true.
 * Frames that are blurred or moving are skipped (status `hold`) instead of read. With `needAgree` a date is settled when
 * two frames give the same month and year, or one frame is very confident (CONFIDENT_ALONE, never when the year was
 * assumed); without it, the first date read settles it, as in round 2. Stops at the first answer: the caller freezes it,
 * nothing keeps grabbing frames after this returns.
 */
export async function scanUntil(
  cam: Cam, engine: Engine, timeoutMs: number, abort: () => boolean,
  onStatus?: (s: ScanStatus, i: StatusInfo) => void, opts: ScanOpts = {},
): Promise<LoopOut> {
  const t0 = performance.now();
  const needAgree = (opts.needAgree ?? false) && timeoutMs > 0; // one tapped read (auto off) is one frame: nothing to agree with
  const readOpts = opts.rotations ? { rotations: opts.rotations } : {};
  let frames = 0, skipped = 0, skippedMotion = 0, skippedBlur = 0, glare = 0, glareRun = 0, skipRun = 0, best = 0, prev: Gray | null = null;
  let last: Gray | null = null, lastRes: ReadResult | null = null;
  // month-year -> the frames that read it, so the second one can complete the answer
  const seen = new Map<number, { v: MonthYear; n: number; firstStart: number; computeMs: number; text: string }>();
  const weak = new Map<string, { s: Suggestion; n: number }>(); // weak runs over all frames
  let pending: string | undefined; // a date read once, waiting for company
  const gate = timeoutMs > 0; // a single tapped read (no auto-retry) reads whatever frame it gets
  const say = (s: ScanStatus) => onStatus?.(s, { frames, skipped, seen: pending });
  const waiting = () => say(pending ? 'checking' : 'looking');
  for (;;) {
    const crop = cam.captureBox();
    last = crop;
    const th = thumb(crop);
    const sharp = sharpness(crop);
    best = Math.max(best * 0.9, sharp); // round 4a: was 0.98, so one sharp frame made every later one look blurred for ~35 frames
    const first = !prev; // the tap itself shakes the phone: look at one frame to measure motion before reading anything
    const moving = prev ? frameDiff(prev, th) > MOVING_DIFF : false;
    const blurred = sharp < best * BLUR_RATIO;
    const flat = sharp < FLAT_SHARPNESS; // nothing with edges in view: a wall, a table, the lens cap
    prev = th;
    const sat = saturatedShare(crop);
    if (gate && sat >= GLARE_MIN && sat <= GLARE_MAX && glareRun < MAX_GLARE_RUN) {
      glare++; glareRun++;
      say('glare');
    } else if (gate && flat) {
      glareRun = 0;
      waiting();
    } else if (gate && (first || moving || blurred) && skipRun < MAX_SKIPS) {
      glareRun = 0;
      skipped++; skipRun++;
      if (first || moving) skippedMotion++; else skippedBlur++;
      say('hold');
    } else {
      skipRun = 0; glareRun = 0;
      say('reading');
      await paint(); // OCR runs on the main thread: let "Reading frame" reach the screen before it blocks
      const tFrame = performance.now();
      const res = await readDate(engine, crop, { maxMs: 3000, ...readOpts });
      frames++;
      lastRes = res;
      for (const x of res.suggestions) { const e = weak.get(fmtMY(x)); if (e) e.n++; else weak.set(fmtMY(x), { s: x, n: 1 }); }
      if (abort()) break; // the owner moved on while this frame was being read: drop the result
      if (res.value) {
        const now = performance.now();
        const done = (stop: StopReason, agreed: number, aim: number, compute: number): LoopOut =>
          ({ outcome: 'got', res, crop, frames, skipped, glare, skippedMotion, skippedBlur, totalMs: now - t0, aimMs: aim - t0, computeMs: compute, ms: now - t0, aborted: false, agreed, stop, lone: null, suggestions: [] });
        if (!needAgree) return done('single', 1, tFrame, res.ms);
        const k = res.value.year * 12 + res.value.month;
        const e = seen.get(k) ?? { v: res.value, n: 0, firstStart: tFrame, computeMs: 0, text: res.text };
        e.n++; e.computeMs += res.ms;
        seen.set(k, e);
        if (e.n >= 2) return done('agreement', e.n, e.firstStart, e.computeMs);
        if (!res.yearAssumed && res.confidence >= CONFIDENT_ALONE) return done('confident', 1, tFrame, res.ms);
        pending = fmtMY(res.value);
      }
      waiting();
    }
    if (abort()) break;
    if (performance.now() - t0 >= timeoutMs) break;
    await new Promise((r) => setTimeout(r, first || skipRun > 0 ? 110 : 80));
  }
  const total = performance.now() - t0;
  const aborted = abort();
  // the last frame's read, minus its date: anything left unconfirmed is reported as `lone`, never as an answer
  const lone = [...seen.values()].sort((a, b) => b.n - a.n)[0];
  const rest = lastRes ? { ...lastRes, value: null, yearAssumed: false, expired: false } : null;
  const sugg: LoopOut['suggestions'] = [];
  const addS = (x: Suggestion, why: 'seen once' | 'weak read') => { if (!sugg.some((y) => y.year === x.year && y.month === x.month)) sugg.push({ ...x, why }); };
  for (const e of seen.values()) addS({ ...e.v, text: e.text.replace(/\s+/g, ' ').slice(0, 30), expired: e.v.year * 12 + e.v.month < new Date().getFullYear() * 12 + new Date().getMonth() + 1 }, 'seen once');
  [...weak.values()].sort((a, b) => b.n - a.n).forEach((e) => addS(e.s, 'weak read'));
  return {
    outcome: aborted ? 'stopped' : 'none', res: rest, crop: last, frames, skipped, skippedMotion, skippedBlur, glare, totalMs: total, aimMs: total, computeMs: lastRes?.ms ?? 0, ms: total, aborted,
    agreed: 0, stop: null, lone: lone ? { value: lone.v, text: lone.text } : null, suggestions: sugg.slice(0, 3),
  };
}

export const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
export const p90 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))] : 0; };

export function load<T>(key: string, dflt: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return dflt; }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: log lives in memory only */ }
}
export async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = t; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
