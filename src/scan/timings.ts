/**
 * A per-page-session list of the date reader's timings, for finding out how fast it is on a real
 * phone. Counts and times only: no text read, no codes, no images (D125). It lives in memory, is
 * off unless `?debug=1` switches it on, and is never stored.
 */
import type { Provider } from './ocr/paddle';

export interface LoadTiming {
  kind: 'load';
  ep: Provider;
  loadMs: number;
}
export interface ReadTiming {
  kind: 'read';
  /** The worker's own compute for the frame. */
  ms: number;
  /** From asking to the answer arriving (the round trip). */
  wallMs: number;
  pictures: number;
  settled: boolean;
}
export interface StepTiming {
  kind: 'step';
  outcome: 'got' | 'none' | 'stopped' | 'failed';
  frames: number;
  skippedMotion: number;
  skippedBlur: number;
  glare: number;
  totalMs: number;
  aimMs: number;
  computeMs: number;
}
export type Timing = LoadTiming | ReadTiming | StepTiming;

const MAX_ENTRIES = 1000;
let enabled = false;
let list: Timing[] = [];

export function enableTimings(on = true): void {
  enabled = on;
}
export function timingsEnabled(): boolean {
  return enabled;
}

const whole = (n: number): number => Math.round(n);

export function recordTiming(t: Timing): void {
  if (!enabled) return;
  let rounded: Timing;
  if (t.kind === 'load') {
    rounded = { kind: 'load', ep: t.ep, loadMs: whole(t.loadMs) };
  } else if (t.kind === 'read') {
    rounded = {
      kind: 'read',
      ms: whole(t.ms),
      wallMs: whole(t.wallMs),
      pictures: whole(t.pictures),
      settled: t.settled,
    };
  } else {
    rounded = {
      kind: 'step',
      outcome: t.outcome,
      frames: whole(t.frames),
      skippedMotion: whole(t.skippedMotion),
      skippedBlur: whole(t.skippedBlur),
      glare: whole(t.glare),
      totalMs: whole(t.totalMs),
      aimMs: whole(t.aimMs),
      computeMs: whole(t.computeMs),
    };
  }
  if (rounded.kind === 'load') {
    // A different back end starts a fresh list, so a run on one never carries the other's lines.
    const lastLoad = [...list].reverse().find((x): x is LoadTiming => x.kind === 'load');
    if (lastLoad && lastLoad.ep !== rounded.ep) list = [];
  }
  list.push(rounded);
  if (list.length > MAX_ENTRIES) list = list.slice(list.length - MAX_ENTRIES);
}

export function timings(): readonly Timing[] {
  return [...list];
}
export function resetTimings(): void {
  list = [];
}

/** Nearest-rank percentile (p in 0..100) of a list of numbers; 0 for an empty one. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

const median = (values: readonly number[]): number => percentile(values, 50);
const label = (ep: Provider | '?'): string =>
  ep === 'webgpu' ? 'WebGPU' : ep === 'wasm' ? 'WASM' : '?';

export function timingSummary(source: readonly Timing[] = list): string {
  if (source.length === 0) return '';
  const lines: string[] = [];

  // Reads belong to the most recent load before them.
  const groups: Array<{ ep: Provider | '?'; loads: number[]; reads: ReadTiming[] }> = [];
  let current: (typeof groups)[number] | undefined;
  for (const t of source) {
    if (t.kind === 'load') {
      current = { ep: t.ep, loads: [t.loadMs], reads: [] };
      groups.push(current);
    } else if (t.kind === 'read') {
      if (!current) {
        current = { ep: '?', loads: [], reads: [] };
        groups.push(current);
      }
      current.reads.push(t);
    }
  }
  for (const g of groups) {
    const ms = g.reads.map((r) => r.ms);
    const loadText = g.loads.length ? `load ${g.loads[0]} ms` : 'load unknown';
    lines.push(
      `reader ${label(g.ep)}: ${loadText}; ${g.reads.length} reads, median ${median(ms)} ms, p90 ${percentile(ms, 90)} ms (round trip median ${median(g.reads.map((r) => r.wallMs))} ms), pictures median ${median(g.reads.map((r) => r.pictures))}`,
    );
  }

  const steps = source.filter((t): t is StepTiming => t.kind === 'step');
  if (steps.length > 0) {
    const count = (o: StepTiming['outcome']): number => steps.filter((s) => s.outcome === o).length;
    const sum = (k: 'skippedMotion' | 'skippedBlur' | 'glare'): number =>
      steps.reduce((n, s) => n + s[k], 0);
    const skips = steps.map((s) => s.skippedMotion + s.skippedBlur);
    lines.push(
      `date steps ${steps.length}: got ${count('got')}, none ${count('none')}, stopped ${count('stopped')}, failed ${count('failed')}; skipped for motion ${sum('skippedMotion')}, blur ${sum('skippedBlur')}, glare ${sum('glare')}; skips a step median ${median(skips)}; loop step median ${median(steps.map((s) => s.totalMs))} ms`,
    );
  }

  const readMs = source.filter((t): t is ReadTiming => t.kind === 'read').map((r) => r.ms);
  if (readMs.length > 0) lines.push(`read ms: ${readMs.join(' ')}`);
  return lines.join('\n');
}
