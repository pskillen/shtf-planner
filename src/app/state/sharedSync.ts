import {
  createDrivePort,
  createIdbPersistence,
  createSync,
  forgetDeviceData,
  type Sync,
} from '../../store';
import { getStore } from './sharedStore';

const persistence = createIdbPersistence();
let starting: Promise<Sync> | undefined;

/**
 * The one sync engine for this page, started on first use (after the document is open). It is the
 * only place `src/app` builds the Drive port and the sync state's storage.
 */
export function getSync(): Promise<Sync> {
  starting ??= (async () => {
    const store = await getStore();
    const sync = createSync({
      store,
      drive: createDrivePort(),
      persistence,
      env: typeof __BUILD_ENV__ !== 'undefined' ? __BUILD_ENV__ : 'local',
    });
    await sync.start();
    return sync;
  })().catch((e: unknown) => {
    starting = undefined;
    throw e;
  });
  return starting;
}

/** "Forget this device's data": stops sync, deletes the household and sync state, reloads. */
export async function forgetThisDevice(): Promise<void> {
  const sync = await getSync();
  sync.stop();
  await forgetDeviceData(await getStore(), persistence, createDrivePort());
}

/**
 * Start again after a too-old household: forget local data but keep the Drive sign-in, then open
 * the app empty (onboarding).
 */
export async function startFreshHousehold(): Promise<void> {
  try {
    const sync = await getSync();
    sync.stop();
  } catch {
    // Sync may never have started; still clear the household.
  }
  await forgetDeviceData(await getStore(), persistence, createDrivePort(), { keepDrive: true });
  globalThis.location.assign('/app');
}
