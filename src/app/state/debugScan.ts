import { enableTimings, resetTimings, timings } from '../../scan/timings';

/**
 * Where an injected barcode goes. The camera strip registers its handler while it is looking for a
 * barcode; with `?debug=1`, `window.__shtf.scan.code('3017620422003')` hands a code to it, as if
 * the camera had read it (the e2e suite uses it beside the fake camera). The same flag switches on
 * the date reader's timing list (`window.__shtf.scan.timings()`, `resetTimings()`; counts and times
 * only, kept in memory, copied with the Done summary). Nothing is installed or recorded without
 * the flag.
 */
let handler: ((code: string) => void) | undefined;

/** The strip calls this while it is scanning; the returned function unregisters. */
export function registerScanHandler(fn: (code: string) => void): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = undefined;
  };
}

export function installScanDebug(hook: Record<string, unknown> | undefined): void {
  if (!hook) return;
  enableTimings();
  hook.scan = {
    code: (code: string): boolean => {
      if (!handler) return false;
      handler(code);
      return true;
    },
    timings: () => timings(),
    resetTimings,
  };
}
