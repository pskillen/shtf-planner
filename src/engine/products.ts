import type { Document, Item, Packs, Product, ResourceId, Size, Stock } from '../model';
import { baseAmount } from '../util';

/**
 * What one pack of `product` gives, through its item: the size's total (g, ml or pieces) times the
 * item's gives per base unit. For a food figure on a mass or volume item, the product's label kcal
 * (per 100 g or 100 ml) replaces the item's typical figure; a diet drink with a label of 0 gives
 * 0 kcal. A `count` item ignores label kcal.
 */
export function packGives(
  product: Pick<Product, 'size' | 'labelKcalPer100'>,
  item: Item,
): { resource: ResourceId; amount: number }[] {
  const base = baseAmount(product.size);
  return item.gives.map((g) => {
    const useLabel =
      g.resource === 'foodKcal' &&
      item.measure !== 'count' &&
      product.labelKcalPer100 !== undefined;
    return {
      resource: g.resource,
      amount: useLabel ? (base * product.labelKcalPer100!) / 100 : (base * g.amount) / g.per,
    };
  });
}

/**
 * Where a product's calories come from, for display: the label, the item's typical figure, or
 * none (the item has no food figure, or the product counts towards nothing).
 */
export function kcalSource(
  product: Product,
  item: Item | undefined,
): 'label' | 'typical' | undefined {
  if (!item || !item.gives.some((g) => g.resource === 'foodKcal')) return undefined;
  if (item.measure !== 'count' && product.labelKcalPer100 !== undefined) return 'label';
  return 'typical';
}

/**
 * The household's usual product of an item: the one whose stock was added most recently (then the
 * most packs, then name); with none in stock, the newest product (then name).
 */
export function usualProduct(
  doc: Pick<Document, 'products' | 'stock'>,
  itemId: string,
): Product | undefined {
  const mine = Object.values(doc.products).filter((p) => p.itemId === itemId);
  if (mine.length === 0) return undefined;
  const latest = new Map<string, string>();
  const packs = new Map<string, number>();
  for (const s of Object.values(doc.stock)) {
    const added = latest.get(s.productId);
    if (added === undefined || s.added > added) latest.set(s.productId, s.added);
    packs.set(s.productId, (packs.get(s.productId) ?? 0) + s.qty);
  }
  const held = mine.filter((p) => latest.has(p.id));
  if (held.length > 0) {
    return [...held].sort(
      (a, b) =>
        latest.get(b.id)!.localeCompare(latest.get(a.id)!) ||
        packs.get(b.id)! - packs.get(a.id)! ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )[0];
  }
  return [...mine].sort(
    (a, b) =>
      b.added.localeCompare(a.added) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  )[0];
}

/**
 * The item a stock row counts as, through its product; undefined when it counts towards nothing
 * or the product (or its item) is gone.
 */
export function itemOfStock(
  doc: Pick<Document, 'products'>,
  packs: Pick<Packs, 'items'>,
  stock: Pick<Stock, 'productId'>,
): Item | undefined {
  const itemId = doc.products[stock.productId]?.itemId;
  return itemId === undefined ? undefined : packs.items[itemId];
}

/**
 * The pack a restock or a purchase is counted in: the household's usual product of the item (its
 * size, its label kcal) or else the item's usual size with no label. Undefined for an item with no
 * size.
 */
export function usualPack(
  doc: Pick<Document, 'products' | 'stock'>,
  item: Item,
):
  { product?: Product; size: Size; gives: { resource: ResourceId; amount: number }[] } | undefined {
  const product = item.assetTypeId ? undefined : usualProduct(doc, item.id);
  const size = product?.size ?? item.sizes[0];
  if (!size) return undefined;
  return { ...(product ? { product } : {}), size, gives: packGives(product ?? { size }, item) };
}
