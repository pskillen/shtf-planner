import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  SchemaTooNewError,
  emptyDocument,
  type Document,
  type Member,
  type MigrationStep,
} from '../model';
import { openStore, type DocumentStore, type OpenOptions } from './documentStore';

let counter = 0;
const dbName = () => `test-doc-${++counter}-${Math.random().toString(36).slice(2)}`;
const open = (o: OpenOptions = {}) =>
  openStore({ name: dbName(), env: 'local', deviceId: 'dev-1', channel: false, ...o });

const member = (id: string, name: string): Member => ({
  id,
  name,
  dob: '1990-01-01',
  tags: [],
  medication: [],
});
const location = (id: string, name: string): Document['locations'][string] => ({
  id,
  name,
  kind: 'stored',
  conditions: [],
  size: 'M',
});

describe('openStore', () => {
  it('creates a valid empty document, stamped with the env and this device', async () => {
    const store = await open({ env: 'staging', deviceId: 'phone' });
    const doc = store.get();
    expect(doc.meta.env).toBe('staging');
    expect(doc.meta.devices).toEqual(['phone']);
    expect(doc.meta.schemaVersion).toBe(1);
    expect(store.status()).toEqual({ kind: 'ok' });
    expect(doc.settings.packs.length).toBeGreaterThan(0);
    await store.close();
  });

  it('change then get reflects the write; the snapshot is frozen', async () => {
    const store = await open();
    store.change('add pantry', (d) => {
      d.locations['loc-1'] = location('loc-1', 'Pantry');
      d.household.members.push(member('m1', 'Alex'));
    });
    expect(store.get().locations['loc-1']!.name).toBe('Pantry');
    expect(store.get().household.members.map((m) => m.name)).toEqual(['Alex']);
    expect(Object.isFrozen(store.get())).toBe(true);
    expect(() => {
      (store.get().household.members as Member[]).push(member('x', 'X'));
    }).toThrow();
    await store.close();
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const store = await open();
    const seen: string[] = [];
    const off = store.subscribe((doc) =>
      seen.push(doc.household.members.map((m) => m.name).join()),
    );
    store.change('a', (d) => d.household.members.push(member('m1', 'Alex')));
    off();
    store.change('b', (d) => d.household.members.push(member('m2', 'Sam')));
    expect(seen).toEqual(['Alex']);
    await store.close();
  });

  it('writes nothing when the draft is unchanged, and nothing when fn throws', async () => {
    const store = await open();
    const before = store.heads();
    store.change('noop', () => {});
    expect(store.heads()).toBe(before);
    expect(() =>
      store.change('boom', (d) => {
        d.household.members.push(member('m1', 'Alex'));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.get().household.members).toEqual([]);
    await store.close();
  });

  it('validates a change and rejects an invalid draft without writing it', async () => {
    const store = await open({ validate: true });
    expect(() =>
      store.change('bad', (d) => {
        (d.settings as { horizonDays: number }).horizonDays = 5;
      }),
    ).toThrow();
    expect(store.get().settings.horizonDays).toBe(3);
    await store.close();
  });

  it('survives a reopen', async () => {
    const name = dbName();
    const a = await openStore({ name, env: 'local', deviceId: 'd1', channel: false });
    a.change('add', (d) => {
      d.locations['loc-1'] = location('loc-1', 'Shed');
    });
    await a.close();
    const b = await openStore({ name, env: 'local', deviceId: 'd2', channel: false });
    expect(b.get().locations['loc-1']!.name).toBe('Shed');
    expect(b.get().meta.devices).toEqual(['d1', 'd2']);
    await b.close();
  });

  it('two instances on the same database see each other through the tab channel', async () => {
    const name = dbName();
    const a = await openStore({ name, env: 'local', deviceId: 'd1' });
    const b = await openStore({ name, env: 'local', deviceId: 'd1' });
    a.change('add', (d) => {
      d.locations['loc-1'] = location('loc-1', 'Pantry');
    });
    await vi.waitFor(() => expect(b.get().locations['loc-1']?.name).toBe('Pantry'));
    b.change('rename', (d) => {
      d.locations['loc-1']!.name = 'Larder';
    });
    await vi.waitFor(() => expect(a.get().locations['loc-1']?.name).toBe('Larder'));
    await a.close();
    await b.close();
  });

  it('a late tab catches up on open', async () => {
    const name = dbName();
    const a = await openStore({ name, env: 'local', deviceId: 'd1' });
    a.change('add', (d) => {
      d.locations['loc-1'] = location('loc-1', 'Pantry');
    });
    await a.flush();
    const b = await openStore({ name, env: 'local', deviceId: 'd1' });
    expect(b.get().locations['loc-1']?.name).toBe('Pantry');
    await a.close();
    await b.close();
  });
});

describe('export and import', () => {
  it('exports with sorted keys, byte-identically for the same document', async () => {
    const a = await open();
    const b = await open();
    for (const s of [a, b]) {
      s.change('fill', (d) => {
        d.locations['z'] = location('z', 'Z');
        d.locations['a'] = location('a', 'A');
        d.meta.createdAt = '2026-01-01T00:00:00.000Z';
        d.meta.devices = ['same'];
      });
    }
    // Different insertion histories, same content.
    b.change('more', (d) => {
      delete d.locations['a'];
      d.locations['a'] = location('a', 'A');
    });
    expect(a.export()).toBe(b.export());
    const keys = Object.keys(JSON.parse(a.export()).locations);
    expect(keys).toEqual(['a', 'z']);
    expect(a.export().endsWith('\n')).toBe(true);
    await a.close();
    await b.close();
  });

  it('importJson replaces the document and round-trips', async () => {
    const a = await open();
    a.change('fill', (d) => {
      d.household.members.push(member('m1', 'Alex'));
      d.locations['l'] = location('l', 'Pantry');
    });
    const json = a.export();
    const b = await open();
    b.change('other', (d) => {
      d.household.members.push(member('zz', 'Someone else'));
      d.locations['gone'] = location('gone', 'Gone');
    });
    b.importJson(json, 'replace');
    expect(b.get().household.members.map((m) => m.id)).toEqual(['m1']);
    expect(Object.keys(b.get().locations)).toEqual(['l']);
    // the live createdAt and devices are kept; everything else matches the import
    const live = JSON.parse(b.export());
    const imported = JSON.parse(json);
    expect(live.meta.createdAt).not.toBe(undefined);
    expect({ ...live, meta: { ...live.meta, createdAt: 0, devices: 0 } }).toEqual({
      ...imported,
      meta: { ...imported.meta, createdAt: 0, devices: 0 },
    });
    await a.close();
    await b.close();
  });

  it('importJson keeps the live createdAt and unions the devices with the import', async () => {
    const live = await open({ deviceId: 'phone' });
    const createdAt = live.get().meta.createdAt;
    const other = emptyDocument('local', '2020-01-01T00:00:00.000Z');
    other.meta.devices = ['laptop', 'phone'];
    live.importJson(JSON.stringify(other), 'replace');
    expect(live.get().meta.createdAt).toBe(createdAt);
    expect([...live.get().meta.devices].sort()).toEqual(['laptop', 'phone']);
    // a device the live document knew but the import did not stays listed
    live.importJson(JSON.stringify(emptyDocument('local')), 'replace');
    expect([...live.get().meta.devices].sort()).toEqual(['laptop', 'phone']);
    await live.close();
  });

  it('importJson refuses garbage and a newer schema', async () => {
    const a = await open();
    expect(() => a.importJson('{"nope":1}', 'replace')).toThrow();
    const newer = emptyDocument('local');
    newer.meta.schemaVersion = 9;
    expect(() => a.importJson(JSON.stringify(newer), 'replace')).toThrow(SchemaTooNewError);
    await a.close();
  });

  it('importJson on a store holding a newer document throws and writes nothing', async () => {
    const newer = await open({ schemaVersion: 2, steps: [addSize] });
    const old = await open({ schemaVersion: 1, steps: [], validate: false });
    old.mergeBytes(newer.bytes());
    const status = old.status();
    expect(status.kind).toBe('too-new');
    const before = old.heads();
    const valid = JSON.stringify(emptyDocument('local'));
    expect(() => old.importJson(valid, 'replace')).toThrow(SchemaTooNewError);
    expect(old.heads()).toBe(before);
    expect(old.status().kind).toBe('too-new');
    expect(old.get().meta.schemaVersion).toBe(2);
  });

  it('importJson still recovers a store whose document is invalid', async () => {
    const name = dbName();
    const broken = await openStore({
      name,
      env: 'local',
      deviceId: 'd',
      channel: false,
      validate: false,
    });
    broken.change('corrupt', (d) => {
      (d.settings as { horizonDays: number }).horizonDays = 5;
    });
    await broken.close();
    const store = await openStore({ name, env: 'local', deviceId: 'd', channel: false });
    expect(store.status().kind).toBe('invalid');
    store.importJson(JSON.stringify(emptyDocument('local')), 'replace');
    expect(store.status()).toEqual({ kind: 'ok' });
    expect(store.get().settings.horizonDays).toBe(3);
    await store.close();
  });
});

describe('merging between devices', () => {
  const exchange = (a: DocumentStore, b: DocumentStore) => {
    const ab = a.bytes();
    const ba = b.bytes();
    b.mergeBytes(ab);
    a.mergeBytes(ba);
  };

  async function pair() {
    const a = await open({ deviceId: 'a' });
    const b = await open({ deviceId: 'b' });
    b.mergeBytes(a.bytes());
    return { a, b };
  }

  it('concurrent adds of different records both survive', async () => {
    const { a, b } = await pair();
    a.change('a adds', (d) => {
      d.locations['l1'] = location('l1', 'Pantry');
    });
    b.change('b adds', (d) => {
      d.locations['l2'] = location('l2', 'Garage');
    });
    exchange(a, b);
    for (const s of [a, b]) expect(Object.keys(s.get().locations).sort()).toEqual(['l1', 'l2']);
    expect(a.export()).toBe(b.export());
  });

  it('concurrent edits to different fields of one record both survive', async () => {
    const { a, b } = await pair();
    a.change('add', (d) => {
      d.locations['l1'] = location('l1', 'Pantry');
    });
    exchange(a, b);
    a.change('rename', (d) => {
      d.locations['l1']!.name = 'Larder';
    });
    b.change('resize', (d) => {
      d.locations['l1']!.size = 'L';
    });
    exchange(a, b);
    expect(a.get().locations['l1']).toMatchObject({ name: 'Larder', size: 'L' });
    expect(a.export()).toBe(b.export());
  });

  it('a concurrent edit to one member does not clobber another', async () => {
    const { a, b } = await pair();
    a.change('add', (d) => {
      d.household.members.push(member('m1', 'Alex'), member('m2', 'Sam'));
    });
    exchange(a, b);
    a.change('edit Alex', (d) => {
      d.household.members.find((m) => m.id === 'm1')!.tags = ['elderly'];
    });
    b.change('edit Sam', (d) => {
      d.household.members.find((m) => m.id === 'm2')!.name = 'Samantha';
    });
    b.change('add Robin', (d) => {
      d.household.members.push(member('m3', 'Robin'));
    });
    exchange(a, b);
    for (const s of [a, b]) {
      const ms = s.get().household.members;
      expect(ms.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
      expect(ms.find((m) => m.id === 'm1')!.tags).toEqual(['elderly']);
      expect(ms.find((m) => m.id === 'm2')!.name).toBe('Samantha');
    }
    expect(a.export()).toBe(b.export());
  });

  it("two devices that both started from nothing keep each other's records", async () => {
    const a = await open({ deviceId: 'a' });
    const b = await open({ deviceId: 'b' });
    a.change('a adds', (d) => {
      d.locations['l1'] = location('l1', 'Pantry');
      d.household.members.push(member('m1', 'Alex'));
    });
    b.change('b adds', (d) => {
      d.locations['l2'] = location('l2', 'Garage');
      d.household.members.push(member('m2', 'Sam'));
    });
    exchange(a, b);
    for (const s of [a, b]) {
      expect(Object.keys(s.get().locations).sort()).toEqual(['l1', 'l2']);
      expect(
        s
          .get()
          .household.members.map((m) => m.id)
          .sort(),
      ).toEqual(['m1', 'm2']);
      expect([...s.get().meta.devices].sort()).toEqual(['a', 'b']);
    }
    expect(a.export()).toBe(b.export());
  });

  it('bytes round-trips into a fresh store, and heads moves with changes', async () => {
    const a = await open();
    const h0 = a.heads();
    a.change('add', (d) => {
      d.locations['l1'] = location('l1', 'Pantry');
    });
    expect(a.heads()).not.toBe(h0);
    expect(typeof a.heads()).toBe('string');
    const b = await open();
    b.mergeBytes(a.bytes());
    expect(b.get().locations['l1']!.name).toBe('Pantry');
    a.mergeBytes(b.bytes());
    expect(b.heads()).toBe(a.heads());
  });
});

// A fake schema 2: every location gets `litres` it lacked. Per record, idempotent.
const addSize: MigrationStep = {
  from: 1,
  to: 2,
  name: 'locations get litres',
  up(raw) {
    const locations = { ...(raw.locations as Record<string, Record<string, unknown>>) };
    for (const [id, loc] of Object.entries(locations)) {
      locations[id] = loc.litres === undefined ? { ...loc, litres: 100 } : loc;
    }
    return { ...raw, locations };
  },
};

describe('schema drift between devices', () => {
  it('goes read-only when a merge brings a newer schema, and subscribers hear it', async () => {
    const newer = await open({ schemaVersion: 2, steps: [addSize] });
    const old = await open({ schemaVersion: 1, steps: [], validate: false });
    const states: string[] = [];
    old.subscribe((_doc, status) => states.push(status.kind));
    old.mergeBytes(newer.bytes());
    expect(old.status().kind).toBe('too-new');
    expect(states.at(-1)).toBe('too-new');
    expect(() => old.change('x', () => {})).toThrow(SchemaTooNewError);
    const status = old.status();
    if (status.kind !== 'too-new') throw new Error('unreachable');
    expect(status.found).toBe(2);
    expect(status.supported).toBe(1);
  });

  it('brings old-shaped records an old client wrote into a migrated document forward', async () => {
    // A shared starting point: a v1 document with a location that has no litres yet.
    const v1 = await open({ schemaVersion: 1, steps: [], validate: false });
    v1.change('add', (d) => {
      d.locations['l1'] = location('l1', 'Pantry');
    });
    // Device A is on the new build: merging brings the document to schema 2 and migrates l1.
    const a = await open({ schemaVersion: 2, steps: [addSize] });
    a.mergeBytes(v1.bytes());
    expect(a.status().kind).toBe('ok');
    expect(a.get().meta.schemaVersion).toBe(2);
    expect(a.get().locations['l1']!.litres).toBe(100);
    // An old client branched from v1 before A migrated, and edits offline.
    const old = await open({ schemaVersion: 1, steps: [], validate: false });
    old.mergeBytes(v1.bytes());
    old.change('offline edit', (d) => {
      d.locations['l2'] = location('l2', 'Shed');
    });
    // Its old-shaped record merges into the migrated document and is brought forward.
    a.mergeBytes(old.bytes());
    expect(a.status().kind).toBe('ok');
    expect(a.get().meta.schemaVersion).toBe(2);
    expect(a.get().locations['l2']!.litres).toBe(100);
    expect(a.get().locations['l1']!.litres).toBe(100);
    // and the old client, merging back, learns it must update
    old.mergeBytes(a.bytes());
    expect(old.status().kind).toBe('too-new');
  });

  it('migrates a stored document on open', async () => {
    const name = dbName();
    const v1 = await openStore({
      name,
      env: 'local',
      deviceId: 'd',
      channel: false,
      schemaVersion: 1,
      steps: [],
      validate: false,
    });
    v1.change('add', (d) => {
      d.locations['l1'] = location('l1', 'Pantry');
    });
    await v1.close();
    const v2 = await openStore({
      name,
      env: 'local',
      deviceId: 'd',
      channel: false,
      schemaVersion: 2,
      steps: [addSize],
    });
    expect(v2.get().meta.schemaVersion).toBe(2);
    expect(v2.get().locations['l1']!.litres).toBe(100);
    await v2.close();
  });

  it('opens a stored newer document read-only', async () => {
    const name = dbName();
    const v2 = await openStore({
      name,
      env: 'local',
      deviceId: 'd',
      channel: false,
      schemaVersion: 2,
      steps: [addSize],
    });
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
