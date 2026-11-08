import { DOCUMENT_DB_NAME, type DocumentStore } from './documentStore';
import { clearDriveSession, type DrivePort } from './drive';
import { deleteSyncDatabase, type SyncPersistence } from './syncPersistence';

/**
 * Per-device choices the Stores screens remember in localStorage (`src/app/screens/stores/stock.ts`
 * owns them; the store layer may not import it, so the names are repeated here).
 */
const DEVICE_KEYS = [
  'shtf.lastLocationId',
  'shtf.recentItems',
  'shtf.recentProducts',
  // The key schema 3 used for recent item types; removed once, harmlessly.
  'shtf.recentItemTypes',
] as const;

/** Unsaved checklist notes (`StepNote.tsx` in `src/app`): household text, one key per step. */
const DEVICE_KEY_PREFIXES = ['shtf:checklist-note-draft:'] as const;

function clearDeviceKeys(): void {
  try {
    const storage = globalThis.localStorage;
    const found: string[] = [];
    for (let i = 0; storage && i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && DEVICE_KEY_PREFIXES.some((p) => key.startsWith(p))) found.push(key);
    }
    for (const key of found) storage.removeItem(key);
  } catch {
    // Storage off: nothing was remembered.
  }
  for (const key of DEVICE_KEYS) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Storage off: nothing was remembered.
    }
  }
}

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
 * IndexedDB, forgets the remembered per-device choices, revokes the Drive token (best effort: offline or a slow Google must not stop the
 * forgetting) and drops the Drive sign-in. Nothing on Drive is touched. The caller reloads the
 * page afterwards, which starts from an empty household.
 *
 * With `keepDrive` (a household from an older version is being replaced) the Drive token is not
 * revoked and the sign-in stays, so the person remains connected; the sync database, which holds
 * the old base and file ids, is still deleted.
 */
export async function forgetDeviceData(
  store?: DocumentStore,
  persistence?: SyncPersistence,
  drive?: Pick<DrivePort, 'disconnect'>,
  opts: { keepDrive?: boolean } = {},
): Promise<void> {
  if (!opts.keepDrive) await revokeBestEffort(drive);
  await store?.close();
  await persistence?.close();
  await deleteDatabase(DOCUMENT_DB_NAME);
  await deleteSyncDatabase();
  if (!opts.keepDrive) clearDriveSession();
  clearDeviceKeys();
}
