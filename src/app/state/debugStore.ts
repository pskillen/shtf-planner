import type { Document } from '../../model';
import { getStore } from './sharedStore';

/**
 * With `?debug=1`, hangs the document on `window.__shtf` for e2e tests and the console:
 * `doc()` and `change(fn)`. Opens the store on first use.
 */
export function installStoreDebug(hook: Record<string, unknown> | undefined): void {
  if (!hook) return;
  hook.doc = async () => (await getStore()).get();
  hook.change = async (fn: (draft: Document) => void) => {
    const store = await getStore();
    store.change('debug', fn);
    await store.flush();
  };
}
