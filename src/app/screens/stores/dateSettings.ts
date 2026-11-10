import type { ReaderStatus } from '../../../scan/ocr/client';

/**
 * Four per-device switches, kept in this browser only (they are about this phone, not the
 * household): "Read dates with the camera" (on by default), "Use the graphics chip (WebGPU) when
 * available" (on by default), the stocktake's "Propped" (off by default) and its "Sound with each
 * buzz" (on by default, heard only while Propped is on).
 */
const CAMERA_KEY = 'shtf.dates.camera';
const WEBGPU_KEY = 'shtf.dates.webgpu';
const PROPPED_KEY = 'shtf.stocktake.propped';
const SOUND_KEY = 'shtf.stocktake.sound';

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

function readOff(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export const readUseCamera = (): boolean => read(CAMERA_KEY);
export const writeUseCamera = (on: boolean): void => write(CAMERA_KEY, on);
export const readUseWebGpu = (): boolean => read(WEBGPU_KEY);
export const writeUseWebGpu = (on: boolean): void => write(WEBGPU_KEY, on);
export const readPropped = (): boolean => readOff(PROPPED_KEY);
export const writePropped = (on: boolean): void => write(PROPPED_KEY, on);
export const readSound = (): boolean => read(SOUND_KEY);
export const writeSound = (on: boolean): void => write(SOUND_KEY, on);

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
