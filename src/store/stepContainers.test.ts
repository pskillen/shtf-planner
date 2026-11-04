import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import type { MigrationStep } from '../model';
import { applyInit } from './init';
import { createdContainers, ensureStepContainers, stepClientId } from './stepContainers';
import { toPlain, toY } from './yconvert';

// A fixture schema-2 step that adds a `contacts` container (and a nested one). There is no real v2
// step yet, and the document schema has no optional container, so these tests drive the store's
// container writer directly over Yjs documents seeded as a schema-1 device would be.
const addContacts: MigrationStep = {
  from: 1,
  to: 2,
  name: 'add contacts',
  up: (raw) => ({ ...raw, contacts: (raw.contacts as object | undefined) ?? { groups: {} } }),
};

const replica = (base: Uint8Array): { ydoc: Y.Doc; root: Y.Map<unknown> } => {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, base);
  return { ydoc, root: ydoc.getMap('doc') };
};
const migrate = (
  r: { ydoc: Y.Doc; root: Y.Map<unknown> },
  steps: MigrationStep[] = [addContacts],
) => ensureStepContainers(r.ydoc, r.root, toPlain(r.root), steps, 2);
const addRecord = (r: { root: Y.Map<unknown> }, id: string) => {
  (r.root.get('contacts') as Y.Map<unknown>).set(id, toY({ id, name: id }));
};
const sync = (a: Y.Doc, b: Y.Doc) => {
  const ua = Y.encodeStateAsUpdate(a);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, ua);
};

describe('containers created by a migration step', () => {
  const base = (() => {
    const d = new Y.Doc();
    applyInit(d, d.getMap('doc'), 1);
    return Y.encodeStateAsUpdate(d);
  })();

  it('two replicas that each add the container and a record keep both records', () => {
    const a = replica(base);
    const b = replica(base);
    migrate(a);
    migrate(b);
    addRecord(a, 'c1');
    addRecord(b, 'c2');
    sync(a.ydoc, b.ydoc);
    for (const r of [a, b]) {
      const plain = toPlain(r.root) as { contacts: Record<string, unknown> };
      expect(Object.keys(plain.contacts).sort()).toEqual(['c1', 'c2', 'groups']);
    }
  });

  it('the control: containers created under random client ids lose a record', () => {
    const a = replica(base);
    const b = replica(base);
    for (const r of [a, b]) r.root.set('contacts', new Y.Map());
    addRecord(a, 'c1');
    addRecord(b, 'c2');
    sync(a.ydoc, b.ydoc);
    const plain = toPlain(a.root) as { contacts: Record<string, unknown> };
    expect(Object.keys(plain.contacts)).toHaveLength(1);
  });

  it('is a no-op when the container already exists, and replays quietly', () => {
    const a = replica(base);
    migrate(a);
    const before = Y.encodeStateVector(a.ydoc);
    migrate(a);
    expect(Y.encodeStateVector(a.ydoc)).toEqual(before);
  });

  it('writes each container under an id derived from the step and that container', () => {
    const created = createdContainers({ a: {} }, { a: {}, contacts: { groups: {} }, tags: [] });
    expect(created.map((c) => c.path.join('.')).sort()).toEqual(['contacts', 'tags']);
    const [contacts, tags] = created as [(typeof created)[number], (typeof created)[number]];
    const id = stepClientId(addContacts, contacts);
    expect(id).toBe(stepClientId(addContacts, { ...contacts }));
    expect(id).not.toBe(stepClientId({ ...addContacts, name: 'another' }, contacts));
    expect(id).not.toBe(stepClientId({ ...addContacts, to: 3 }, contacts));
    expect(id).not.toBe(stepClientId(addContacts, tags));
    expect(id).not.toBe(stepClientId(addContacts, { ...contacts, shape: {} }));
  });

  it('finds nested containers a step adds inside an existing one', () => {
    expect(createdContainers({ a: { x: 1 } }, { a: { x: 1, y: { z: [] } } })).toEqual([
      { path: ['a', 'y'], shape: { z: [] } },
    ]);
  });
});

// A step that gives every record a container: `assets.<id>.maintenance`. Replicas that hold
// different sets of records create different sets of containers, but must agree on each one.
describe('per-record containers created by a migration step', () => {
  const addMaintenance: MigrationStep = {
    from: 1,
    to: 2,
    name: 'assets get maintenance',
    up(raw) {
      const assets = { ...((raw.assets ?? {}) as Record<string, Record<string, unknown>>) };
      for (const [id, a] of Object.entries(assets)) {
        assets[id] = a.maintenance === undefined ? { ...a, maintenance: {} } : a;
      }
      return { ...raw, assets };
    },
  };
  const withAssets = (ids: string[]): Uint8Array => {
    const d = new Y.Doc();
    const root = d.getMap('doc');
    applyInit(d, root, 1);
    d.transact(() => {
      const assets = new Y.Map<unknown>();
      for (const id of ids) assets.set(id, toY({ id }));
      root.set('assets', assets);
    });
    return Y.encodeStateAsUpdate(d);
  };
  const entry = (r: ReturnType<typeof replica>, id: string, key: string) => {
    const assets = r.root.get('assets') as Y.Map<Y.Map<unknown>>;
    (assets.get(id)!.get('maintenance') as Y.Map<unknown>).set(key, toY({ key }));
  };
  const maintenanceOfA1 = (r: ReturnType<typeof replica>) =>
    Object.keys(
      (toPlain(r.root) as { assets: Record<string, { maintenance: object }> }).assets['a1']!
        .maintenance,
    ).sort();

  it('replicas holding different record sets agree on a shared record container', () => {
    // A holds a1; B holds a1 and a2 (a1 is shared history; a2 reached only B).
    const a = replica(withAssets(['a1']));
    const b = replica(Y.encodeStateAsUpdate(a.ydoc));
    (b.root.get('assets') as Y.Map<unknown>).set('a2', toY({ id: 'a2' }));
    migrate(a, [addMaintenance]);
    migrate(b, [addMaintenance]);
    entry(a, 'a1', 'from-a');
    entry(b, 'a1', 'from-b');
    sync(a.ydoc, b.ydoc);
    expect(maintenanceOfA1(a)).toEqual(['from-a', 'from-b']);
    expect(maintenanceOfA1(b)).toEqual(['from-a', 'from-b']);
  });

  it('the control: one id for the whole created list loses an entry', () => {
    // The previous scheme: one client id hashed from every container the replica creates.
    const wholeList = (r: ReturnType<typeof replica>, ids: string[]) => {
      const real = r.ydoc.clientID;
      r.ydoc.clientID = ids.join(',').length * 7919 + ids.length;
      r.ydoc.transact(() => {
        const assets = r.root.get('assets') as Y.Map<Y.Map<unknown>>;
        for (const id of ids) assets.get(id)!.set('maintenance', new Y.Map());
      });
      r.ydoc.clientID = real;
    };
    const base = withAssets(['a1', 'a2']);
    const a = replica(base);
    const b = replica(base);
    wholeList(a, ['a1']);
    wholeList(b, ['a1', 'a2']);
    entry(a, 'a1', 'from-a');
    entry(b, 'a1', 'from-b');
    sync(a.ydoc, b.ydoc);
    expect(maintenanceOfA1(a)).toHaveLength(1);
  });
});
