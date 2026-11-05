import type {
  Condition,
  Document,
  Item,
  Location,
  Packs,
  Product,
  Size,
  Stock,
} from '../../../model';
import { formatSize, normaliseGtin, sameSize } from '../../../util';

/** How a place's condition reads in "Water can may freeze in the Shed". */
const PHRASE: Record<Exclude<Condition, 'indoor-stable'>, string> = {
  frost: 'freeze',
  heat: 'get too hot',
  damp: 'get damp',
};

/**
 * Why this item does not suit this place, or undefined when it does. A place's conditions
 * (frost, heat, damp) must each be in the type's `suitability`; `indoor-stable` asks for nothing.
 */
export function suitabilityWarning(
  type: Pick<Item, 'name' | 'suitability'>,
  location: Pick<Location, 'name' | 'conditions'>,
): string | undefined {
  const bad = location.conditions.filter(
    (c): c is Exclude<Condition, 'indoor-stable'> =>
      c !== 'indoor-stable' && !type.suitability.includes(c),
  );
  if (bad.length === 0) return undefined;
  const what = bad.map((c) => PHRASE[c]);
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} or ${what.at(-1)}` : what[0];
  return `${type.name} may ${list} in the ${location.name}`;
}

// ---- best-before months ---------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03" as "Mar 2027"; anything that is not a year-month is returned as it is. */
export function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  const month = m ? Number(m[2]) : 0;
  return m && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${m[1]}` : ym;
}

const monthIndex = (ym: string): number => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : NaN;
};

/** The `YYYY-MM` of a `YYYY-MM-DD` date. */
export const monthOfDate = (date: string): string => date.slice(0, 7);

/** `ym` moved by `months` (negative goes back). */
export function addMonthsYM(ym: string, months: number): string {
  const index = monthIndex(ym) + months;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * A best-before typed by hand as "2027-03", "03/2027", "3/2027" or "Mar 2027", read as
 * `YYYY-MM`; undefined when it is not a real month. A two-digit year ("3/27") is 20xx.
 */
export function parseMonth(text: string): string | undefined {
  const t = text.trim();
  let year: number | undefined;
  let month: number | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(t))) [year, month] = [Number(m[1]), Number(m[2])];
  else if ((m = /^(\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t)))
    [year, month] = [Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]), Number(m[1])];
  else if ((m = /^([A-Za-z]{3})[a-z]*\.? (\d{4})$/.exec(t))) {
    const at = MONTHS.findIndex((name) => name.toLowerCase() === m![1]!.toLowerCase());
    if (at >= 0) [year, month] = [Number(m[2]), at + 1];
  }
  if (year === undefined || month === undefined || month < 1 || month > 12) return undefined;
  if (year < 2000 || year > 2200) return undefined;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface MonthChip {
  label: string;
  value: string;
}

/**
 * The one-tap best-before choices for an item, from how long it keeps: "+1 y", "+2 y" and
 * "+5 y" for things that keep for years; fewer for things that keep for less; none for things
 * that do not go off.
 */
export function monthChips(shelfLife: Item['shelfLife'], todayIso: string): MonthChip[] {
  const now = monthOfDate(todayIso);
  const steps: Record<Item['shelfLife'], Array<[string, number]>> = {
    none: [],
    years: [
      ['+1 y', 12],
      ['+2 y', 24],
      ['+5 y', 60],
    ],
    year: [
      ['+6 m', 6],
      ['+1 y', 12],
    ],
    months: [
      ['+3 m', 3],
      ['+6 m', 6],
      ['+1 y', 12],
    ],
    weeks: [
      ['+1 m', 1],
      ['+2 m', 2],
    ],
  };
  return steps[shelfLife].map(([label, n]) => ({ label, value: addMonthsYM(now, n) }));
}

// ---- remembered choices (per device, never in the document) --------------------------------

const LAST_LOCATION_KEY = 'shtf.lastLocationId';
const RECENT_KEY = 'shtf.recentItems';
const RECENT_PRODUCTS_KEY = 'shtf.recentProducts';
const RECENT_MAX = 12;

const read = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private mode or storage off: the choice is just not remembered.
  }
};

export const readLastLocation = (): string | null => read(LAST_LOCATION_KEY);
export const writeLastLocation = (id: string): void => write(LAST_LOCATION_KEY, id);

/** Item ids added lately on this device, newest first. */
export function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function pushRecent(itemId: string): void {
  write(
    RECENT_KEY,
    JSON.stringify([itemId, ...readRecent().filter((t) => t !== itemId)].slice(0, RECENT_MAX)),
  );
}

/** Product ids added lately on this device, newest first. */
export function readRecentProducts(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_PRODUCTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentProduct(productId: string): void {
  write(
    RECENT_PRODUCTS_KEY,
    JSON.stringify(
      [productId, ...readRecentProducts().filter((id) => id !== productId)].slice(0, RECENT_MAX),
    ),
  );
}

/**
 * Where a new item most likely goes: the place that already holds the most packs of it (through
 * its products), else the place last used, else the fullest place (the most stock records; a tie
 * goes to the first by name). Empty when there are no places.
 */
export function defaultLocationId(
  doc: Pick<Document, 'stock' | 'products' | 'locations'>,
  itemId: string,
  lastUsed: string | null,
): string {
  const places = Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name));
  const best = (score: (id: string) => number): string | undefined => {
    let top: string | undefined;
    let most = 0;
    for (const l of places) {
      const n = score(l.id);
      if (n > most) [top, most] = [l.id, n];
    }
    return top;
  };
  const rows = Object.values(doc.stock);
  return (
    best((id) =>
      rows
        .filter((r) => r.locationId === id && doc.products[r.productId]?.itemId === itemId)
        .reduce((n, r) => n + r.qty, 0),
    ) ??
    (lastUsed && doc.locations[lastUsed] ? lastUsed : undefined) ??
    best((id) => rows.filter((r) => r.locationId === id).length) ??
    places[0]?.id ??
    ''
  );
}

// ---- searching and adding -------------------------------------------------------------------

/**
 * Items that match a search, recent ones first. An empty search lists recent items and then all
 * of them in the order given (the pack's aisle order); a search matches the name, the heading, the
 * category, the tags and what it counts as.
 */
export function matchItems(
  items: readonly Item[],
  query: string,
  recent: readonly string[] = [],
): Item[] {
  const q = query.trim().toLowerCase();
  const rank = (t: Item) => {
    const at = recent.indexOf(t.id);
    return at < 0 ? Infinity : at;
  };
  return items
    .map((item, order) => ({ item, order }))
    .filter(
      ({ item: t }) =>
        q === '' ||
        [t.name, t.heading ?? '', t.category, t.countsAs, ...t.tags].some((s) =>
          s.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => rank(a.item) - rank(b.item) || a.order - b.order)
    .map((x) => x.item);
}

/** The item's usual size: the first of its quick sizes. */
export const usualSize = (item: Item): Size => item.sizes[0]!;

// ---- products ---------------------------------------------------------------------------------

export interface NewProduct {
  /** Absent: a name made from the item and size. */
  name?: string;
  /** Absent: the product counts towards nothing. */
  itemId?: string;
  size: Size;
  /** kcal per 100 g or 100 ml from the label (only kept for a mass or volume item). */
  labelKcalPer100?: number;
}

/** "Baked beans 415 g"; with no item, "Product 415 g". */
export const defaultProductName = (item: Item | undefined, size: Size): string =>
  `${item?.name ?? 'Product'} ${formatSize(size)}`;

/** Same item, same name (trimmed, case-insensitive) and same size: the product already there. */
export function findProduct(
  doc: Pick<Document, 'products'>,
  p: { itemId?: string; name: string; size: Size },
): Product | undefined {
  const name = p.name.trim().toLowerCase();
  return Object.values(doc.products).find(
    (x) =>
      x.itemId === p.itemId && x.name.trim().toLowerCase() === name && sameSize(x.size, p.size),
  );
}

/**
 * The product for a draft: the one already there for the same item, name and size, else a new
 * one. Says which, and whether it is new.
 */
export function ensureProduct(
  draft: Document,
  p: NewProduct,
  packs: Pick<Packs, 'items'>,
  todayIso: string,
  newId: () => string = () => crypto.randomUUID(),
): { id: string; created: boolean } {
  const item = p.itemId ? packs.items[p.itemId] : undefined;
  const name = p.name?.trim() || defaultProductName(item, p.size);
  const same = findProduct(draft, { itemId: p.itemId, name, size: p.size });
  if (same) return { id: same.id, created: false };
  const label =
    p.labelKcalPer100 !== undefined && item && item.measure !== 'count'
      ? p.labelKcalPer100
      : undefined;
  const product: Product = {
    id: newId(),
    name,
    ...(p.itemId ? { itemId: p.itemId } : {}),
    size: p.size,
    ...(label !== undefined ? { labelKcalPer100: label } : {}),
    added: todayIso,
  };
  draft.products[product.id] = product;
  return { id: product.id, created: true };
}

/** Remembers a barcode as a product; a barcode already remembered keeps its first-seen date. */
export function rememberBarcode(
  draft: Document,
  code: string,
  productId: string,
  todayIso: string,
): void {
  const key = normaliseGtin(code);
  draft.barcodes[key] = { productId, seen: draft.barcodes[key]?.seen ?? todayIso };
}

// ---- stock ------------------------------------------------------------------------------------

export interface NewStock {
  productId: string;
  qty: number;
  locationId: string;
  bestBefore?: string;
  /** Where it came from; a scan says `barcode`. A merge into stock already there keeps that stock's source. */
  source?: Stock['source'];
}

/** What an addition did, enough to take it back: see `undoAddStock`. */
export interface StockAddition {
  id: string;
  qty: number;
  /** True when the addition made a new stock row (rather than adding to one there). */
  created: boolean;
}

/**
 * Adds stock to a draft. Stock of the same product in the same place with the same best-before
 * month is added to rather than listed twice. Says which row and whether it is new.
 */
export function addStockWithUndo(
  draft: Document,
  stock: NewStock,
  todayIso: string,
  newId: () => string = () => crypto.randomUUID(),
): StockAddition {
  const same = Object.values(draft.stock).find(
    (i) =>
      i.productId === stock.productId &&
      i.locationId === stock.locationId &&
      i.bestBefore === stock.bestBefore,
  );
  if (same) {
    draft.stock[same.id] = { ...same, qty: same.qty + stock.qty };
    return { id: same.id, qty: stock.qty, created: false };
  }
  const row: Stock = {
    id: newId(),
    productId: stock.productId,
    qty: stock.qty,
    locationId: stock.locationId,
    ...(stock.bestBefore ? { bestBefore: stock.bestBefore } : {}),
    added: todayIso,
    source: stock.source ?? 'manual',
  };
  draft.stock[row.id] = row;
  return { id: row.id, qty: stock.qty, created: true };
}

/** Adds stock to a draft and returns the row's id. */
export function addStock(
  draft: Document,
  stock: NewStock,
  todayIso: string,
  newId: () => string = () => crypto.randomUUID(),
): string {
  return addStockWithUndo(draft, stock, todayIso, newId).id;
}

/**
 * Takes exactly one addition back: subtracts its quantity, and removes the row if this addition
 * made it or it falls to nothing. The product and any barcode made with it stay remembered. Does
 * nothing if the row has since gone.
 */
export function undoAddStock(draft: Document, addition: StockAddition): void {
  const row = draft.stock[addition.id];
  if (!row) return;
  const left = row.qty - addition.qty;
  if (addition.created || left <= 0) delete draft.stock[addition.id];
  else draft.stock[addition.id] = { ...row, qty: left };
}
