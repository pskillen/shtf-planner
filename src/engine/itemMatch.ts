import type { Item, Size } from '../model';
import { sizeFits } from '../util';
import { localId } from './context';

/** What Open Food Facts told us about a product, as far as matching goes. */
export interface OffHints {
  /** OFF `categories_tags`, e.g. `en:canned-foods`. The order is never used (it may come back from the CRDT as a set). */
  categories: readonly string[];
  size?: Size;
}

/**
 * At most three stock items a scanned product is likely to be, best first. An item matches when
 * one of its `offCategories` is among the product's categories. Specific items come before
 * catch-alls (a local id starting `other-`), then those with more matching tags, then pack order
 * (the order of `items`). When the size is known, items whose measure it does not fit are dropped
 * (a weight for a drink). Equipment is never offered. Pure: the caller passes the items it can see.
 */
export function suggestItems(hints: OffHints, items: readonly Item[]): Item[] {
  const tags = new Set(hints.categories);
  const found: Array<{ item: Item; matches: number; general: boolean; order: number }> = [];
  items.forEach((item, order) => {
    if (item.assetTypeId !== undefined) return;
    const matches = (item.offCategories ?? []).filter((t) => tags.has(t)).length;
    if (matches === 0) return;
    if (hints.size && !sizeFits(hints.size, item.measure)) return;
    found.push({ item, matches, general: localId(item.id).startsWith('other-'), order });
  });
  found.sort(
    (a, b) => Number(a.general) - Number(b.general) || b.matches - a.matches || a.order - b.order,
  );
  return found.slice(0, 3).map((f) => f.item);
}
