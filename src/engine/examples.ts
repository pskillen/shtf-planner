import type { ItemType } from '../model';
import { MAX_OVERSHOOT } from './assumptions';
import { fitsHousehold } from './context';
import { NO_SUGGEST, type SuggestContext } from './suggest';

/**
 * Examples for the horizon preview: what a household would recognise and buy for an amount, in a
 * count it can picture. They are illustrations, not advice, and never a shopping list (the Gaps
 * tab does that).
 */

/** A count above this reads as a pile ("about 34 ×"), so a bigger pack is preferred. */
export const EXAMPLE_MAX_UNITS = 12;

const EPS = 1e-9;

/** A pick: `units` whole units of `type`, each giving `per` of the resource. */
interface Pick {
  type: ItemType;
  per: number;
  units: number;
}

const unitsFor = (amount: number, per: number): number =>
  Math.max(1, Math.ceil(amount / per - EPS));

/**
 * The best size of an item for `amount` of `resource` among `types`: the cheapest per unit of the
 * resource whose count is at most `EXAMPLE_MAX_UNITS` (and which does not overshoot wildly); when no
 * size is that big, the one with the fewest units. Undefined when no type gives the resource.
 */
export function pickSize(
  types: readonly ItemType[],
  resource: string,
  amount: number,
  max: number = EXAMPLE_MAX_UNITS,
): Pick | undefined {
  const all: Pick[] = [];
  for (const type of types) {
    const per = type.gives.find((g) => g.resource === resource)?.amount ?? 0;
    if (per > 0) all.push({ type, per, units: unitsFor(amount, per) });
  }
  if (all.length === 0) return undefined;
  const sensible = all.filter((p) => p.units * p.per <= amount * MAX_OVERSHOOT + EPS);
  const pool = sensible.length > 0 ? sensible : all;
  const price = (p: Pick) => (p.type.typicalPricePence ?? Infinity) / p.per;
  const byPrice = (a: Pick, b: Pick) =>
    price(a) - price(b) || (a.type.id < b.type.id ? -1 : a.type.id > b.type.id ? 1 : 0);
  const fits = pool.filter((p) => p.units <= max).sort(byPrice);
  if (fits[0]) return fits[0];
  return pool.sort((a, b) => a.units - b.units || byPrice(a, b))[0];
}

/** The types an example may name: stock a household buys, that suit it, not odd first answers. */
function everyday(ctx: SuggestContext, resource: string): ItemType[] {
  return Object.values(ctx.packs.items).filter(
    (t) =>
      !t.id.startsWith('custom:') &&
      t.assetTypeId === undefined &&
      !t.tags.includes(NO_SUGGEST) &&
      // an empty container is not stored water
      !t.tags.includes('refillable') &&
      fitsHousehold(t, ctx.people) &&
      !(t.tags.includes('needs-cooking') && !ctx.cookingMet) &&
      t.gives.some((g) => g.resource === resource),
  );
}

const label = (p: Pick): string => `${p.units} × ${p.type.name}`;

// ---- food: a short mix, never one item for all the calories -----------------------------------

/**
 * The split of a food target across everyday staples, as shares of the kcal. It is fixed and
 * only illustrates the variety (tins, grains, a spread), it is not a diet: the shares add to 1.
 * Each part names pack sizes smallest first (local ids in the items pack); the smallest size with
 * at most `EXAMPLE_MAX_UNITS` packs (70 for tins, which are counted in dozens) is used. Parts whose types are missing are left out and the
 * rest share the kcal.
 */
export const FOOD_MIX: ReadonlyArray<{
  share: number;
  /** Parts with the same group are added together: "8 kg of pasta and rice". */
  group: string;
  /** Say it by weight ("8 kg of pasta") or by the pack ("3 jars of peanut butter"). */
  show: 'kg' | 'count';
  /** The most packs of the smaller size before the bigger one is used (default 12). */
  maxUnits?: number;
  sizes: readonly string[];
}> = [
  {
    share: 0.25,
    group: 'tins',
    show: 'count',
    maxUnits: 70,
    sizes: ['tinned-food-tin', 'tinned-food'],
  },
  { share: 0.2, group: 'pasta and rice', show: 'kg', sizes: ['dried-pasta-1kg', 'dried-pasta'] },
  { share: 0.2, group: 'pasta and rice', show: 'kg', sizes: ['rice-1kg', 'rice-sack'] },
  {
    share: 0.15,
    group: 'porridge oats',
    show: 'kg',
    sizes: ['porridge-oats-1kg', 'porridge-oats'],
  },
  {
    share: 0.2,
    group: 'peanut butter',
    show: 'count',
    sizes: ['peanut-butter-340g', 'peanut-butter'],
  },
];

/** Kilograms in a size such as "1 kg" or "340 g"; undefined when it is not a mass. */
export function massKg(unitSize: string | undefined): number | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*(kg|g)\b/i.exec(unitSize ?? '');
  if (!m) return undefined;
  return Number(m[1]) / (m[2]!.toLowerCase() === 'kg' ? 1 : 1000);
}

const plural = (n: number, unit: string): string => (n === 1 ? unit : `${unit}s`);

/** "15 tins, 4 kg of pasta and rice, 1 kg of porridge oats and 3 jars of peanut butter". */
export function foodMixExample(ctx: SuggestContext, kcal: number): string | undefined {
  const usable = everyday(ctx, 'foodKcal');
  const local = (id: string) => usable.find((t) => t.id.split(':')[1] === id);
  const parts = FOOD_MIX.flatMap((part) => {
    const sizes = part.sizes.map(local).filter((t): t is ItemType => t !== undefined);
    return sizes.length > 0 ? [{ ...part, sizes }] : [];
  });
  const total = parts.reduce((n, p) => n + p.share, 0);
  if (!(total > 0)) return undefined;

  const order: string[] = [];
  const groups = new Map<string, { show: 'kg' | 'count'; picks: Pick[] }>();
  for (const part of parts) {
    // Sizes are listed smallest first, so the first that gives a sane count wins.
    const share = (kcal * part.share) / total;
    const picks = part.sizes.map((t) => pickSize([t], 'foodKcal', share)!);
    const pick =
      picks.find((p) => p.units <= (part.maxUnits ?? EXAMPLE_MAX_UNITS)) ?? picks.at(-1)!;
    const group = groups.get(part.group);
    if (!group) order.push(part.group);
    groups.set(part.group, { show: part.show, picks: [...(group?.picks ?? []), pick] });
  }

  const phrases = order.map((name) => {
    const { show, picks } = groups.get(name)!;
    const kg = picks.map((p) => (massKg(p.type.unitSize) ?? NaN) * p.units);
    if (show === 'kg' && kg.every(Number.isFinite)) {
      return `${Math.round(kg.reduce((a, b) => a + b, 0) * 10) / 10} kg of ${name}`;
    }
    return picks
      .map((p) => {
        // A tin, a jar or a tub reads as "3 jars of peanut butter"; anything else by its name.
        const unit = p.type.unit;
        if (unit === 'pack' && name === 'tins')
          return `${p.units} ${plural(p.units, 'pack')} of tinned food (each one person's week)`;
        if (unit !== 'tin' && unit !== 'jar' && unit !== 'tub') return label(p);
        return `${p.units} ${plural(p.units, unit)}${unit === 'tin' ? '' : ` of ${name}`}`;
      })
      .join(' and ');
  });
  return phrases.length > 1
    ? `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`
    : phrases[0]!;
}

// ---- other resources ----------------------------------------------------------------------------

/**
 * Power for phones: power banks, which people own for this. When even they would be a pile (more
 * than a dozen: a month of charging), the banks are still the example and a portable power
 * station is named beside them in words, "or" the other way to get the same Wh. (A station costs
 * two to two and a half times as much for the same Wh, so it is never swapped in silently.)
 */
function phonePower(ctx: SuggestContext, wh: number): string | undefined {
  const banks = everyday(ctx, 'batteryWh').filter((t) => t.tags.includes('phone'));
  const bank = pickSize(banks, 'batteryWh', wh);
  const stations = Object.values(ctx.packs.items).filter(
    (t) => t.assetTypeId !== undefined && t.tags.includes('portable-power'),
  );
  const station = pickSize(stations, 'batteryWh', wh);
  if (bank && bank.units <= EXAMPLE_MAX_UNITS) return label(bank);
  if (bank && station) return `${label(bank)}, or ${label(station)}`;
  return bank ? label(bank) : station ? label(station) : undefined;
}

/**
 * An example for an amount of a resource: a short mix for food, power banks for phone power, and
 * for everything else one everyday size chosen so that the count is picturable. Undefined when
 * nothing in the packs gives the resource.
 */
export function resourceExample(
  ctx: SuggestContext,
  resource: string,
  amount: number,
): string | undefined {
  if (!(amount > EPS)) return undefined;
  if (resource === 'foodKcal') {
    const mix = foodMixExample(ctx, amount);
    if (mix) return mix;
  }
  if (resource === 'batteryWh') return phonePower(ctx, amount);
  const pick = pickSize(everyday(ctx, resource), resource, amount);
  return pick ? label(pick) : undefined;
}
