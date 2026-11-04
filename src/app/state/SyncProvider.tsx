import { useEffect, useState, type ReactNode } from 'react';
import type { Sync } from '../../store';
import { getSync } from './sharedSync';
import { SyncContext } from './syncContext';

/**
 * Starts Drive sync once the document is open (render it inside `DocumentProvider`) and provides
 * the engine to `useSync()` and `useSyncState()`. The app renders at once; sync joins when ready.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [sync, setSync] = useState<Sync | null>(null);

  useEffect(() => {
    let live = true;
    getSync().then(
      (s) => live && setSync(s),
      () => undefined, // sync is optional: the household works without it
    );
    return () => {
      live = false;
    };
  }, []);

  return <SyncContext.Provider value={sync}>{children}</SyncContext.Provider>;
}
