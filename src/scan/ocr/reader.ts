import { FrameTally, type FrameVerdict } from '../../engine/datecode';
import { FRAME_MAX_MS } from '../tunables';
import { variantsFor, type Gray } from './image';
import type { Engine } from './paddle';

export interface ReadFrameOptions {
  /** Stop trying more pictures after this long. */
  maxMs?: number;
  /** A clock in milliseconds (tests). */
  now?: () => number;
}

/**
 * Reads one cropped frame: the pictures of {@link variantsFor} in order (cheapest first), each
 * through the text reader and the date parser, stopping at the first sure parse or at two passes
 * that agree. Returns the frame's verdict; the picture itself never leaves this function.
 */
export async function readFrame(
  engine: Engine,
  crop: Gray,
  todayIso: string,
  opts: ReadFrameOptions = {},
): Promise<FrameVerdict> {
  const now = opts.now ?? (() => performance.now());
  const maxMs = opts.maxMs ?? FRAME_MAX_MS;
  const t0 = now();
  const tally = new FrameTally(todayIso);
  for (const v of variantsFor(crop)) {
    if (now() - t0 > maxMs) break;
    const t1 = now();
    const out = await engine.read(v.apply(crop));
    const done = tally.add({
      variant: v.name,
      text: out.text,
      engineConf: out.conf,
      ms: now() - t1,
    });
    if (done) break;
  }
  return tally.verdict(now() - t0);
}
