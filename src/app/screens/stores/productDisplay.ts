import { kcalSource } from '../../../engine';
import type { Document, Item, Product } from '../../../model';
import { formatSize } from '../../../util';
import { groupItemsForPicker } from './pickerHelpers';

/** "label: 75 kcal per 100 g" or "typical for Baked beans: 84 kcal per 100 g". */
export function productKcalLine(product: Product, item: Item | undefined): string | undefined {
  const source = kcalSource(product, item);
  if (!source || !item) return undefined;
  const per = item.measure === 'volume' ? 'ml' : 'g';
  if (source === 'label') {
    return `label: ${Math.round(product.labelKcalPer100 ?? 0)} kcal per 100 ${per}`;
  }
  const food = item.gives.find((g) => g.resource === 'foodKcal');
  if (!food) return undefined;
  return `typical for ${item.name}: ${Math.round(food.amount)} kcal per 100 ${per}`;
}

export function barcodeCount(doc: Pick<Document, 'barcodes'>, productId: string): number {
  return Object.values(doc.barcodes).filter((b) => b.productId === productId).length;
}

export type ProductListGroup = {
  item: Item | undefined;
  label: string;
  products: Product[];
};

/** Every household product, grouped by pack item (aisle order) plus a last group with no item. */
export function groupAllProducts(
  doc: Pick<Document, 'products'>,
  items: readonly Item[],
): { groups: ProductListGroup[]; nothing: Product[] } {
  const byItem = new Map<string, Product[]>();
  const nothing: Product[] = [];
  for (const p of Object.values(doc.products)) {
    if (!p.itemId) nothing.push(p);
    else {
      const list = byItem.get(p.itemId) ?? [];
      list.push(p);
      byItem.set(p.itemId, list);
    }
  }
  const sort = (a: Product, b: Product) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const groups: ProductListGroup[] = [];
  for (const g of groupItemsForPicker(items)) {
    for (const item of g.items) {
      const prods = byItem.get(item.id);
      if (prods?.length) {
        groups.push({ item, label: item.name, products: prods.sort(sort) });
        byItem.delete(item.id);
      }
    }
  }
  for (const prods of byItem.values()) {
    groups.push({
      item: undefined,
      label: prods[0]?.itemId ?? 'Unknown item',
      products: prods.sort(sort),
    });
  }
  return { groups, nothing: nothing.sort(sort) };
}

export function productSizeLine(product: Product): string {
  return formatSize(product.size);
}
