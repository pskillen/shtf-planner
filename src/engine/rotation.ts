import { monthOf } from './dates';
import { itemOfStock } from './products';
import type { Document, Packs } from '../model';

/**
 * Per item, the batch to use first: the earliest best-before that has not passed (this month
 * counts), across all the item's products. Ties go to the batch added first, then the lower id.
 * Undated stock and expired stock are never first. Returns item id to stock id; an item with no
 * live dated batch is absent.
 */
export function useFirst(doc: Document, packs: Packs, asOf: string): ReadonlyMap<string, string> {
  const month = monthOf(asOf);
  const best = new Map<string, Document['stock'][string]>();
  for (const stock of Object.values(doc.stock)) {
    if (!stock.bestBefore || stock.bestBefore < month) continue;
    const item = itemOfStock(doc, packs, stock);
    if (!item) continue;
    const cur = best.get(item.id);
    if (
      !cur ||
      stock.bestBefore < cur.bestBefore! ||
      (stock.bestBefore === cur.bestBefore &&
        (stock.added < cur.added || (stock.added === cur.added && stock.id < cur.id)))
    )
      best.set(item.id, stock);
  }
  return new Map([...best].map(([itemId, stock]) => [itemId, stock.id]));
}
