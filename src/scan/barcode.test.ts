import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ean13Frame, rotatedFrame } from '../fixtures/ean';
import {
  loadZxing,
  luminanceOf,
  rotate90,
  startBarcodeLoop,
  type FrameSource,
  type ZxingReader,
} from './barcode';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const frameOf = (f: { data: Uint8ClampedArray; width: number; height: number }) =>
  f as unknown as ImageData;
const source = (frames: ImageData[]): FrameSource => {
  let i = 0;
  return { captureBox: () => frames[Math.min(i++, frames.length - 1)]! };
};
const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('rotate90', () => {
  it('turns a grey frame a quarter turn clockwise', () => {
    // 3 wide, 2 tall:  1 2 3 / 4 5 6  ->  2 wide, 3 tall:  4 1 / 5 2 / 6 3
    const out = rotate90(new Uint8ClampedArray([1, 2, 3, 4, 5, 6]), 3, 2);
    expect(Array.from(out)).toEqual([4, 1, 5, 2, 6, 3]);
  });
});

describe('the loop with the native detector', () => {
  const detectorFor = (value: string) =>
    class {
      static getSupportedFormats = async () => ['ean_13', 'qr_code'];
      detect = async () => [{ rawValue: value }];
    };

  it('uses it when it supports EAN and reports a valid, normalised code once', async () => {
    const onCode = vi.fn();
    const onDecoder = vi.fn();
    const load = vi.fn();
    const stop = startBarcodeLoop(source([frameOf(ean13Frame('3017620422003'))]), onCode, {
      detector: detectorFor('036000291452') as never, // a UPC-A: reported as its EAN-13 form
      loadZxing: load,
      onDecoder,
    });
    await flush(300);
    expect(onDecoder).toHaveBeenCalledWith('detector');
    expect(load).not.toHaveBeenCalled();
    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith('0036000291452');
    stop();
  });

  it('ignores a misread that fails the check digit and keeps looking', async () => {
    const onCode = vi.fn();
    startBarcodeLoop(source([frameOf(ean13Frame('3017620422003'))]), onCode, {
      detector: detectorFor('3017620422004') as never,
      intervalMs: 100,
    });
    await flush(1000);
    expect(onCode).not.toHaveBeenCalled();
  });

  it('falls back to zxing when the detector has no EAN', async () => {
    const onDecoder = vi.fn();
    const zxing: ZxingReader = { decode: () => '5000169005743' };
    const onCode = vi.fn();
    class NoEan {
      static getSupportedFormats = async () => ['qr_code'];
    }
    startBarcodeLoop(source([frameOf(ean13Frame('5000169005743'))]), onCode, {
      detector: NoEan as never,
      loadZxing: async () => zxing,
      onDecoder,
    });
    await flush(300);
    expect(onDecoder).toHaveBeenCalledWith('zxing');
    expect(onCode).toHaveBeenCalledWith('5000169005743');
  });
});

describe('the loop with zxing', () => {
  it('turns every other attempt 90 degrees', async () => {
    const shapes: string[] = [];
    const zxing: ZxingReader = {
      decode: (_l, w, h) => {
        shapes.push(`${w}x${h}`);
        return undefined;
      },
    };
    const f = frameOf({ data: new Uint8ClampedArray(40 * 10 * 4), width: 40, height: 10 });
    const stop = startBarcodeLoop(source([f]), vi.fn(), {
      detector: null,
      loadZxing: async () => zxing,
      intervalMs: 100,
    });
    await flush(450);
    stop();
    expect(shapes.slice(0, 4)).toEqual(['40x10', '10x40', '40x10', '10x40']);
  });

  it('does not rotate when rotation is off, and waits the interval between attempts', async () => {
    const shapes: string[] = [];
    startBarcodeLoop(
      source([frameOf({ data: new Uint8ClampedArray(160), width: 8, height: 5 })]),
      vi.fn(),
      {
        detector: null,
        rotate: false,
        intervalMs: 100,
        loadZxing: async () => ({
          decode: (_l, w, h) => {
            shapes.push(`${w}x${h}`);
            return undefined;
          },
        }),
      },
    );
    await flush(250);
    expect(shapes.length).toBe(3); // at 0, 100 and 200 ms
    expect(new Set(shapes)).toEqual(new Set(['8x5']));
  });

  it('stop ends the loop', async () => {
    const decode = vi.fn(() => undefined);
    const stop = startBarcodeLoop(
      source([frameOf({ data: new Uint8ClampedArray(16), width: 2, height: 2 })]),
      vi.fn(),
      {
        detector: null,
        loadZxing: async () => ({ decode }),
        intervalMs: 50,
      },
    );
    await flush(120);
    stop();
    const n = decode.mock.calls.length;
    await flush(500);
    expect(decode.mock.calls.length).toBe(n);
  });

  it('keeps trying when the camera is not ready', async () => {
    let calls = 0;
    const cam: FrameSource = {
      captureBox: () => {
        if (calls++ < 2) throw new Error('The camera is not ready');
        return frameOf(ean13Frame('3017620422003'));
      },
    };
    const onCode = vi.fn();
    startBarcodeLoop(cam, onCode, {
      detector: null,
      loadZxing: async () => ({ decode: () => '3017620422003' }),
      intervalMs: 50,
    });
    await flush(400);
    expect(onCode).toHaveBeenCalledWith('3017620422003');
  });
});

describe('real zxing on rendered bars', () => {
  beforeEach(() => vi.useRealTimers());

  it('reads an EAN-13, and one turned a quarter turn', async () => {
    const zxing = await loadZxing();
    const f = ean13Frame('3017620422003', 3, 90);
    expect(zxing.decode(luminanceOf(f), f.width, f.height)).toBe('3017620422003');
    const turned = rotatedFrame(f);
    // Sideways, it reads nothing; turned back by the loop's rotation, it reads.
    expect(zxing.decode(luminanceOf(turned), turned.width, turned.height)).toBeUndefined();
    const back = rotate90(luminanceOf(turned), turned.width, turned.height);
    expect(zxing.decode(back, turned.height, turned.width)).toBe('3017620422003');
  });

  it('the loop finds the sideways code on its second attempt', async () => {
    const turned = rotatedFrame(ean13Frame('5000169005743', 3, 90));
    const onCode = vi.fn();
    startBarcodeLoop(source([frameOf(turned)]), onCode, { detector: null, intervalMs: 5 });
    await vi.waitFor(() => expect(onCode).toHaveBeenCalledWith('5000169005743'), { timeout: 3000 });
  });
});
