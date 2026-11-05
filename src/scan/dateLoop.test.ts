import { describe, expect, it, vi } from 'vitest';
import type { FrameVerdict } from '../engine/datecode';
import { startDateLoop, type LoopOptions, type LoopStatus } from './dateLoop';
import { gray, type Gray } from './ocr/image';

const TODAY = '2026-11-15';

/** Vertical stripes between two grey levels, with the first `blown` share of pixels at 255. */
function frame(lo = 40, hi = 200, blown = 0): Gray {
  const g = gray(96, 48);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) g.d[y * g.w + x] = x % 3 === 0 ? lo : hi;
  g.d.fill(255, 0, Math.round(g.d.length * blown));
  return g;
}
const SHARP = () => frame();
const SHIFTED = () => frame(80, 240); // same edges, a different brightness: "moving"
/** Same average brightness as the sharp frame (so it is not "moving"), but soft edges: "blurred". */
const SOFT = () => frame(120, 160);
const FLAT = () => {
  const g = gray(96, 48);
  g.d.fill(128);
  return g;
};

const verdict = (over: Partial<FrameVerdict> = {}): FrameVerdict => ({
  value: null,
  yearAssumed: false,
  expired: false,
  suggestions: [],
  confidence: 0,
  text: '',
  votes: 0,
  passes: [],
  ms: 100,
  ...over,
});
const june = (confidence = 0.5): FrameVerdict =>
  verdict({ value: { month: 6, year: 2028 }, confidence, text: 'BB 06/2028', votes: 1 });

function setup(
  frames: Gray[],
  answer: (n: number, frame: Gray) => FrameVerdict | Promise<FrameVerdict>,
  opts: Partial<LoopOptions> = {},
) {
  let clock = 0;
  let captured = 0;
  const reads: Gray[] = [];
  const statuses: LoopStatus[] = [];
  const cam = { captureGray: () => frames[Math.min(captured++, frames.length - 1)]! };
  const reader = {
    read: vi.fn(async (f: Gray) => {
      reads.push(f);
      return answer(reads.length - 1, f);
    }),
  };
  const loop = startDateLoop(cam, reader, {
    todayIso: TODAY,
    timeoutMs: 3000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    onStatus: (s) => statuses.push(s),
    ...opts,
  });
  return { loop, reader, reads, statuses, captured: () => captured };
}

describe('the date loop: what it reads', () => {
  it('never reads the first frame after the step starts', async () => {
    const t = setup([SHARP()], () => verdict());
    await t.loop.result;
    expect(t.statuses[0]).toBe('hold');
    expect(t.reads[0]).toBeDefined();
    const out = await t.loop.result;
    expect(out.skippedMotion).toBe(1);
    expect(t.captured()).toBeGreaterThan(1);
  });

  it('skips moving frames, at most four in a row, then reads one anyway', async () => {
    const frames = Array.from({ length: 40 }, (_, i) => (i % 2 ? SHIFTED() : SHARP()));
    const t = setup(frames, () => verdict(), { timeoutMs: 1500 });
    const out = await t.loop.result;
    // the first frame and three moving ones are skipped; the fifth is read
    expect(t.reads[0]).toBe(frames[4]);
    expect(out.skippedMotion).toBeGreaterThanOrEqual(4);
  });

  it('skips a blurred frame and reads the sharp ones', async () => {
    const t = setup([SHARP(), SHARP(), SOFT(), SHARP()], () => verdict(), { timeoutMs: 200 });
    const out = await t.loop.result;
    expect(out.skippedBlur).toBeGreaterThanOrEqual(1);
    expect(out.frames).toBeGreaterThanOrEqual(2);
  });

  it('does not read flat frames: there is nothing there', async () => {
    const t = setup([FLAT()], () => verdict(), { timeoutMs: 500 });
    const out = await t.loop.result;
    expect(t.reader.read).not.toHaveBeenCalled();
    expect(out.outcome).toBe('none');
    expect(t.statuses.every((s) => s === 'looking')).toBe(true);
  });

  it('says glare and does not read while a reflection covers a fifth to two thirds of the box', async () => {
    const t = setup([frame(40, 200, 0.3)], () => verdict(), { timeoutMs: 1500 });
    const out = await t.loop.result;
    expect(t.statuses).toContain('glare');
    expect(out.glare).toBeGreaterThan(0);
    expect(out.frames).toBe(0 + t.reads.length);
  });

  it('reads anyway after 25 glare frames in a row', async () => {
    const t = setup([frame(40, 200, 0.3)], () => verdict(), { timeoutMs: 4000 });
    const out = await t.loop.result;
    expect(out.glare).toBeGreaterThanOrEqual(25);
    expect(t.statuses.slice(0, 25).every((s) => s === 'glare')).toBe(true);
    expect(t.statuses[25]).toBe('reading');
  });

  it('reads a bright label as usual: a washed-out box is paper, not glare', async () => {
    const t = setup([frame(40, 200, 0.9)], () => verdict(), { timeoutMs: 300 });
    const out = await t.loop.result;
    expect(out.glare).toBe(0);
    expect(t.statuses).not.toContain('glare');
  });
});

describe('the date loop: what it answers', () => {
  it('settles when two frames agree, and counts the frames that went into it', async () => {
    const t = setup([SHARP()], () => june(0.5));
    const out = await t.loop.result;
    expect(out.outcome).toBe('got');
    expect(out.settled).toMatchObject({ stop: 'agreement', agreed: 2 });
    expect(out.settled?.value).toEqual({ month: 6, year: 2028 });
    expect(out.frames).toBe(2);
    expect(out.computeMs).toBe(200);
    expect(out.aimMs).toBeGreaterThan(0);
    expect(out.aimMs).toBeLessThan(out.totalMs);
    expect(out.crop).not.toBeNull();
    expect(t.statuses).toContain('checking');
  });

  it('settles on one confident frame', async () => {
    const t = setup([SHARP()], () => june(0.9));
    const out = await t.loop.result;
    expect(out.settled).toMatchObject({ stop: 'confident', agreed: 1 });
    expect(out.frames).toBe(1);
  });

  it('stops grabbing frames once settled', async () => {
    const t = setup([SHARP()], () => june(0.9));
    await t.loop.result;
    const n = t.captured();
    await new Promise((r) => setTimeout(r, 20));
    expect(t.captured()).toBe(n);
  });

  it('times out with none, and offers suggestions from weak reads', async () => {
    const weak = verdict({
      suggestions: [{ month: 12, year: 2026, text: '12.26', expired: false }],
    });
    const t = setup([SHARP()], () => weak, { timeoutMs: 1000 });
    const out = await t.loop.result;
    expect(out.outcome).toBe('none');
    expect(out.settled).toBeNull();
    expect(out.suggestions).toEqual([
      expect.objectContaining({ month: 12, year: 2026, why: 'weak read' }),
    ]);
  });

  it('reports a date seen once as lone, and offers it first', async () => {
    const t = setup([SHARP()], (n) => (n === 0 ? june(0.5) : verdict()), { timeoutMs: 600 });
    const out = await t.loop.result;
    expect(out.outcome).toBe('none');
    expect(out.lone).toEqual({ month: 6, year: 2028 });
    expect(out.suggestions[0]).toMatchObject({ month: 6, year: 2028, why: 'seen once' });
  });

  it('abort drops the answer of a read in flight', async () => {
    let release!: (v: FrameVerdict) => void;
    const t = setup(
      [SHARP()],
      () =>
        new Promise<FrameVerdict>((r) => {
          release = r;
        }),
    );
    await vi.waitFor(() => expect(t.reader.read).toHaveBeenCalled());
    t.loop.abort();
    release(june(0.95));
    const out = await t.loop.result;
    expect(out.outcome).toBe('stopped');
    expect(out.settled).toBeNull();
  });

  it('says so when the reader is not available', async () => {
    const t = setup([SHARP()], () => {
      throw new Error('The date reader failed');
    });
    const out = await t.loop.result;
    expect(out).toMatchObject({ outcome: 'failed', message: 'The date reader failed' });
  });
});
