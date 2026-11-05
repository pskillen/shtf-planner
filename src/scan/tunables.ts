/**
 * The numbers the owner may want to nudge while trying the scanner on a phone. Each is one line.
 * (The app's own ones, the Undo time and the buzz patterns, are in `src/app/screens/stores/stocktakeTunables.ts`.)
 */

/** zxing only: pause between two decode attempts, in milliseconds. */
export const ZXING_INTERVAL_MS = 100;

/** zxing reads one orientation only: when true, every other attempt turns the frame 90 degrees. */
export const ZXING_ROTATE = true;

/** The zoom a camera starts at where it offers zoom, before the person's own choice is remembered. */
export const DEFAULT_ZOOM = 1.75;

/** How long single-shot focus after a tap holds before going back to continuous focus. */
export const FOCUS_HOLD_MS = 1500;

/** Open Food Facts: give up on one lookup after this long. */
export const OFF_TIMEOUT_MS = 4000;

/** Open Food Facts: at most this many lookups in any rolling window (OFF's own limit is 15 a minute). */
export const OFF_MAX_LOOKUPS = 10;
export const OFF_WINDOW_MS = 60_000;

/** A box on the camera strip, as fractions of the visible strip. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Barcode step: a wide, short box across the middle (blue). */
export const BARCODE_BOX: Box = { x: 0.04, y: 0.36, w: 0.92, h: 0.28 };

/** Date step: a taller box (yellow). Used by the camera date reading, once built. */
export const DATE_BOX: Box = { x: 0.06, y: 0.22, w: 0.88, h: 0.56 };

/**
 * zxing's turned attempts look here instead: a tall box in the middle, because a code held
 * sideways needs its length inside the box. (The native detector reads any way up.)
 */
export const BARCODE_BOX_SIDEWAYS: Box = { x: 0.3, y: 0.04, w: 0.4, h: 0.92 };

export const BARCODE_COLOUR = '#2aa8ff';
export const DATE_COLOUR = '#fc0';
