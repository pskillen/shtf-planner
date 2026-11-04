import { useEffect, useState, type ReactNode } from 'react';
import type { DocumentStore } from '../../store';
import { getStore } from './sharedStore';
import { StoreContext } from './storeContext';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; store: DocumentStore }
  | { kind: 'error'; message: string };

/**
 * Opens the household document and provides it to `useDocument()`, `useChange()` and
 * `useStoreStatus()`. This is the only place `src/app` touches the store.
 */
export function DocumentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    getStore().then(
      (store) => live && setState({ kind: 'ready', store }),
      (e: unknown) =>
        live && setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === 'loading') return <p className="muted screen">Loading your plan…</p>;
  if (state.kind === 'error') {
    return (
      <section className="screen" role="alert">
        <h1>Could not open your plan</h1>
        <p>{state.message}</p>
      </section>
    );
  }
  return <StoreContext.Provider value={state.store}>{children}</StoreContext.Provider>;
}
