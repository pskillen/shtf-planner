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

/** Date step: a taller box (yellow), where the camera reads the best-before date. */
export const DATE_BOX: Box = { x: 0.06, y: 0.22, w: 0.88, h: 0.56 };

/**
 * zxing's turned attempts look here instead: a tall box in the middle, because a code held
 * sideways needs its length inside the box. (The native detector reads any way up.)
 */
export const BARCODE_BOX_SIDEWAYS: Box = { x: 0.3, y: 0.04, w: 0.4, h: 0.92 };

export const BARCODE_COLOUR = '#2aa8ff';
export const DATE_COLOUR = '#fc0';

// ---- Reading the date (src/scan/dateLoop.ts, src/scan/ocr). The agreement and confidence
// numbers are in src/engine/datecode/tally.ts; the parser's ranges in src/engine/datecode/parse.ts.

/** A date step gives up and offers suggestions after this long, in milliseconds. */
export const DATE_TIMEOUT_MS = 8000;

/** One frame stops trying more pictures after this long, in milliseconds. */
export const FRAME_MAX_MS = 3000;

/** The box is captured at most this many pixels high (and never narrower than 480). */
export const CAPTURE_MAX_H = 256;

/** The small picture the text reader sees is this many pixels high. */
export const OCR_H = 64;

/** Glare: this share of the box (250+ grey) or more, up to GLARE_MAX, says "tilt the phone" and skips the frame. */
export const GLARE_MIN = 0.2;
/** Above this the label is just bright paper, not a reflection: read it as usual. */
export const GLARE_MAX = 0.65;
/** After this many glare frames in a row, read anyway: a label that really is that bright must not lock the loop. */
export const MAX_GLARE_RUN = 25;

/** A frame is "moving" when its thumbnail differs from the last by more than this many grey levels. */
export const MOVING_DIFF = 18;
/** A frame is "blurred" when its sharpness is under this share of the sharpest so far. */
export const BLUR_RATIO = 0.5;
/** The sharpest-so-far memory decays by this each frame, so one sharp frame does not make the rest look blurred. */
export const SHARP_DECAY = 0.9;
/** Never skip more than this many frames in a row: read one anyway. */
export const MAX_SKIPS = 4;
/** Mean edge strength under this means nothing to read in the box. */
export const FLAT_SHARPNESS = 2;

/** Pause between two frames of the date loop, in milliseconds; a little longer after a skip. */
export const DATE_GAP_MS = 80;
export const DATE_SKIP_GAP_MS = 110;
