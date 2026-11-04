import type { Document } from '../../model';
import { getStore } from './sharedStore';
import { getSync } from './sharedSync';

/**
 * With `?debug=1`, hangs the document on `window.__shtf` for e2e tests and the console:
 * `doc()`, `change(fn)` and `loadFixture()`. Opens the store on first use.
 */
export function installStoreDebug(hook: Record<string, unknown> | undefined): void {
  if (!hook) return;
  hook.doc = async () => (await getStore()).get();
  hook.change = async (fn: (draft: Document) => void) => {
    const store = await getStore();
    store.change('debug', fn);
    await store.flush();
  };
  // Sync, for the e2e suite: `sync()` is the live state, `flush()` pushes now.
  hook.sync = async () => (await getSync()).state();
  // `flush()` settles the document on disk, then pushes to Drive when connected.
  hook.flush = async () => {
    await (await getStore()).flush();
    await (await getSync()).flush();
  };
  hook.loadFixture = async () => {
    // Loaded only here, so the fixture is a separate chunk that normal use never fetches.
    const { biggarDocument } = await import('../../fixtures/household-biggar');
    const store = await getStore();
    store.importJson(JSON.stringify(biggarDocument()), 'replace');
    await store.flush();
  };
}
