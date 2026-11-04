import type { Coverage, Gap, Score, Suggestion } from '../../../engine';
import type { CapabilityId } from '../../../model';
import { formatVolume } from '../../../util';
import { CAPABILITY_LABEL } from '../../labels';

export type ShoppingSort = 'capability' | 'cost';

/** One line to buy. `alternatives` are other ways to close the same shortfall (store gaps). */
export interface ShoppingRow {
  key: string;
  capability: CapabilityId;
  kind: 'acquire' | 'replenish';
  label: string;
  /** "water: 20 L short of 14 days" */
  closes: string;
  pricePence?: number;
  /** Price per unit of the store, for sorting by cost per coverage. */
  perUnitPence?: number;
  /** What Quick add opens with when the row is ticked; absent for advice with nothing to add. */
  itemTypeId?: string;
  qty?: number;
  alternatives: string[];
  critical?: boolean;
}

export interface TodoRow {
  key: string;
  capability: CapabilityId;
  kind: 'task' | 'plan';
  label: string;
  /** For a plan item: the id to mark done. */
  planItemId?: string;
  /** For a task from a blocked asset: the asset type (the row links to Equipment). */
  assetTypeId?: string;
  /** Why, for a task. */
  closes: string;
}

export interface EnoughRow {
  capability: CapabilityId;
  text: string;
}

export interface GapsView {
  shopping: ShoppingRow[];
  todo: TodoRow[];
  enough: EnoughRow[];
}

const round1 = (n: number): string => String(Math.round(n * 10) / 10);

/** An amount in its unit; litres follow the household's region. */
export function formatAmount(amount: number, unit: string, region: 'UK' | 'US'): string {
  if (unit === 'L') return formatVolume(amount, region);
  return `${round1(amount)} ${unit}`.trim();
}

/** Pence as "£12" or "£12.50". Prices in the packs are rough UK shop prices. */
export function formatPrice(pence: number): string {
  const pounds = pence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

/** "water: 20 L short of 14 days" (a one-off need such as a first aid kit has no days). */
export function closesText(gap: Gap, horizonDays: number, region: 'UK' | 'US'): string {
  const short = formatAmount(gap.shortfall, gap.unit, region);
  const label = gap.target.label;
  return gap.target.fixed || gap.target.kind === 'device' || gap.target.kind === 'range'
    ? `${label}: ${short} short`
    : `${label}: ${short} short of ${horizonDays} days`;
}

/**
 * Store and device gaps list alternatives (any one will do); a gap for running hours lists what
 * works together (the heater and its fuel); a floor to restock or a medicine is one line.
 */
const ALTERNATIVES = new Set<Gap['target']['kind']>(['store', 'device']);

function shoppingRowsFor(gap: Gap, horizonDays: number, region: 'UK' | 'US', at: number) {
  if (gap.kind !== 'acquire' && gap.kind !== 'replenish') return [];
  const closes = closesText(gap, horizonDays, region);
  const base = { capability: gap.capability, kind: gap.kind, closes, critical: gap.critical };
  const row = (s: Suggestion, i: number, alternatives: string[]): ShoppingRow => ({
    ...base,
    key: `${gap.target.id}|${gap.kind}|${at}|${i}`,
    label: s.label,
    ...(s.pricePence !== undefined ? { pricePence: s.pricePence } : {}),
    ...(s.pricePence !== undefined && s.qty && s.perUnitCoverage
      ? { perUnitPence: s.pricePence / (s.qty * s.perUnitCoverage) }
      : {}),
    ...(s.itemTypeId ? { itemTypeId: s.itemTypeId } : {}),
    ...(s.qty ? { qty: s.qty } : {}),
    alternatives,
  });
  if (ALTERNATIVES.has(gap.target.kind) && gap.kind === 'acquire') {
    const [best, ...others] = gap.suggestions;
    return best
      ? [
          row(
            best,
            0,
            others.map((o) => o.label),
          ),
        ]
      : [];
  }
  return gap.suggestions.map((s, i) => row(s, i, []));
}

/** Lowest share of target first: the weakest capability leads. */
function weakestFirst(score: Score): CapabilityId[] {
  return [...score.capabilities]
    .sort((a, b) => a.percent - b.percent || a.meanPercent - b.meanPercent)
    .map((c) => c.capability);
}

/**
 * The Gaps tab from what the engine returned: shopping (restocking a floor before buying more),
 * things to do (plan items and tasks), and what is already enough. Nothing is worked out here;
 * this only groups, orders and words it.
 */
export function buildGapsView(input: {
  gaps: readonly Gap[];
  score: Score;
  coverage: readonly Coverage[];
  horizonDays: number;
  region: 'UK' | 'US';
  sort: ShoppingSort;
}): GapsView {
  const { gaps, score, coverage, horizonDays, region, sort } = input;
  const weakest = weakestFirst(score);

  const shopping = gaps.flatMap((g, at) => shoppingRowsFor(g, horizonDays, region, at));
  const kindOrder = (r: ShoppingRow) => (r.kind === 'replenish' ? 0 : 1);
  const capOrder = (r: ShoppingRow) => weakest.indexOf(r.capability);
  shopping.sort((a, b) => {
    if (kindOrder(a) !== kindOrder(b)) return kindOrder(a) - kindOrder(b);
    if (sort === 'cost') {
      // Priced by cost per unit given, cheapest first; what has no price comes last.
      const pa = a.perUnitPence ?? Infinity;
      const pb = b.perUnitPence ?? Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
    }
    return capOrder(a) - capOrder(b);
  });

  const todo: TodoRow[] = gaps
    .flatMap((g, at): TodoRow[] =>
      g.kind === 'plan' || g.kind === 'task'
        ? g.suggestions.map((s, i) => ({
            key: `${g.target.id}|${g.kind}|${at}|${i}`,
            capability: g.capability,
            kind: g.kind as 'task' | 'plan',
            label: s.label,
            closes: g.kind === 'plan' ? '' : closesText(g, horizonDays, region),
            ...(s.planItemId ? { planItemId: s.planItemId } : {}),
            ...(s.assetTypeId ? { assetTypeId: s.assetTypeId } : {}),
          }))
        : [],
    )
    .sort((a, b) => weakest.indexOf(a.capability) - weakest.indexOf(b.capability));

  const cover = new Map(coverage.map((c) => [c.targetId, c]));
  const enough: EnoughRow[] = score.capabilities
    .filter((c) => c.targetCount > 0 && c.percent >= 100)
    .map((c) => {
      const name = CAPABILITY_LABEL[c.capability];
      const t = c.weakestTarget;
      const have = t ? cover.get(t.id)?.amount : undefined;
      if (c.capability === 'plans') return { capability: c.capability, text: `${name}: all done` };
      if (!t || have === undefined) return { capability: c.capability, text: `${name}: enough` };
      const spare = have - t.amount;
      const lead = t.fixed ? `${name}: covered` : `${name}: enough for ${horizonDays} days`;
      // Only an amount of something is worth saying; hours, doses and ranges are not "more than needed".
      const more =
        t.kind === 'store' && spare > 0.05 * t.amount && spare >= 0.1
          ? `; ${formatAmount(spare, t.unit, region)} more than needed`
          : '';
      return { capability: c.capability, text: lead + more };
    })
    .sort((a, b) => weakest.indexOf(a.capability) - weakest.indexOf(b.capability));

  return { shopping, todo, enough };
}
