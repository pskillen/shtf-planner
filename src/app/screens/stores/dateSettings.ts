import type { ReaderStatus } from '../../../scan/ocr/client';

/**
 * Two per-device switches for reading dates with the camera, kept in this browser only (they are
 * about this phone, not the household): "Read dates with the camera" (on by default) and "Use the
 * graphics chip (WebGPU) when available" (on by default).
 */
const CAMERA_KEY = 'shtf.dates.camera';
const WEBGPU_KEY = 'shtf.dates.webgpu';

function read(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) !== '0';
  } catch {
    return true;
  }
}

function write(key: string, on: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, on ? '1' : '0');
  } catch {
    // Not remembered; the default comes back next time.
  }
}

export const readUseCamera = (): boolean => read(CAMERA_KEY);
export const writeUseCamera = (on: boolean): void => write(CAMERA_KEY, on);
export const readUseWebGpu = (): boolean => read(WEBGPU_KEY);
export const writeUseWebGpu = (on: boolean): void => write(WEBGPU_KEY, on);

/** Whether this browser can open a camera at all (the Read the date button is shown only then). */
export function hasCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** "WebGPU · last read 0.4 s", "WASM · last read 1.5 s", or why the reader is not ready. */
export function aboutLine(status: ReaderStatus | undefined): string {
  if (!status) return 'Not started yet. It loads when the first date is read.';
  if (status.state === 'loading') return 'Getting ready…';
  if (status.state === 'failed') return `Not available: ${status.message}`;
  const base = status.ep === 'webgpu' ? 'WebGPU' : 'WASM';
  const last =
    status.lastReadMs === undefined
      ? ''
      : ` · last read ${(status.lastReadMs / 1000).toFixed(1)} s`;
  const why = status.ep === 'wasm' && status.reason ? ` (${status.reason})` : '';
  return `${base}${last}${why}`;
}
