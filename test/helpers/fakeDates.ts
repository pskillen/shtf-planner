/**
 * Fakes for the date reader in component tests. `vi.mock` the two modules in the test file itself
 * with `fakeDateClientModule` and `fakeDateLoopModule`. The loop never runs: the test settles it
 * with `dateState.finish(...)`.
 */
export interface FakeLoopOut {
  outcome: 'got' | 'none' | 'stopped' | 'failed';
  settled: {
    value: { month: number; year: number };
    yearAssumed: boolean;
    expired: boolean;
  } | null;
  crop: null;
  frames: number;
  skippedMotion: number;
  skippedBlur: number;
  glare: number;
  totalMs: number;
  aimMs: number;
  computeMs: number;
  lone: null;
  suggestions: Array<{
    month: number;
    year: number;
    text: string;
    expired: boolean;
    why: 'weak read' | 'seen once';
  }>;
}

export const dateState: {
  /** The reader cannot load. */
  unavailable: boolean;
  /** Whether a reader is already loaded when `peekDateReader` is asked. */
  loaded: boolean;
  starts: number;
  stops: number;
  aborts: number;
  terminated: number;
  /** Times a screen let go of the reader (it stays loaded for a while). */
  released: number;
  /** What the reader's status() says (the About line). */
  status: unknown;
  listeners: Set<() => void>;
  resolvers: Array<(out: FakeLoopOut) => void>;
  /** Settles the latest loop. */
  finish(out: Partial<FakeLoopOut>): void;
} = {
  unavailable: false,
  loaded: true,
  starts: 0,
  stops: 0,
  aborts: 0,
  terminated: 0,
  released: 0,
  status: { state: 'ready', ep: 'wasm', loadMs: 1, reason: '', lastReadMs: 400 },
  listeners: new Set(),
  resolvers: [],
  finish(out) {
    dateState.resolvers.at(-1)!({
      outcome: 'none',
      settled: null,
      crop: null,
      frames: 3,
      skippedMotion: 0,
      skippedBlur: 0,
      glare: 0,
      totalMs: 2000,
      aimMs: 1000,
      computeMs: 300,
      lone: null,
      suggestions: [],
      ...out,
    });
  },
};

export function resetDates(): void {
  dateState.unavailable = false;
  dateState.loaded = true;
  dateState.starts = 0;
  dateState.stops = 0;
  dateState.aborts = 0;
  dateState.terminated = 0;
  dateState.released = 0;
  dateState.status = { state: 'ready', ep: 'wasm', loadMs: 1, reason: '', lastReadMs: 400 };
  dateState.listeners = new Set();
  dateState.resolvers = [];
}

/** A settled read of `month`/`year` (the loop's own shape). */
export const gotRead = (month: number, year: number, extra: { yearAssumed?: boolean } = {}) => ({
  outcome: 'got' as const,
  settled: { value: { month, year }, yearAssumed: extra.yearAssumed ?? false, expired: false },
});

export const fakeDateClientModule = () => ({
  getDateReader: () => ({
    ready: dateState.unavailable
      ? Promise.reject(new Error('no reader'))
      : Promise.resolve({ ep: 'wasm', loadMs: 1, reason: '' }),
    status: () => ({ state: 'ready', ep: 'wasm', loadMs: 1, reason: '', lastReadMs: 400 }),
    read: async () => {
      throw new Error('not used');
    },
    terminate: () => undefined,
  }),
  peekDateReader: () =>
    dateState.loaded ? { status: () => dateState.status } : undefined,
  onReaderChange: (l: () => void) => {
    dateState.listeners.add(l);
    return () => void dateState.listeners.delete(l);
  },
  preloadDateReader: () => undefined,
  releaseDateReader: () => {
    dateState.released++;
  },
  terminateDateReader: () => {
    dateState.terminated++;
  },
});

export const fakeDateLoopModule = () => ({
  startDateLoop: () => {
    dateState.starts++;
    return {
      result: new Promise<FakeLoopOut>((resolve) => dateState.resolvers.push(resolve)),
      abort: () => {
        dateState.aborts++;
      },
      stop: () => {
        dateState.stops++;
      },
    };
  },
});
