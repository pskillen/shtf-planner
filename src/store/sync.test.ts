import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Document, Env } from '../model';
import { openStore, type DocumentStore } from './documentStore';
import { JSON_FILE_NAME, YJS_FILE_NAME } from './drive';
import { createFakeCloud, type FakeCloud, type FakePort } from './fakeDrive';
import {
  NEWER_VERSION_MESSAGE,
  RECONNECT_MESSAGE,
  createSync,
  type Sync,
  type SyncHost,
} from './sync';
import { createMemoryPersistence, type SyncPersistence } from './syncPersistence';

type HostEvent = 'online' | 'offline' | 'visible' | 'hidden';
function fakeHost() {
  const handlers = new Map<HostEvent, Set<() => void>>();
  const host: SyncHost & { online: boolean; fire(e: HostEvent): void } = {
    online: true,
    isOnline: () => host.online,
    isVisible: () => true,
    on(event, cb) {
      const set = handlers.get(event) ?? new Set();
      set.add(cb);
      handlers.set(event, set);
      return () => void set.delete(cb);
    },
    fire(event) {
      if (event === 'online') host.online = true;
      if (event === 'offline') host.online = false;
      for (const cb of Array.from(handlers.get(event) ?? [])) cb();
    },
  };
  return host;
}

const DEBOUNCE = 30;
let counter = 0;
const opened: Array<{ store: DocumentStore; sync: Sync }> = [];
afterEach(async () => {
  for (const { store, sync } of opened.splice(0)) {
    sync.stop();
    await store.close();
  }
});

interface Device {
  store: DocumentStore;
  sync: Sync;
  port: FakePort;
  host: ReturnType<typeof fakeHost>;
  persistence: SyncPersistence;
}

async function device(
  cloud: FakeCloud,
  options: { env?: Env; persistence?: SyncPersistence; name?: string; start?: boolean } = {},
): Promise<Device> {
  const name = options.name ?? `sync-${++counter}-${Math.random().toString(36).slice(2)}`;
  const store = await openStore({
    name,
    env: options.env ?? 'local',
    deviceId: name,
    channel: false,
  });
  const port = cloud.port();
  const host = fakeHost();
  const persistence = options.persistence ?? createMemoryPersistence();
  let t = Date.UTC(2026, 5, 1, 12, 0, 0);
  const sync = createSync({
    store,
    drive: port,
    persistence,
    env: options.env ?? 'local',
    host,
    now: () => (t += 1000),
    debounceMs: DEBOUNCE,
    retryMs: 10_000_000,
  });
  opened.push({ store, sync });
  if (options.start !== false) await sync.start();
  return { store, sync, port, host, persistence };
}

const item = (id: string, qty: number, over: Partial<Document['items'][string]> = {}) => ({
  id,
  typeId: 'items-base:water-can',
  qty,
  locationId: 'loc',
  added: '2026-01-01',
  source: 'manual' as const,
  ...over,
});
const setItem = (d: Device, id: string, qty: number, over = {}) =>
  d.store.change(`set ${id}`, (doc) => {
    doc.items[id] = item(id, qty, over);
  });
const kind = (d: Device) => d.sync.state().status.kind;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Lets the debounce fire and the operation finish. */
const settle = async (d: Device) => {
  await sleep(DEBOUNCE * 3);
  await d.sync.whenIdle();
};

describe('connecting', () => {
  it('first connect to an empty Drive sends the household: both files, then synced', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 3);
    expect(kind(a)).toBe('disconnected');
    await a.sync.connect();
    expect(kind(a)).toBe('synced');
    expect(cloud.writes[YJS_FILE_NAME]).toBe(1);
    expect(cloud.writes[JSON_FILE_NAME]).toBe(1);
    expect(JSON.parse(cloud.text(JSON_FILE_NAME)!)).toEqual(JSON.parse(a.store.export()));
  });

  it('a blank device takes the household from Drive without asking', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 3);
    await a.sync.connect();

    const b = await device(cloud);
    await b.sync.connect();
    expect(b.store.get().items.a).toMatchObject({ qty: 3 });
    expect(b.sync.state().firstConnect).toBe(false);
    expect(b.sync.state().notice?.text).toBe('Loaded your household from Google Drive');
    expect(kind(b)).toBe('synced');
    // its only news for Drive is that this device now exists (meta.devices)
    await b.sync.whenIdle();
    const onDrive = JSON.parse(cloud.text(JSON_FILE_NAME)!);
    expect(onDrive.items.a.qty).toBe(3);
    expect(onDrive.meta.devices).toHaveLength(2);
  });

  it('a device with data meeting a household on Drive asks first, then merges both', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 3);
    await a.sync.connect();

    const b = await device(cloud);
    setItem(b, 'b', 5);
    await b.sync.connect();
    expect(b.sync.state().firstConnect).toBe(true);
    expect(kind(b)).toBe('remoteNewer');
    expect(b.store.get().items.a).toBeUndefined();

    await b.sync.resolveFirstConnect('merge');
    expect(Object.keys(b.store.get().items).sort()).toEqual(['a', 'b']);
    expect(kind(b)).toBe('synced');
    // and Drive now has both, for the first device
    await a.sync.checkDrive();
    expect(Object.keys(a.store.get().items).sort()).toEqual(['a', 'b']);
  });

  it('declining the first-connect question disconnects and leaves both alone', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 3);
    await a.sync.connect();
    const b = await device(cloud);
    setItem(b, 'b', 5);
    await b.sync.connect();
    await b.sync.resolveFirstConnect('cancel');
    expect(kind(b)).toBe('disconnected');
    expect(b.store.get().items.a).toBeUndefined();
    expect(b.sync.state().firstConnect).toBe(false);
  });

  it('a closed Google popup is quiet: still disconnected, no error', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    a.port.cancelNextConnect = true;
    await a.sync.connect();
    expect(a.sync.state().status).toEqual({ kind: 'disconnected' });
    await a.sync.connect(); // the retry works
    expect(kind(a)).toBe('synced');
  });

  it('disconnect forgets the connection but keeps the household', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 3);
    await a.sync.connect();
    await a.sync.disconnect();
    expect(kind(a)).toBe('disconnected');
    expect(a.store.get().items.a).toBeDefined();
    expect(cloud.files.size).toBe(2);
  });
});

async function pairWithConflict() {
  const cloud = createFakeCloud();
  const a = await device(cloud);
  const b = await device(cloud);
  setItem(a, 'x', 1);
  await a.sync.connect();
  await b.sync.connect();
  a.port.offline = true;
  setItem(a, 'x', 2);
  await settle(a);
  setItem(b, 'x', 3);
  await b.sync.flush();
  a.port.offline = false;
  await a.sync.checkDrive();
  return { cloud, a, b };
}

describe('disconnect and reconnect', () => {
  async function pair() {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    setItem(a, 'x', 1);
    await a.sync.connect();
    await b.sync.connect();
    return { cloud, a, b };
  }

  it('edits made while disconnected survive a reconnect, with no false questions', async () => {
    const { cloud, a, b } = await pair();
    await a.sync.disconnect();
    setItem(a, 'x', 5); // A edits x while disconnected
    setItem(b, 'y', 7); // B edits y and pushes
    await b.sync.flush();

    await a.sync.connect();
    await a.sync.whenIdle();
    expect(a.sync.state().firstConnect).toBe(false);
    expect(a.sync.state().conflicts).toEqual([]);
    expect(kind(a)).toBe('synced');
    expect(a.store.get().items.x).toMatchObject({ qty: 5 });
    expect(a.store.get().items.y).toMatchObject({ qty: 7 });
    expect(JSON.parse(cloud.text(JSON_FILE_NAME)!).items.x.qty).toBe(5);

    await b.sync.checkDrive();
    expect(b.store.get().items.x).toMatchObject({ qty: 5 });
  });

  it('reconnecting with nothing changed asks nothing and writes nothing', async () => {
    const { cloud, a } = await pair();
    await a.sync.disconnect();
    const writes = cloud.writes[YJS_FILE_NAME];
    await a.sync.connect();
    expect(a.sync.state().firstConnect).toBe(false);
    expect(kind(a)).toBe('synced');
    expect(cloud.writes[YJS_FILE_NAME]).toBe(writes);
  });

  it('drops pending questions and keeps the household as merged', async () => {
    const { a } = await pairWithConflict();
    expect(a.sync.state().conflicts.length).toBeGreaterThan(0);
    await a.sync.disconnect();
    expect(a.sync.state().conflicts).toEqual([]);
    expect(a.store.get().items.x).toBeDefined();
  });

  it('a different Google account starts afresh and asks first', async () => {
    const { a } = await pair();
    await a.sync.disconnect();
    setItem(a, 'mine', 2);
    a.port.email = 'someone-else@example.test';
    await a.sync.connect();
    expect(a.sync.state().firstConnect).toBe(true);
  });
});

describe('pushing', () => {
  it('two edits within the debounce window make one upload of two files', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    const yjs0 = cloud.writes[YJS_FILE_NAME]!;
    setItem(a, 'a', 1);
    setItem(a, 'b', 2);
    expect(a.sync.state().status).toMatchObject({ kind: 'pending', edits: 2 });
    await settle(a);
    expect(cloud.writes[YJS_FILE_NAME]).toBe(yjs0 + 1);
    expect(cloud.writes[JSON_FILE_NAME]).toBe(yjs0 + 1);
    expect(kind(a)).toBe('synced');
    expect(JSON.parse(cloud.text(JSON_FILE_NAME)!).items.b.qty).toBe(2);
  });

  it('flush() pushes at once, without waiting for the debounce', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    setItem(a, 'a', 1);
    await a.sync.flush();
    expect(kind(a)).toBe('synced');
    expect(JSON.parse(cloud.text(JSON_FILE_NAME)!).items.a.qty).toBe(1);
  });

  it('hiding the page pushes at once', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    setItem(a, 'a', 1);
    a.host.fire('hidden');
    await a.sync.whenIdle();
    expect(kind(a)).toBe('synced');
  });

  it('does nothing while disconnected: edits are just edits', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 1);
    await settle(a);
    expect(cloud.files.size).toBe(0);
    expect(kind(a)).toBe('disconnected');
  });

  it('keeps pending edits across a restart', async () => {
    const cloud = createFakeCloud();
    const persistence = createMemoryPersistence();
    const a = await device(cloud, { persistence, name: 'restart-a' });
    await a.sync.connect();
    a.port.offline = true;
    setItem(a, 'a', 1);
    await settle(a);
    a.sync.stop();

    // same persisted sync state, new page load
    const again = createSync({
      store: a.store,
      drive: a.port,
      persistence,
      env: 'local',
      host: fakeHost(),
      debounceMs: DEBOUNCE,
      retryMs: 10_000_000,
    });
    opened.push({ store: a.store, sync: again });
    await again.start();
    await again.whenIdle();
    expect(again.state().status.kind).toBe('offline');
    a.port.offline = false;
    await again.checkDrive();
    expect(again.state().status.kind).toBe('synced');
    expect(JSON.parse(cloud.text(JSON_FILE_NAME)!).items.a.qty).toBe(1);
  });
});

describe('pulling', () => {
  it('applies the other device’s changes silently, with a toast', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    await a.sync.connect();
    await b.sync.connect();

    setItem(a, 'a', 3);
    setItem(a, 'b', 4);
    await a.sync.flush();

    await b.sync.checkDrive();
    expect(b.store.get().items.a).toMatchObject({ qty: 3 });
    expect(b.sync.state().conflicts).toEqual([]);
    expect(b.sync.state().notice?.text).toBe('2 changes from your other device');
    expect(kind(b)).toBe('synced');
  });

  it('pulls when the page becomes visible again', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    await a.sync.connect();
    await b.sync.connect();
    setItem(a, 'a', 3);
    await a.sync.flush();
    b.host.fire('visible');
    await b.sync.whenIdle();
    expect(b.store.get().items.a).toBeDefined();
  });

  it('does not download again when Drive has not changed', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    const reads = a.port.calls.read;
    await a.sync.checkDrive();
    await a.sync.checkDrive();
    expect(a.port.calls.read).toBe(reads);
  });

  it('merges before pushing when the other device wrote in the meantime', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    await a.sync.connect();
    await b.sync.connect();
    setItem(a, 'a', 3);
    await a.sync.flush();
    setItem(b, 'b', 4);
    await b.sync.flush(); // pulls a's item first, then sends both
    expect(Object.keys(b.store.get().items).sort()).toEqual(['a', 'b']);
    await a.sync.checkDrive();
    expect(Object.keys(a.store.get().items).sort()).toEqual(['a', 'b']);
  });
});

describe('a stale write must not undo a deletion', () => {
  const has = (text: string | undefined, id: string) =>
    Object.keys(JSON.parse(text!).items).includes(id);

  async function pair() {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    setItem(a, 'x', 1);
    await a.sync.connect();
    await b.sync.connect();
    expect(has(b.store.export(), 'x')).toBe(true);
    return { cloud, a, b };
  }

  it('B looked before A deleted and pushed: B merges before writing, all four copies lack x', async () => {
    const { cloud, a, b } = await pair();
    setItem(b, 'other', 2);
    // B has looked at Drive when A deletes x and pushes
    b.port.afterNextList = async () => {
      a.store.change('delete x', (d) => {
        delete d.items.x;
      });
      await a.sync.flush();
    };
    await b.sync.flush();
    // B did not overwrite A's deletion: it merged first
    expect(has(cloud.text(JSON_FILE_NAME), 'x')).toBe(false);
    await a.sync.checkDrive();
    await b.sync.checkDrive();
    for (const text of [a.store.export(), b.store.export(), cloud.text(JSON_FILE_NAME)]) {
      expect(has(text, 'x')).toBe(false);
      expect(has(text, 'other')).toBe(true);
    }
    const c = await device(cloud);
    await c.sync.connect();
    expect(has(c.store.export(), 'x')).toBe(false);
    expect(has(c.store.export(), 'other')).toBe(true);
  });

  it('a stale file that gets onto Drive anyway is corrected by the device that deleted', async () => {
    const { cloud, a, b } = await pair();
    const stale = b.store.bytes(); // still has x
    a.store.change('delete x', (d) => {
      delete d.items.x;
    });
    await a.sync.flush();
    setItem(b, 'other', 2);
    // B's earlier overwrite lands after A's push
    const merged = b.store.bytes();
    cloud.put(YJS_FILE_NAME, merged);
    expect(stale.length).toBeGreaterThan(0);
    await a.sync.checkDrive();
    await a.sync.whenIdle();
    await b.sync.checkDrive();
    await b.sync.whenIdle();
    for (const text of [a.store.export(), b.store.export(), cloud.text(JSON_FILE_NAME)]) {
      expect(has(text, 'x')).toBe(false);
      expect(has(text, 'other')).toBe(true);
    }
    const c = await device(cloud);
    await c.sync.connect();
    expect(has(c.store.export(), 'x')).toBe(false);
  });

  it('unsent edits survive a lost dirty flag: sync works out what Drive lacks at start', async () => {
    const cloud = createFakeCloud();
    const persistence = createMemoryPersistence();
    const a = await device(cloud, { persistence, name: 'lost-flag' });
    setItem(a, 'x', 1);
    await a.sync.connect();
    a.sync.stop();
    // edits whose dirty flag never reached storage (the page died first)
    a.store.change('delete x', (d) => {
      delete d.items.x;
    });
    const before = cloud.writes[YJS_FILE_NAME];
    // same persisted sync state, new page load
    const again = createSync({
      store: a.store,
      drive: a.port,
      persistence,
      env: 'local',
      host: fakeHost(),
      debounceMs: DEBOUNCE,
      retryMs: 10_000_000,
    });
    opened.push({ store: a.store, sync: again });
    await again.start();
    await again.whenIdle();
    expect(cloud.writes[YJS_FILE_NAME]).toBe(before + 1);
    expect(has(cloud.text(JSON_FILE_NAME), 'x')).toBe(false);
    expect(again.state().status.kind).toBe('synced');
  });
});

describe('both devices changed the same thing', () => {
  async function conflicted() {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    await a.sync.connect();
    setItem(a, 'x', 1);
    await a.sync.flush();
    await b.sync.connect();
    expect(b.store.get().items.x).toBeDefined();

    // b goes offline and edits; a edits and pushes
    b.port.offline = true;
    setItem(b, 'x', 20);
    await b.sync.flush();
    expect(kind(b)).toBe('offline');
    setItem(a, 'x', 10);
    await a.sync.flush();
    b.port.offline = false;
    await b.sync.checkDrive();
    return { cloud, a, b };
  }

  it('shows the which-copy question with both values, and holds the push', async () => {
    const { b, cloud } = await conflicted();
    const { conflicts } = b.sync.state();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      key: 'items/x',
      fields: [{ field: 'qty', mine: 20, theirs: 10 }],
    });
    expect(kind(b)).toBe('remoteNewer');
    const before = cloud.writes[YJS_FILE_NAME];
    b.sync.dismissNotice();
    await b.sync.flush();
    expect(cloud.writes[YJS_FILE_NAME]).toBe(before); // nothing sent until answered
  });

  it('"take theirs" writes their value on top, and both devices end up agreeing', async () => {
    const { a, b } = await conflicted();
    await b.sync.resolveConflicts({ 'items/x': 'theirs' });
    expect(b.store.get().items.x!.qty).toBe(10);
    expect(b.sync.state().conflicts).toEqual([]);
    expect(kind(b)).toBe('synced');
    await a.sync.checkDrive();
    expect(a.store.get().items.x!.qty).toBe(10);
  });

  it('"keep mine" wins on both devices', async () => {
    const { a, b } = await conflicted();
    await b.sync.resolveAll('mine');
    expect(b.store.get().items.x!.qty).toBe(20);
    await a.sync.checkDrive();
    expect(a.store.get().items.x!.qty).toBe(20);
    expect(kind(a)).toBe('synced');
  });

  it('survives a reload before it is answered', async () => {
    const { b } = await conflicted();
    const persistence = (b as Device).persistence;
    b.sync.stop();
    const again = createSync({
      store: b.store,
      drive: b.port,
      persistence,
      env: 'local',
      host: fakeHost(),
      debounceMs: DEBOUNCE,
    });
    opened.push({ store: b.store, sync: again });
    await again.start();
    expect(again.state().conflicts.map((c) => c.key)).toEqual(['items/x']);
  });

  it('different fields of the same record merge without a question', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    const b = await device(cloud);
    await a.sync.connect();
    setItem(a, 'x', 1);
    await a.sync.flush();
    await b.sync.connect();

    b.port.offline = true;
    b.store.change('qty', (d) => {
      d.items.x!.qty = 7;
    });
    await b.sync.flush();
    a.store.change('date', (d) => {
      d.items.x!.bestBefore = '2027-05';
    });
    await a.sync.flush();
    b.port.offline = false;
    await b.sync.checkDrive();
    expect(b.sync.state().conflicts).toEqual([]);
    expect(b.store.get().items.x).toMatchObject({ qty: 7, bestBefore: '2027-05' });
    await a.sync.checkDrive();
    expect(a.store.get().items.x).toMatchObject({ qty: 7, bestBefore: '2027-05' });
  });
});

describe('guards', () => {
  it('refuses a household from a newer version, without merging', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    setItem(a, 'a', 1);
    await a.sync.connect();
    const sidecar = JSON.parse(cloud.text(JSON_FILE_NAME)!);
    sidecar.meta.schemaVersion = 99;
    cloud.put(JSON_FILE_NAME, JSON.stringify(sidecar));
    cloud.put(YJS_FILE_NAME, a.store.bytes()); // newer mtime: a pull is due

    const b = await device(cloud);
    await b.sync.connect();
    expect(b.sync.state().status).toEqual({ kind: 'error', message: NEWER_VERSION_MESSAGE });
    expect(b.store.get().items.a).toBeUndefined();
    expect(b.store.status().kind).toBe('ok');
  });

  it('warns when the file was last written by another build, and merges only on "continue"', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud, { env: 'dev' });
    setItem(a, 'a', 1);
    await a.sync.connect();

    const b = await device(cloud, { env: 'prod' });
    await b.sync.connect();
    expect(b.sync.state().envWarning).toEqual({ fileEnv: 'dev', buildEnv: 'prod' });
    expect(kind(b)).toBe('remoteNewer');
    expect(b.store.get().items.a).toBeUndefined();

    await b.sync.resolveEnv('continue');
    expect(b.sync.state().envWarning).toBeNull();
    expect(b.store.get().items.a).toBeDefined();
    expect(kind(b)).toBe('synced');
  });

  it('"don’t sync" leaves everything alone and says why', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud, { env: 'dev' });
    setItem(a, 'a', 1);
    await a.sync.connect();
    const b = await device(cloud, { env: 'prod' });
    await b.sync.connect();
    await b.sync.resolveEnv('dont-sync');
    expect(b.sync.state().status).toMatchObject({ kind: 'error' });
    setItem(b, 'b', 2);
    await b.sync.flush();
    expect(b.store.get().items.a).toBeUndefined();
    expect(cloud.writes[YJS_FILE_NAME]).toBe(1);
  });

  it('is quiet when both devices run the same build, whichever it is', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud, { env: 'next' });
    setItem(a, 'a', 1);
    await a.sync.connect();
    const b = await device(cloud, { env: 'next' });
    await b.sync.connect();
    expect(b.sync.state().envWarning).toBeNull();
    expect(b.store.get().items.a).toBeDefined();
  });
});

describe('offline and sign-in', () => {
  it('queues edits while offline, says how many, and sends them when back online', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    a.port.offline = true;
    a.host.fire('offline');
    setItem(a, 'a', 1);
    setItem(a, 'b', 2);
    setItem(a, 'c', 3);
    expect(a.sync.state().status).toMatchObject({ kind: 'offline', edits: 3 });
    await settle(a);
    expect(cloud.writes[YJS_FILE_NAME]).toBe(1); // nothing new went out

    a.port.offline = false;
    a.host.fire('online');
    await a.sync.whenIdle();
    expect(kind(a)).toBe('synced');
    expect(Object.keys(JSON.parse(cloud.text(JSON_FILE_NAME)!).items)).toEqual(['a', 'b', 'c']);
  });

  it('a failing network call reads as offline, not as an error', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    a.port.offline = true;
    setItem(a, 'a', 1);
    await settle(a);
    expect(a.sync.state().status).toMatchObject({ kind: 'offline', edits: 1 });
  });

  it('an expired sign-in asks to reconnect, keeps the edits, and sends them after', async () => {
    const cloud = createFakeCloud();
    const a = await device(cloud);
    await a.sync.connect();
    a.port.authExpired = true;
    setItem(a, 'a', 1);
    await settle(a);
    expect(a.sync.state().status).toEqual({
      kind: 'error',
      message: RECONNECT_MESSAGE,
      reconnect: true,
    });
    await a.sync.connect();
    expect(kind(a)).toBe('synced');
    expect(JSON.parse(cloud.text(JSON_FILE_NAME)!).items.a.qty).toBe(1);
  });
});
