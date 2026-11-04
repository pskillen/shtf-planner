import { DOCUMENT_DB_NAME, type DocumentStore } from './documentStore';
import { clearDriveSession, type DrivePort } from './drive';
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

const REVOKE_TIMEOUT_MS = 3000;

async function revokeBestEffort(drive?: Pick<DrivePort, 'disconnect'>): Promise<void> {
  if (!drive) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      drive.disconnect(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, REVOKE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Best effort: the sign-in is dropped below either way.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "Forget this device's data": closes the store, deletes the household and the sync state from
 * IndexedDB, revokes the Drive token (best effort: offline or a slow Google must not stop the
 * forgetting) and drops the Drive sign-in. Nothing on Drive is touched. The caller reloads the
 * page afterwards, which starts from an empty household.
 */
export async function forgetDeviceData(
  store?: DocumentStore,
  persistence?: SyncPersistence,
  drive?: Pick<DrivePort, 'disconnect'>,
): Promise<void> {
  await revokeBestEffort(drive);
  await store?.close();
  await persistence?.close();
  await deleteDatabase(DOCUMENT_DB_NAME);
  await deleteSyncDatabase();
  clearDriveSession();
}
