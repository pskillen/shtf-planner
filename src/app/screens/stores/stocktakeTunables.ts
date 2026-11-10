/**
 * The stocktake's numbers the owner may want to nudge: one line each. (The camera's are in
 * `src/scan/tunables.ts`.)
 */

/** How long the Undo toast stays after OK, in milliseconds. */
export const UNDO_MS = 6000;

/** Vibration patterns, in milliseconds on and off: one buzz on a barcode, two on a date. */
export const BUZZ_BARCODE: number | number[] = 80;
export const BUZZ_DATE: number | number[] = [60, 90, 60];

/** The propped stocktake's tones: one beep on a barcode, two (with a gap) on a date. */
export const BEEP_BARCODE = { hz: 880, ms: 90 };
export const BEEP_DATE = { hz: 1320, ms: 70 };
/** The gap between the two date beeps, in milliseconds. */
export const BEEP_GAP_MS = 90;

let cueSound = false;
/** Turns the beeps on or off (the stocktake does so while Propped and Sound are on). */
export function setCueSound(on: boolean): void {
  cueSound = on;
}

let audio: AudioContext | undefined;
function tone(hz: number, ms: number, delayMs: number): void {
  const Ctx =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audio ??= new Ctx();
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  const start = audio.currentTime + delayMs / 1000;
  const end = start + ms / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** The sounds, as an object so a test can spy on `cues.beep`. Generated: no audio files. */
export const cues = {
  beep(kind: 'barcode' | 'date'): void {
    try {
      if (kind === 'barcode') tone(BEEP_BARCODE.hz, BEEP_BARCODE.ms, 0);
      else {
        tone(BEEP_DATE.hz, BEEP_DATE.ms, 0);
        tone(BEEP_DATE.hz, BEEP_DATE.ms, BEEP_DATE.ms + BEEP_GAP_MS);
      }
    } catch {
      // No sound here.
    }
  },
};

/** A short buzz where the phone can (and a beep when propped); silently nothing elsewhere. */
export function buzz(kind: 'barcode' | 'date'): void {
  try {
    globalThis.navigator?.vibrate?.(kind === 'barcode' ? BUZZ_BARCODE : BUZZ_DATE);
  } catch {
    // No vibration here.
  }
  if (cueSound) cues.beep(kind);
}
