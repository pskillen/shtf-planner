import type { Condition, Document, ItemInstance, ItemType, Location } from '../../../model';

/** How a place's condition reads in "Water can may freeze in the Shed". */
const PHRASE: Record<Exclude<Condition, 'indoor-stable'>, string> = {
  frost: 'freeze',
  heat: 'get too hot',
  damp: 'get damp',
};

/**
 * Why this item type does not suit this place, or undefined when it does. A place's conditions
 * (frost, heat, damp) must each be in the type's `suitability`; `indoor-stable` asks for nothing.
 */
export function suitabilityWarning(
  type: Pick<ItemType, 'name' | 'suitability'>,
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

export type MonthTone = 'past' | 'soon' | 'ok';

/**
 * How near a best-before month is to `todayIso`: `past` once its month has gone (the engine treats
 * stock as expired from the month after), `soon` within the next three months, else `ok`.
 */
export function monthTone(ym: string, todayIso: string): MonthTone {
  const now = monthOfDate(todayIso);
  if (ym < now) return 'past';
  return monthIndex(ym) - monthIndex(now) <= 3 ? 'soon' : 'ok';
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
 * The one-tap best-before choices for an item type, from how long it keeps: "+1 y", "+2 y" and
 * "+5 y" for things that keep for years; fewer for things that keep for less; none for things
 * that do not go off.
 */
export function monthChips(shelfLife: ItemType['shelfLife'], todayIso: string): MonthChip[] {
  const now = monthOfDate(todayIso);
  const steps: Record<ItemType['shelfLife'], Array<[string, number]>> = {
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
const RECENT_KEY = 'shtf.recentItemTypes';
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

/** Item type ids added lately on this device, newest first. */
export function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function pushRecent(typeId: string): void {
  write(
    RECENT_KEY,
    JSON.stringify([typeId, ...readRecent().filter((t) => t !== typeId)].slice(0, RECENT_MAX)),
  );
}

/**
 * Where a new item most likely goes: the place that already holds the most of its type, else the
 * place last used, else the fullest place (the most stock records; a tie goes to the first by
 * name). Empty when there are no places.
 */
export function defaultLocationId(
  doc: Pick<Document, 'items' | 'locations'>,
  typeId: string,
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
  const items = Object.values(doc.items);
  return (
    best((id) =>
      items
        .filter((i) => i.typeId === typeId && i.locationId === id)
        .reduce((n, i) => n + i.qty, 0),
    ) ??
    (lastUsed && doc.locations[lastUsed] ? lastUsed : undefined) ??
    best((id) => items.filter((i) => i.locationId === id).length) ??
    places[0]?.id ??
    ''
  );
}

// ---- searching and adding -------------------------------------------------------------------

/**
 * Item types that match a search, recent ones first. An empty search lists recent types and then
 * all of them by name; a search matches the name, the unit size, the category and the tags.
 */
export function matchTypes(
  types: readonly ItemType[],
  query: string,
  recent: readonly string[] = [],
): ItemType[] {
  const q = query.trim().toLowerCase();
  const rank = (t: ItemType) => {
    const at = recent.indexOf(t.id);
    return at < 0 ? Infinity : at;
  };
  return types
    .filter(
      (t) =>
        q === '' ||
        [t.name, t.unitSize ?? '', t.category, ...t.tags].some((s) => s.toLowerCase().includes(q)),
    )
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export interface NewStock {
  typeId: string;
  qty: number;
  locationId: string;
  bestBefore?: string;
}

/**
 * Adds stock to a draft. Stock of the same type in the same place with the same best-before is
 * added to rather than listed twice. Returns the instance's id.
 */
export function addStock(
  draft: Document,
  stock: NewStock,
  todayIso: string,
  newId: () => string = () => crypto.randomUUID(),
): string {
  const same = Object.values(draft.items).find(
    (i) =>
      i.typeId === stock.typeId &&
      i.locationId === stock.locationId &&
      i.bestBefore === stock.bestBefore,
  );
  if (same) {
    draft.items[same.id] = { ...same, qty: same.qty + stock.qty };
    return same.id;
  }
  const item: ItemInstance = {
    id: newId(),
    typeId: stock.typeId,
    qty: stock.qty,
    locationId: stock.locationId,
    ...(stock.bestBefore ? { bestBefore: stock.bestBefore } : {}),
    added: todayIso,
    source: 'manual',
  };
  draft.items[item.id] = item;
  return item.id;
}
