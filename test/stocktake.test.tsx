// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScansToSort } from '../src/app/screens/stores/ScansToSort';
import { StocktakeScreen } from '../src/app/screens/stores/StocktakeScreen';
import { useScanQueue } from '../src/app/screens/stores/useScanQueue';
import { score } from '../src/engine';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';
import type { Scan } from '../src/model';
import { fakeOff, resetScan, scanState } from './helpers/fakeScan';
import { liveStore } from './helpers/liveStore';

vi.mock('../src/scan/camera', async () => (await import('./helpers/fakeScan')).fakeCameraModule());
vi.mock('../src/scan/barcode', async () =>
  (await import('./helpers/fakeScan')).fakeBarcodeModule(),
);

beforeEach(() => {
  localStorage.clear();
  resetScan();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const KNOWN = '3017620422003'; // fixture: prod-spread (Test spread 400 g)
const UNKNOWN = '5000169005743';
const BEANS_PRODUCT = 'Test beans 415 g';
const beans = {
  found: true as const,
  name: 'Test beans',
  quantity: '415 g',
  size: { amount: 415, unit: 'g' as const },
  kcalPer100: 80,
  categories: ['en:canned-foods', 'en:baked-beans'],
};
const barcodeStock = (s: ReturnType<typeof liveStore>) =>
  Object.values(s.doc().stock).filter((r) => r.source === 'barcode');
const SPREAD = 'Test spread 400 g';

async function open(doc = biggarDocument()) {
  const s = liveStore(doc);
  render(s.wrap(<StocktakeScreen />));
  await waitFor(() => expect(scanState.onCode).toBeDefined());
  return s;
}
const read = async (code: string) => {
  await act(async () => scanState.onCode!(code));
};
const chip = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
const ok = () => fireEvent.click(screen.getByRole('button', { name: 'OK' }));

describe('Stocktake: the step machine', () => {
  it('barcode, then date, then OK saves and goes straight back to a barcode', async () => {
    const s = await open();
    expect(screen.getByText('1 BARCODE')).toBeTruthy();
    await read(KNOWN);
    expect(await screen.findByText(SPREAD)).toBeTruthy();
    expect(screen.getByText(/Test spread 400 g/)).toBeTruthy(); // the remembered product name
    expect(screen.getByText('Counts as Peanut butter')).toBeTruthy();
    expect(screen.getByText('2 DATE', { selector: '.camera-chip' })).toBeTruthy();
    chip('+1 y');
    ok();
    const saved = barcodeStock(s);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      productId: 'prod-spread',
      qty: 1,
      source: 'barcode',
    });
    expect(saved[0]!.bestBefore).toMatch(/^\d{4}-\d{2}$/);
    // straight back to a barcode, with the toast
    expect(screen.getByText('1 BARCODE')).toBeTruthy();
    expect(screen.getByTestId('stocktake-saved').textContent).toContain(`Saved 1 × ${SPREAD}`);
  });

  it('the place applies to every item', async () => {
    const s = await open();
    fireEvent.change(screen.getByLabelText('Counting into'), { target: { value: 'loc-garage' } });
    await read(KNOWN);
    await screen.findByText(SPREAD);
    chip('+1 y');
    ok();
    await read(KNOWN);
    await screen.findByText(SPREAD);
    chip('+6 m');
    ok();
    const saved = barcodeStock(s);
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((i) => i.locationId))).toEqual(new Set(['loc-garage']));
  });

  it('Undo takes back a new instance exactly, and the card comes back', async () => {
    const s = await open();
    const before = structuredClone(s.doc().stock);
    await read(KNOWN);
    await screen.findByText(SPREAD);
    chip('+1 y');
    ok();
    expect(Object.keys(s.doc().stock).length).toBe(Object.keys(before).length + 1);
    fireEvent.click(
      within(screen.getByTestId('stocktake-saved')).getByRole('button', { name: 'Undo' }),
    );
    expect(s.doc().stock).toEqual(before);
    expect(screen.getByText(SPREAD)).toBeTruthy();
    expect(screen.queryByTestId('stocktake-saved')).toBeNull();
  });

  it('Undo of an addition that merged into existing stock only takes its own quantity back', async () => {
    const s = await open();
    for (let n = 0; n < 2; n++) {
      await read(KNOWN);
      await screen.findByText(SPREAD);
      chip('+1 y'); // the same month both times, so the second merges into the first
      ok();
    }
    const merged = barcodeStock(s);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.qty).toBe(2);
    fireEvent.click(
      within(screen.getByTestId('stocktake-saved')).getByRole('button', { name: 'Undo' }),
    );
    const after = barcodeStock(s);
    expect(after).toHaveLength(1);
    expect(after[0]!.qty).toBe(1);
  });

  it('the Undo goes after six seconds', async () => {
    vi.useFakeTimers();
    const s = liveStore(biggarDocument());
    render(s.wrap(<StocktakeScreen />));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    await act(async () => scanState.onCode!(KNOWN));
    chip('+1 y');
    ok();
    expect(screen.getByTestId('stocktake-saved')).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(5900)));
    expect(screen.queryByTestId('stocktake-saved')).not.toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(screen.queryByTestId('stocktake-saved')).toBeNull();
  });

  it('Done says how many items, how fast, and how many are left to sort', async () => {
    fakeOff({ [UNKNOWN]: 'offline' });
    await open();
    await read(KNOWN);
    await screen.findByText(SPREAD);
    chip('+1 y');
    ok();
    await read(UNKNOWN);
    fireEvent.click(await screen.findByRole('button', { name: 'Decide later' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('stocktake-summary').textContent).toMatch(
      /^1 item in 1 min \(\d+\.\d a minute\) · 1 to sort later$/,
    );
  });

  it('shows the hint once and remembers it was dismissed', async () => {
    await open();
    expect(screen.getByText(/Red line for the barcode, yellow box for the date/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Red line for the barcode, yellow box for the date/)).toBeNull();
    cleanup();
    await open();
    expect(screen.queryByText(/Red line for the barcode, yellow box for the date/)).toBeNull();
  });
  it('the hint hides at the first barcode and stays gone', async () => {
    await open();
    const gone = () => expect(screen.queryByText(/Red line for the barcode/)).toBeNull();
    expect(screen.getByText(/Red line for the barcode/)).toBeTruthy();
    await read(KNOWN);
    await screen.findByText(SPREAD);
    gone();
    cleanup();
    await open();
    gone();
  });
  it('a typed barcode hides the hint too', async () => {
    await open();
    expect(screen.getByText(/Red line for the barcode/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Or type the barcode number'), {
      target: { value: KNOWN },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use this number' }));
    await screen.findByText(SPREAD);
    expect(screen.queryByText(/Red line for the barcode/)).toBeNull();
  });
  it('shows the stored size under the name, and the new product name leaves the size out of it', async () => {
    fakeOff({ [UNKNOWN]: beans });
    const s = await open();
    await read(UNKNOWN);
    await screen.findByRole('heading', { name: 'Counts as: Baked beans?' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await screen.findByRole('heading', { name: 'Test beans' });
    expect(screen.getByTestId('product-size').textContent).toBe('415 g');
    const made = s.doc().products[s.doc().barcodes[UNKNOWN]!.productId]!;
    expect(made.name).toBe('Test beans');
    expect(made.size).toEqual({ amount: 415, unit: 'g' });
  });
  it('keeps the quantity text in the name when it did not parse into a size', async () => {
    fakeOff({ [UNKNOWN]: { ...beans, size: undefined } });
    await open();
    await read(UNKNOWN);
    expect(await screen.findByText(/Test beans 415 g/)).toBeTruthy();
  });
  it('shows a multipack size with its count', async () => {
    const doc = biggarDocument();
    doc.products['prod-spread']!.size = { count: 4, amount: 100, unit: 'g' };
    const s = await open(doc);
    await read(KNOWN);
    await waitFor(() => expect(screen.getByTestId('product-size').textContent).toBe('4 × 100 g'));
    expect(s.doc().products['prod-spread']).toBeDefined();
  });
  it('Undo after a scan that made a product leaves the product and barcode remembered', async () => {
    fakeOff({ [UNKNOWN]: beans });
    const s = await open();
    await read(UNKNOWN);
    await screen.findByRole('heading', { name: 'Counts as: Baked beans?' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await screen.findByRole('heading', { name: 'Test beans' });
    chip('+1 y');
    ok();
    const pid = s.doc().barcodes[UNKNOWN]?.productId;
    expect(pid).toBeDefined();
    expect(s.doc().products[pid!]).toBeDefined();
    fireEvent.click(
      within(screen.getByTestId('stocktake-saved')).getByRole('button', { name: 'Undo' }),
    );
    expect(barcodeStock(s)).toHaveLength(0);
    expect(s.doc().barcodes[UNKNOWN]?.productId).toBe(pid);
    expect(s.doc().products[pid!]).toBeDefined();
  });
});

describe('Not this item?', () => {
  it('reopens the picker for a remembered barcode and replaces what is remembered', async () => {
    fakeOff({});
    const s = await open();
    await read(KNOWN);
    await screen.findByText(SPREAD);
    fireEvent.click(screen.getByRole('button', { name: 'Not this item?' }));
    expect(screen.getByText(/remembered as Test spread 400 g/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search for what it counts as'), {
      target: { value: 'soup' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Tinned soup/ }));
    fireEvent.click(screen.getByRole('button', { name: '400 g' }));
    fireEvent.change(screen.getByLabelText(/^Product name/), {
      target: { value: 'Tinned soup 400 g' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByRole('heading', { name: /soup/i })).toBeTruthy();
    expect(s.doc().barcodes[KNOWN]?.productId).not.toBe('prod-spread');
    chip('+1 y');
    ok();
    expect(barcodeStock(s)[0]!.productId).not.toBe('prod-spread');
    await read(KNOWN);
    expect(await screen.findByRole('heading', { name: /soup/i })).toBeTruthy();
  });

  it('Keep leaves the barcode as it was', async () => {
    fakeOff({});
    const s = await open();
    await read(KNOWN);
    await screen.findByText(SPREAD);
    fireEvent.click(screen.getByRole('button', { name: 'Not this item?' }));
    fireEvent.click(screen.getByRole('button', { name: /^Keep / }));
    expect(screen.getByRole('heading', { name: SPREAD })).toBeTruthy();
    expect(s.doc().barcodes[KNOWN]!.productId).toBe('prod-spread');
  });
});

describe('Undo and Sort later edge cases', () => {
  it('Undo leaves an item already in progress alone', async () => {
    const s = await open();
    await read(KNOWN);
    await screen.findByText(SPREAD);
    chip('+1 y');
    ok();
    // a second item is already being counted when Undo is tapped
    await read(KNOWN);
    await screen.findByRole('heading', { name: SPREAD });
    fireEvent.click(screen.getByRole('button', { name: '+6 m' }));
    fireEvent.click(
      within(screen.getByTestId('stocktake-saved')).getByRole('button', { name: 'Undo' }),
    );
    expect(barcodeStock(s)).toHaveLength(0); // the first save is taken back
    // the second is untouched: still on its card, with its +6 m chip chosen
    expect(screen.getByRole('button', { name: '+6 m' }).getAttribute('aria-pressed')).toBe('true');
    ok();
    expect(barcodeStock(s)).toHaveLength(1);
  });

  it('Sort later is off, with the reason, when there is no place', async () => {
    fakeOff({ [UNKNOWN]: 'offline' });
    const doc = biggarDocument();
    doc.locations = {};
    render(liveStore(doc).wrap(<StocktakeScreen />)); // no place, so nothing scans: the number is typed
    fireEvent.change(screen.getByLabelText('Or type the barcode number'), {
      target: { value: UNKNOWN },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use this number' }));
    const later = await screen.findByRole('button', { name: 'Decide later' });
    expect((later as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/Add a place first/).length).toBeGreaterThan(0);
  });
});

describe('scans to sort', () => {
  const scan = (over: Partial<Scan> = {}): Scan => ({
    id: 's1',
    code: UNKNOWN,
    qty: 2,
    locationId: 'loc-pantry',
    bestBefore: '2028-01',
    scanned: '2026-11-04T10:00:00.000Z',
    ...over,
  });
  const withScan = (s: Scan = scan()) => {
    const doc = biggarDocument();
    doc.scans[s.id] = s;
    return doc;
  };
  const packs = bundledPacks();

  it('a queued scan counts nothing until it is sorted', () => {
    const plain = biggarDocument();
    expect(score(withScan(), packs, '2026-11-04')).toEqual(score(plain, packs, '2026-11-04'));
  });

  it('a stocktake "Sort later" queues the scan and adds no stock', async () => {
    fakeOff({ [UNKNOWN]: 'offline' });
    const s = await open();
    const stock = structuredClone(s.doc().stock);
    await read(UNKNOWN);
    fireEvent.click(await screen.findByRole('button', { name: 'Decide later' }));
    expect(s.doc().stock).toEqual(stock);
    expect(Object.values(s.doc().scans)).toMatchObject([{ code: UNKNOWN, qty: 1 }]);
  });

  it('sorting makes stock with source barcode, remembers the barcode and leaves the queue', async () => {
    fakeOff({
      [UNKNOWN]: {
        found: true,
        name: 'Test beans',
        quantity: '415 g',
        size: { amount: 415, unit: 'g' },
        categories: ['en:canned-foods', 'en:baked-beans'],
      },
    });
    const s = liveStore(withScan());
    render(s.wrap(<ScansToSort onClose={() => undefined} />));
    fireEvent.click(screen.getByRole('button', { name: `Sort scan ${UNKNOWN}` }));
    await waitFor(() => expect(screen.getByText(/Test beans 415 g/)).toBeTruthy());
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(Object.keys(s.doc().scans)).toHaveLength(0));
    const made = Object.values(s.doc().stock).find((r) => r.source === 'barcode');
    expect(made).toMatchObject({
      qty: 2,
      locationId: 'loc-pantry',
      bestBefore: '2028-01',
    });
    expect(s.doc().barcodes[UNKNOWN]?.productId).toBeDefined();
  });

  it('a row can be deleted, with undo', () => {
    vi.useFakeTimers();
    const s = liveStore(withScan());
    render(s.wrap(<ScansToSort onClose={() => undefined} />));
    fireEvent.click(screen.getByRole('button', { name: `Delete scan ${UNKNOWN}` }));
    expect(screen.queryByRole('button', { name: `Sort scan ${UNKNOWN}` })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: `Sort scan ${UNKNOWN}` })).toBeTruthy();
    expect(Object.keys(s.doc().scans)).toEqual(['s1']);
  });
});

function Queue() {
  useScanQueue();
  return null;
}

describe('the scan queue lookup', () => {
  const queued = (code: string, id: string, at: string): Scan => ({
    id,
    code,
    qty: 1,
    locationId: 'loc-pantry',
    scanned: at,
  });
  const docWith = (...scans: Scan[]) => {
    const doc = biggarDocument();
    for (const s of scans) doc.scans[s.id] = s;
    return doc;
  };

  it('looks queued codes up oldest first and writes OFF facts back', async () => {
    const lookup = fakeOff({
      [UNKNOWN]: { found: true, name: 'Test beans', quantity: '415 g', categories: [] },
    });
    const s = liveStore(
      docWith(
        queued(UNKNOWN, 'a', '2026-11-04T10:00:00.000Z'),
        queued('4006381333931', 'b', '2026-11-04T10:05:00.000Z'),
      ),
    );
    render(s.wrap(<Queue />));
    await waitFor(() => expect(s.doc().scans['b']?.off).toBeDefined());
    expect(lookup.mock.calls.map((c) => c[0])).toEqual([UNKNOWN, '4006381333931']);
    expect(s.doc().scans['a']!.off).toMatchObject({ found: true, name: 'Test beans' });
    expect(s.doc().scans['b']!.off).toMatchObject({ found: false });
  });

  it('stops when offline and asks nothing more', async () => {
    const lookup = fakeOff({ [UNKNOWN]: 'offline' });
    const s = liveStore(docWith(queued(UNKNOWN, 'a', '2026-11-04T10:00:00.000Z')));
    render(s.wrap(<Queue />));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(s.doc().scans['a']!.off).toBeUndefined();
  });

  it('respects busy: waits a minute, then tries again', async () => {
    vi.useFakeTimers();
    const lookup = vi
      .fn()
      .mockResolvedValueOnce('busy')
      .mockResolvedValue({ found: true, name: 'Test beans', categories: [] });
    const { setOffClient } = await import('../src/app/off');
    setOffClient({ lookup });
    const s = liveStore(docWith(queued(UNKNOWN, 'a', '2026-11-04T10:00:00.000Z')));
    render(s.wrap(<Queue />));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(s.doc().scans['a']!.off).toBeUndefined();
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(31_000)));
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(s.doc().scans['a']!.off).toMatchObject({ found: true });
  });
});
