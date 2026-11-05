import {
  AgreementTally,
  type FrameVerdict,
  type OfferedSuggestion,
  type Settled,
} from '../engine/datecode';
import { frameDiff, saturatedShare, sharpness, thumb, type Gray } from './ocr/image';
import {
  BLUR_RATIO,
  CAPTURE_MAX_H,
  DATE_BOX,
  DATE_GAP_MS,
  DATE_SKIP_GAP_MS,
  DATE_TIMEOUT_MS,
  FLAT_SHARPNESS,
  GLARE_MAX,
  GLARE_MIN,
  MAX_GLARE_RUN,
  MAX_SKIPS,
  MOVING_DIFF,
  SHARP_DECAY,
  type Box,
} from './tunables';

/** What the loop needs from the camera (the real `CameraStream` has it). */
export interface DateCamera {
  captureGray(box: Box, maxHeight?: number): Gray;
}

/** What the loop needs from the reader (the real `DateReader` has it). */
export interface FrameReader {
  read(frame: Gray, todayIso: string): Promise<FrameVerdict>;
}

/** What the one status line says while the loop runs. The UI adds "getting the reader ready" and "got it". */
export type LoopStatus = 'looking' | 'hold' | 'glare' | 'reading' | 'checking';

export interface StatusInfo {
  frames: number;
  /** The date read once and waiting for a second frame to agree, as `YYYY-MM`-free month and year. */
  pending?: { month: number; year: number };
}

export interface LoopOptions {
  /** Today, `YYYY-MM-DD`. */
  todayIso: string;
  timeoutMs?: number;
  /** Settle only on two agreeing frames or one confident one (default). Off: the first date read settles. */
  needAgree?: boolean;
  /** The part of the strip to look at. */
  box?: Box;
  onStatus?: (status: LoopStatus, info: StatusInfo) => void;
  /** A clock in milliseconds and a sleep (tests). */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface LoopOut {
  /** `got`: settled. `none`: timed out. `stopped`: aborted. `failed`: the reader is not available. */
  outcome: 'got' | 'none' | 'stopped' | 'failed';
  settled: Settled | null;
  /** The frame that completed the answer, or the last one read: in memory, for the person to see. */
  crop: Gray | null;
  /** Frames read. */
  frames: number;
  skippedMotion: number;
  skippedBlur: number;
  /** Frames not read because a reflection washed out the box. */
  glare: number;
  /** From the start to the end. */
  totalMs: number;
  /** From the start to the first frame that went into the answer. */
  aimMs: number;
  /** Compute of the frames that went into the answer. */
  computeMs: number;
  /** On `none`: a date read once and never confirmed. */
  lone: { month: number; year: number } | null;
  /** On `none`: up to three one-tap choices, best first. */
  suggestions: OfferedSuggestion[];
  /** On `failed`: why. */
  message?: string;
}

export interface DateLoop {
  result: Promise<LoopOut>;
  /** Stops the loop; an in-flight read's answer is dropped. */
  abort(): void;
  /** Ends the search now as if the time had run out: `none`, with suggestions. */
  stop(): void;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Looks at the date box again and again until a date is settled, the time runs out or `abort()`.
 * Each tick: capture, measure, then skip (glare, flat, moving, blurred) or read. Frames that are
 * moving or blurred are skipped, at most {@link MAX_SKIPS} in a row, then one is read anyway; the
 * first frame after the step starts is never read (the tap shakes the phone). One read is in
 * flight at a time. Stops at the first answer: nothing keeps grabbing frames after it settles.
 */
export function startDateLoop(cam: DateCamera, reader: FrameReader, opts: LoopOptions): DateLoop {
  let aborted = false;
  let stopped = false;
  const result = run(
    cam,
    reader,
    opts,
    () => aborted,
    () => stopped,
  );
  return {
    result,
    abort() {
      aborted = true;
    },
    stop() {
      stopped = true;
    },
  };
}

async function run(
  cam: DateCamera,
  reader: FrameReader,
  opts: LoopOptions,
  isAborted: () => boolean,
  isStopped: () => boolean,
): Promise<LoopOut> {
  const now = opts.now ?? (() => performance.now());
  const sleep = opts.sleep ?? wait;
  const timeoutMs = opts.timeoutMs ?? DATE_TIMEOUT_MS;
  const box = opts.box ?? DATE_BOX;
  const tally = new AgreementTally(opts.todayIso, { needAgree: opts.needAgree ?? true });
  const t0 = now();

  let frames = 0;
  let skippedMotion = 0;
  let skippedBlur = 0;
  let glare = 0;
  let glareRun = 0;
  let skipRun = 0;
  let sharpest = 0;
  let prev: Gray | null = null;
  let last: Gray | null = null;

  const say = (s: LoopStatus): void => opts.onStatus?.(s, { frames, pending: tally.pending });
  const waiting = (): void => say(tally.pending ? 'checking' : 'looking');
  const out = (
    outcome: LoopOut['outcome'],
    settled: Settled | null,
    crop: Gray | null,
    extra: Partial<LoopOut> = {},
  ): LoopOut => {
    const end = tally.finish();
    const total = now() - t0;
    return {
      outcome,
      settled,
      crop,
      frames,
      skippedMotion,
      skippedBlur,
      glare,
      totalMs: total,
      aimMs: settled ? settled.firstAt - t0 : total,
      computeMs: settled ? settled.computeMs : 0,
      lone: settled ? null : (end.lone?.value ?? null),
      suggestions: settled ? [] : end.suggestions,
      ...extra,
    };
  };

  for (;;) {
    if (isAborted()) return out('stopped', null, last);
    let crop: Gray | null = null;
    try {
      crop = cam.captureGray(box, CAPTURE_MAX_H);
    } catch {
      // The camera is not showing a picture yet.
    }
    if (crop) {
      last = crop;
      const th = thumb(crop);
      const sharp = sharpness(crop);
      // The memory decays, so one sharp frame does not make every later one look blurred.
      sharpest = Math.max(sharpest * SHARP_DECAY, sharp);
      const first = prev === null;
      const moving = prev ? frameDiff(prev, th) > MOVING_DIFF : false;
      const blurred = sharp < sharpest * BLUR_RATIO;
      const flat = sharp < FLAT_SHARPNESS;
      prev = th;
      const sat = saturatedShare(crop);
      if (sat >= GLARE_MIN && sat <= GLARE_MAX && glareRun < MAX_GLARE_RUN) {
        glare++;
        glareRun++;
        say('glare');
      } else if (flat) {
        glareRun = 0;
        waiting();
      } else if ((first || moving || blurred) && skipRun < MAX_SKIPS) {
        glareRun = 0;
        skipRun++;
        if (first || moving) skippedMotion++;
        else skippedBlur++;
        say('hold');
      } else {
        skipRun = 0;
        glareRun = 0;
        say('reading');
        const at = now();
        let verdict: FrameVerdict;
        try {
          verdict = await reader.read(crop, opts.todayIso);
        } catch (e) {
          if (isAborted()) return out('stopped', null, last);
          return out('failed', null, last, {
            message: e instanceof Error ? e.message : String(e),
          });
        }
        frames++;
        // The person moved on while this frame was being read: drop the answer.
        if (isAborted()) return out('stopped', null, last);
        const settled = tally.addFrame(verdict, at);
        if (settled) return out('got', settled, crop);
        waiting();
      }
    } else {
      waiting();
    }
    if (isAborted()) return out('stopped', null, last);
    if (isStopped() || now() - t0 >= timeoutMs) return out('none', null, last);
    await sleep(prev === null || skipRun > 0 ? DATE_SKIP_GAP_MS : DATE_GAP_MS);
  }
}
