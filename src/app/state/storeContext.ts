import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Document } from '../../model';
import type { DocumentStore, StoreStatus } from '../../store';

export const StoreContext = createContext<DocumentStore | null>(null);

function useStore(): DocumentStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useDocument must be used inside <DocumentProvider>.');
  return store;
}

/** The current household document (a frozen snapshot); re-renders when it changes. */
export function useDocument(): Document {
  const store = useStore();
  return useSyncExternalStore((onChange) => store.subscribe(() => onChange()), store.get);
}

/** Why the document is read-only (`too-new`: update this device), or `ok`. */
export function useStoreStatus(): StoreStatus {
  const store = useStore();
  return useSyncExternalStore((onChange) => store.subscribe(() => onChange()), store.status);
}

/** `change(label, fn)`: edit a draft of the document; only what changed is written. */
export function useChange(): DocumentStore['change'] {
  return useStore().change;
}
