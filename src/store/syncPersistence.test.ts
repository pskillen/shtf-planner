import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStore } from './documentStore';
import { isDriveConnected, loadDriveAccount, saveDriveSession } from './drive/drivePrefs';
import { memoryStorage } from './drive/testStorage';
import { forgetDeviceData } from './forget';
import {
  createIdbPersistence,
  createMemoryPersistence,
  deleteSyncDatabase,
  type SyncPersistence,
} from './syncPersistence';

const conflict = {
  key: 'items/a',
  title: 'Water',
  noun: 'Item',
  minePresent: true,
  theirsPresent: true,
  fields: [{ field: 'qty', mine: 1, theirs: 2 }],
};

describe.each([
  ['memory', () => createMemoryPersistence()],
  ['indexeddb', () => createIdbPersistence(`sync-test-${Math.random()}`)],
] as const)('%s persistence', (_name, make: () => SyncPersistence) => {
  it('starts empty, merges patches, and keeps the base apart', async () => {
    const p = make();
    expect((await p.load()).record).toEqual({ dirty: false, edits: 0, conflicts: [] });
    await p.save({ folderId: 'f', dirty: true, edits: 2 });
    await p.save({ conflicts: [conflict] });
    await p.saveBase(new Uint8Array([1, 2, 3]));
    const loaded = await p.load();
    expect(loaded.record).toMatchObject({ folderId: 'f', dirty: true, edits: 2 });
    expect(loaded.record.conflicts).toEqual([conflict]);
    expect(Array.from(loaded.base ?? [])).toEqual([1, 2, 3]);
  });

  it('clear forgets everything', async () => {
    const p = make();
    await p.save({ folderId: 'f' });
    await p.saveBase(new Uint8Array([9]));
    await p.clear();
    const loaded = await p.load();
    expect(loaded.record.folderId).toBeUndefined();
    expect(loaded.base).toBeUndefined();
  });
});

describe('forgetDeviceData', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('also forgets the choices remembered per device', async () => {
    const storage = memoryStorage();
    storage.setItem('shtf.lastLocationId', 'loc-1');
    storage.setItem('shtf.recentItems', '["a"]');
    storage.setItem('shtf.recentProducts', '["p"]');
    storage.setItem('shtf.recentItemTypes', '["old"]');
    storage.setItem('unrelated', 'kept');
    vi.stubGlobal('localStorage', storage);
    await forgetDeviceData();
    expect(storage.getItem('shtf.lastLocationId')).toBeNull();
    expect(storage.getItem('shtf.recentItems')).toBeNull();
    expect(storage.getItem('shtf.recentProducts')).toBeNull();
    expect(storage.getItem('shtf.recentItemTypes')).toBeNull();
    expect(storage.getItem('unrelated')).toBe('kept');
  });

  it('deletes the household and the sync state', async () => {
    const store = await openStore({ env: 'local', deviceId: 'd', channel: false });
    store.change('x', (d) => {
      d.home.area = 'ML12';
    });
    const sync = createIdbPersistence();
    await sync.save({ folderId: 'f' });
    await forgetDeviceData(store, sync);

    const reopened = await openStore({ env: 'local', deviceId: 'd', channel: false });
    expect(reopened.get().home.area).toBeUndefined();
    const again = createIdbPersistence();
    expect((await again.load()).record.folderId).toBeUndefined();
    await again.close();
    await reopened.close();
    await deleteSyncDatabase();
  });

  it('revokes the Drive token first, and still forgets when revoking fails', async () => {
    const order: string[] = [];
    const sync = createIdbPersistence();
    await forgetDeviceData(undefined, sync, {
      disconnect: async () => {
        order.push('revoked');
      },
    });
    expect(order).toEqual(['revoked']);

    await sync.save({ folderId: 'f' });
    await forgetDeviceData(undefined, sync, {
      disconnect: async () => {
        throw new Error('offline');
      },
    });
    const again = createIdbPersistence();
    expect((await again.load()).record.folderId).toBeUndefined();
    await again.close();
    await deleteSyncDatabase();
  });

  it('keepDrive leaves the Drive sign-in and token alone, but still deletes the sync state', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    saveDriveSession({ accessToken: 't', expiresAt: Date.now() + 60_000, accountEmail: 'a@b.c' });
    const revoked: string[] = [];
    const sync = createIdbPersistence();
    await sync.save({ folderId: 'f' });
    await forgetDeviceData(
      undefined,
      sync,
      {
        disconnect: async () => {
          revoked.push('revoked');
        },
      },
      { keepDrive: true },
    );
    expect(revoked).toEqual([]);
    expect(isDriveConnected()).toBe(true);
    expect(loadDriveAccount()).toBe('a@b.c');
    const again = createIdbPersistence();
    expect((await again.load()).record.folderId).toBeUndefined();
    await again.close();
    await deleteSyncDatabase();

    // and without it the sign-in goes
    await forgetDeviceData(undefined, undefined, { disconnect: async () => {} });
    expect(isDriveConnected()).toBe(false);
  });
});
