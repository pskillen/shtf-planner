// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StocktakeScreen } from '../src/app/screens/stores/StocktakeScreen';
import { buzz, cues } from '../src/app/screens/stores/stocktakeTunables';
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

const KNOWN = '3017620422003'; // fixture: prod-spread (Test spread 400 g)
const release = vi.fn(() => Promise.resolve());
const request = vi.fn(() => Promise.resolve({ release }));
const beep = vi.spyOn(cues, 'beep').mockImplementation(() => undefined);

beforeEach(() => {
  localStorage.clear();
  resetScan();
  resetDates();
  release.mockClear();
  request.mockClear();
  beep.mockClear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom does not implement it
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

const barcodeStock = (s: ReturnType<typeof liveStore>) =>
  Object.values(s.doc().stock).filter((r) => r.source === 'barcode');
/** Identical additions merge into one row, so count the quantity, not the rows. */
const counted = (s: ReturnType<typeof liveStore>) =>
  barcodeStock(s).reduce((sum, r) => sum + r.qty, 0);
const proppedSwitch = () => screen.getByRole('switch', { name: /^Propped/ });
const section = () => document.querySelector('section.stocktake') as HTMLElement;

async function open() {
  const s = liveStore(biggarDocument());
  const view = render(s.wrap(<StocktakeScreen />));
  await waitFor(() => expect(scanState.onCode).toBeDefined());
  return { s, view };
}

describe('Stocktake: propped mode', () => {
  it('is off by default, and remembered once switched on', async () => {
    const { view } = await open();
    expect((proppedSwitch() as HTMLInputElement).checked).toBe(false);
    expect(section().classList.contains('propped')).toBe(false);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(proppedSwitch());
    expect(section().classList.contains('propped')).toBe(true);
    expect(localStorage.getItem('shtf.stocktake.propped')).toBe('1');
    view.unmount();
    resetScan();
    await open();
    expect((proppedSwitch() as HTMLInputElement).checked).toBe(true);
    expect(section().classList.contains('propped')).toBe(true);
  });

  it('keeps the screen awake while on, and lets go on switching off and on unmount', async () => {
    const { view } = await open();
    fireEvent.click(proppedSwitch());
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    await act(async () => undefined);
    fireEvent.click(proppedSwitch());
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    fireEvent.click(proppedSwitch());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    view.unmount();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('is fine where there is no wake lock', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    await open();
    fireEvent.click(proppedSwitch());
    expect(section().classList.contains('propped')).toBe(true);
  });

  it('three items in a row, one OK each, nothing saved before it', async () => {
    const { s } = await open();
    fireEvent.click(proppedSwitch());
    for (let n = 1; n <= 3; n++) {
      await act(async () => scanState.onCode!(KNOWN));
      await screen.findByText('Test spread 400 g');
      await waitFor(() => expect(dateState.starts).toBe(n));
      await act(async () => dateState.finish(gotRead(6, 2028)));
      expect(await screen.findByTestId('date-result')).toBeTruthy();
      expect(counted(s)).toBe(n - 1);
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      expect(screen.getByText('1 BARCODE')).toBeTruthy();
      expect(counted(s)).toBe(n);
    }
    expect(barcodeStock(s).every((r) => r.bestBefore === '2028-06')).toBe(true);
  });
});

describe('useWakeLock: the page hides and comes back', () => {
  const setVisibility = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  it('forgets the lock when hidden, asks again when visible', async () => {
    const { view } = await open();
    fireEvent.click(proppedSwitch());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    await act(async () => setVisibility('hidden'));
    expect(request).toHaveBeenCalledTimes(1); // nothing asked while hidden
    await act(async () => setVisibility('visible'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    view.unmount();
    expect(release).toHaveBeenCalledTimes(1); // only the new lock is ours to release
  });
});

describe('Stocktake: the tones themselves', () => {
  it('plays an oscillator and stops it, with no network', async () => {
    vi.resetModules();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    class FakeAudio {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn(() => Promise.resolve());
      createOscillator() {
        const o = { frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        oscillators.push(o);
        return o;
      }
      createGain() {
        return { gain: param(), connect: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudio);
    try {
      const mod = await import('../src/app/screens/stores/stocktakeTunables');
      mod.cues.beep('barcode');
      expect(oscillators).toHaveLength(1);
      mod.cues.beep('date');
      expect(oscillators).toHaveLength(3);
      for (const o of oscillators) {
        expect(o.start).toHaveBeenCalledTimes(1);
        expect(o.stop).toHaveBeenCalledTimes(1);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Stocktake: the sound with each buzz', () => {
  it('beeps with a barcode and with a camera date while Propped and Sound are on', async () => {
    await open();
    fireEvent.click(proppedSwitch());
    await act(async () => scanState.onCode!(KNOWN));
    expect(beep).toHaveBeenCalledWith('barcode');
    await waitFor(() => expect(dateState.starts).toBe(1));
    await act(async () => dateState.finish(gotRead(6, 2028)));
    await screen.findByTestId('date-result');
    expect(beep).toHaveBeenCalledWith('date');
  });

  it('is silent with Sound off, and Sound is remembered', async () => {
    await open();
    fireEvent.click(proppedSwitch());
    fireEvent.click(screen.getByRole('switch', { name: 'Sound with each buzz' }));
    expect(localStorage.getItem('shtf.stocktake.sound')).toBe('0');
    await act(async () => scanState.onCode!(KNOWN));
    expect(beep).not.toHaveBeenCalled();
  });

  it('is silent with Propped off, and the Sound switch is hidden', async () => {
    await open();
    expect(screen.queryByRole('switch', { name: 'Sound with each buzz' })).toBeNull();
    await act(async () => scanState.onCode!(KNOWN));
    expect(beep).not.toHaveBeenCalled();
  });

  it('stops beeping once the stocktake is left', async () => {
    const { view } = await open();
    fireEvent.click(proppedSwitch());
    view.unmount();
    buzz('barcode');
    expect(beep).not.toHaveBeenCalled();
  });
});
