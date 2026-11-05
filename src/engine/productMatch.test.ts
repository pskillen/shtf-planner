import { describe, expect, it } from 'vitest';
import type { ItemType } from '../model';
import { bundledPacks } from '../packs/bundled';
import { CATEGORY_TABLE, likelyTypes } from './productMatch';

const types: ItemType[] = Object.values(bundledPacks().items);
const ids = (list: ItemType[]) => list.map((t) => t.id);

describe('likelyTypes', () => {
  it('maps tinned food to the tin', () => {
    const out = likelyTypes(
      { categories: ['en:canned-foods', 'en:baked-beans'], grams: 415 },
      types,
    );
    expect(ids(out)).toEqual(['items-base:tinned-food-tin']);
  });

  it('picks pasta by weight, nearest first', () => {
    expect(ids(likelyTypes({ categories: ['en:dry-pastas'], grams: 500 }, types))[0]).toBe(
      'items-base:dried-pasta-500g',
    );
    expect(ids(likelyTypes({ categories: ['en:pastas'], grams: 1000 }, types))[0]).toBe(
      'items-base:dried-pasta-1kg',
    );
    expect(likelyTypes({ categories: ['en:pastas'], grams: 500 }, types)).toHaveLength(3);
  });

  it('picks water by volume', () => {
    expect(ids(likelyTypes({ categories: ['en:spring-waters'], ml: 2000 }, types))[0]).toBe(
      'items-base:bottled-water-2l',
    );
    expect(ids(likelyTypes({ categories: ['en:mineral-waters'], ml: 5000 }, types))[0]).toBe(
      'items-base:bottled-water-5l',
    );
  });

  it('keeps table order when the product has no size', () => {
    expect(ids(likelyTypes({ categories: ['en:rices'] }, types))).toEqual([
      'items-base:rice-1kg',
      'items-base:rice-sack',
    ]);
  });

  it('knows nothing about categories it does not have', () => {
    expect(likelyTypes({ categories: ['en:books', 'en:chocolates'], grams: 100 }, types)).toEqual(
      [],
    );
    expect(likelyTypes({ categories: [] }, types)).toEqual([]);
  });

  it('never offers equipment, even if a table id points at one', () => {
    const asEquipment = types.map((t) =>
      t.id === 'items-base:tinned-food-tin' ? { ...t, assetTypeId: 'assets-base:stove' } : t,
    );
    expect(likelyTypes({ categories: ['en:canned-foods'] }, asEquipment)).toEqual([]);
  });

  it('every id in the table is a stock type in the bundled pack', () => {
    const byId = new Map(types.map((t) => [t.id, t]));
    for (const [tag, candidates] of Object.entries(CATEGORY_TABLE)) {
      for (const c of candidates) {
        const t = byId.get(`items-base:${c.local}`);
        expect(t, `${tag} -> ${c.local}`).toBeDefined();
        expect(t!.assetTypeId).toBeUndefined();
      }
    }
  });
});
