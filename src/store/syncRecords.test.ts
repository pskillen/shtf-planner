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
const item = (id: string, qty: number, over: Partial<Document['stock'][string]> = {}) => ({
  id,
  productId: 'prod-water',
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
      d.stock.a = item('a', 1);
    });
    const l = b;
    const r = withDoc((d) => {
      d.stock.a = item('a', 5);
      d.stock.b = item('b', 2);
    });
    const out = classify(plain(b), plain(l), plain(r));
    expect(out.conflicts).toEqual([]);
    expect(out.remoteOnly).toBe(2);
  });

  it('ignores changes both devices made the same way', () => {
    const b = base();
    const both = withDoc((d) => {
      d.stock.a = item('a', 3);
    });
    expect(classify(plain(b), plain(both), plain(both))).toEqual({ conflicts: [], remoteOnly: 0 });
  });

  it('asks when both devices set the same field to different values', () => {
    const b = withDoc((d) => {
      d.stock.a = item('a', 1);
    });
    const l = withDoc((d) => {
      d.stock.a = item('a', 4);
    });
    const r = withDoc((d) => {
      d.stock.a = item('a', 9);
    });
    const { conflicts, remoteOnly } = classify(plain(b), plain(l), plain(r));
    expect(remoteOnly).toBe(0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      key: 'stock/a',
      noun: 'Stock',
      minePresent: true,
      theirsPresent: true,
      fields: [{ field: 'qty', mine: 4, theirs: 9 }],
    });
  });

  it('does not ask when the devices changed different fields of one record', () => {
    const b = withDoc((d) => {
      d.stock.a = item('a', 1);
    });
    const l = withDoc((d) => {
      d.stock.a = item('a', 4);
    });
    const r = withDoc((d) => {
      d.stock.a = item('a', 1, { bestBefore: '2027-01' });
    });
    const out = classify(plain(b), plain(l), plain(r));
    expect(out.conflicts).toEqual([]);
    expect(out.remoteOnly).toBe(1);
  });

  it('asks when one device deleted a record the other edited', () => {
    const b = withDoc((d) => {
      d.stock.a = item('a', 1);
    });
    const l = base(); // deleted here
    const r = withDoc((d) => {
      d.stock.a = item('a', 7);
    });
    const { conflicts } = classify(plain(b), plain(l), plain(r));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: 'stock/a', minePresent: false, theirsPresent: true });
  });

  it('treats a delete on one side with no edit on the other as the other not having changed', () => {
    const b = withDoc((d) => {
      d.stock.a = item('a', 1);
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
      x.stock.a = item('a', 1);
    });
    expect(Array.from(recordsOf(plain(d)).keys())).toEqual(['stock/a', 'home', 'settings']);
  });
});

describe('applyChoice', () => {
  const conflict = () => {
    const b = withDoc((d) => {
      d.stock.a = item('a', 1);
    });
    const l = withDoc((d) => {
      d.stock.a = item('a', 4, { bestBefore: '2027-01' });
    });
    const r = withDoc((d) => {
      d.stock.a = item('a', 9);
    });
    return classify(plain(b), plain(l), plain(r)).conflicts[0]!;
  };

  it('writes only the conflicting fields from the chosen side', () => {
    const draft = withDoc((d) => {
      d.stock.a = item('a', 9, { bestBefore: '2027-01' }); // the merge kept their qty, our date
    });
    applyChoice(draft, conflict(), 'mine');
    expect(draft.stock.a).toMatchObject({ qty: 4, bestBefore: '2027-01' });
    applyChoice(draft, conflict(), 'theirs');
    expect(draft.stock.a!.qty).toBe(9);
    expect(draft.stock.a!.bestBefore).toBe('2027-01'); // not a conflicting field: untouched
  });

  it('restores a record deleted by the merge, and removes one the chosen side deleted', () => {
    const b = withDoc((d) => {
      d.stock.a = item('a', 1);
    });
    const edited = withDoc((d) => {
      d.stock.a = item('a', 7);
    });
    const c = classify(plain(b), plain(base()), plain(edited)).conflicts[0]!;
    const draft = base();
    applyChoice(draft, c, 'theirs');
    expect(draft.stock.a!.qty).toBe(7);
    applyChoice(draft, c, 'mine'); // mine = deleted
    expect(draft.stock.a).toBeUndefined();
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
      d.stock.a = item('a', 2);
    });
    expect(plainFromBytes(store.bytes())).toEqual(plain(store.get()));
    await store.close();
  });

  it('knows a new document, a blank one, and what a device has that another lacks', async () => {
    const open = (n: string) =>
      openStore({ name: `rec-${n}-${Math.random()}`, env: 'local', deviceId: n, channel: false });
    const a = await open('a');
    expect(isBlank(a.get())).toBe(true);
    expect(freshPlain(SCHEMA_VERSION).stock).toEqual({});
    const before = a.bytes();
    a.change('x', (d) => {
      d.stock.a = item('a', 2);
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
      d.stock.a = item('a', 2);
    });
    const withItem = a.bytes();
    a.change('delete', (d) => {
      delete d.stock.a;
    });
    // no new structure, only a delete set entry
    expect(hasUnseenChanges(a.bytes(), withItem)).toBe(true);
    expect(hasUnseenChanges(withItem, a.bytes())).toBe(false);
    expect(hasUnseenChanges(a.bytes(), a.bytes())).toBe(false);
    await a.close();
  });
});

describe('naming records the person recognises', () => {
  const product = (name: string) => ({
    id: 'p1',
    name,
    itemId: 'items-base:baked-beans',
    size: { amount: 415, unit: 'g' as const },
    added: '2026-01-01',
  });

  it('nouns and titles: a product by its name, stock by its product, a barcode by its code', () => {
    const b = withDoc((d) => {
      d.products.p1 = product('Beans');
      d.stock.s1 = item('s1', 1, { productId: 'p1' });
      d.barcodes['5000169005743'] = { productId: 'p1', seen: '2026-01-01' };
      d.minimums['loc|items-base:baked-beans'] = 2;
    });
    const l = withDoc((d) => {
      d.products.p1 = product('Heinz Beanz');
      d.stock.s1 = item('s1', 2, { productId: 'p1' });
      d.barcodes['5000169005743'] = { productId: 'p2', seen: '2026-01-01' };
      d.minimums['loc|items-base:baked-beans'] = 3;
    });
    const r = withDoc((d) => {
      d.products.p1 = product('Tesco beans');
      d.stock.s1 = item('s1', 3, { productId: 'p1' });
      d.barcodes['5000169005743'] = { productId: 'p3', seen: '2026-01-01' };
      d.minimums['loc|items-base:baked-beans'] = 4;
    });
    const { conflicts } = classify(plain(b), plain(l), plain(r));
    const by = Object.fromEntries(conflicts.map((c) => [c.key, [c.noun, c.title]]));
    expect(by['products/p1']).toEqual(['Product', 'Heinz Beanz']);
    expect(by['stock/s1']).toEqual(['Stock', 'Heinz Beanz']);
    expect(by['barcodes/5000169005743']).toEqual(['Barcode', '5000169005743']);
    expect(by['minimums/loc|items-base:baked-beans']).toEqual([
      'Minimum',
      'loc|items-base:baked-beans',
    ]);
  });

  it('a stock row whose product is not in the snapshots is titled by its id', () => {
    const b = withDoc((d) => {
      d.stock.s1 = item('s1', 1, { productId: 'gone' });
    });
    const l = withDoc((d) => {
      d.stock.s1 = item('s1', 2, { productId: 'gone' });
    });
    const r = withDoc((d) => {
      d.stock.s1 = item('s1', 3, { productId: 'gone' });
    });
    expect(classify(plain(b), plain(l), plain(r)).conflicts[0]).toMatchObject({ title: 's1' });
  });

  it('a household with only products, barcodes, minimums or scans is not blank', () => {
    expect(isBlank(base())).toBe(true);
    for (const fill of [
      (d: Document) => void (d.products.p = product('x')),
      (d: Document) => void (d.barcodes['1'] = { productId: 'p', seen: '2026-01-01' }),
      (d: Document) => void (d.minimums['l|i'] = 1),
      (d: Document) => void (d.stock.s = item('s', 1)),
    ]) {
      expect(isBlank(withDoc(fill))).toBe(false);
    }
  });
});

describe('review answer conflicts', () => {
  it('retains conflicts for removal versus addition and for finish disagreements', () => {
    const b = withDoc((d) => {
      d.reviews.r = { id: 'r', started: '2026-01-01T00:00:00Z', resolved: ['a'] };
    });
    const l = structuredClone(b);
    const r = structuredClone(b);
    l.reviews.r!.resolved = [];
    r.reviews.r!.resolved.push('b');
    expect(
      classify(plain(b), plain(l), plain(r)).conflicts[0]?.fields.map((f) => f.field),
    ).toContain('resolved');
    l.reviews.r!.finished = '2026-02-01T00:00:00Z';
    r.reviews.r!.finished = '2026-03-01T00:00:00Z';
    l.reviews.r!.scoreAfter = 1;
    r.reviews.r!.scoreAfter = 2;
    expect(classify(plain(b), plain(l), plain(r)).conflicts[0]?.fields.map((f) => f.field)).toEqual(
      expect.arrayContaining(['finished', 'scoreAfter']),
    );
  });
});

describe('checklist runs and step states', () => {
  const run = (id: string, scenarios: string[]): Document['checklistRuns'][string] => ({
    id,
    scenarios,
    started: '2026-03-04T10:00:00.000Z',
    catalogue: {
      packs: [{ id: 'checklists-base', version: 1 }],
      scenarios: [
        { id: 'flood', name: 'Flood' },
        { id: 'power-cut', name: 'Power cut' },
      ],
      steps: [
        {
          id: 'unplug',
          packId: 'checklists-base',
          text: 'Unplug appliances',
          phase: 'immediate',
          order: 1,
          scenarios: ['flood'],
          source: 'assumption',
        },
      ],
    },
  });

  it('a household with only checklist data is not blank', () => {
    expect(isBlank(withDoc((d) => void (d.checklistRuns.r = run('r', ['flood']))))).toBe(false);
    expect(
      isBlank(
        withDoc((d) => void (d.checklistStepStates['r|unplug'] = { runId: 'r', stepId: 'unplug' })),
      ),
    ).toBe(false);
  });

  it('records both collections under collection/id keys', () => {
    const d = withDoc((x) => {
      x.checklistRuns.r = run('r', ['flood']);
      x.checklistStepStates['r|unplug'] = { runId: 'r', stepId: 'unplug' };
    });
    expect([...recordsOf(plain(d)).keys()]).toEqual(
      expect.arrayContaining(['checklistRuns/r', 'checklistStepStates/r|unplug']),
    );
  });

  it('titles a run by its scenario names (each once) and start day, a step by its text', () => {
    const b = withDoc((d) => {
      d.checklistRuns.r = run('r', ['flood', 'power-cut', 'flood']);
      d.checklistStepStates['r|unplug'] = { runId: 'r', stepId: 'unplug' };
    });
    const l = structuredClone(b);
    const r = structuredClone(b);
    l.checklistRuns.r!.finished = '2026-03-05T10:00:00.000Z';
    r.checklistRuns.r!.finished = '2026-03-06T10:00:00.000Z';
    l.checklistStepStates['r|unplug']!.note = 'mine';
    r.checklistStepStates['r|unplug']!.note = 'theirs';
    const by = Object.fromEntries(
      classify(plain(b), plain(l), plain(r)).conflicts.map((c) => [c.key, [c.noun, c.title]]),
    );
    expect(by['checklistRuns/r']).toEqual([
      'Checklist run',
      'Flood, Power cut, started 2026-03-04',
    ]);
    expect(by['checklistStepStates/r|unplug']).toEqual(['Checklist step', 'Unplug appliances']);
  });

  it('titles a step by its key when no run in the snapshots lists it', () => {
    const b = withDoc((d) => {
      d.checklistStepStates['gone|x'] = { runId: 'gone', stepId: 'x' };
    });
    const l = structuredClone(b);
    const r = structuredClone(b);
    l.checklistStepStates['gone|x']!.note = 'a';
    r.checklistStepStates['gone|x']!.note = 'b';
    expect(classify(plain(b), plain(l), plain(r)).conflicts[0]).toMatchObject({
      noun: 'Checklist step',
      title: 'gone|x',
    });
  });

  it('does not ask when both devices only added scenarios to a run', () => {
    const b = withDoc((d) => void (d.checklistRuns.r = run('r', ['flood'])));
    const l = structuredClone(b);
    const r = structuredClone(b);
    l.checklistRuns.r!.scenarios.push('power-cut');
    r.checklistRuns.r!.scenarios.push('heatwave');
    const out = classify(plain(b), plain(l), plain(r));
    expect(out.conflicts).toEqual([]);
    expect(out.remoteOnly).toBe(1);
  });
});
