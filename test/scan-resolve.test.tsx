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

const KNOWN = '3017620422003'; // in the fixture: Peanut butter (340 g jar)
const UNKNOWN = '5000169005743';

const beans = {
  found: true as const,
  name: 'Test beans',
  quantity: '415 g',
  grams: 415,
  kcalPer100g: 80,
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

describe('Quick add: Scan a barcode', () => {
  it('has the scan button above the search box', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<QuickAdd onClose={() => undefined} />));
    const scan = screen.getByRole('button', { name: 'Scan a barcode' });
    const search = screen.getByLabelText('What are you adding?');
    expect(scan.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a known barcode goes straight to the form with the type picked, and saves as a barcode item', async () => {
    const lookup = fakeOff({});
    const s = await openScanner();
    await read(KNOWN);
    expect(await screen.findByText('Add Peanut butter (340 g jar)')).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled(); // remembered: nothing leaves the phone
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const added = Object.values(s.doc().items).filter(
      (i) => i.typeId === 'items-base:peanut-butter-340g' && i.source === 'barcode',
    );
    expect(added.length).toBe(1);
  });

  it('Not this item? on the form reopens the picker and corrects the remembered type', async () => {
    fakeOff({});
    const s = await openScanner();
    await read(KNOWN);
    await screen.findByText('Add Peanut butter (340 g jar)');
    fireEvent.click(screen.getByRole('button', { name: 'Not this item?' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pick what it is' }));
    fireEvent.change(screen.getByLabelText('Search all types'), {
      target: { value: 'tinned food' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tinned food \(400 g tin\)/ }));
    expect(await screen.findByText('Add Tinned food (400 g tin)')).toBeTruthy();
    expect(s.doc().barcodes[KNOWN]?.typeId).toBe('items-base:tinned-food-tin');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      Object.values(s.doc().items).some(
        (i) => i.typeId === 'items-base:tinned-food-tin' && i.source === 'barcode',
      ),
    ).toBe(true);
  });

  it('an unknown barcode asks Open Food Facts, offers likely types, and remembers the pick', async () => {
    const lookup = fakeOff({ [UNKNOWN]: beans });
    const s = await openScanner();
    await read(UNKNOWN);
    expect(await screen.findByText('Test beans 415 g')).toBeTruthy();
    expect(lookup).toHaveBeenCalledWith(UNKNOWN);
    expect(screen.getByText('Which of these is it?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tinned food \(400 g tin\)/ }));
    expect(s.doc().barcodes[UNKNOWN]).toMatchObject({
      typeId: 'items-base:tinned-food-tin',
      name: 'Test beans 415 g',
    });
    expect(screen.getByText('Add Tinned food (400 g tin)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    // Next item from a scanned item goes back to the scanner, not the search
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    expect(screen.getByText('Scan a barcode', { selector: 'h2' })).toBeTruthy();
  });

  it('offline: not known yet, with search, its own item and sort later', async () => {
    fakeOff({ [UNKNOWN]: 'offline' });
    const s = await openScanner();
    await read(UNKNOWN);
    expect(await screen.findByText(/You are offline/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pick what it is' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New item' })).toBeTruthy(); // no name offline
    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
    const scans = Object.values(s.doc().scans);
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ code: UNKNOWN, qty: 1 });
    expect(screen.getByText('Kept to sort later.')).toBeTruthy();
    expect(Object.values(s.doc().items).some((i) => i.source === 'barcode')).toBe(false);
  });

  it('never saves equipment as stock: a stove search routes to the equipment form', async () => {
    fakeOff({});
    const s = await openScanner();
    const before = Object.keys(s.doc().items).length;
    await read(UNKNOWN);
    fireEvent.click(await screen.findByRole('button', { name: 'Pick what it is' }));
    fireEvent.change(screen.getByLabelText('Search all types'), { target: { value: 'stove' } });
    const route = screen.getByRole('list', { name: 'Equipment: add to your home' });
    expect(route.querySelector('a')?.getAttribute('href')).toMatch(/^\/app\/assets\?add=/);
    // no stock button for any equipment-backed type
    expect(screen.queryByRole('button', { name: /stove/i })).toBeNull();
    expect(Object.keys(s.doc().items)).toHaveLength(before);
  });

  it('"New item: <name>" fills the name and the kcal from Open Food Facts', async () => {
    fakeOff({ [UNKNOWN]: beans });
    const s = await openScanner();
    await read(UNKNOWN);
    // The button carries the name Open Food Facts gave it.
    fireEvent.click(await screen.findByRole('button', { name: 'New item: Test beans' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Test beans');
    expect((screen.getByLabelText(/kcal/) as HTMLInputElement).value).toBe('332'); // 80 per 100 g x 415 g
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    const custom = Object.values(s.doc().customTypes);
    expect(custom).toHaveLength(1);
    expect(s.doc().barcodes[UNKNOWN]?.typeId).toBe(custom[0]!.id);
    expect(await screen.findByText('Add Test beans')).toBeTruthy();
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
    expect(await screen.findByText('Add Peanut butter (340 g jar)')).toBeTruthy();
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
