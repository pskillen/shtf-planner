import { ANSWERED_BY_ASSET } from '../../../engine';
import type { BlockedAsset, Coverage, Gap, Score, Suggestion } from '../../../engine';
import type { CapabilityId } from '../../../model';
import { formatVolume } from '../../../util';
import { blockedLine } from '../../blocked';
import { CAPABILITY_LABEL } from '../../labels';

export type ShoppingSort = 'capability' | 'cost';

/** One line to buy. `alternatives` are other ways to close the same shortfall (store gaps). */
export interface ShoppingRow {
  key: string;
  capability: CapabilityId;
  /** The target this row closes (`food:foodKcal`): a restock and a buy for the same one go together. */
  targetId: string;
  kind: 'acquire' | 'replenish';
  label: string;
  /**
   * What it closes: "water: 20 L short of 14 days"; for a restock, worded from the minimum ("Pantry:
   * UHT milk is 3 below its minimum of 6"), with no days.
   */
  closes: string;
  pricePence?: number;
  /** Shown under the label when the engine named a product ("10 × Tesco fusilli 500 g"). */
  detail?: string;
  /** What Quick add opens with when the row is ticked; absent for advice with nothing to add. */
  itemId?: string;
  productId?: string;
  /** Set when the row is a piece of equipment: ticking it opens the equipment form, not stock. */
  assetTypeId?: string;
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
  /** Why, for a task, in words with no shortfall ("Roof solar gives nothing in a power cut ..."). */
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

/** "Pantry: UHT milk is 3 below its minimum of 6", or, with none in date, "... has none in date (minimum 3)". */
function restockText(r: NonNullable<Gap['restock']>): string {
  const lead = `${r.place}: ${r.itemName}`;
  return r.actual <= 0
    ? `${lead} has none in date (minimum ${round1(r.minimum)})`
    : `${lead} is ${round1(r.minimum - r.actual)} below its minimum of ${round1(r.minimum)}`;
}

/**
 * Store and device gaps list alternatives (any one will do); a gap for running hours lists what
 * works together (the heater and its fuel); a floor to restock or a medicine is one line.
 */
const ALTERNATIVES = new Set<Gap['target']['kind']>(['resource', 'device']);

function shoppingRowsFor(gap: Gap, horizonDays: number, region: 'UK' | 'US', at: number) {
  if (gap.kind !== 'acquire' && gap.kind !== 'replenish') return [];
  const closes =
    gap.kind === 'replenish' && gap.restock
      ? restockText(gap.restock)
      : closesText(gap, horizonDays, region);
  const base = {
    capability: gap.capability,
    targetId: gap.target.id,
    kind: gap.kind,
    closes,
    critical: gap.critical,
  };
  const row = (s: Suggestion, i: number, alternatives: string[]): ShoppingRow => ({
    ...base,
    key: `${gap.target.id}|${gap.kind}|${at}|${i}`,
    label: s.label,
    ...(s.pricePence !== undefined ? { pricePence: s.pricePence } : {}),
    ...(s.detail ? { detail: s.detail } : {}),
    ...(s.assetTypeId
      ? { assetTypeId: s.assetTypeId }
      : s.itemId
        ? { itemId: s.itemId, ...(s.productId ? { productId: s.productId } : {}) }
        : {}),
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
  // A buy row for a target that is also being restocked says it is beyond restocking (the engine
  // has taken the restock out of it). Other targets of the same capability are not touched.
  const restocked = new Set(shopping.filter((r) => r.kind === 'replenish').map((r) => r.targetId));
  for (const r of shopping)
    if (r.kind === 'acquire' && restocked.has(r.targetId)) r.closes += ', beyond restocking';
  const kindOrder = (r: ShoppingRow) => (r.kind === 'replenish' ? 0 : 1);
  const capOrder = (r: ShoppingRow) => weakest.indexOf(r.capability);
  shopping.sort((a, b) => {
    if (kindOrder(a) !== kindOrder(b)) return kindOrder(a) - kindOrder(b);
    if (sort === 'cost') {
      // The row's own price, cheapest first (units differ across needs, so a per-unit price
      // would not compare); what has no price comes last. A tie keeps the weakest first.
      const pa = a.pricePence ?? Infinity;
      const pb = b.pricePence ?? Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
    }
    return capOrder(a) - capOrder(b);
  });

  // A task from a blocked asset says what that asset gives, not how much is short.
  const blockedByTask = new Map<string, BlockedAsset>(
    coverage.flatMap((c) => c.blockedAssets ?? []).map((b) => [b.task, b]),
  );
  const taskQuestions = new Set(
    gaps
      .filter((g) => g.kind === 'task')
      .flatMap((g) => g.suggestions.map((s) => blockedByTask.get(s.label)?.question))
      .filter((q): q is string => q !== undefined),
  );
  const todo: TodoRow[] = gaps
    .flatMap((g, at): TodoRow[] =>
      g.kind === 'plan' || g.kind === 'task'
        ? g.suggestions
            // A plan item a task already covers (the EPS plan, while EPS tasks show) is left out.
            .filter((s) => {
              const q = s.planItemId ? ANSWERED_BY_ASSET[s.planItemId] : undefined;
              return !(q && taskQuestions.has(q));
            })
            .map((s, i) => {
              const blocked = g.kind === 'task' ? blockedByTask.get(s.label) : undefined;
              return {
                key: `${g.target.id}|${g.kind}|${at}|${i}`,
                capability: g.capability,
                kind: g.kind as 'task' | 'plan',
                label: s.label,
                closes: blocked ? blockedLine(blocked) : '',
                ...(s.planItemId ? { planItemId: s.planItemId } : {}),
                ...(s.assetTypeId ? { assetTypeId: s.assetTypeId } : {}),
              };
            })
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
        t.kind === 'resource' && spare > 0.05 * t.amount && spare >= 0.1
          ? `; ${formatAmount(spare, t.unit, region)} more than needed`
          : '';
      return { capability: c.capability, text: lead + more };
    })
    .sort((a, b) => weakest.indexOf(a.capability) - weakest.indexOf(b.capability));

  return { shopping, todo, enough };
}
