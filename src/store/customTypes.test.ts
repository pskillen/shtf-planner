import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SchemaTooNewError, type ItemType } from '../model';
import { openStore, type DocumentStore, type OpenOptions } from './documentStore';
import { applyInit } from './init';

let counter = 0;
const dbName = () => `test-custom-${++counter}-${Math.random().toString(36).slice(2)}`;
const open = (o: OpenOptions = {}) =>
  openStore({ name: dbName(), env: 'local', deviceId: 'dev', channel: false, ...o });

const soup = (id: string): ItemType => ({
  id: `custom:${id}`,
  name: `Soup ${id}`,
  category: 'food',
  unit: 'tin',
  gives: [{ resource: 'foodKcal', amount: 300 }],
  suitability: ['frost', 'heat', 'damp'],
  shelfLife: 'none',
  tags: [],
});
const addType = (store: DocumentStore, id: string) =>
  store.change('add custom type', (d) => {
    d.customTypes[`custom:${id}`] = soup(id);
  });

/** Writes a schema-1 document into IndexedDB the way a schema-1 build would have left it. */
async function storeV1(name: string): Promise<void> {
  const ydoc = new Y.Doc();
  const persistence = new IndexeddbPersistence(name, ydoc);
  await persistence.whenSynced;
  const root = ydoc.getMap('doc');
  applyInit(ydoc, root, 1);
  ydoc.transact(() => {
    const meta = root.get('meta') as Y.Map<unknown>;
    meta.set('env', 'local');
    meta.set('createdAt', '2026-01-01T00:00:00.000Z');
  });
  await persistence.destroy();
  ydoc.destroy();
}

describe('custom item types (schema 2)', () => {
  it('a fresh device starts with an empty customTypes container', async () => {
    const store = await open();
    expect(store.get().meta.schemaVersion).toBe(3);
    expect(store.get().customTypes).toEqual({});
    const replica = new Y.Doc();
    Y.applyUpdate(replica, store.bytes());
    expect(replica.getMap('doc').get('customTypes')).toBeInstanceOf(Y.Map);
    await store.close();
  });

  it('a stored schema-1 document is migrated on open', async () => {
    const name = dbName();
    await storeV1(name);
    const store = await openStore({ name, env: 'local', deviceId: 'dev', channel: false });
    expect(store.status()).toEqual({ kind: 'ok' });
    expect(store.get().meta.schemaVersion).toBe(3);
    expect(store.get().customTypes).toEqual({});
    addType(store, 'a');
    expect(Object.keys(store.get().customTypes)).toEqual(['custom:a']);
    await store.close();
  });

  it('two fresh devices that each add a custom type before syncing keep both', async () => {
    const a = await open({ deviceId: 'a' });
    const b = await open({ deviceId: 'b' });
    addType(a, 'one');
    addType(b, 'two');
    a.mergeBytes(b.bytes());
    b.mergeBytes(a.bytes());
    for (const s of [a, b]) {
      expect(Object.keys(s.get().customTypes).sort()).toEqual(['custom:one', 'custom:two']);
    }
    await a.close();
    await b.close();
  });

  it('two migrated schema-1 devices that each add a custom type before syncing keep both', async () => {
    const [n1, n2] = [dbName(), dbName()];
    await storeV1(n1);
    await storeV1(n2);
    const a = await openStore({ name: n1, env: 'local', deviceId: 'a', channel: false });
    const b = await openStore({ name: n2, env: 'local', deviceId: 'b', channel: false });
    addType(a, 'one');
    addType(b, 'two');
    a.mergeBytes(b.bytes());
    b.mergeBytes(a.bytes());
    for (const s of [a, b]) {
      expect(s.status()).toEqual({ kind: 'ok' });
      expect(Object.keys(s.get().customTypes).sort()).toEqual(['custom:one', 'custom:two']);
    }
    await a.close();
    await b.close();
  });

  it('a fresh device and a migrated schema-1 device share one container', async () => {
    const name = dbName();
    await storeV1(name);
    const old = await openStore({ name, env: 'local', deviceId: 'old', channel: false });
    const fresh = await open({ deviceId: 'fresh' });
    addType(old, 'one');
    addType(fresh, 'two');
    old.mergeBytes(fresh.bytes());
    fresh.mergeBytes(old.bytes());
    for (const s of [old, fresh]) {
      expect(Object.keys(s.get().customTypes).sort()).toEqual(['custom:one', 'custom:two']);
    }
    await old.close();
    await fresh.close();
  });

  it('a schema-1 build opening the schema-2 document goes read-only', async () => {
    const name = dbName();
    const v2 = await openStore({ name, env: 'local', deviceId: 'd', channel: false });
    addType(v2, 'one');
    await v2.close();
    const v1 = await openStore({
      name,
      env: 'local',
      deviceId: 'd',
      channel: false,
      schemaVersion: 1,
      steps: [],
      validate: false,
    });
    expect(v1.status().kind).toBe('too-new');
    expect(() => v1.change('x', () => {})).toThrow(SchemaTooNewError);
    await v1.close();
  });
});

describe('barcodes and scans (schema 3)', () => {
  /** A schema-2 store: what the previous build left in IndexedDB. */
  async function storeV2(name: string): Promise<void> {
    const old = await openStore({
      name,
      env: 'local',
      deviceId: 'v2',
      channel: false,
      schemaVersion: 2,
      steps: MIGRATIONS.filter((s) => s.to <= 2),
      validate: false,
    });
    await old.close();
  }
  const remember = (store: DocumentStore, code: string) =>
    store.change('remember barcode', (d) => {
      d.barcodes[code] = { typeId: 'items-base:uht-milk', seen: '2026-11-04' };
    });

  it('a fresh device starts with empty barcodes and scans containers', async () => {
    const store = await open();
    expect(store.get().barcodes).toEqual({});
    expect(store.get().scans).toEqual({});
    const replica = new Y.Doc();
    Y.applyUpdate(replica, store.bytes());
    expect(replica.getMap('doc').get('barcodes')).toBeInstanceOf(Y.Map);
    expect(replica.getMap('doc').get('scans')).toBeInstanceOf(Y.Map);
    await store.close();
  });

  it('a stored schema-2 document is migrated on open', async () => {
    const name = dbName();
    await storeV2(name);
    const store = await openStore({ name, env: 'local', deviceId: 'dev', channel: false });
    expect(store.status()).toEqual({ kind: 'ok' });
    expect(store.get().meta.schemaVersion).toBe(3);
    expect(store.get().barcodes).toEqual({});
    remember(store, '3017620422003');
    expect(Object.keys(store.get().barcodes)).toEqual(['3017620422003']);
    await store.close();
  });

  it('two replicas that migrate from schema 2 before syncing share one barcodes map', async () => {
    const nameA = dbName();
    const nameB = dbName();
    await storeV2(nameA);
    await storeV2(nameB);
    const a = await openStore({ name: nameA, env: 'local', deviceId: 'a', channel: false });
    const b = await openStore({ name: nameB, env: 'local', deviceId: 'b', channel: false });
    remember(a, '3017620422003');
    remember(b, '5000169005743');
    const scan = (id: string, code: string) =>
      ({ id, code, qty: 1, locationId: 'l', scanned: '2026-11-04T10:00:00.000Z' }) as const;
    a.change('keep scan', (d) => void (d.scans['s-a'] = scan('s-a', '3017620422003')));
    b.change('keep scan', (d) => void (d.scans['s-b'] = scan('s-b', '5000169005743')));
    a.mergeBytes(b.bytes());
    b.mergeBytes(a.bytes());
    for (const s of [a, b]) {
      expect(Object.keys(s.get().barcodes).sort()).toEqual(['3017620422003', '5000169005743']);
      // and one scans map too: neither device's scan is lost
      expect(Object.keys(s.get().scans).sort()).toEqual(['s-a', 's-b']);
    }
    await a.close();
    await b.close();
  });

  it('a schema-2 build opening the schema-3 document goes read-only', async () => {
    const name = dbName();
    const v3 = await openStore({ name, env: 'local', deviceId: 'd', channel: false });
    remember(v3, '3017620422003');
    await v3.close();
    const v2 = await openStore({
      name,
      env: 'local',
      deviceId: 'd',
      channel: false,
      schemaVersion: 2,
      steps: MIGRATIONS.filter((s) => s.to <= 2),
      validate: false,
    });
    expect(v2.status().kind).toBe('too-new');
    expect(() => v2.change('x', () => {})).toThrow(SchemaTooNewError);
    await v2.close();
  });
});
