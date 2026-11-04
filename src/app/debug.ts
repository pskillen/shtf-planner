/**
 * Test hooks. With `?debug=1` in the URL, `window.__shtf` exists for e2e tests and for poking at
 * the app from the console. Later phases hang their hooks on it; it is empty for now. Without the
 * flag nothing is installed.
 */
export type ShtfDebug = Record<string, unknown>;

declare global {
  interface Window {
    __shtf?: ShtfDebug;
  }
}

export function installDebugHook(
  search: string = window.location.search,
  target: Window = window,
): ShtfDebug | undefined {
  if (new URLSearchParams(search).get('debug') !== '1') return undefined;
  target.__shtf ??= {};
  return target.__shtf;
}
