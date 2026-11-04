import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { Sync, SyncState } from '../../store';

/** The sync engine, once it has started; `null` before that and in tests without a provider. */
export const SyncContext = createContext<Sync | null>(null);

/** What the UI shows before the engine is up (and where there is no provider at all). */
export const NO_SYNC_STATE: SyncState = {
  status: { kind: 'disconnected' },
  configured: false,
  connected: false,
  account: null,
  conflicts: [],
  envWarning: null,
  firstConnect: false,
  notice: null,
  checkedAt: null,
};

/** The engine for actions (connect, flush, resolve ...); `null` until it is ready. */
export function useSync(): Sync | null {
  return useContext(SyncContext);
}

/** The sync state; re-renders on every change. Safe without a provider. */
export function useSyncState(): SyncState {
  const sync = useContext(SyncContext);
  const subscribe = useCallback(
    (onChange: () => void) => (sync ? sync.subscribe(() => onChange()) : () => {}),
    [sync],
  );
  const snapshot = useCallback(() => (sync ? sync.state() : NO_SYNC_STATE), [sync]);
  return useSyncExternalStore(subscribe, snapshot);
}
