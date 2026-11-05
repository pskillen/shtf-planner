import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import type { Document, Product, Stock } from '../model';
import { bundledPacks } from '../packs/bundled';
import { itemOfStock, kcalSource, packGives, usualPack, usualProduct } from './products';

const packs = bundledPacks();
const item = (local: string) => packs.items[`items-base:${local}`]!;
const product = (over: Partial<Product> & Pick<Product, 'id' | 'size'>): Product => ({
  name: over.id,
  added: '2026-09-01',
  ...over,
});
const kcal = (p: Pick<Product, 'size' | 'labelKcalPer100'>, local: string) =>
  packGives(p, item(local)).find((g) => g.resource === 'foodKcal')?.amount;

describe('packGives', () => {
  it("uses the item's typical figure with no label, and the label's when there is one", () => {
    const size = { amount: 415, unit: 'g' as const };
    expect(kcal({ size }, 'baked-beans')).toBeCloseTo(415 * 0.84);
    expect(kcal({ size, labelKcalPer100: 75 }, 'baked-beans')).toBeCloseTo(415 * 0.75);
  });

  it('a diet soft drink with a label of 0 gives 0 kcal, and still gives water', () => {
    const size = { count: 24, amount: 330, unit: 'ml' as const };
    const diet = packGives({ size, labelKcalPer100: 0 }, item('soft-drinks'));
    expect(diet).toEqual([
      { resource: 'waterL', amount: expect.closeTo(7.92, 6) },
      { resource: 'foodKcal', amount: 0 },
    ]);
    const sugary = packGives({ size, labelKcalPer100: 42 }, item('soft-drinks'));
    expect(sugary.find((g) => g.resource === 'foodKcal')!.amount).toBeCloseTo(7920 * 0.42);
  });

  it("counts a multipack's total", () => {
    const six = { count: 6, amount: 1, unit: 'L' as const };
    expect(kcal({ size: six }, 'uht-milk')).toBeCloseTo(6000 * 0.46);
  });

  it('a count item ignores label kcal', () => {
    const size = { amount: 8, unit: 'pieces' as const };
    const gives = packGives({ size, labelKcalPer100: 999 }, item('aa-cells'));
    expect(gives).toEqual([{ resource: 'batteryWh', amount: expect.closeTo(26.4, 6) }]);
  });

  it('gives per piece for equipment and kits', () => {
    const one = { amount: 1, unit: 'pieces' as const };
    expect(packGives({ size: one }, item('first-aid-kit'))).toEqual([
      { resource: 'firstAid', amount: 3 },
    ]);
    expect(packGives({ size: { amount: 13, unit: 'kg' } }, item('propane-bottle'))).toEqual([
      { resource: 'lpgKg', amount: 13 },
    ]);
  });
});

describe('kcalSource', () => {
  it('says label, typical or nothing', () => {
    const size = { amount: 415, unit: 'g' as const };
    expect(kcalSource(product({ id: 'a', size, labelKcalPer100: 75 }), item('baked-beans'))).toBe(
      'label',
    );
    expect(kcalSource(product({ id: 'a', size }), item('baked-beans'))).toBe('typical');
    expect(kcalSource(product({ id: 'a', size }), undefined)).toBeUndefined();
    expect(
      kcalSource(product({ id: 'a', size: { amount: 1, unit: 'pieces' } }), item('first-aid-kit')),
    ).toBeUndefined();
    // a label on a count item is not used
    expect(
      kcalSource(
        product({ id: 'a', size: { amount: 8, unit: 'pieces' }, labelKcalPer100: 5 }),
        item('aa-cells'),
      ),
    ).toBeUndefined();
  });
});

describe('usualProduct', () => {
  const stockRow = (id: string, productId: string, qty: number, added: string): Stock => ({
    id,
    productId,
    qty,
    locationId: 'l',
    added,
    source: 'manual',
  });
  const doc = (stock: Stock[], products: Product[]): Pick<Document, 'products' | 'stock'> => ({
    products: Object.fromEntries(products.map((p) => [p.id, p])),
    stock: Object.fromEntries(stock.map((s) => [s.id, s])),
  });
  const size = { amount: 415, unit: 'g' as const };
  const beans = 'items-base:baked-beans';

  it('picks the product whose stock was added most recently', () => {
    const d = doc(
      [stockRow('s1', 'a', 20, '2026-09-01'), stockRow('s2', 'b', 1, '2026-10-01')],
      [product({ id: 'a', size, itemId: beans }), product({ id: 'b', size, itemId: beans })],
    );
    expect(usualProduct(d, beans)!.id).toBe('b');
  });

  it('then the most packs, then the name', () => {
    const same = [stockRow('s1', 'a', 2, '2026-09-01'), stockRow('s2', 'b', 5, '2026-09-01')];
    const products = [
      product({ id: 'a', name: 'Zed', size, itemId: beans }),
      product({ id: 'b', name: 'Alpha', size, itemId: beans }),
    ];
    expect(usualProduct(doc(same, products), beans)!.id).toBe('b');
    const tied = [stockRow('s1', 'a', 5, '2026-09-01'), stockRow('s2', 'b', 5, '2026-09-01')];
    expect(usualProduct(doc(tied, products), beans)!.id).toBe('b'); // Alpha before Zed
  });

  it('with none in stock, the newest product', () => {
    const d = doc(
      [],
      [
        product({ id: 'a', size, itemId: beans, added: '2026-09-01' }),
        product({ id: 'b', size, itemId: beans, added: '2026-10-01' }),
      ],
    );
    expect(usualProduct(d, beans)!.id).toBe('b');
  });

  it('prefers a product with stock over a newer one with none', () => {
    const d = doc(
      [stockRow('s1', 'a', 1, '2026-09-01')],
      [
        product({ id: 'a', size, itemId: beans, added: '2026-09-01' }),
        product({ id: 'b', size, itemId: beans, added: '2026-10-01' }),
      ],
    );
    expect(usualProduct(d, beans)!.id).toBe('a');
  });

  it('is undefined when the household has no product of the item', () => {
    expect(usualProduct(doc([], []), beans)).toBeUndefined();
    const d = doc([], [product({ id: 'a', size })]);
    expect(usualProduct(d, beans)).toBeUndefined();
  });
});

describe('usualPack', () => {
  it("is the usual product's size and gives, else the item's first size with no label", () => {
    const doc = biggarDocument();
    const beans = item('baked-beans');
    const mine = usualPack(doc, beans)!;
    expect(mine.product!.id).toBe('prod-beans');
    expect(mine.gives[0]!.amount).toBeCloseTo(415 * 0.75);
    const fish = usualPack(doc, item('tinned-fish'))!;
    expect(fish.product).toBeUndefined();
    expect(fish.size).toEqual({ amount: 145, unit: 'g' });
    expect(fish.gives[0]!.amount).toBeCloseTo(145 * 1.5);
  });

  it('never uses a product for equipment', () => {
    const pack = usualPack(biggarDocument(), item('generator'))!;
    expect(pack.product).toBeUndefined();
    expect(pack.size).toEqual({ amount: 1, unit: 'pieces' });
  });
});

describe('itemOfStock', () => {
  const doc = biggarDocument();

  it('goes through the product to the item', () => {
    expect(itemOfStock(doc, packs, doc.stock['stock-beans']!)!.id).toBe('items-base:baked-beans');
  });

  it('is undefined for a product that counts towards nothing, or one that is gone', () => {
    expect(itemOfStock(doc, packs, doc.stock['stock-twine']!)).toBeUndefined();
    expect(itemOfStock(doc, packs, { productId: 'gone' })).toBeUndefined();
  });
});
