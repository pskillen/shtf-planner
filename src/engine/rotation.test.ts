import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import { addStock } from '../fixtures/stock';
import { bundledPacks } from '../packs/bundled';
import { useFirst } from './rotation';

const packs = bundledPacks();
const NOW = '2026-11-15';
const BEANS = 'items-base:baked-beans';

describe('useFirst', () => {
  it('picks the earliest live month across all the products of an item', () => {
    const doc = biggarDocument();
    addStock(doc, packs, {
      id: 'small',
      item: 'baked-beans',
      qty: 2,
      locationId: 'loc-attic',
      bestBefore: '2027-03',
    });
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBe('small'); // before 2028-06
    doc.stock['stock-beans']!.bestBefore = '2027-01';
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBe('stock-beans');
  });

  it('counts this month as live', () => {
    const doc = biggarDocument();
    doc.stock['stock-beans']!.bestBefore = '2026-11';
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBe('stock-beans');
    doc.stock['stock-beans']!.bestBefore = '2026-10';
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBeUndefined();
  });

  it('never picks expired or undated stock', () => {
    const doc = biggarDocument();
    // the fixture's UHT milk expired in 2026-10, and the water cans have no date
    const first = useFirst(doc, packs, NOW);
    expect(first.get('items-base:uht-milk')).toBeUndefined();
    expect(first.get('items-base:water-container')).toBeUndefined();
    addStock(doc, packs, { id: 'undated', item: 'baked-beans', qty: 1, locationId: 'loc-attic' });
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBe('stock-beans');
  });

  it('breaks a tie by the date added, then the id', () => {
    const doc = biggarDocument();
    doc.stock['stock-beans']!.bestBefore = '2027-05';
    addStock(doc, packs, {
      id: 'older',
      item: 'baked-beans',
      qty: 1,
      locationId: 'loc-attic',
      bestBefore: '2027-05',
      added: '2026-08-01',
    });
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBe('older');
    addStock(doc, packs, {
      id: 'a-same',
      item: 'baked-beans',
      qty: 1,
      locationId: 'loc-attic',
      bestBefore: '2027-05',
      added: '2026-08-01',
    });
    expect(useFirst(doc, packs, NOW).get(BEANS)).toBe('a-same');
  });

  it('skips stock that counts towards nothing', () => {
    const doc = biggarDocument();
    doc.stock['stock-twine']!.bestBefore = '2027-01';
    expect([...useFirst(doc, packs, NOW).values()]).not.toContain('stock-twine');
  });
});
