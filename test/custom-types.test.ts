import { describe, expect, it } from 'vitest';
import { coverage, gaps } from '../src/engine';
import { biggarDocument } from '../src/fixtures/household-biggar';
import type { ItemType } from '../src/model';
import { bundledPacks, customTypeId, isCustomTypeId, withCustomTypes } from '../src/packs';

const soup: ItemType = {
  id: customTypeId('0b6e4c9a-1111-4222-8333-444455556666'),
  name: 'Gran’s soup',
  category: 'food',
  unit: 'jar',
  gives: [{ store: 'foodKcal', amount: 800 }],
  suitability: [],
  shelfLife: 'years',
  tags: [],
};

const kcal = (c: ReturnType<typeof coverage>) => c.find((x) => x.store === 'foodKcal')?.amount ?? 0;

describe('withCustomTypes', () => {
  const packs = bundledPacks();

  it('returns the packs themselves when there are none', () => {
    expect(withCustomTypes(packs, {})).toBe(packs);
  });

  it('adds the types as a pseudo-pack `custom` without touching the shipped ones', () => {
    const merged = withCustomTypes(packs, { [soup.id]: soup });
    expect(merged.items[soup.id]).toBe(soup);
    expect(merged.byId['custom']?.kind).toBe('items');
    expect(Object.keys(merged.items)).toHaveLength(Object.keys(packs.items).length + 1);
    expect(merged.all).toBe(packs.all);
    expect(packs.items[soup.id]).toBeUndefined();
  });

  it('names custom ids so they fit the pack id format and are recognised', () => {
    expect(soup.id).toMatch(/^custom:[a-z0-9-]+$/);
    expect(isCustomTypeId(soup.id)).toBe(true);
    expect(isCustomTypeId('items-base:water-can')).toBe(false);
  });

  it('counts a custom item in the engine like any other', () => {
    const doc = biggarDocument();
    const withSoup = {
      ...doc,
      customTypes: { [soup.id]: soup },
      items: {
        ...doc.items,
        'item-soup': {
          id: 'item-soup',
          typeId: soup.id,
          qty: 10,
          locationId: 'loc-hall',
          added: '2026-09-01',
          source: 'manual' as const,
        },
      },
    };
    const before = kcal(coverage(doc, packs, '2026-11-15', 28));
    const merged = withCustomTypes(packs, withSoup.customTypes);
    const after = kcal(coverage(withSoup, merged, '2026-11-15', 28));
    expect(after).toBe(before + 8000);
    // without the merge the engine skips the unknown type, as it does for any missing pack
    expect(kcal(coverage(withSoup, packs, '2026-11-15', 28))).toBe(before);
    expect(gaps(withSoup, merged, '2026-11-15', 28).length).toBeGreaterThan(0);
  });
});
