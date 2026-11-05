import type { Cam } from './camera.ts';
import type { Engine } from './engines.ts';
import { type Gray, frameDiff, sharpness, thumb } from './image.ts';
import { type ReadResult, readDate } from './reader.ts';

/** What the one status line says. Exactly one at a time. */
export type ScanStatus = 'ready' | 'looking' | 'reading' | 'hold' | 'got' | 'none';
export type StatusInfo = { frames: number; skipped: number };

export type LoopOut = {
  outcome: 'got' | 'none' | 'stopped';
  res: ReadResult | null;
  crop: Gray | null; // the exact frame that produced the result (or the last one read)
  frames: number; // frames actually read (OCR run)
  skipped: number; // frames skipped as blurred or moving
  totalMs: number; // from the READ tap to the end
  aimMs: number; // from the READ tap to the start of the frame that produced the result
  computeMs: number; // OCR + parse of that frame
  ms: number; // = totalMs, kept for older callers
  aborted: boolean;
};

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
 * Look at the framed region again and again until a date parses, the timeout passes or `abort()` is true.
 * Frames that are blurred or moving are skipped (status `hold`) instead of read. Stops at the first result:
 * the caller freezes it, nothing keeps grabbing frames after this returns.
 */
export async function scanUntil(
  cam: Cam, engine: Engine, timeoutMs: number, abort: () => boolean,
  onStatus?: (s: ScanStatus, i: StatusInfo) => void, readOpts: { rotations?: (0 | 90 | 180 | 270)[] } = {},
): Promise<LoopOut> {
  const t0 = performance.now();
  let frames = 0, skipped = 0, skipRun = 0, best = 0, prev: Gray | null = null;
  let last: Gray | null = null, lastRes: ReadResult | null = null;
  const gate = timeoutMs > 0; // a single tapped read (no auto-retry) reads whatever frame it gets
  const say = (s: ScanStatus) => onStatus?.(s, { frames, skipped });
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
      say('looking');
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
        return { outcome: 'got', res, crop, frames, skipped, totalMs: now - t0, aimMs: tFrame - t0, computeMs: res.ms, ms: now - t0, aborted: false };
      }
      say('looking');
    }
    if (abort()) break;
    if (performance.now() - t0 >= timeoutMs) break;
    await new Promise((r) => setTimeout(r, first || skipRun > 0 ? 110 : 80));
  }
  const total = performance.now() - t0;
  const aborted = abort();
  return { outcome: aborted ? 'stopped' : 'none', res: lastRes, crop: last, frames, skipped, totalMs: total, aimMs: total, computeMs: lastRes?.ms ?? 0, ms: total, aborted };
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
