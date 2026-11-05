import { expiryLevel, expiryWindows, useFirst, type ExpiryLevel } from '../../../engine';
import type { Document, Item, Location, Packs, Product, Settings, Stock } from '../../../model';
import { minimumKey } from '../../../model';
import { baseAmount, formatQty } from '../../../util';
import { EXPIRY_LABEL } from '../../labels';
import { groupItemsForPicker } from './pickerHelpers';

const LEVEL_RANK: Record<ExpiryLevel, number> = {
  expired: 0,
  soon: 1,
  check: 2,
  ok: 3,
};

/** Total stock in the item's base measure (g, ml or pieces). */
export function sumItemBase(
  doc: Pick<Document, 'stock' | 'products'>,
  itemId: string,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): number {
  let total = 0;
  for (const s of Object.values(doc.stock)) {
    if (skipStock.has(s.id)) continue;
    if (placeId !== 'all' && s.locationId !== placeId) continue;
    const product = doc.products[s.productId];
    if (product?.itemId !== itemId) continue;
    total += s.qty * baseAmount(product.size);
  }
  return total;
}

export function sumProductPacks(
  doc: Pick<Document, 'stock' | 'products'>,
  productId: string,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): number {
  let total = 0;
  for (const s of Object.values(doc.stock)) {
    if (skipStock.has(s.id)) continue;
    if (s.productId !== productId) continue;
    if (placeId !== 'all' && s.locationId !== placeId) continue;
    total += s.qty;
  }
  return total;
}

/** "5.8 kg", "700 ml", "14 pieces" from a base-unit total. */
export function formatItemMeasureTotal(measure: Item['measure'], base: number): string {
  if (measure === 'count') {
    const n = Math.round(base);
    return `${n} ${n === 1 ? 'piece' : 'pieces'}`;
  }
  if (base >= 1000) {
    const n = Math.round((base / 1000) * 10) / 10;
    return `${n} ${measure === 'mass' ? 'kg' : 'L'}`;
  }
  const n = Math.round(base);
  return `${n} ${measure === 'mass' ? 'g' : 'ml'}`;
}

const pluralUnit = (unit: string, n: number): string => {
  if (n === 1) return unit;
  if (unit === 'each') return unit;
  return unit.endsWith('ch') || unit.endsWith('x') ? `${unit}es` : `${unit}s`;
};

/** "14 tins", "1½ jars". */
export function formatPackTotal(qty: number, unit: string): string {
  return `${formatQty(qty)} ${pluralUnit(unit, qty)}`;
}

export function worstExpiryLevel(
  stocks: readonly Stock[],
  todayIso: string,
  settings: Pick<Settings, 'expirySoonMonths' | 'expiryCheckMonths'>,
): ExpiryLevel | undefined {
  const w = expiryWindows(settings);
  let worst: ExpiryLevel | undefined;
  for (const s of stocks) {
    if (!s.bestBefore) continue;
    const level = expiryLevel(s.bestBefore, todayIso, w);
    if (level === 'ok') continue;
    if (worst === undefined || LEVEL_RANK[level] < LEVEL_RANK[worst]) worst = level;
  }
  return worst;
}

export function worstExpiryWord(
  stocks: readonly Stock[],
  todayIso: string,
  settings: Pick<Settings, 'expirySoonMonths' | 'expiryCheckMonths'>,
): string | undefined {
  const worst = worstExpiryLevel(stocks, todayIso, settings);
  return worst && worst !== 'ok' ? EXPIRY_LABEL[worst] : undefined;
}

export function itemIdsInView(
  doc: Pick<Document, 'stock' | 'products' | 'minimums'>,
  placeId: string | 'all',
): Set<string> {
  const ids = new Set<string>();
  for (const s of Object.values(doc.stock)) {
    if (placeId !== 'all' && s.locationId !== placeId) continue;
    const itemId = doc.products[s.productId]?.itemId;
    if (itemId) ids.add(itemId);
  }
  if (placeId !== 'all') {
    for (const key of Object.keys(doc.minimums)) {
      const [locId, itemId] = key.split('|') as [string, string];
      if (locId === placeId) ids.add(itemId);
    }
  } else {
    for (const key of Object.keys(doc.minimums)) {
      const [, itemId] = key.split('|') as [string, string];
      ids.add(itemId);
    }
  }
  return ids;
}

export function nothingProductIds(
  doc: Pick<Document, 'stock' | 'products'>,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): string[] {
  const ids = new Set<string>();
  for (const s of Object.values(doc.stock)) {
    if (skipStock.has(s.id)) continue;
    if (placeId !== 'all' && s.locationId !== placeId) continue;
    const product = doc.products[s.productId];
    if (product && !product.itemId) ids.add(product.id);
  }
  return [...ids].sort((a, b) =>
    (doc.products[a]?.name ?? a).localeCompare(doc.products[b]?.name ?? b),
  );
}

/** Pack items that appear in the view, in category and heading order. */
export function orderedItemsInView(packs: Packs, itemIds: ReadonlySet<string>): Item[] {
  const all = Object.values(packs.items);
  const groups = groupItemsForPicker(all);
  const out: Item[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      if (itemIds.has(item.id)) out.push(item);
    }
  }
  return out;
}

export function batchesForProduct(
  doc: Pick<Document, 'stock' | 'locations'>,
  productId: string,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): Stock[] {
  return Object.values(doc.stock)
    .filter(
      (s) =>
        s.productId === productId &&
        !skipStock.has(s.id) &&
        (placeId === 'all' || s.locationId === placeId),
    )
    .sort((a, b) => {
      const ma = a.bestBefore ?? '9999-99';
      const mb = b.bestBefore ?? '9999-99';
      if (ma !== mb) return ma.localeCompare(mb);
      return a.id.localeCompare(b.id);
    });
}

export function productsOfItemInDoc(
  doc: Pick<Document, 'products' | 'stock'>,
  itemId: string,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): Product[] {
  const ids = new Set<string>();
  for (const s of Object.values(doc.stock)) {
    if (skipStock.has(s.id)) continue;
    if (placeId !== 'all' && s.locationId !== placeId) continue;
    const p = doc.products[s.productId];
    if (p?.itemId === itemId) ids.add(p.id);
  }
  return [...ids].map((id) => doc.products[id]!).sort((a, b) => a.name.localeCompare(b.name));
}

export function locationName(doc: Pick<Document, 'locations'>, locationId: string): string {
  return doc.locations[locationId]?.name ?? 'Unknown place';
}

export function rotatingPlaces(doc: Pick<Document, 'locations'>): Location[] {
  return Object.values(doc.locations)
    .filter((l) => l.kind === 'rotating')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useFirstMap(
  doc: Document,
  packs: Packs,
  todayIso: string,
): ReadonlyMap<string, string> {
  return useFirst(doc, packs, todayIso);
}

export function minBadgesForItem(
  doc: Pick<Document, 'minimums' | 'locations'>,
  itemId: string,
): { locationId: string; name: string; min: number }[] {
  const out: { locationId: string; name: string; min: number }[] = [];
  for (const loc of rotatingPlaces(doc)) {
    const min = doc.minimums[minimumKey(loc.id, itemId)];
    if (min !== undefined) out.push({ locationId: loc.id, name: loc.name, min });
  }
  return out;
}

export function totalPacksForItem(
  doc: Pick<Document, 'stock' | 'products'>,
  itemId: string,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): number {
  let total = 0;
  for (const s of Object.values(doc.stock)) {
    if (skipStock.has(s.id)) continue;
    if (placeId !== 'all' && s.locationId !== placeId) continue;
    if (doc.products[s.productId]?.itemId !== itemId) continue;
    total += s.qty;
  }
  return total;
}

export function stocksForItem(
  doc: Pick<Document, 'stock' | 'products'>,
  itemId: string,
  placeId: string | 'all',
  skipStock: ReadonlySet<string>,
): Stock[] {
  return Object.values(doc.stock).filter((s) => {
    if (skipStock.has(s.id)) return false;
    if (placeId !== 'all' && s.locationId !== placeId) return false;
    return doc.products[s.productId]?.itemId === itemId;
  });
}
