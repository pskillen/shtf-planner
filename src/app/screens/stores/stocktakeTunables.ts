/**
 * The stocktake's numbers the owner may want to nudge: one line each. (The camera's are in
 * `src/scan/tunables.ts`.)
 */

/** How long the Undo toast stays after OK, in milliseconds. */
export const UNDO_MS = 6000;

/** Vibration patterns, in milliseconds on and off: one buzz on a barcode, two on a date. */
export const BUZZ_BARCODE: number | number[] = 80;
export const BUZZ_DATE: number | number[] = [60, 90, 60];

/** A short buzz where the phone can; silently nothing elsewhere. */
export function buzz(kind: 'barcode' | 'date'): void {
  try {
    globalThis.navigator?.vibrate?.(kind === 'barcode' ? BUZZ_BARCODE : BUZZ_DATE);
  } catch {
    // No vibration here.
  }
}
