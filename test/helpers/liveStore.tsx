import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { StoreContext } from '../../src/app/state/storeContext';
import type { Document } from '../../src/model';
import type { DocumentStore } from '../../src/store';

const ok = { kind: 'ok' as const };

/**
 * A minimal in-memory store for component tests: `change` applies the edit to a copy and tells
 * the subscribers, so a screen re-renders the way it does on the real store. `doc()` reads it back.
 */
export function liveStore(initial: Document) {
  let current = structuredClone(initial);
  const listeners = new Set<() => void>();
  const labels: string[] = [];
  const store = {
    get: () => current,
    status: () => ok,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    change: (label: string, fn: (d: Document) => void) => {
      const draft = structuredClone(current);
      fn(draft);
      current = draft;
      labels.push(label);
      for (const l of [...listeners]) l();
    },
  } as unknown as DocumentStore;
  const wrap = (ui: ReactNode) => (
    <MemoryRouter>
      <StoreContext.Provider value={store}>{ui}</StoreContext.Provider>
    </MemoryRouter>
  );
  return { store, wrap, doc: () => current, labels };
}
