import type { CapabilityId, Document, Item, Packs, Size } from '../model';
import { baseAmount, compareText, formatSize } from '../util';
import { MAX_OVERSHOOT } from './assumptions';
import { activeConverters } from './coverage';
import { fitsHousehold, type Person } from './context';
import { packGives, usualProduct } from './products';

export interface Suggestion {
  itemId?: string;
  /** The household's usual product of the item, when it has one. */
  productId?: string;
  assetTypeId?: string;
  assetId?: string;
  assetIds?: string[];
  alternativeGroup?: string;
  /** Resource units still required by this fuel option. */
  fuelDemand?: number;
  capabilities?: CapabilityId[];
  question?: string;
  planItemId?: string;
  /** Packs of `size`: the usual product's, else the item's usual size. */
  qty?: number;
  size?: Size;
  /** How much of the item is needed, in base units (g, ml or pieces). */
  amount?: number;
  /** "Dried pasta: about 5 kg more"; equipment "1 × Portable power station (500 Wh)". */
  label: string;
  /** "10 × Tesco fusilli 500 g", or "10 × 500 g bags" with no product of the item. */
  detail?: string;
  /** The price of the whole suggestion (qty x the typical pack price), when the pack has one. */
  pricePence?: number;
  /** How much of the resource one pack gives. */
  perUnitCoverage?: number;
}

export interface SuggestContext {
  doc: Document;
  packs: Packs;
  people: readonly Person[];
  /** Food that needs cooking may be suggested only when cooking is covered. */
  cookingMet: boolean;
}

const EPS = 1e-9;

/** Unit prices this close (a fraction) count as equal when ranking suggestions. */
const NEAR_PRICE = 0.2;

/** The item tag that keeps a type out of the suggestions unless nothing else would do. */
export const NO_SUGGEST = 'no-suggest';

/** "about 5 kg", "about 700 ml", "16": a base-unit amount for people, rounded up. */
function roundedAmount(measure: Item['measure'], base: number): { text: string; base: number } {
  if (measure === 'count') {
    const n = Math.max(1, Math.ceil(base - EPS));
    return { text: `${n}`, base: n };
  }
  const step = base < 1000 ? 100 : 500;
  const rounded = Math.max(step, Math.ceil(base / step - EPS) * step);
  const unit = measure === 'mass' ? ['g', 'kg'] : ['ml', 'L'];
  const text =
    rounded >= 1000
      ? `${Math.round((rounded / 1000) * 10) / 10} ${unit[1]}`
      : `${rounded} ${unit[0]}`;
  return { text: `about ${text}`, base: rounded };
}

const plural = (word: string, n: number): string =>
  n === 1 ? word : word.endsWith('ch') || word.endsWith('x') ? `${word}es` : `${word}s`;

/**
 * The cheapest sensible ways to close a shortfall of `resource`, best first (at most `limit`).
 * Each is a whole number of packs of one item. A pack is the household's usual product of the item
 * (its size, and its label kcal when it has one) or else the item's usual size. "Sensible" means
 * the packs do not overshoot the shortfall by more than `MAX_OVERSHOOT` times (unless nothing else
 * is left); they are sorted by price per unit of the resource, then by total price, and unpriced
 * items come last, largest pack first. Items tagged `no-suggest` (a bath bladder, loose cells:
 * cheap per unit but an odd first answer) are used only when nothing else gives the resource.
 */
export function closeResource(
  ctx: SuggestContext,
  resource: string,
  shortfall: number,
  limit = 3,
  onlyItemId?: string,
): Suggestion[] {
  if (!(shortfall > EPS)) return [];
  type Candidate = {
    item: Item;
    size: Size;
    productId?: string;
    productName?: string;
    per: number;
    units: number;
    total: number;
    /** Resource per base unit of the item, to say how much of the item is needed. */
    perBase: number;
    packPrice?: number;
    price?: number;
  };
  const all: Candidate[] = [];
  for (const item of Object.values(ctx.packs.items)) {
    if (onlyItemId && item.id !== onlyItemId) continue;
    if (!item.gives.some((g) => g.resource === resource)) continue;
    if (!fitsHousehold(item, ctx.people)) continue;
    if (item.tags.includes('needs-cooking') && !ctx.cookingMet) continue;
    const usual = item.assetTypeId ? undefined : usualProduct(ctx.doc, item.id);
    const size = usual?.size ?? item.sizes[0];
    if (!size) continue;
    const per =
      packGives(usual ?? { size }, item).find((g) => g.resource === resource)?.amount ?? 0;
    if (!(per > 0)) continue;
    const first = item.sizes[0];
    const packPrice =
      item.typicalPricePence !== undefined && first
        ? Math.round((item.typicalPricePence * baseAmount(size)) / baseAmount(first))
        : undefined;
    const units = Math.max(1, Math.ceil(shortfall / per - EPS));
    all.push({
      item,
      size,
      ...(usual ? { productId: usual.id, productName: usual.name } : {}),
      per,
      units,
      total: units * per,
      perBase: per / baseAmount(size),
      ...(packPrice !== undefined ? { packPrice, price: units * packPrice } : {}),
    });
  }
  const usual = all.filter((c) => !c.item.tags.includes(NO_SUGGEST));
  const candidates = usual.length > 0 ? usual : all;
  const sensible = candidates.filter((c) => c.total <= shortfall * MAX_OVERSHOOT + EPS);
  const pool = sensible.length > 0 ? sensible : candidates;
  const perUnitPrice = (c: Candidate) => (c.packPrice ?? 0) / c.per;
  // Those within `NEAR_PRICE` of the best price per unit are on a par: the one that costs least
  // in total leads (so a trade-size sack never leads a small shortfall), then the one that
  // overshoots least. Dearer per unit than that come after, cheapest per unit first. The tier is
  // measured from the single best price, so the order is the same however the packs are listed.
  const priced = pool.filter((c) => c.price !== undefined).map(perUnitPrice);
  const best = priced.length > 0 ? Math.min(...priced) : 0;
  const onPar = (c: Candidate) =>
    c.price !== undefined && perUnitPrice(c) <= best * (1 + NEAR_PRICE) + EPS;
  pool.sort((a, b) => {
    const pa = a.price !== undefined;
    const pb = b.price !== undefined;
    if (pa !== pb) return pa ? -1 : 1;
    if (!pa) return b.per - a.per;
    const [ta, tb] = [onPar(a), onPar(b)];
    if (ta !== tb) return ta ? -1 : 1;
    if (ta) return a.price! - b.price! || a.total - b.total || compareText(a.item.id, b.item.id);
    return (
      perUnitPrice(a) - perUnitPrice(b) || a.price! - b.price! || compareText(a.item.id, b.item.id)
    );
  });
  return pool.slice(0, limit).map((c): Suggestion => {
    const { item } = c;
    const common = {
      itemId: item.id,
      ...(c.productId ? { productId: c.productId } : {}),
      // Equipment is bought, then added under Home, Equipment: say which type it is.
      ...(item.assetTypeId ? { assetTypeId: item.assetTypeId } : {}),
      qty: c.units,
      size: c.size,
      ...(c.price !== undefined ? { pricePence: c.price } : {}),
      perUnitCoverage: c.per,
    };
    if (item.assetTypeId) {
      return { ...common, amount: c.units, label: `${c.units} × ${item.name}` };
    }
    const needed = roundedAmount(item.measure, shortfall / c.perBase);
    const tap = item.tags.includes('refillable') ? ', to fill from the tap' : '';
    const single = !c.size.count && c.size.amount === 1 && c.size.unit === 'pieces';
    const packs = c.productName
      ? `${c.units} × ${c.productName}`
      : single
        ? ''
        : c.size.count || item.measure === 'count'
          ? `${c.units} ${plural('pack', c.units)} of ${formatSize(c.size)}`
          : `${c.units} × ${formatSize(c.size)} ${plural(item.unit === 'each' ? 'pack' : item.unit, c.units)}`;
    const detail = `${packs}${tap}`.replace(/^, /, '');
    return {
      ...common,
      amount: needed.base,
      label: `${item.name}: ${needed.text} more`,
      ...(detail ? { detail } : {}),
    };
  });
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
  const out: Suggestion[] = [];
  for (const itemId of [...new Set(owned.map((c) => c.itemId))].sort()) {
    const choices = owned
      .filter((c) => c.itemId === itemId)
      .sort(
        (a, b) =>
          b.output / b.perHour - a.output / a.perHour || a.asset.id.localeCompare(b.asset.id),
      );
    const best = choices[0]!;
    const fuel = closeResource(
      ctx,
      best.resource,
      (shortfallHours / best.output) * best.perHour,
      1,
      itemId,
    )[0];
    if (fuel)
      out.push({
        ...fuel,
        label: `${fuel.label} for the ${best.name}`,
        assetIds: choices.map((c) => c.asset.id),
        alternativeGroup: `${capability}:fuel`,
        fuelDemand: (shortfallHours / best.output) * best.perHour,
        capabilities: [capability],
      });
  }
  if (out.length) return out;
  if (
    capability === 'heat' &&
    !Object.values(doc.assets).some((a) =>
      ctx.packs.assets[a.typeId]?.contributes.some((c) => c.capability === 'heat' && c.converts),
    )
  )
    return [{ label: 'Choose how you will keep warm' }];
  return [];
}
