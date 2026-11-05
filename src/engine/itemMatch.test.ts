import { describe, expect, it } from 'vitest';
import { bundledPacks } from '../packs/bundled';
import { suggestItems } from './itemMatch';

const items = Object.values(bundledPacks().items);
const ids = (categories: string[], size?: Parameters<typeof suggestItems>[0]['size']) =>
  suggestItems({ categories, ...(size ? { size } : {}) }, items).map((i) => i.id.split(':')[1]);

describe('suggestItems', () => {
  it('puts baked beans before the catch-all other tins', () => {
    expect(ids(['en:canned-foods', 'en:baked-beans'])).toEqual(['baked-beans', 'other-tins']);
  });

  it('ignores the order of the categories (they may come back from the CRDT as a set)', () => {
    expect(ids(['en:baked-beans', 'en:canned-foods'])).toEqual(
      ids(['en:canned-foods', 'en:baked-beans']),
    );
    expect(ids(['en:sodas', 'en:waters'])).toEqual(ids(['en:waters', 'en:sodas']));
  });

  it("drops items whose measure the product's size does not fit: a drink is not a weight", () => {
    const cola = ids(['en:sodas'], { count: 24, amount: 330, unit: 'ml' });
    expect(cola).toEqual(['soft-drinks']);
    expect(ids(['en:sodas'], { amount: 400, unit: 'g' })).toEqual([]);
  });

  it('never offers equipment', () => {
    const fake = suggestItems({ categories: ['en:x'] }, [
      { ...items.find((i) => i.assetTypeId)!, offCategories: ['en:x'] },
    ]);
    expect(fake).toEqual([]);
  });

  it('offers at most three, and nothing for a tag it does not know', () => {
    expect(ids(['en:unheard-of'])).toEqual([]);
    expect(
      suggestItems({ categories: ['en:canned-foods', 'en:baked-beans', 'en:canned-meals'] }, items)
        .length,
    ).toBeLessThanOrEqual(3);
  });

  it('puts the item with more matching tags first', () => {
    expect(ids(['en:canned-legumes', 'en:canned-chickpeas', 'en:soups'])[0]).toBe('tinned-pulses');
  });

  it('every item reachable by a tag is a stock item with a size', () => {
    for (const item of items) {
      for (const tag of item.offCategories ?? []) {
        const [first] = suggestItems({ categories: [tag] }, items);
        expect(first, tag).toBeDefined();
        expect(first!.assetTypeId, tag).toBeUndefined();
      }
    }
  });
});
