import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openStore } from './documentStore';
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
});
