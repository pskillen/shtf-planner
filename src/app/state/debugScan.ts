/**
 * Where an injected barcode goes. The camera strip registers its handler while it is looking for a
 * barcode; with `?debug=1`, `window.__shtf.scan.code('3017620422003')` hands a code to it, as if
 * the camera had read it (the e2e suite uses it beside the fake camera). Nothing is installed
 * without the flag.
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
  hook.scan = {
    code: (code: string): boolean => {
      if (!handler) return false;
      handler(code);
      return true;
    },
  };
}
