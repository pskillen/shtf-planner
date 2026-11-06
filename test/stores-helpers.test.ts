import { describe, expect, it } from 'vitest';
import {
  addMonthsYM,
  addStock,
  addStockWithUndo,
  defaultLocationId,
  ensureProduct,
  formatMonth,
  matchItems,
  placeWarnings,
  shortName,
  monthChips,
  parseMonth,
  suitabilityWarning,
  undoAddStock,
} from '../src/app/screens/stores/stock';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';

const water = { name: 'Water can (10 L)', suitability: ['frost' as const] };
const shed = { name: 'Shed', conditions: ['frost' as const, 'damp' as const, 'heat' as const] };

describe('suitabilityWarning', () => {
  it('names what the place does to the item', () => {
    expect(suitabilityWarning({ name: 'Tinned soup', suitability: [] }, { ...shed })).toBe(
      'Tinned soup may freeze, get damp or get too hot in the Shed',
    );
    expect(
      suitabilityWarning(
        { name: 'Water can (10 L)', suitability: ['damp', 'heat'] },
        { name: 'Garage', conditions: ['frost', 'damp'] },
      ),
    ).toBe('Water can (10 L) may freeze in the Garage');
  });

  it('says nothing when the type tolerates every condition, whatever it lists besides', () => {
    expect(suitabilityWarning({ name: 'x', suitability: ['frost', 'heat', 'damp'] }, shed)).toBe(
      undefined,
    );
    expect(suitabilityWarning(water, { name: 'Loft', conditions: ['frost'] })).toBeUndefined();
  });

  it('ignores indoor-stable and a place with no conditions', () => {
    expect(
      suitabilityWarning(
        { name: 'x', suitability: [] },
        { name: 'Pantry', conditions: ['indoor-stable'] },
      ),
    ).toBeUndefined();
    expect(
      suitabilityWarning({ name: 'x', suitability: [] }, { name: 'Hall', conditions: [] }),
    ).toBeUndefined();
  });

  it('on the fixture, flags nothing that the packs say is fine and something that is not', () => {
    const doc = biggarDocument();
    const packs = bundledPacks();
    const uht = packs.items['items-base:uht-milk']!;
    expect(suitabilityWarning(uht, doc.locations['loc-pantry']!)).toBeUndefined();
    expect(suitabilityWarning(uht, doc.locations['loc-shed']!)).toMatch(/in the Shed$/);
  });
});

describe('best-before months', () => {
  it('formats months', () => {
    expect(formatMonth('2027-03')).toBe('Mar 2027');
    expect(formatMonth('nonsense')).toBe('nonsense');
  });

  it('moves a month across year ends in both directions', () => {
    expect(addMonthsYM('2026-11', 3)).toBe('2027-02');
    expect(addMonthsYM('2026-01', -1)).toBe('2025-12');
    expect(addMonthsYM('2026-12', 12)).toBe('2027-12');
    expect(addMonthsYM('2026-06', 60)).toBe('2031-06');
  });

  it('reads typed months in the usual ways and refuses the rest', () => {
    expect(parseMonth('2027-03')).toBe('2027-03');
    expect(parseMonth(' 3/2027 ')).toBe('2027-03');
    expect(parseMonth('03/27')).toBe('2027-03');
    expect(parseMonth('Mar 2027')).toBe('2027-03');
    expect(parseMonth('september 2028')).toBe('2028-09');
    expect(parseMonth('2027-13')).toBeUndefined();
    expect(parseMonth('2027-00')).toBeUndefined();
    expect(parseMonth('soon')).toBeUndefined();
    expect(parseMonth('')).toBeUndefined();
  });

  it('offers chips from how long the item keeps', () => {
    const today = '2026-11-04';
    expect(monthChips('years', today)).toEqual([
      { label: '+1 y', value: '2027-11' },
      { label: '+2 y', value: '2028-11' },
      { label: '+5 y', value: '2031-11' },
    ]);
    expect(monthChips('none', today)).toEqual([]);
    expect(monthChips('months', today).map((c) => c.label)).toEqual(['+3 m', '+6 m', '+1 y']);
    expect(monthChips('weeks', today)[0]).toEqual({ label: '+1 m', value: '2026-12' });
  });
});

describe('matchItems', () => {
  const items = Object.values(bundledPacks().items).filter((t) => !t.assetTypeId);

  it('puts recent items first and keeps pack order for the rest', () => {
    const recent = ['items-base:tinned-soup', 'items-base:water-container'];
    const out = matchItems(items, '', recent);
    expect(out.slice(0, 2).map((t) => t.id)).toEqual(recent);
    expect(out.length).toBeGreaterThan(recent.length);
  });

  it('matches name, counts-as, category and tags, ignoring case', () => {
    expect(
      matchItems(items, 'water container').some((t) => t.id === 'items-base:water-container'),
    ).toBe(true);
    expect(matchItems(items, 'containers').some((t) => t.id === 'items-base:water-container')).toBe(
      true,
    );
    expect(matchItems(items, 'zzzzzz')).toEqual([]);
  });
});

describe('ensureProduct', () => {
  const packs = bundledPacks();
  const item = packs.items['items-base:baked-beans']!;

  it('reuses a product with the same item, name and size', () => {
    const doc = structuredClone(biggarDocument());
    const first = ensureProduct(
      doc,
      { itemId: item.id, size: { amount: 415, unit: 'g' }, name: 'Test beans 415 g' },
      packs,
      '2026-11-04',
    );
    const second = ensureProduct(
      doc,
      { itemId: item.id, size: { amount: 415, unit: 'g' }, name: 'Test beans 415 g' },
      packs,
      '2026-11-04',
    );
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(Object.keys(doc.products)).toHaveLength(Object.keys(biggarDocument().products).length);
  });

  it('does not reuse when the size differs', () => {
    const doc = structuredClone(biggarDocument());
    const first = ensureProduct(
      doc,
      { itemId: item.id, size: { amount: 415, unit: 'g' }, name: 'Beans A' },
      packs,
      '2026-11-04',
      () => 'p-a',
    );
    const second = ensureProduct(
      doc,
      { itemId: item.id, size: { amount: 400, unit: 'g' }, name: 'Beans B' },
      packs,
      '2026-11-04',
      () => 'p-b',
    );
    expect(second.id).not.toBe(first.id);
    expect(doc.products['p-a']).toBeDefined();
    expect(doc.products['p-b']).toBeDefined();
  });
});

describe('addStockWithUndo', () => {
  it('merges on product, place and month and undo leaves the product', () => {
    const doc = structuredClone(biggarDocument());
    doc.barcodes['999'] = { productId: 'prod-can', seen: '2026-11-04' };
    const addition = addStockWithUndo(
      doc,
      {
        productId: 'prod-can',
        qty: 1,
        locationId: 'loc-garage',
        source: 'barcode',
      },
      '2026-11-04',
    );
    expect(addition.created).toBe(false);
    expect(doc.stock['stock-can']!.qty).toBe(3);
    undoAddStock(doc, addition);
    expect(doc.stock['stock-can']!.qty).toBe(2);
    expect(doc.products['prod-can']).toBeDefined();
    expect(doc.barcodes['999']!.productId).toBe('prod-can');
  });

  it('adds a new row when the best-before month differs', () => {
    const doc = structuredClone(biggarDocument());
    const id = addStock(
      doc,
      { productId: 'prod-can', qty: 1, locationId: 'loc-garage', bestBefore: '2028-01' },
      '2026-11-04',
      () => 'new-row',
    );
    expect(id).toBe('new-row');
    expect(doc.stock['new-row']!.productId).toBe('prod-can');
  });
});

describe('defaultLocationId', () => {
  const doc = biggarDocument();
  const count = (id: string) => Object.values(doc.stock).filter((i) => i.locationId === id).length;
  const fullest = Object.values(doc.locations)
    .map((l) => l.id)
    .sort((a, b) => count(b) - count(a))[0]!;

  it('is where the item already lives', () => {
    expect(defaultLocationId(doc, 'items-base:uht-milk', 'loc-shed')).toBe('loc-pantry');
  });

  it('else the last place used', () => {
    expect(defaultLocationId(doc, 'items-base:candles', 'loc-shed')).toBe('loc-shed');
  });

  it('else the fullest place, ignoring a last place that no longer exists', () => {
    expect(defaultLocationId(doc, 'items-base:candles', null)).toBe(fullest);
    expect(defaultLocationId(doc, 'items-base:candles', 'loc-gone')).toBe(fullest);
  });

  it('is empty with no places', () => {
    expect(
      defaultLocationId({ stock: {}, products: {}, locations: {} }, 'items-base:candles', null),
    ).toBe('');
  });
});

describe('placeWarnings', () => {
  it('gives one warning per place, naming each product once in a short form', () => {
    const doc = biggarDocument();
    const packs = bundledPacks();
    const uht = packs.items['items-base:uht-milk']!;
    const shed = doc.locations['loc-shed']!;
    doc.products['p-long'] = {
      id: 'p-long',
      name: 'HARIB Tangfastics 1471 346 AN A 1054 AIN 1% 50% 6A',
      itemId: uht.id,
    } as never;
    for (const id of ['s-a', 's-b']) {
      doc.stock[id] = { id, productId: 'p-long', locationId: shed.id, qty: 1 } as never;
    }
    const all = placeWarnings(doc, packs, () => true);
    const inShed = all.filter((w) => w.locationId === shed.id);
    expect(inShed).toHaveLength(1);
    expect(inShed[0]!.summary).toMatch(/^May .* in the Shed$/);
    expect(inShed[0]!.products.filter((p) => p.id === 'p-long')).toHaveLength(1);
    expect(inShed[0]!.products.find((p) => p.id === 'p-long')!.name.length).toBeLessThanOrEqual(25);
    expect(placeWarnings(doc, packs, () => false)).toEqual([]);
  });
});

describe('shortName', () => {
  it('keeps short names and cuts long ones at a word', () => {
    expect(shortName('Baked beans')).toBe('Baked beans');
    expect(shortName('Fruit & Nut Milk Chocolate bar large')).toBe('Fruit & Nut Milk…');
  });
});
