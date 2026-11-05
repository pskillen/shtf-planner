import type { Page } from '@playwright/test';

/**
 * A fake camera for the e2e suite: `getUserMedia` returns a `canvas.captureStream`, and
 * `window.__fakeCam.show({ ean?, text?, sideways? })` draws a rendered EAN-13 (or a text label,
 * which the camera date reading of P9b uses) onto it. No real camera is needed, so it runs in CI.
 *
 *  - `capabilities: 'chrome'` gives the track torch, zoom 1 to 7 and focus modes, as Chrome on
 *    Android reports; `'none'` reports nothing, as Firefox does.
 *  - `detector: true` installs a fake `BarcodeDetector` that returns the code on show; false
 *    removes it so zxing does the reading.
 */
export interface FakeCameraOptions {
  capabilities?: 'chrome' | 'none';
  detector?: boolean;
}

export interface FakeCam {
  show(what: { ean?: string; text?: string; sideways?: boolean }): void;
  clear(): void;
  /** Every constraint applied to the track, for the tests that check torch and zoom. */
  applied: Array<Record<string, unknown>>;
}

export async function installFakeCamera(
  page: Page,
  options: FakeCameraOptions = {},
): Promise<void> {
  await page.addInitScript((opts) => {
    const L = [
      '0001101',
      '0011001',
      '0010011',
      '0111101',
      '0100011',
      '0110001',
      '0101111',
      '0111011',
      '0110111',
      '0001011',
    ];
    const G = [
      '0100111',
      '0110011',
      '0011011',
      '0100001',
      '0011101',
      '0111001',
      '0000101',
      '0010001',
      '0001001',
      '0010111',
    ];
    const R = [
      '1110010',
      '1100110',
      '1101100',
      '1000010',
      '1011100',
      '1001110',
      '1010000',
      '1000100',
      '1001000',
      '1110100',
    ];
    const PARITY = [
      'LLLLLL',
      'LLGLGG',
      'LLGGLG',
      'LLGGGL',
      'LGLLGG',
      'LGGLLG',
      'LGGGLL',
      'LGLGLG',
      'LGLGGL',
      'LGGLGL',
    ];
    const bitsOf = (code: string): string => {
      const d = code.split('').map(Number);
      const parity = PARITY[d[0]!]!;
      let bits = '101';
      for (let i = 0; i < 6; i++) bits += (parity[i] === 'L' ? L : G)[d[i + 1]!];
      bits += '01010';
      for (let i = 0; i < 6; i++) bits += R[d[i + 7]!];
      return bits + '101';
    };

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    let current: { ean?: string; text?: string; sideways?: boolean } = {};

    function draw(): void {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (current.ean) {
        const bits = bitsOf(current.ean);
        const quiet = 12;
        const modules = bits.length + quiet * 2;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (current.sideways) ctx.rotate(Math.PI / 2);
        // Upright: 7 px a module, 300 px tall. Sideways: 3 px a module so its length fits the tall box.
        const scale = current.sideways ? 3 : 7;
        const height = current.sideways ? 120 : 300;
        const width = modules * scale;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-width / 2, -height / 2 - 10, width, height + 20);
        ctx.fillStyle = '#000';
        for (let i = 0; i < bits.length; i++) {
          if (bits[i] === '1')
            ctx.fillRect(-width / 2 + (quiet + i) * scale, -height / 2, scale, height);
        }
        ctx.restore();
      }
      if (current.text) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(canvas.width / 2 - 300, canvas.height / 2 - 70, 600, 140);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 90px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(current.text, canvas.width / 2, canvas.height / 2);
      }
    }
    draw();
    // Keep frames flowing: a captured canvas only emits when it changes.
    let tick = 0;
    setInterval(() => {
      draw();
      ctx.fillStyle = tick++ % 2 ? '#9a9a99' : '#9a9a9a';
      ctx.fillRect(0, 0, 1, 1);
    }, 66);

    const applied: Array<Record<string, unknown>> = [];
    const cam = {
      applied,
      show(what: { ean?: string; text?: string; sideways?: boolean }) {
        current = what;
        draw();
      },
      clear() {
        current = {};
        draw();
      },
    };
    (window as unknown as { __fakeCam: typeof cam }).__fakeCam = cam;

    const chrome = opts.capabilities !== 'none';
    const devices = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, 'mediaDevices', { value: devices, configurable: true });
    devices.getUserMedia = async () => {
      const stream = canvas.captureStream(15);
      const track = stream.getVideoTracks()[0]!;
      const t = track as unknown as Record<string, unknown>;
      t.getCapabilities = () =>
        chrome
          ? {
              torch: true,
              zoom: { min: 1, max: 7, step: 0.1 },
              focusMode: ['continuous', 'single-shot', 'manual'],
            }
          : {};
      t.applyConstraints = async (c: { advanced?: Array<Record<string, unknown>> }) => {
        for (const one of c.advanced ?? []) applied.push(one);
      };
      return stream;
    };
    devices.getSupportedConstraints = () =>
      (chrome
        ? { torch: true, zoom: true, focusMode: true, pointsOfInterest: true }
        : {}) as MediaTrackSupportedConstraints;

    if (opts.detector) {
      (window as unknown as Record<string, unknown>).BarcodeDetector = class {
        static getSupportedFormats = async () => ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
        detect = async () => (current.ean ? [{ rawValue: current.ean }] : []);
      };
    } else {
      delete (window as unknown as Record<string, unknown>).BarcodeDetector;
    }
  }, options);
}
