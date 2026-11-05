import type { Cam } from './camera.ts';
import type { Engine } from './engines.ts';
import { type Gray, frameDiff, sharpness, thumb } from './image.ts';
import { type MonthYear, fmtMY } from './parse.ts';
import { type ReadResult, readDate } from './reader.ts';

/** What the one status line says. Exactly one at a time. */
export type ScanStatus = 'ready' | 'looking' | 'reading' | 'hold' | 'checking' | 'got' | 'none';
/** `seen` is the date read once and waiting for a second frame to agree ("10/2028"). */
export type StatusInfo = { frames: number; skipped: number; seen?: string };

/** Why the loop stopped on a date. */
export type StopReason = 'agreement' | 'confident' | 'single';

export type LoopOut = {
  outcome: 'got' | 'none' | 'stopped';
  res: ReadResult | null; // on 'got' the frame that completed the answer; otherwise the last frame read, with no value
  crop: Gray | null; // the exact frame that produced the result (or the last one read)
  frames: number; // frames actually read (OCR run)
  skipped: number; // frames skipped as blurred or moving
  totalMs: number; // from the READ tap to the end
  aimMs: number; // from the READ tap to the start of the first frame that went into the answer
  computeMs: number; // OCR + parse of the frames from there to the answer (all of them, so agreement shows as compute)
  ms: number; // = totalMs, kept for older callers
  aborted: boolean;
  agreed: number; // frames that gave the answer's month and year (1 for a lone confident or unchecked read)
  stop: StopReason | null;
  lone: { value: MonthYear; text: string } | null; // on 'none': a date read once and never confirmed
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

/** A frame is "moving" when its thumbnail differs this much from the last one (mean grey levels, 0..255). */
export const MOVING_DIFF = 12;
/** A frame is "blurred" when it is this much less sharp than the sharpest frame so far in this scan. */
export const BLUR_RATIO = 0.65;
/** Mean edge strength below this means there is nothing to read in the box. */
export const FLAT_SHARPNESS = 2;
/** Never skip more than this many frames in a row: read one anyway so a shaky hand can't starve the loop. */
const MAX_SKIPS = 12;

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
  let frames = 0, skipped = 0, skipRun = 0, best = 0, prev: Gray | null = null;
  let last: Gray | null = null, lastRes: ReadResult | null = null;
  // month-year -> the frames that read it, so the second one can complete the answer
  const seen = new Map<number, { v: MonthYear; n: number; firstStart: number; computeMs: number; text: string }>();
  let pending: string | undefined; // a date read once, waiting for company
  const gate = timeoutMs > 0; // a single tapped read (no auto-retry) reads whatever frame it gets
  const say = (s: ScanStatus) => onStatus?.(s, { frames, skipped, seen: pending });
  const waiting = () => say(pending ? 'checking' : 'looking');
  for (;;) {
    const crop = cam.captureBox();
    last = crop;
    const th = thumb(crop);
    const sharp = sharpness(crop);
    best = Math.max(best * 0.98, sharp);
    const first = !prev; // the tap itself shakes the phone: look at one frame to measure motion before reading anything
    const moving = prev ? frameDiff(prev, th) > MOVING_DIFF : false;
    const blurred = sharp < best * BLUR_RATIO;
    const flat = sharp < FLAT_SHARPNESS; // nothing with edges in view: a wall, a table, the lens cap
    prev = th;
    if (gate && flat) {
      waiting();
    } else if (gate && (first || moving || blurred) && skipRun < MAX_SKIPS) {
      skipped++; skipRun++;
      say('hold');
    } else {
      skipRun = 0;
      say('reading');
      await paint(); // OCR runs on the main thread: let "Reading frame" reach the screen before it blocks
      const tFrame = performance.now();
      const res = await readDate(engine, crop, { maxMs: 3000, ...readOpts });
      frames++;
      lastRes = res;
      if (abort()) break; // the owner moved on while this frame was being read: drop the result
      if (res.value) {
        const now = performance.now();
        const done = (stop: StopReason, agreed: number, aim: number, compute: number): LoopOut =>
          ({ outcome: 'got', res, crop, frames, skipped, totalMs: now - t0, aimMs: aim - t0, computeMs: compute, ms: now - t0, aborted: false, agreed, stop, lone: null });
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
  const rest = lastRes ? { ...lastRes, value: null, yearAssumed: false } : null;
  return {
    outcome: aborted ? 'stopped' : 'none', res: rest, crop: last, frames, skipped, totalMs: total, aimMs: total, computeMs: lastRes?.ms ?? 0, ms: total, aborted,
    agreed: 0, stop: null, lone: lone ? { value: lone.v, text: lone.text } : null,
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
