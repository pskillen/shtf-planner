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
const migrate = (r: { ydoc: Y.Doc; root: Y.Map<unknown> }, steps = [addContacts]) =>
  ensureStepContainers(r.ydoc, r.root, toPlain(r.root), steps, 2);
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

  it('writes under an id derived from the step and what it creates', () => {
    const created = createdContainers({ a: {} }, { a: {}, contacts: { groups: {} }, tags: [] });
    expect(created.map((c) => c.path.join('.')).sort()).toEqual(['contacts', 'tags']);
    const id = stepClientId(addContacts, created);
    expect(id).toBe(stepClientId(addContacts, [...created].reverse()));
    expect(id).not.toBe(stepClientId({ ...addContacts, name: 'another' }, created));
    expect(id).not.toBe(stepClientId(addContacts, created.slice(0, 1)));
  });

  it('finds nested containers a step adds inside an existing one', () => {
    expect(createdContainers({ a: { x: 1 } }, { a: { x: 1, y: { z: [] } } })).toEqual([
      { path: ['a', 'y'], shape: { z: [] } },
    ]);
  });
});
