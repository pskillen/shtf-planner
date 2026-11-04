import type { Cam } from './camera.ts';
import type { Engine } from './engines.ts';
import type { Gray } from './image.ts';
import { type ReadResult, readDate } from './reader.ts';

export type LoopOut = { res: ReadResult | null; crop: Gray | null; ms: number; frames: number; aborted: boolean };

/** Grab the framed region and read it, again and again, until a date parses, the timeout passes or `abort()` is true. */
export async function readUntil(cam: Cam, engine: Engine, timeoutMs: number, abort: () => boolean, onFrame?: (crop: Gray, r: ReadResult) => void): Promise<LoopOut> {
  const t0 = performance.now();
  let frames = 0, last: Gray | null = null, lastRes: ReadResult | null = null;
  for (;;) {
    const crop = cam.captureBox();
    last = crop;
    const res = await readDate(engine, crop, { maxMs: 3000 });
    frames++;
    lastRes = res;
    onFrame?.(crop, res);
    if (res.value) return { res, crop, ms: performance.now() - t0, frames, aborted: false };
    if (performance.now() - t0 >= timeoutMs || abort()) break;
    await new Promise((r) => setTimeout(r, 80));
  }
  return { res: lastRes, crop: last, ms: performance.now() - t0, frames, aborted: abort() };
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
