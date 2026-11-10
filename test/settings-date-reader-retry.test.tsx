// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real client with a stubbed Worker: only the cache lookup is faked.
const readerDownloaded = vi.fn();
vi.mock('../src/scan/ocr/cache', () => ({
  READER_DOWNLOAD_MB: 10,
  readerDownloaded: () => readerDownloaded(),
}));

import { DateReaderSection } from '../src/app/screens/settings/DateReaderSection';
import { peekDateReader } from '../src/scan/ocr/client';

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(m: { type: string }) {
    if (m.type === 'init') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'failed', message: 'no network' } }));
    }
  }
  terminate() {
    this.terminated = true;
  }
}

const BUTTON = 'Download the date reader now';

beforeEach(() => {
  FakeWorker.made = [];
  readerDownloaded.mockReset().mockResolvedValue(false);
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Settings, Date reader: retry after a failed download', () => {
  it('a failure frees the reader, so the next tap makes a new one', async () => {
    render(<DateReaderSection />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/Couldn’t download it/)).toBeTruthy();
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    expect(peekDateReader()).toBeUndefined();

    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    await screen.findByText(/Couldn’t download it/);
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[1]!.terminated).toBe(true);
  });
});
