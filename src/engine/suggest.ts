import type { CapabilityId, Document, ItemType, Packs } from '../model';
import { compareText } from '../util';
import { MAX_OVERSHOOT } from './assumptions';
import { activeConverters } from './coverage';
import { fitsHousehold, localId, type Person } from './context';

export interface Suggestion {
  itemTypeId?: string;
  assetTypeId?: string;
  planItemId?: string;
  qty?: number;
  label: string;
  /** The price of the whole suggestion (qty x the typical unit price), when the pack has one. */
  pricePence?: number;
  /** How much of the store one unit gives. */
  perUnitCoverage?: number;
}

export interface SuggestContext {
  packs: Packs;
  people: readonly Person[];
  /** Food that needs cooking may be suggested only when cooking is covered. */
  cookingMet: boolean;
}

const EPS = 1e-9;

/** The item tag that keeps a type out of the suggestions unless nothing else would do. */
export const NO_SUGGEST = 'no-suggest';

/**
 * The cheapest sensible ways to close a shortfall of `store`, best first (at most `limit`).
 * Each is a whole number of units of one item type. "Sensible" means the units do not overshoot
 * the shortfall by more than `MAX_OVERSHOOT` times (unless nothing else is left); they are sorted
 * by price per unit of the store, then by total price, and unpriced types come last, largest
 * unit first. Item types tagged `no-suggest` (a bath bladder, loose cells: cheap per unit but an
 * odd first answer) are used only when nothing else gives the store.
 */
export function closeStore(
  ctx: SuggestContext,
  store: string,
  shortfall: number,
  limit = 3,
): Suggestion[] {
  if (!(shortfall > EPS)) return [];
  type Candidate = { type: ItemType; per: number; units: number; total: number; price?: number };
  const all: Candidate[] = [];
  for (const type of Object.values(ctx.packs.items)) {
    // The household's own types are what it has, not something to suggest buying.
    if (type.id.startsWith('custom:')) continue;
    const give = type.gives.find((g) => g.store === store);
    if (!give || !(give.amount > 0)) continue;
    if (!fitsHousehold(type, ctx.people)) continue;
    if (type.tags.includes('needs-cooking') && !ctx.cookingMet) continue;
    const units = Math.max(1, Math.ceil(shortfall / give.amount - EPS));
    all.push({
      type,
      per: give.amount,
      units,
      total: units * give.amount,
      ...(type.typicalPricePence !== undefined ? { price: units * type.typicalPricePence } : {}),
    });
  }
  const usual = all.filter((c) => !c.type.tags.includes(NO_SUGGEST));
  const candidates = usual.length > 0 ? usual : all;
  const sensible = candidates.filter((c) => c.total <= shortfall * MAX_OVERSHOOT + EPS);
  const pool = sensible.length > 0 ? sensible : candidates;
  const perUnitPrice = (c: Candidate) => (c.type.typicalPricePence ?? 0) / c.per;
  pool.sort((a, b) => {
    const pa = a.price !== undefined;
    const pb = b.price !== undefined;
    if (pa !== pb) return pa ? -1 : 1;
    if (!pa) return b.per - a.per;
    return (
      perUnitPrice(a) - perUnitPrice(b) || a.price! - b.price! || compareText(a.type.id, b.type.id)
    );
  });
  return pool.slice(0, limit).map((c) => ({
    itemTypeId: c.type.id,
    qty: c.units,
    label: `${c.units} × ${c.type.name}`,
    ...(c.price !== undefined ? { pricePence: c.price } : {}),
    perUnitCoverage: c.per,
  }));
}

/**
 * How to close a shortfall of running hours of `capability` (heat, cooking). With a converter
 * already owned it is the fuel for it. With none, it is the cheapest converter the packs know and
 * the fuel for it, as two suggestions.
 */
export function closeHours(
  ctx: SuggestContext,
  doc: Document,
  capability: CapabilityId,
  shortfallHours: number,
): Suggestion[] {
  if (!(shortfallHours > EPS)) return [];
  const owned = activeConverters(doc, ctx.packs).filter((c) => c.capability === capability);
  if (owned.length > 0) {
    const out: Suggestion[] = [];
    for (const store of [...new Set(owned.map((c) => c.store))].sort()) {
      const best = owned
        .filter((c) => c.store === store)
        .reduce((a, b) => (b.output / b.perHour > a.output / a.perHour ? b : a));
      const fuel = closeStore(ctx, store, (shortfallHours / best.output) * best.perHour, 1)[0];
      if (fuel) out.push({ ...fuel, label: `${fuel.label} for the ${best.name}` });
    }
    return out;
  }

  type Option = { assetTypeId: string; item?: ItemType; fuel?: Suggestion; total?: number };
  const options: Option[] = [];
  for (const asset of Object.values(ctx.packs.assets)) {
    const c = asset.contributes.find((x) => x.capability === capability && x.converts?.perHour);
    if (!c?.converts?.perHour) continue;
    const item = Object.values(ctx.packs.items).find((i) => localId(i.id) === localId(asset.id));
    const fuel = closeStore(ctx, c.converts.store, shortfallHours * c.converts.perHour, 1)[0];
    const price =
      item?.typicalPricePence !== undefined && fuel?.pricePence !== undefined
        ? item.typicalPricePence + fuel.pricePence
        : undefined;
    options.push({
      assetTypeId: asset.id,
      ...(item ? { item } : {}),
      ...(fuel ? { fuel } : {}),
      ...(price !== undefined ? { total: price } : {}),
    });
  }
  options.sort((a, b) => {
    const pa = a.total !== undefined;
    const pb = b.total !== undefined;
    if (pa !== pb) return pa ? -1 : 1;
    return (a.total ?? 0) - (b.total ?? 0) || compareText(a.assetTypeId, b.assetTypeId);
  });
  const best = options.find((o) => o.item && o.total !== undefined) ?? options[0];
  if (!best) return [];
  const name = best.item?.name ?? ctx.packs.assets[best.assetTypeId]!.name;
  const out: Suggestion[] = [
    {
      assetTypeId: best.assetTypeId,
      ...(best.item ? { itemTypeId: best.item.id } : {}),
      qty: 1,
      label: `1 × ${name}`,
      ...(best.item?.typicalPricePence !== undefined
        ? { pricePence: best.item.typicalPricePence }
        : {}),
    },
  ];
  if (best.fuel) out.push({ ...best.fuel, label: `${best.fuel.label} to run it` });
  return out;
}
