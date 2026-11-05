import { isValidGtin, normaliseGtin } from '../util/gtin';
import {
  BARCODE_BOX,
  BARCODE_BOX_SIDEWAYS,
  ZXING_INTERVAL_MS,
  ZXING_ROTATE,
  type Box,
} from './tunables';

/**
 * The barcode loop: look at the barcode box on the live camera every moment until a valid
 * EAN or UPC number is read. The browser's own `BarcodeDetector` (Chrome on Android) does it when
 * it has EAN; otherwise zxing, loaded only when first needed (its own chunk). zxing reads one
 * orientation only, so on every other attempt the frame is turned 90 degrees.
 */

/** What the loop needs from the camera (the real `CameraStream` has both). */
export interface FrameSource {
  captureBox(box: Box, maxHeight?: number): ImageData;
}

/** The part of zxing the loop uses: grey pixels in, the text of a barcode out (or nothing). */
export interface ZxingReader {
  decode(luminance: Uint8ClampedArray, width: number, height: number): string | undefined;
}

interface DetectorLike {
  detect(source: ImageData): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = {
  new (opts: { formats: string[] }): DetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

export interface LoopOptions {
  intervalMs?: number;
  /** Turn every other zxing attempt 90 degrees (default `ZXING_ROTATE`). */
  rotate?: boolean;
  /** The native detector class; `null` forces zxing. Default: `globalThis.BarcodeDetector`. */
  detector?: DetectorCtor | null;
  /** Loads zxing. Default: the real library, imported on first use. */
  loadZxing?: () => Promise<ZxingReader>;
  /** Told which decoder is in use, once. */
  onDecoder?: (name: 'detector' | 'zxing') => void;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Grey levels of an RGBA frame, one byte a pixel. */
export function luminanceOf(frame: {
  data: ArrayLike<number>;
  width: number;
  height: number;
}): Uint8ClampedArray {
  const { data, width, height } = frame;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8;
  }
  return out;
}

/** A grey frame turned 90 degrees clockwise: the result is `height` wide and `width` tall. */
export function rotate90(src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[x * height + (height - 1 - y)] = src[y * width + x]!;
    }
  }
  return out;
}

/** The real zxing, EAN and UPC only. Imported on first use so the main bundle does not carry it. */
export async function loadZxing(): Promise<ZxingReader> {
  const z = await import('@zxing/library');
  // The 1D reader alone: the all-format reader logs a warning for every empty frame.
  const hints = new Map<import('@zxing/library').DecodeHintType, unknown>([
    [
      z.DecodeHintType.POSSIBLE_FORMATS,
      [z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8, z.BarcodeFormat.UPC_A, z.BarcodeFormat.UPC_E],
    ],
  ]);
  const reader = new z.MultiFormatOneDReader(hints);
  return {
    decode(luminance, width, height) {
      try {
        const source = new z.RGBLuminanceSource(luminance, width, height);
        return reader.decode(new z.BinaryBitmap(new z.HybridBinarizer(source)), hints).getText();
      } catch {
        return undefined; // nothing readable in this frame
      }
    },
  };
}

type Decode = (cam: FrameSource, attempt: number) => Promise<string | undefined>;

async function chooseDecoder(
  opts: LoopOptions,
): Promise<{ name: 'detector' | 'zxing'; decode: Decode }> {
  const Ctor =
    opts.detector === undefined
      ? ((globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null)
      : opts.detector;
  if (Ctor) {
    try {
      if ((await Ctor.getSupportedFormats()).includes('ean_13')) {
        const detector = new Ctor({ formats: FORMATS });
        return {
          name: 'detector',
          decode: async (cam) =>
            (await detector.detect(cam.captureBox(BARCODE_BOX, 1080)))[0]?.rawValue,
        };
      }
    } catch {
      // Present but broken: fall through to zxing.
    }
  }
  const zxing = await (opts.loadZxing ?? loadZxing)();
  const rotate = opts.rotate ?? ZXING_ROTATE;
  return {
    name: 'zxing',
    decode: async (cam, attempt) => {
      if (rotate && attempt % 2 === 1) {
        // A code held sideways: a tall box, turned to read upright.
        const frame = cam.captureBox(BARCODE_BOX_SIDEWAYS, 1080);
        const grey = luminanceOf(frame);
        return zxing.decode(rotate90(grey, frame.width, frame.height), frame.height, frame.width);
      }
      const frame = cam.captureBox(BARCODE_BOX, 1080);
      return zxing.decode(luminanceOf(frame), frame.width, frame.height);
    },
  };
}

/**
 * Starts looking. `onCode` gets the first valid number, normalised (a UPC-A as its EAN-13 form),
 * once; the loop then stops itself, and the caller starts a new one for the next item. A number
 * that fails its check digit is a misread and is ignored. Returns the stop function.
 */
export function startBarcodeLoop(
  cam: FrameSource,
  onCode: (code: string) => void,
  opts: LoopOptions = {},
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interval = opts.intervalMs ?? ZXING_INTERVAL_MS;

  void (async () => {
    let decoder: Awaited<ReturnType<typeof chooseDecoder>>;
    try {
      decoder = await chooseDecoder(opts);
    } catch {
      return; // zxing could not load (offline on first use): no scanning, typing still works
    }
    if (stopped) return;
    opts.onDecoder?.(decoder.name);
    let attempt = 0;
    const tick = async (): Promise<void> => {
      if (stopped) return;
      let text: string | undefined;
      try {
        text = await decoder.decode(cam, attempt++);
      } catch {
        text = undefined; // camera not ready yet, or a frame the decoder could not take
      }
      if (stopped) return;
      if (text && isValidGtin(text)) {
        stopped = true;
        onCode(normaliseGtin(text));
        return;
      }
      timer = setTimeout(() => void tick(), interval);
    };
    void tick();
  })();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
