import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  enableTimings,
  percentile,
  recordTiming,
  resetTimings,
  timings,
  timingSummary,
  type ReadTiming,
  type StepTiming,
} from './timings';

const read = (ms: number, over: Partial<ReadTiming> = {}): ReadTiming => ({
  kind: 'read',
  ms,
  wallMs: ms + 100,
  pictures: 3,
  settled: false,
  ...over,
});
const step = (over: Partial<StepTiming> = {}): StepTiming => ({
  kind: 'step',
  outcome: 'got',
  frames: 2,
  skippedMotion: 3,
  skippedBlur: 1,
  glare: 0,
  totalMs: 2000,
  aimMs: 900,
  computeMs: 1200,
  ...over,
});

beforeEach(() => {
  resetTimings();
  enableTimings(true);
});
afterEach(() => {
  resetTimings();
  enableTimings(false);
});

describe('the timing list', () => {
  it('records nothing when disabled', () => {
    enableTimings(false);
    recordTiming(read(100));
    expect(timings()).toEqual([]);
    expect(timingSummary()).toBe('');
  });

  it('keeps entries in order and rounds times to whole numbers', () => {
    recordTiming({ kind: 'load', ep: 'wasm', loadMs: 4210.6 });
    recordTiming(read(1520.4, { wallMs: 1620.6 }));
    expect(timings()).toEqual([
      { kind: 'load', ep: 'wasm', loadMs: 4211 },
      read(1520, { wallMs: 1621 }),
    ]);
  });

  it('keeps at most 1000 entries, dropping the oldest', () => {
    for (let i = 0; i < 1005; i++) recordTiming(read(i));
    const all = timings() as ReadTiming[];
    expect(all).toHaveLength(1000);
    expect(all[0]!.ms).toBe(5);
    expect(all[999]!.ms).toBe(1004);
  });

  it('takes nearest-rank percentiles', () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 90)).toBe(90);
    expect(percentile([], 50)).toBe(0);
  });

  it('summarises reads by the load before them, and the steps', () => {
    recordTiming({ kind: 'load', ep: 'webgpu', loadMs: 3900 });
    for (const ms of [1000, 2000, 3000]) recordTiming(read(ms));
    recordTiming({ kind: 'load', ep: 'wasm', loadMs: 4210 });
    for (const ms of [500, 600]) recordTiming(read(ms, { pictures: 5 }));
    recordTiming(step());
    recordTiming(step({ outcome: 'none', skippedMotion: 9, skippedBlur: 0 }));
    const text = timingSummary();
    expect(text).toContain(
      'reader WebGPU: load 3900 ms; 3 reads, median 2000 ms, p90 3000 ms (round trip median 2100 ms), pictures median 3',
    );
    expect(text).toContain('reader WASM: load 4210 ms; 2 reads, median 500 ms');
    expect(text).toContain('pictures median 5');
    expect(text).toContain('date steps 2: got 1, none 1');
    expect(text).toContain('skipped for motion 12, blur 1, glare 0');
    expect(text).toContain('skips a step median 4');
    expect(text).toContain('read ms: 1000 2000 3000 500 600');
  });

  it('puts a read before any load under "reader ?"', () => {
    recordTiming(read(700));
    expect(timingSummary()).toContain('reader ?:');
  });

  it('is empty when there is nothing', () => {
    expect(timingSummary()).toBe('');
  });

  it('holds no text from a verdict: counts and times only', () => {
    // The caller passes numbers drawn from a verdict, never the verdict itself.
    const verdict = { text: 'BB 06/2028', passes: [{ text: 'BB 06/2028' }], ms: 812.3 };
    recordTiming({ kind: 'load', ep: 'wasm', loadMs: 100 });
    recordTiming({
      kind: 'read',
      ms: verdict.ms,
      wallMs: 900,
      pictures: verdict.passes.length,
      settled: true,
    });
    recordTiming(step());
    const dump = JSON.stringify(timings()) + timingSummary();
    expect(dump).not.toContain('BB');
    expect(dump).not.toContain('2028');
    const keys: Record<string, string[]> = {
      load: ['kind', 'ep', 'loadMs'],
      read: ['kind', 'ms', 'wallMs', 'pictures', 'settled'],
      step: [
        'kind',
        'outcome',
        'frames',
        'skippedMotion',
        'skippedBlur',
        'glare',
        'totalMs',
        'aimMs',
        'computeMs',
      ],
    };
    for (const t of timings()) {
      expect(Object.keys(t).sort()).toEqual([...keys[t.kind]!].sort());
      for (const [k, v] of Object.entries(t)) {
        if (k === 'kind' || k === 'ep' || k === 'outcome') continue;
        expect(['number', 'boolean']).toContain(typeof v);
      }
    }
  });
});
