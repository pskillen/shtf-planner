import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameVerdict } from '../../engine/datecode';
import {
  createDateReader,
  getDateReader,
  peekDateReader,
  preloadDateReader,
  releaseDateReader,
  type WorkerLike,
} from './client';
import { ReaderStopped } from './errors';
import { gray } from './image';
import { enableTimings, resetTimings, timings } from '../timings';
import type { FromWorker, ToWorker } from './messages';

class FakeWorker implements WorkerLike {
  sent: ToWorker[] = [];
  transfers: Transferable[][] = [];
  terminated = false;
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  postMessage(m: ToWorker, transfer: Transferable[] = []): void {
    this.sent.push(m);
    this.transfers.push(transfer);
  }
  terminate(): void {
    this.terminated = true;
  }
  say(m: FromWorker): void {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  }
  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const verdict = (ms = 400): FrameVerdict => ({
  value: { month: 6, year: 2027 },
  yearAssumed: false,
  expired: false,
  suggestions: [],
  confidence: 0.9,
  text: 'BB 06/2027',
  votes: 1,
  passes: [],
  ms,
});

function make(opts: { preferWebGpu?: boolean } = {}) {
  const w = new FakeWorker();
  const reader = createDateReader({ spawn: () => w, todayIso: '2026-11-15', ...opts });
  return { w, reader };
}

describe('the date reader client', () => {
  it('asks the worker to load, with the WebGPU preference, and is ready when told', async () => {
    const { w, reader } = make({ preferWebGpu: false });
    expect(w.sent[0]).toEqual({ type: 'init', preferWebGpu: false, todayIso: '2026-11-15' });
    expect(reader.status()).toEqual({ state: 'loading' });
    w.say({ type: 'ready', ep: 'wasm', loadMs: 1500, reason: 'WebGPU is switched off' });
    await expect(reader.ready).resolves.toEqual({
      ep: 'wasm',
      loadMs: 1500,
      reason: 'WebGPU is switched off',
    });
    expect(reader.status()).toMatchObject({ state: 'ready', ep: 'wasm' });
  });

  it('reports the WebGPU-then-WASM fallback the worker made', async () => {
    const { w, reader } = make();
    w.say({ type: 'ready', ep: 'wasm', loadMs: 900, reason: 'WebGPU read the test label wrong' });
    expect((await reader.ready).reason).toMatch(/wrong/);
  });

  it('rejects ready and every read when the worker says it failed', async () => {
    const { w, reader } = make();
    const early = reader.read(gray(4, 4), '2026-11-15');
    w.say({ type: 'failed', message: 'det-fp16.onnx: 404' });
    await expect(reader.ready).rejects.toThrow('404');
    await expect(early).rejects.toThrow('404');
    await expect(reader.read(gray(4, 4), '2026-11-15')).rejects.toThrow('404');
    expect(reader.status()).toEqual({ state: 'failed', message: 'det-fp16.onnx: 404' });
  });

  it('fails when the worker itself errors', async () => {
    const { w, reader } = make();
    w.fail('Script error');
    await expect(reader.ready).rejects.toThrow('Script error');
    expect(reader.status().state).toBe('failed');
  });

  it('matches reads to answers by id, even out of order, and sends a copy of the pixels', async () => {
    const { w, reader } = make();
    w.say({ type: 'ready', ep: 'wasm', loadMs: 1, reason: '' });
    const frame = gray(8, 4);
    frame.d.fill(77);
    const a = reader.read(frame, '2026-11-15');
    const b = reader.read(frame, '2026-11-16');
    const [, ra, rb] = w.sent as Array<Extract<ToWorker, { type: 'read' }>>;
    expect(ra!.id).not.toBe(rb!.id);
    expect(ra).toMatchObject({ w: 8, h: 4, todayIso: '2026-11-15' });
    expect(w.transfers[1]).toEqual([ra!.data]);
    expect(frame.d.length).toBe(32); // not detached: the page still has its picture
    w.say({ type: 'read', id: rb!.id, result: verdict(222) });
    w.say({ type: 'read', id: ra!.id, result: verdict(111) });
    expect((await a).ms).toBe(111);
    expect((await b).ms).toBe(222);
    expect(reader.status()).toMatchObject({ state: 'ready', lastReadMs: 111 });
  });

  it('rejects one read the worker could not do and keeps going', async () => {
    const { w, reader } = make();
    w.say({ type: 'ready', ep: 'wasm', loadMs: 1, reason: '' });
    const a = reader.read(gray(4, 4), '2026-11-15');
    const sent = w.sent[1] as Extract<ToWorker, { type: 'read' }>;
    w.say({ type: 'error', id: sent.id, message: 'bad frame' });
    await expect(a).rejects.toThrow('bad frame');
    expect(reader.status().state).toBe('ready');
  });

  it('terminate stops the worker and rejects what is waiting', async () => {
    const { w, reader } = make();
    w.say({ type: 'ready', ep: 'wasm', loadMs: 1, reason: '' });
    const waiting = reader.read(gray(4, 4), '2026-11-15');
    reader.terminate();
    expect(w.terminated).toBe(true);
    await expect(waiting).rejects.toBeInstanceOf(ReaderStopped);
    await expect(reader.read(gray(4, 4), '2026-11-15')).rejects.toBeInstanceOf(ReaderStopped);
  });

  it('the page keeps one reader until it is terminated, then makes a new one', () => {
    const spawn = vi.fn(() => new FakeWorker());
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return spawn();
        }
      },
    );
    try {
      const a = getDateReader();
      expect(getDateReader()).toBe(a);
      a.terminate();
      const b = getDateReader();
      expect(b).not.toBe(a);
      b.terminate();
      expect(spawn).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a released reader stays until the idle time, and asking for it again keeps it', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return new FakeWorker();
        }
      },
    );
    try {
      preloadDateReader();
      const a = peekDateReader()!;
      releaseDateReader(1000);
      vi.advanceTimersByTime(900);
      expect(peekDateReader()).toBe(a);
      expect(getDateReader()).toBe(a); // asked for again: the timer is cancelled
      vi.advanceTimersByTime(5000);
      expect(peekDateReader()).toBe(a);
      releaseDateReader(1000);
      vi.advanceTimersByTime(1000);
      expect(peekDateReader()).toBeUndefined();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe('the date reader client: the debug timing list', () => {
  afterEach(() => {
    resetTimings();
    enableTimings(false);
  });

  it('records the load with its back end when timings are on', () => {
    resetTimings();
    enableTimings(true);
    const { w } = make();
    w.say({ type: 'ready', ep: 'webgpu', loadMs: 3900.4, reason: '' });
    expect(timings()).toEqual([{ kind: 'load', ep: 'webgpu', loadMs: 3900 }]);
  });

  it('records nothing when they are off', () => {
    resetTimings();
    enableTimings(false);
    const { w } = make();
    w.say({ type: 'ready', ep: 'wasm', loadMs: 1500, reason: '' });
    expect(timings()).toEqual([]);
  });
});
