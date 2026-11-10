// @vitest-environment jsdom
// The page goes hidden (the screen turns off) while a date read is in flight. The real client and
// the real date loop and DateReader run; only the Worker and the camera are fakes.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DateReader } from '../src/app/screens/stores/DateReader';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { gray, type Gray } from '../src/scan/ocr/image';
import { liveStore } from './helpers/liveStore';

class FakeWorker {
  static made: FakeWorker[] = [];
  static autoReady = true;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  reads = 0;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(m: { type: string }) {
    if (m.type === 'init' && FakeWorker.autoReady) queueMicrotask(() => this.ready());
    if (m.type === 'read') this.reads++; // never answered: the read stays in flight
  }
  ready() {
    this.onmessage?.({ data: { type: 'ready', ep: 'webgpu', loadMs: 5, reason: '' } });
  }
  terminate() {
    this.terminated = true;
  }
}

function stripes(): Gray {
  const g = gray(96, 48);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.d[y * g.w + x] = x % 3 ? 200 : 40;
  return g;
}
const cam = () => ({ captureGray: () => stripes() });

let vis: DocumentVisibilityState = 'visible';
function setVisibility(v: DocumentVisibilityState) {
  vis = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  FakeWorker.made = [];
  FakeWorker.autoReady = true;
  vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  cleanup();
  setVisibility('hidden'); // frees the module's reader so the next test makes its own
  vi.unstubAllGlobals();
});

const UNAVAILABLE = 'The date reader isn’t available here; pick the date.';
const LOADING = 'Getting the date reader ready…';
const props = { todayIso: '2026-11-10', onResult: () => {}, onSuggestion: () => {} };
const status = () => screen.getByTestId('date-status').textContent;

it('hidden mid-read: never says unavailable; a new stream reloads the reader, says loading, then reads', async () => {
  const s = liveStore(biggarDocument());
  const view = render(s.wrap(<DateReader cam={cam()} {...props} />));
  await waitFor(() => expect(FakeWorker.made[0]!.reads).toBe(1), { timeout: 3000 });

  await act(async () => setVisibility('hidden'));
  expect(FakeWorker.made[0]!.terminated).toBe(true);
  expect(screen.queryByText(UNAVAILABLE)).toBeNull();

  // Shown again: the strip hands a new stream. Hold the second load to see what shows meanwhile.
  FakeWorker.autoReady = false;
  await act(async () => setVisibility('visible'));
  view.rerender(s.wrap(<DateReader cam={cam()} {...props} />));
  await waitFor(() => expect(FakeWorker.made).toHaveLength(2));
  expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  expect(status()).toBe(LOADING);

  await act(async () => FakeWorker.made[1]!.ready());
  await waitFor(() => expect(FakeWorker.made[1]!.reads).toBeGreaterThan(0), { timeout: 3000 });
  expect(screen.queryByText(UNAVAILABLE)).toBeNull();
});

it('a real worker crash: says unavailable, with a Try again that makes a new reader and reads on the same item', async () => {
  const s = liveStore(biggarDocument());
  render(s.wrap(<DateReader cam={cam()} {...props} />));
  await waitFor(() => expect(FakeWorker.made[0]!.reads).toBe(1), { timeout: 3000 });
  await act(async () => FakeWorker.made[0]!.onerror?.({ message: 'crashed' }));
  expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(FakeWorker.made).toHaveLength(2));
  expect(FakeWorker.made[0]!.terminated).toBe(true);
  await waitFor(() => expect(FakeWorker.made[1]!.reads).toBeGreaterThan(0), { timeout: 3000 });
  expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});
