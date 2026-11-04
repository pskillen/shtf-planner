import { useStoreStatus } from './storeContext';

/** False when the document is read-only (saved by a newer version, or invalid): edits are off. */
export function useEditable(): boolean {
  return useStoreStatus().kind === 'ok';
}
