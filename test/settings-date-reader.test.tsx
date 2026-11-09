// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateState, fakeDateClientModule, resetDates } from './helpers/fakeDates';

vi.mock('../src/scan/ocr/client', () => fakeDateClientModule());
const readerDownloaded = vi.fn();
vi.mock('../src/scan/ocr/cache', () => ({
  READER_DOWNLOAD_MB: 10,
  readerDownloaded: () => readerDownloaded(),
}));

import { DateReaderSection } from '../src/app/screens/settings/DateReaderSection';

const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => {
  resetDates();
  readerDownloaded.mockReset();
  setOnline(true);
});
afterEach(cleanup);

const BUTTON = 'Download the date reader now';

describe('Settings, Date reader', () => {
  it('not downloaded: says so and offers the button', async () => {
    readerDownloaded.mockResolvedValue(false);
    render(<DateReaderSection />);
    expect(await screen.findByText(/Not downloaded yet/)).toBeTruthy();
    expect((screen.getByRole('button', { name: BUTTON }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('download: Downloading…, then Downloaded, and the reader it made is stopped', async () => {
    readerDownloaded.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    dateState.loaded = false;
    render(<DateReaderSection />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    expect(screen.getByRole('button', { name: 'Downloading…' })).toBeTruthy();
    expect(await screen.findByText(/^Downloaded: best-before dates/)).toBeTruthy();
    expect(dateState.terminated).toBe(1);
    expect(dateState.released).toBe(0);
  });

  it('download with a reader already loaded: it is released, not stopped', async () => {
    readerDownloaded.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    dateState.loaded = true;
    render(<DateReaderSection />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/^Downloaded: best-before dates/)).toBeTruthy();
    expect(dateState.released).toBe(1);
    expect(dateState.terminated).toBe(0);
  });

  it('failure: says so and offers the button again', async () => {
    readerDownloaded.mockResolvedValue(false);
    dateState.unavailable = true;
    render(<DateReaderSection />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/Couldn’t download it/)).toBeTruthy();
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
  });

  it('loaded but not kept: asks for a reload', async () => {
    readerDownloaded.mockResolvedValue(false);
    render(<DateReaderSection />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/can’t keep it yet/)).toBeTruthy();
  });

  it('offline: the button is disabled with a hint', async () => {
    setOnline(false);
    readerDownloaded.mockResolvedValue(false);
    render(<DateReaderSection />);
    const b = (await screen.findByRole('button', { name: BUTTON })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText('Connect to the internet to download it.')).toBeTruthy();
  });

  it('no Cache Storage: says it cannot keep it and has no button', async () => {
    readerDownloaded.mockResolvedValue(null);
    render(<DateReaderSection />);
    expect(await screen.findByText(/can’t keep the date reader/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });
});
