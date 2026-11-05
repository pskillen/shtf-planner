import type { FrameVerdict } from '../../engine/datecode';
import { today } from '../../util';
import { ReadError } from './errors';
import type { Gray } from './image';
import type { FromWorker, ToWorker } from './messages';
import type { Provider } from './paddle';

/** The part of a `Worker` the client uses (a fake in tests). */
export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export interface ReaderInfo {
  ep: Provider;
  /** How long the models took to load and warm up, in milliseconds. */
  loadMs: number;
  /** Why WASM and not WebGPU, when it is WASM. */
  reason: string;
}

export type ReaderStatus =
  | { state: 'loading' }
  | ({ state: 'ready'; lastReadMs?: number } & ReaderInfo)
  | { state: 'failed'; message: string };

export interface DateReader {
  /** Resolves when the models are loaded; rejects when the reader cannot load. */
  readonly ready: Promise<ReaderInfo>;
  /** Reads one grey frame. Rejects when the reader is not available or has been stopped. */
  read(frame: Gray, todayIso: string): Promise<FrameVerdict>;
  status(): ReaderStatus;
  /** Frees the models' memory. The next {@link getDateReader} makes a new one. */
  terminate(): void;
}

export interface ReaderOptions {
  /** Use WebGPU when the browser has it and it passes the self-test. Default true. */
  preferWebGpu?: boolean;
  /** Makes the worker. Default: the real one. */
  spawn?: () => WorkerLike;
  todayIso?: string;
  /** Called once when the reader is terminated. */
  onTerminate?: () => void;
}

const realWorker = (): WorkerLike =>
  new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });

const listeners = new Set<() => void>();
/** Told whenever a reader is made, changes state, reads a frame or is stopped (a live "About" line). */
export function onReaderChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const notify = (): void => listeners.forEach((l) => l());

/** Makes a reader on its own worker. Most callers want {@link getDateReader}. */
export function createDateReader(opts: ReaderOptions = {}): DateReader {
  const worker = (opts.spawn ?? realWorker)();
  let status: ReaderStatus = { state: 'loading' };
  let stopped = false;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: FrameVerdict) => void; reject: (e: Error) => void }
  >();
  let settleReady: { resolve: (i: ReaderInfo) => void; reject: (e: Error) => void };
  const ready = new Promise<ReaderInfo>((resolve, reject) => {
    settleReady = { resolve, reject };
  });
  // A reader nobody is waiting on must not log an unhandled rejection.
  ready.catch(() => undefined);

  const fail = (message: string): void => {
    if (status.state === 'failed') return;
    status = { state: 'failed', message };
    notify();
    settleReady.reject(new Error(message));
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  };

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') {
      const info = { ep: m.ep, loadMs: m.loadMs, reason: m.reason };
      status = { state: 'ready', ...info };
      settleReady.resolve(info);
      notify();
    } else if (m.type === 'failed') {
      fail(m.message);
    } else if (m.type === 'read') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (status.state === 'ready') status = { ...status, lastReadMs: Math.round(m.result.ms) };
      p?.resolve(m.result);
      notify();
    } else {
      const p = pending.get(m.id);
      pending.delete(m.id);
      p?.reject(new ReadError(m.message));
      notify();
    }
  };
  worker.onerror = (e) => fail(e.message || 'The date reader stopped');

  worker.postMessage({
    type: 'init',
    preferWebGpu: opts.preferWebGpu ?? true,
    todayIso: opts.todayIso ?? today(),
  });

  return {
    ready,
    status: () => status,
    read(frame, todayIso) {
      if (stopped) return Promise.reject(new Error('The date reader was stopped'));
      if (status.state === 'failed') return Promise.reject(new Error(status.message));
      return new Promise<FrameVerdict>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        // A copy goes over: the page keeps its own picture to show.
        const data = frame.d.slice().buffer;
        worker.postMessage({ type: 'read', id, w: frame.w, h: frame.h, data, todayIso }, [data]);
      });
    },
    terminate() {
      if (stopped) return;
      stopped = true;
      worker.terminate();
      const err = new Error('The date reader was stopped');
      settleReady.reject(err);
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      opts.onTerminate?.();
      notify();
    },
  };
}

let single: DateReader | undefined;

/**
 * The page's one date reader, made on first use (the first date step). `preferWebGpu` only counts
 * when this makes it; to change it, {@link DateReader.terminate} the reader and ask again.
 */
export function getDateReader(preferWebGpu = true): DateReader {
  if (!single) {
    single = createDateReader({
      preferWebGpu,
      onTerminate: () => {
        single = undefined;
      },
    });
    notify();
  }
  return single;
}

/** The page's reader if one has been made, without making one. */
export const peekDateReader = (): DateReader | undefined => single;

/** Frees the reader's memory, if there is one. Call when the screen that used it goes away. */
export function terminateDateReader(): void {
  single?.terminate();
}
