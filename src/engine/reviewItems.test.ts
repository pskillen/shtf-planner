import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../model';
import { bundledPacks } from '../packs/bundled';
import { addStock } from '../fixtures/stock';
import { encodeReviewAnswer } from './reviewSession';
import { reviewItems } from './reviewItems';
import { reviewPeriod } from './review';

const packs = bundledPacks();
const doc = () => emptyDocument('local', '2025-01-31T12:00:00Z');
const answer = (opId: string, key: string, action: 'recounted' | 'not-now' | 'fine') =>
  encodeReviewAnswer({ opId, key, action });

describe('review queue', () => {
  it('finds all five kinds with inclusive end, month-end expiry and stable colon-safe keys', () => {
    const d = doc();
    d.household.members = [
      { id: 'child:one', name: 'Alex', dob: '2025-11-30', tags: [], medication: [] },
    ];
    d.locations['place:one'] = {
      id: 'place:one',
      name: 'Pantry',
      kind: 'rotating',
      conditions: [],
      size: 'M',
    };
    addStock(d, packs, {
      id: 'batch:one',
      item: 'baked-beans',
      qty: 1,
      locationId: 'place:one',
      bestBefore: '2026-02',
    });
    d.assets['alarm:one'] = {
      id: 'alarm:one',
      typeId: 'assets-base:smoke-alarm',
      answers: {},
      maintenance: { test: '2026-01-28', replace: '2026-01-28' },
    };
    d.plans['plans-base:first-aid-course'] = { doneAt: '2023-02-28' };
    const rows = reviewItems(d, packs, '2026-02-01', '2026-02-28');
    expect(new Set(rows.map((r) => r.kind))).toEqual(
      new Set(['expiry', 'maintenance', 'recount', 'plan']),
    );
    expect(rows.find((r) => r.key === 'stock:batch:one')).toMatchObject({
      due: '2026-02-28',
      urgency: 'soon',
      expiryLevel: 'soon',
    });
    expect(rows.find((r) => r.key === 'maint:alarm%3Aone:test')).toMatchObject({
      due: '2026-02-28',
      urgency: 'soon',
    });
    expect(rows.find((r) => r.kind === 'plan')).toMatchObject({ due: '2026-02-28' });
    expect(rows.find((r) => r.kind === 'recount')).toMatchObject({
      due: '2026-02-01',
      urgency: 'due',
    });
    expect(rows.some((r) => r.kind === 'age' && r.due === '2026-02-28')).toBe(false);
    expect(
      reviewItems(d, packs, '2026-02-01', '2026-03-01').some(
        (r) => r.kind === 'age' && r.due === '2026-03-01',
      ),
    ).toBe(true);
    expect(
      reviewItems(d, packs, '2026-03-01', '2026-03-01').find((r) => r.key === 'stock:batch:one')
        ?.urgency,
    ).toBe('overdue');
  });
  it('honours explicit plan expiry, enabled applicability and excludes undone plans', () => {
    const d = doc();
    d.plans = {
      'plans-base:first-aid-course': { doneAt: '2020-01-01', expires: '2027-01-01' },
      'plans-base:pets': { doneAt: '2020-01-01', expires: '2020-02-01' },
      'plans-base:meeting-point': { expires: '2020-01-01' },
    };
    expect(
      reviewItems(d, packs, '2026-01-01', '2026-12-31').filter((r) => r.kind === 'plan'),
    ).toEqual([]);
    expect(
      reviewItems(d, packs, '2026-01-01', '2027-01-01').filter((r) => r.kind === 'plan'),
    ).toHaveLength(1);
    d.settings.packs = d.settings.packs.filter((p) => p !== 'plans-base');
    expect(
      reviewItems(d, packs, '2026-01-01', '2028-01-01').filter((r) => r.kind === 'plan'),
    ).toHaveLength(0);
  });
  it('uses explicit recount actions in finished reviews and the union of open answers', () => {
    const d = doc();
    d.locations.a = { id: 'a', name: 'Pantry', kind: 'rotating', conditions: [], size: 'M' };
    d.locations.b = { id: 'b', name: 'Shed', kind: 'stored', conditions: [], size: 'M' };
    d.reviews.old = {
      id: 'old',
      started: '2026-01-01T00:00:00Z',
      finished: '2026-01-02T00:00:00Z',
      resolved: [
        answer('1', 'recount:a', 'recounted'),
        answer('2', 'recount:b', 'not-now'),
        'recount:b',
      ],
    };
    const rows = reviewItems(d, packs, '2026-02-01', '2026-08-01');
    expect(rows.find((r) => r.key === 'recount:a')?.due).toBe('2026-07-02');
    expect(rows.find((r) => r.key === 'recount:b')?.due).toBe('2026-02-01');
    d.reviews.x = {
      id: 'x',
      started: '2026-02-01T00:00:00Z',
      resolved: [answer('3', 'recount:a', 'not-now')],
    };
    d.reviews.y = { id: 'y', started: '2026-02-01T01:00:00Z', resolved: ['recount:b'] };
    expect(
      reviewItems(d, packs, '2026-02-01', '2026-08-01').filter((r) => r.kind === 'recount'),
    ).toEqual([]);
  });
  it('emits distinct item band edges and ignores disabled item packs', () => {
    const d = doc();
    d.household.members = [
      { id: 'baby', name: 'Alex', dob: '2026-01-01', tags: [], medication: [] },
    ];
    const rows = reviewItems(d, packs, '2026-02-01', '2026-08-01').filter((r) => r.kind === 'age');
    expect(rows.filter((r) => r.sourceId === 'items-base:nappies-size-2')).toHaveLength(2);
    expect(rows.some((r) => r.sourceId === 'items-base:baby-food' && r.due === '2026-07-01')).toBe(
      true,
    );
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(
      rows.filter((r) => r.sourceId === 'guidance-grid-free:nappies' && r.due === '2026-07-01'),
    ).toHaveLength(1);
    expect(
      rows.some((r) => r.sourceId === 'items-base:nappies-size-3' && r.due === '2026-06-01'),
    ).toBe(true);
    expect(
      reviewItems(d, packs, '2026-07-01', '2026-07-01').some(
        (r) => r.kind === 'age' && r.due === '2026-07-01' && r.urgency === 'due',
      ),
    ).toBe(true);
    d.settings.packs = d.settings.packs.filter((p) => p !== 'items-base');
    expect(
      reviewItems(d, packs, '2026-02-01', '2026-08-01').some(
        (r) => r.kind === 'age' && r.sourceId.startsWith('items-base:'),
      ),
    ).toBe(false);
  });
  it('keeps the overdue scheduled deadline but looks forward and handles empty households', () => {
    const d = doc();
    expect(reviewPeriod(d, '2026-01-31')).toEqual({
      scheduledDue: '2025-07-31',
      until: '2026-07-31',
    });
    expect(reviewItems(d, packs, '2026-01-31', '2026-07-31')).toEqual([]);
  });
  it('uses the first true age date for a short month', () => {
    const d = doc();
    d.household.members = [
      { id: 'baby', name: 'Alex', dob: '2025-08-31', tags: [], medication: [] },
    ];
    const edges = reviewItems(d, packs, '2026-02-01', '2026-03-01');
    expect(
      edges.some(
        (r) => r.kind === 'age' && r.sourceId === 'items-base:baby-food' && r.due === '2026-03-01',
      ),
    ).toBe(true);
    expect(
      edges.some(
        (r) => r.kind === 'age' && r.sourceId === 'items-base:baby-food' && r.due === '2026-02-28',
      ),
    ).toBe(false);
  });
  it('orders equal dates by capability then canonical key regardless of insertion order', () => {
    const d = doc();
    d.locations.z = { id: 'z', name: 'Shed', kind: 'stored', conditions: [], size: 'M' };
    d.locations.a = { id: 'a', name: 'Pantry', kind: 'stored', conditions: [], size: 'M' };
    addStock(d, packs, {
      id: 'food',
      item: 'baked-beans',
      qty: 1,
      locationId: 'a',
      bestBefore: '2026-02',
    });
    const rows = reviewItems(d, packs, '2026-02-28', '2026-02-28');
    expect(rows.map((r) => r.key)).toEqual(['stock:food', 'recount:a', 'recount:z']);
  });
});
