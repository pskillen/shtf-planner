import type { Document, Packs, Size } from '../model';

/**
 * Test helper: puts `qty` packs of an item into a draft document, making the product for it (the
 * item's usual size unless `size` is given). The product id is `prod-<id>`, the stock id `<id>`.
 * Local item ids are those of `items-base`.
 */
export function addStock(
  doc: Document,
  packs: Packs,
  o: {
    id: string;
    item: string;
    qty: number;
    locationId: string;
    bestBefore?: string;
    size?: Size;
    name?: string;
    labelKcalPer100?: number;
    added?: string;
  },
): { productId: string; stockId: string } {
  const itemId = `items-base:${o.item}`;
  const item = packs.items[itemId];
  if (!item) throw new Error(`no item ${itemId}`);
  const productId = `prod-${o.id}`;
  const added = o.added ?? '2026-09-01';
  doc.products[productId] = {
    id: productId,
    name: o.name ?? `${item.name} ${o.id}`,
    itemId,
    size: o.size ?? item.sizes[0]!,
    ...(o.labelKcalPer100 !== undefined ? { labelKcalPer100: o.labelKcalPer100 } : {}),
    added,
  };
  doc.stock[o.id] = {
    id: o.id,
    productId,
    qty: o.qty,
    locationId: o.locationId,
    ...(o.bestBefore ? { bestBefore: o.bestBefore } : {}),
    added,
    source: 'manual',
  };
  return { productId, stockId: o.id };
}
