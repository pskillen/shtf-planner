import type { Category, Item } from '../../../model';
import { productsOfItem } from './products';

export type ItemPickerGroup = {
  category: Category;
  /** Empty when the item has no heading in the pack. */
  heading: string;
  items: Item[];
};

/** Category and heading groups in pack aisle order (contiguous headings). */
export function groupItemsForPicker(items: readonly Item[]): ItemPickerGroup[] {
  const groups: ItemPickerGroup[] = [];
  for (const item of items) {
    const heading = item.heading ?? '';
    const last = groups.at(-1);
    if (last && last.category === item.category && last.heading === heading) last.items.push(item);
    else groups.push({ category: item.category, heading, items: [item] });
  }
  return groups;
}

/** One quick size and no household products yet: the size step adds nothing. */
export function shouldSkipSizeStep(
  doc: Pick<import('../../../model').Document, 'products'>,
  item: Item,
): boolean {
  return item.sizes.length === 1 && productsOfItem(doc, item.id).length === 0;
}
