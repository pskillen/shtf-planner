// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAdd } from '../src/app/screens/stores/QuickAdd';
import { biggarDocument } from '../src/fixtures/household-biggar';
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
afterEach(cleanup);

const KNOWN = '3017620422003'; // fixture: prod-spread (Test spread 400 g)
const UNKNOWN = '5000169005743';

const beans = {
  found: true as const,
  name: 'Test beans',
  quantity: '415 g',
  size: { amount: 415, unit: 'g' as const },
  kcalPer100: 80,
  categories: ['en:canned-foods', 'en:baked-beans'],
};

async function openScanner(doc = biggarDocument()) {
  const s = liveStore(doc);
  render(s.wrap(<QuickAdd onClose={() => undefined} />));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode' })));
  await waitFor(() => expect(scanState.onCode).toBeDefined());
  return s;
}
const read = async (code: string) => {
  await act(async () => scanState.onCode!(code));
};

const barcodeStock = (s: ReturnType<typeof liveStore>) =>
  Object.values(s.doc().stock).filter((r) => r.source === 'barcode');

describe('Quick add: Scan a barcode', () => {
  it('has the scan button above the search box', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<QuickAdd onClose={() => undefined} />));
    const scan = screen.getByRole('button', { name: 'Scan a barcode' });
    const search = screen.getByLabelText('What are you adding?');
    expect(scan.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a known barcode goes straight to the form with the product picked, and saves as barcode stock', async () => {
    const lookup = fakeOff({});
    const s = await openScanner();
    await read(KNOWN);
    expect(await screen.findByText('Add Test spread 400 g')).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(barcodeStock(s)).toHaveLength(1);
    expect(barcodeStock(s)[0]!.productId).toBe('prod-spread');
  });

  it('Not this item? on the form reopens the picker and corrects the remembered product', async () => {
    fakeOff({});
    const s = await openScanner();
    await read(KNOWN);
    await screen.findByText('Add Test spread 400 g');
    fireEvent.click(screen.getByRole('button', { name: 'Not this item?' }));
    fireEvent.change(await screen.findByLabelText('Search for what it counts as'), {
      target: { value: 'soup' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Tinned soup/ }));
    fireEvent.click(screen.getByRole('button', { name: '400 g' }));
    fireEvent.change(screen.getByLabelText(/^Product name/), {
      target: { value: 'Tinned soup 400 g' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText(/Add .*soup/i)).toBeTruthy();
    expect(s.doc().barcodes[KNOWN]?.productId).not.toBe('prod-spread');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(barcodeStock(s).some((r) => r.productId !== 'prod-spread')).toBe(true);
  });

  it('an unknown barcode asks Open Food Facts, counts-as Yes, and remembers the product', async () => {
    const lookup = fakeOff({ [UNKNOWN]: beans });
    const s = await openScanner();
    await read(UNKNOWN);
    expect(await screen.findByText(/Test beans 415 g/)).toBeTruthy();
    expect(lookup).toHaveBeenCalledWith(UNKNOWN);
    expect(screen.getByRole('heading', { name: 'Counts as: Baked beans?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(s.doc().barcodes[UNKNOWN]?.productId).toBeDefined();
    expect(await screen.findByText(/Add /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Scan a barcode', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByTestId('last-add-status').textContent).toMatch(/Added 1 × .* to /);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('offline: not known yet, with search, counts towards nothing and sort later', async () => {
    fakeOff({ [UNKNOWN]: 'offline' });
    const s = await openScanner();
    await read(UNKNOWN);
    expect(await screen.findByText(/You are offline/)).toBeTruthy();
    expect(screen.getByLabelText('Search for what it counts as')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Counts towards nothing' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
    const scans = Object.values(s.doc().scans);
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ code: UNKNOWN, qty: 1 });
    expect(screen.getByText('Kept to sort later.')).toBeTruthy();
    expect(barcodeStock(s)).toHaveLength(0);
  });

  it('never saves equipment as stock: a stove search routes to the equipment form', async () => {
    fakeOff({});
    const s = await openScanner();
    const before = Object.keys(s.doc().stock).length;
    await read(UNKNOWN);
    fireEvent.change(await screen.findByLabelText('Search for what it counts as'), {
      target: { value: 'camping stove' },
    });
    const route = screen.getByRole('region', { name: 'Equipment: add to your home' });
    expect(route.querySelector('a')?.getAttribute('href')).toMatch(/^\/app\/assets\?add=/);
    expect(Object.keys(s.doc().stock)).toHaveLength(before);
  });

  it('Counts towards nothing makes a product with no item and remembers the barcode', async () => {
    fakeOff({ [UNKNOWN]: beans });
    const s = await openScanner();
    await read(UNKNOWN);
    fireEvent.click(await screen.findByRole('button', { name: 'Counts towards nothing' }));
    const pid = s.doc().barcodes[UNKNOWN]?.productId;
    expect(pid).toBeDefined();
    expect(s.doc().products[pid!]!.itemId).toBeUndefined();
    expect(await screen.findByText(/Add Test beans/)).toBeTruthy();
  });

  it('Counts towards nothing for a code nobody knows asks for a name first', async () => {
    fakeOff({});
    const s = await openScanner();
    await read(UNKNOWN);
    fireEvent.click(await screen.findByRole('button', { name: 'Counts towards nothing' }));
    expect(s.doc().barcodes[UNKNOWN]).toBeUndefined();
    const save = screen.getByRole('button', { name: 'Save product' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Product name/), { target: { value: 'Dog biscuits' } });
    fireEvent.click(save);
    const pid = s.doc().barcodes[UNKNOWN]?.productId;
    expect(s.doc().products[pid!]).toMatchObject({ name: 'Dog biscuits' });
  });

  it('typing the number works with no camera, and refuses a bad check digit', async () => {
    scanState.startFails = true;
    fakeOff({});
    const s = liveStore(biggarDocument());
    render(s.wrap(<QuickAdd onClose={() => undefined} />));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode' })));
    expect(await screen.findByText(/No camera\./)).toBeTruthy();
    const box = screen.getByLabelText('Or type the barcode number');
    fireEvent.change(box, { target: { value: '3017620422004' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this number' }));
    expect(screen.getByText(/does not look right/)).toBeTruthy();
    fireEvent.change(box, { target: { value: '3017 6204 22003' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this number' }));
    expect(await screen.findByText('Add Test spread 400 g')).toBeTruthy();
  });

  it('shows the one-line fallback when the browser has no torch, zoom or focus', async () => {
    await openScanner();
    expect(
      await screen.findByText(
        'Zoom, focus and torch aren’t available in this browser. Chrome has them.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Torch' })).toBeNull();
  });

  it('shows torch and zoom where the browser has them', async () => {
    scanState.caps = {
      torch: true,
      zoom: { min: 1, max: 7, step: 0.1 },
      focusModes: ['continuous'],
      pointsOfInterest: true,
    };
    await openScanner();
    expect(await screen.findByRole('button', { name: 'Torch' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByLabelText('Zoom level')).toBeTruthy();
  });
});
