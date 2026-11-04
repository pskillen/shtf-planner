import { openStore, type DocumentStore } from '../../store';

let opening: Promise<DocumentStore> | undefined;

/**
 * The one store for this page. Opened on first use and shared by the provider and the debug hook,
 * so React StrictMode's double mount does not open the document twice.
 */
export function getStore(): Promise<DocumentStore> {
  opening ??= openStore().catch((e: unknown) => {
    opening = undefined;
    throw e;
  });
  return opening;
}
