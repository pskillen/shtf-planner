// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StocktakeScreen } from '../src/app/screens/stores/StocktakeScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { dateState, resetDates } from './helpers/fakeDates';
import { resetScan, scanState } from './helpers/fakeScan';
import { liveStore } from './helpers/liveStore';

vi.mock('../src/scan/camera', async () => (await import('./helpers/fakeScan')).fakeCameraModule());
vi.mock('../src/scan/barcode', async () =>
  (await import('./helpers/fakeScan')).fakeBarcodeModule(),
);
vi.mock('../src/scan/ocr/client', async () =>
  (await import('./helpers/fakeDates')).fakeDateClientModule(),
);
vi.mock('../src/scan/dateLoop', async () =>
  (await import('./helpers/fakeDates')).fakeDateLoopModule(),
);
vi.mock('../src/scan/ocr/cache', () => ({
  READER_DOWNLOAD_MB: 10,
  readerDownloaded: async () => false,
}));

const KNOWN = '3017620422003';

beforeEach(() => {
  localStorage.clear();
  resetScan();
  resetDates();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function toDateStep() {
  const s = liveStore(biggarDocument());
  render(s.wrap(<StocktakeScreen />));
  await waitFor(() => expect(scanState.onCode).toBeDefined());
  await act(async () => scanState.onCode!(KNOWN));
  await screen.findByText('Test spread 400 g');
}

describe('the date reader before its first download', () => {
  it('says how big the first download is while the reader loads', async () => {
    dateState.status = { state: 'loading' };
    await toDateStep();
    await waitFor(() =>
      expect(screen.getByTestId('date-status').textContent).toBe(
        'Getting the date reader ready… (about 10 MB, once)',
      ),
    );
  });

  it('offline, says to connect once', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    dateState.unavailable = true;
    await toDateStep();
    expect(
      await screen.findByText(
        'Connect once to download the date reader (about 10 MB). Pick the date for now.',
      ),
    ).toBeTruthy();
  });

  it('online and unavailable keeps the plain text', async () => {
    dateState.unavailable = true;
    await toDateStep();
    expect(
      await screen.findByText('The date reader isn’t available here; pick the date.'),
    ).toBeTruthy();
  });
});
