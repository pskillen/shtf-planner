import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, emptyDocument, type Document } from '../model';
import { openStore } from './documentStore';
import {
  applyChoice,
  classify,
  freshPlain,
  hasUnseenChanges,
  isBlank,
  plainFromBytes,
  recordsOf,
} from './syncRecords';

const base = (): Document => emptyDocument('local', '2026-01-01T00:00:00.000Z');
const item = (id: string, qty: number, over: Partial<Document['items'][string]> = {}) => ({
  id,
  typeId: 'items-base:water-can',
  qty,
  locationId: 'loc',
  added: '2026-01-01',
  source: 'manual' as const,
  ...over,
});
const plain = (d: Document) => JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
const withDoc = (fn: (d: Document) => void): Document => {
  const d = base();
  fn(d);
  return d;
};

describe('classify', () => {
  it('counts records only the other device changed, and asks about none', () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const l = b;
    const r = withDoc((d) => {
      d.items.a = item('a', 5);
      d.items.b = item('b', 2);
    });
    const out = classify(plain(b), plain(l), plain(r));
    expect(out.conflicts).toEqual([]);
    expect(out.remoteOnly).toBe(2);
  });

  it('ignores changes both devices made the same way', () => {
    const b = base();
    const both = withDoc((d) => {
      d.items.a = item('a', 3);
    });
    expect(classify(plain(b), plain(both), plain(both))).toEqual({ conflicts: [], remoteOnly: 0 });
  });

  it('asks when both devices set the same field to different values', () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const l = withDoc((d) => {
      d.items.a = item('a', 4);
    });
    const r = withDoc((d) => {
      d.items.a = item('a', 9);
    });
    const { conflicts, remoteOnly } = classify(plain(b), plain(l), plain(r));
    expect(remoteOnly).toBe(0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      key: 'items/a',
      noun: 'Item',
      minePresent: true,
      theirsPresent: true,
      fields: [{ field: 'qty', mine: 4, theirs: 9 }],
    });
  });

  it('does not ask when the devices changed different fields of one record', () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const l = withDoc((d) => {
      d.items.a = item('a', 4);
    });
    const r = withDoc((d) => {
      d.items.a = item('a', 1, { bestBefore: '2027-01' });
    });
    const out = classify(plain(b), plain(l), plain(r));
    expect(out.conflicts).toEqual([]);
    expect(out.remoteOnly).toBe(1);
  });

  it('asks when one device deleted a record the other edited', () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const l = base(); // deleted here
    const r = withDoc((d) => {
      d.items.a = item('a', 7);
    });
    const { conflicts } = classify(plain(b), plain(l), plain(r));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: 'items/a', minePresent: false, theirsPresent: true });
  });

  it('treats a delete on one side with no edit on the other as the other not having changed', () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const l = base();
    expect(classify(plain(b), plain(l), plain(b))).toEqual({ conflicts: [], remoteOnly: 0 });
  });

  it('covers members, the home and the settings, and names them', () => {
    const member = (name: string) => ({
      id: 'm1',
      name,
      dob: '1990-01-01',
      tags: [],
      medication: [],
    });
    const b = withDoc((d) => {
      d.household.members.push(member('Alex'));
    });
    const l = withDoc((d) => {
      d.household.members.push(member('Alexander'));
      d.home.type = 'flat';
      d.settings.horizonDays = 7;
    });
    const r = withDoc((d) => {
      d.household.members.push(member('Alexandra'));
      d.home.type = 'detached';
      d.settings.horizonDays = 7;
    });
    const { conflicts } = classify(plain(b), plain(l), plain(r));
    expect(conflicts.map((c) => [c.key, c.title])).toEqual([
      ['home', 'Your home'],
      ['household.members/m1', 'Alexander'],
    ]);
  });

  it('lists the records of a document under stable keys', () => {
    const d = withDoc((x) => {
      x.items.a = item('a', 1);
    });
    expect(Array.from(recordsOf(plain(d)).keys())).toEqual(['items/a', 'home', 'settings']);
  });
});

describe('applyChoice', () => {
  const conflict = () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const l = withDoc((d) => {
      d.items.a = item('a', 4, { bestBefore: '2027-01' });
    });
    const r = withDoc((d) => {
      d.items.a = item('a', 9);
    });
    return classify(plain(b), plain(l), plain(r)).conflicts[0]!;
  };

  it('writes only the conflicting fields from the chosen side', () => {
    const draft = withDoc((d) => {
      d.items.a = item('a', 9, { bestBefore: '2027-01' }); // the merge kept their qty, our date
    });
    applyChoice(draft, conflict(), 'mine');
    expect(draft.items.a).toMatchObject({ qty: 4, bestBefore: '2027-01' });
    applyChoice(draft, conflict(), 'theirs');
    expect(draft.items.a!.qty).toBe(9);
    expect(draft.items.a!.bestBefore).toBe('2027-01'); // not a conflicting field: untouched
  });

  it('restores a record deleted by the merge, and removes one the chosen side deleted', () => {
    const b = withDoc((d) => {
      d.items.a = item('a', 1);
    });
    const edited = withDoc((d) => {
      d.items.a = item('a', 7);
    });
    const c = classify(plain(b), plain(base()), plain(edited)).conflicts[0]!;
    const draft = base();
    applyChoice(draft, c, 'theirs');
    expect(draft.items.a!.qty).toBe(7);
    applyChoice(draft, c, 'mine'); // mine = deleted
    expect(draft.items.a).toBeUndefined();
  });
});

describe('bytes helpers', () => {
  it('reads the plain document out of a store state, as the store itself sees it', async () => {
    const store = await openStore({
      name: `rec-${Math.random()}`,
      env: 'local',
      deviceId: 'd',
      channel: false,
    });
    store.change('x', (d) => {
      d.items.a = item('a', 2);
    });
    expect(plainFromBytes(store.bytes())).toEqual(plain(store.get()));
    await store.close();
  });

  it('knows a new document, a blank one, and what a device has that another lacks', async () => {
    const open = (n: string) =>
      openStore({ name: `rec-${n}-${Math.random()}`, env: 'local', deviceId: n, channel: false });
    const a = await open('a');
    expect(isBlank(a.get())).toBe(true);
    expect(freshPlain(SCHEMA_VERSION).items).toEqual({});
    const before = a.bytes();
    a.change('x', (d) => {
      d.items.a = item('a', 2);
    });
    expect(isBlank(a.get())).toBe(false);
    expect(hasUnseenChanges(a.bytes(), before)).toBe(true);
    expect(hasUnseenChanges(before, a.bytes())).toBe(false);
    await a.close();
  });

  it('counts a deletion as something the other side has not seen', async () => {
    const a = await openStore({
      name: `rec-del-${Math.random()}`,
      env: 'local',
      deviceId: 'a',
      channel: false,
    });
    a.change('add', (d) => {
      d.items.a = item('a', 2);
    });
    const withItem = a.bytes();
    a.change('delete', (d) => {
      delete d.items.a;
    });
    // no new structure, only a delete set entry
    expect(hasUnseenChanges(a.bytes(), withItem)).toBe(true);
    expect(hasUnseenChanges(withItem, a.bytes())).toBe(false);
    expect(hasUnseenChanges(a.bytes(), a.bytes())).toBe(false);
    await a.close();
  });
});
