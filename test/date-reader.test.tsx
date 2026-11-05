// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAdd } from '../src/app/screens/stores/QuickAdd';
import { StocktakeScreen } from '../src/app/screens/stores/StocktakeScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { dateState, gotRead, resetDates } from './helpers/fakeDates';
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

beforeEach(() => {
  localStorage.clear();
  resetScan();
  resetDates();
});
afterEach(cleanup);

const KNOWN = '3017620422003'; // fixture: prod-spread
const barcodeStock = (s: ReturnType<typeof liveStore>) =>
  Object.values(s.doc().stock).filter((r) => r.source === 'barcode');
const monthBox = () =>
  document.querySelector('input[type="month"], input[placeholder="Mar 2027"]') as HTMLInputElement;
const ok = () => fireEvent.click(screen.getByRole('button', { name: 'OK' }));

async function toDateStep() {
  const s = liveStore(biggarDocument());
  render(s.wrap(<StocktakeScreen />));
  await waitFor(() => expect(scanState.onCode).toBeDefined());
  await act(async () => scanState.onCode!(KNOWN));
  await screen.findByText('Test spread 400 g');
  await waitFor(() => expect(dateState.starts).toBe(1));
  return s;
}

describe('Stocktake: reading the date with the camera', () => {
  it('starts by itself on the date step and shows the reader line', async () => {
    await toDateStep();
    expect(screen.getByTestId('date-status').textContent).toMatch(/Looking for a date/);
  });

  it('nothing is saved until OK: the read fills the month, then OK saves it', async () => {
    const s = await toDateStep();
    await act(async () => dateState.finish(gotRead(6, 2028)));
    expect(await screen.findByTestId('date-result')).toBeTruthy();
    expect(screen.getByText('Jun 2028', { selector: '.date-month' })).toBeTruthy();
    expect(screen.getByTestId('date-status').textContent).toBe('Got it');
    expect(monthBox().value).toBe('2028-06');
    expect(barcodeStock(s)).toHaveLength(0);
    ok();
    expect(barcodeStock(s)[0]).toMatchObject({ bestBefore: '2028-06', source: 'barcode' });
    expect(screen.getByText('1 BARCODE')).toBeTruthy();
  });

  it('says "year assumed" on a read whose year was filled in', async () => {
    await toDateStep();
    await act(async () => dateState.finish(gotRead(11, 2026, { yearAssumed: true })));
    expect((await screen.findByTestId('date-result')).textContent).toMatch(/year assumed/);
  });

  it('a chip after a read overrides it, and the summary counts it as picked', async () => {
    const s = await toDateStep();
    await act(async () => dateState.finish(gotRead(6, 2028)));
    await screen.findByTestId('date-result');
    fireEvent.click(screen.getByRole('button', { name: '+1 y' }));
    expect(monthBox().value).not.toBe('2028-06');
    ok();
    expect(barcodeStock(s)[0]!.bestBefore).not.toBe('2028-06');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('stocktake-date-summary').textContent).toMatch(
      /dates by camera 0 · picked 1 · from a suggestion 0/,
    );
  });

  it('a camera date that stands is counted, with a date-step time and a counts-only copy', async () => {
    await toDateStep();
    await act(async () => dateState.finish(gotRead(6, 2028)));
    await screen.findByTestId('date-result');
    ok();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const line = screen.getByTestId('stocktake-date-summary').textContent!;
    expect(line).toMatch(/dates by camera 1 · picked 0 · from a suggestion 0 · date step \d/);
    const write = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      configurable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(write.mock.calls[0]![0]).not.toMatch(/2028|BB|\d{8,}/);
  });

  it('no date found: suggestions with their colour, and a tap saves that month', async () => {
    const s = await toDateStep();
    await act(async () =>
      dateState.finish({
        suggestions: [
          { month: 12, year: 2026, text: '12.26', expired: false, why: 'weak read' },
          { month: 6, year: 2028, text: '06.28', expired: false, why: 'weak read' },
        ],
      }),
    );
    expect(screen.getByTestId('date-status').textContent).toBe('No date found');
    const group = screen.getByRole('group', { name: 'Suggested dates' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    expect(barcodeStock(s)).toHaveLength(0);
    fireEvent.click(within(group).getByRole('button', { name: /^Dec 2026/ }));
    expect(barcodeStock(s)[0]).toMatchObject({ bestBefore: '2026-12' });
    expect(screen.getByText('1 BARCODE')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('stocktake-date-summary').textContent).toMatch(/from a suggestion 1/);
  });

  it('Stop ends the search at once, and Read again starts a new one', async () => {
    await toDateStep();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(dateState.stops).toBe(1);
    await act(async () => dateState.finish({}));
    fireEvent.click(await screen.findByRole('button', { name: 'Read again' }));
    await waitFor(() => expect(dateState.starts).toBe(2));
  });

  it('when the reader cannot load, says so and the picker works as before', async () => {
    dateState.unavailable = true;
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    await waitFor(() => expect(scanState.onCode).toBeDefined());
    await act(async () => scanState.onCode!(KNOWN));
    await screen.findByText('Test spread 400 g');
    expect(
      await screen.findByText('The date reader isn’t available here; pick the date.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+1 y' }));
    ok();
    expect(barcodeStock(s)).toHaveLength(1);
  });

  it('with "Read dates with the camera" off there is no camera read at all', async () => {
    localStorage.setItem('shtf.dates.camera', '0');
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    await waitFor(() => expect(scanState.onCode).toBeDefined());
    await act(async () => scanState.onCode!(KNOWN));
    await screen.findByText('Test spread 400 g');
    expect(dateState.starts).toBe(0);
    expect(screen.queryByTestId('date-status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+1 y' }));
    ok();
    expect(barcodeStock(s)).toHaveLength(1);
  });

  it('turning the switch off frees the reader and is remembered', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    fireEvent.click(screen.getByRole('switch', { name: 'Read dates with the camera' }));
    expect(localStorage.getItem('shtf.dates.camera')).toBe('0');
    expect(dateState.terminated).toBeGreaterThan(0);
  });

  it('the About line has the graphics-chip switch, on by default, remembered', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    expect(screen.getByText('About the date reader')).toBeTruthy();
    const sw = screen.getByRole('switch', {
      name: 'Use the graphics chip (WebGPU) when available',
    }) as HTMLInputElement;
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect(localStorage.getItem('shtf.dates.webgpu')).toBe('0');
  });
});

describe('Quick add: Read the date', () => {
  const withCamera = () =>
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({}) },
      configurable: true,
    });
  const openForm = () => {
    const s = liveStore(biggarDocument());
    render(
      s.wrap(<QuickAdd onClose={() => undefined} prefill={{ itemId: 'items-base:tinned-soup' }} />),
    );
    return s;
  };
  const withDate = (s: ReturnType<typeof liveStore>, ym: string) =>
    Object.values(s.doc().stock).filter((r) => r.bestBefore === ym);

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });

  it('has no button where the browser has no camera', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    openForm();
    expect(screen.queryByRole('button', { name: 'Read the date' })).toBeNull();
  });

  it('Read the date, Use this date: the field shows it, nothing is added until Add', async () => {
    withCamera();
    const s = openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Read the date' }));
    await waitFor(() => expect(dateState.starts).toBe(1));
    expect(screen.getByRole('button', { name: 'Use this date' }).hasAttribute('disabled')).toBe(
      true,
    );
    await act(async () => dateState.finish(gotRead(3, 2031)));
    await screen.findByTestId('date-result');
    fireEvent.click(screen.getByRole('button', { name: 'Use this date' }));
    expect(monthBox().value).toBe('2031-03');
    expect(withDate(s, '2031-03')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(withDate(s, '2031-03')).toHaveLength(1);
    expect(dateState.terminated).toBeGreaterThan(0);
  });

  it('a suggestion sets the field and does not save', async () => {
    withCamera();
    const s = openForm();
    const before = Object.keys(s.doc().stock).length;
    fireEvent.click(screen.getByRole('button', { name: 'Read the date' }));
    await waitFor(() => expect(dateState.starts).toBe(1));
    await act(async () =>
      dateState.finish({
        suggestions: [{ month: 12, year: 2026, text: '12.26', expired: false, why: 'weak read' }],
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Dec 2026/ }));
    expect(monthBox().value).toBe('2026-12');
    expect(Object.keys(s.doc().stock).length).toBe(before);
  });
});

describe('Stocktake: the date step stays what the person sees', () => {
  const setVisibility = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('a finished read survives the page being hidden and shown again', async () => {
    await toDateStep();
    await act(async () => dateState.finish(gotRead(6, 2028)));
    await screen.findByTestId('date-result');
    fireEvent.click(screen.getByRole('button', { name: '+1 y' }));
    const picked = monthBox().value;
    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    await new Promise((r) => setTimeout(r, 20));
    expect(dateState.starts).toBe(1); // no new search, no new answer
    expect(monthBox().value).toBe(picked);
    expect(screen.getByTestId('date-result')).toBeTruthy();
  });

  it('a date set by hand stops the search and is never overwritten by a late read', async () => {
    await toDateStep();
    fireEvent.click(screen.getByRole('button', { name: '+6 m' }));
    const picked = monthBox().value;
    expect(dateState.aborts).toBeGreaterThan(0);
    expect(screen.getByTestId('date-status').textContent).toBe('Date set by hand');
    await act(async () => dateState.finish(gotRead(6, 2031)));
    expect(monthBox().value).toBe(picked);
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }));
    await waitFor(() => expect(dateState.starts).toBe(2));
  });

  it('Undo takes the item out of the Done counts, and saving it again counts it once', async () => {
    await toDateStep();
    await act(async () => dateState.finish(gotRead(6, 2028)));
    await screen.findByTestId('date-result');
    ok();
    fireEvent.click(
      within(screen.getByTestId('stocktake-saved')).getByRole('button', { name: 'Undo' }),
    );
    ok();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('stocktake-date-summary').textContent).toMatch(
      /dates by camera 1 · picked 0/,
    );
    expect(screen.getByTestId('stocktake-summary').textContent).toMatch(/^1 item /);
  });

  it('the About line follows the reader live', async () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    dateState.status = { state: 'loading' };
    await act(async () => dateState.listeners.forEach((l) => l()));
    expect(screen.getByTestId('date-about').textContent).toBe('Getting ready…');
    dateState.status = { state: 'ready', ep: 'webgpu', loadMs: 9, reason: '', lastReadMs: 400 };
    await act(async () => dateState.listeners.forEach((l) => l()));
    expect(screen.getByTestId('date-about').textContent).toBe('WebGPU · last read 0.4 s');
  });

  it('the strip is one size for both steps and after a read, and the status and month are drawn on it', async () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    await waitFor(() => expect(scanState.onCode).toBeDefined());
    const strip = () => screen.getByTestId('camera-strip').className;
    expect(strip()).not.toMatch(/compact/);
    expect(screen.queryByText('Barcode caught')).toBeNull();
    await act(async () => scanState.onCode!(KNOWN));
    await screen.findByText('Test spread 400 g');
    expect(document.querySelector('.camera-flash')).not.toBeNull(); // the catch tick
    await waitFor(() => expect(dateState.starts).toBe(1));
    expect(strip()).not.toMatch(/compact/);
    const centre = document.querySelector('.camera-centre')!;
    expect(centre.contains(screen.getByTestId('date-status'))).toBe(true);
    await act(async () => dateState.finish(gotRead(6, 2028)));
    const result = await screen.findByTestId('date-result');
    expect(centre.contains(result)).toBe(true);
    expect(strip()).not.toMatch(/compact/);
  });
});
