import { DOCUMENT_DB_NAME, type DocumentStore } from './documentStore';
import { clearDriveSession } from './drive';
import { deleteSyncDatabase, type SyncPersistence } from './syncPersistence';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    // Another tab still has it open: it closes when that tab reloads. Carry on.
    req.onblocked = () => resolve();
  });
}

/**
 * "Forget this device's data": closes the store, deletes the household and the sync state from
 * IndexedDB, and drops the Drive sign-in. Nothing on Drive is touched. The caller reloads the
 * page afterwards, which starts from an empty household.
 */
export async function forgetDeviceData(
  store?: DocumentStore,
  persistence?: SyncPersistence,
): Promise<void> {
  await store?.close();
  await persistence?.close();
  await deleteDatabase(DOCUMENT_DB_NAME);
  await deleteSyncDatabase();
  clearDriveSession();
}
