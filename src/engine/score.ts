import type { CapabilityId, Document, Packs } from '../model';
import { HORIZONS } from './assumptions';
import { CAPABILITY_ORDER } from './context';
import { analyse, type Analysis } from './coverage';
import type { Target } from './targets';

/**
 * Plans score (done / total) to this power, so one plan item done of nine is 4 %, not 11 %, and
 * only all done is 100 %. A chosen number, not a sourced one.
 */
export const PLANS_EXPONENT = 1.5;

/** A capability's percent from its targets' cover ratios: their product, each capped at 1. */
export function productPercent(ratios: readonly number[]): number {
  return ratios.reduce((n, r) => n * Math.min(1, Math.max(0, r)), 1) * 100;
}

/** The plans percent: the share of plan items done, to the power {@link PLANS_EXPONENT}. */
export function plansPercent(done: number, total: number): number {
  return total > 0 ? (done / total) ** PLANS_EXPONENT * 100 : 100;
}

export interface CapabilityScore {
  capability: CapabilityId;
  /**
   * 0 to 100: the product of the capability's targets' cover ratios, each capped at 1 (so a
   * forgotten dog scores the whole capability 0). Plans: the share done, to the power 1.5.
   */
  percent: number;
  /** The lowest target's ratio as a percentage without the cap (250 is two and a half times enough). */
  raw: number;
  /** The mean ratio over the targets (each capped at 100%): breaks a tie for the weakest. */
  meanPercent: number;
  /** How many targets the capability has; with none it takes no part in the overall score. */
  targetCount: number;
  /** The target with the lowest ratio. */
  weakestTarget?: Target;
}

export interface Score {
  /** The mean of the capabilities' percents, over capabilities that have targets. */
  overall: number;
  capabilities: CapabilityScore[];
  weakest: CapabilityId;
  /** The next horizon up from this one (3, 7, 14, 28), when there is one. */
  nextHorizonDays?: number;
  /** The overall score at that horizon. */
  nextHorizonPreview?: number;
}

function scoreFrom(a: Analysis): Omit<Score, 'nextHorizonDays' | 'nextHorizonPreview'> {
  const cover = new Map(a.coverage.map((c) => [c.targetId, c.amount]));
  const ratio = (t: Target) => (t.amount > 0 ? (cover.get(t.id) ?? 0) / t.amount : 1);

  const capabilities = CAPABILITY_ORDER.map((capability): CapabilityScore => {
    // Plan items are scored together under `plans`, whatever capability they belong to.
    const mine = a.targets.filter(
      (t) => (t.kind === 'plan' ? 'plans' : t.capability) === capability,
    );
    if (mine.length === 0) {
      return { capability, percent: 100, raw: 100, meanPercent: 100, targetCount: 0 };
    }
    let lowest = mine[0]!;
    let sum = 0;
    for (const t of mine) {
      if (ratio(t) < ratio(lowest)) lowest = t;
      sum += Math.min(1, ratio(t));
    }
    const percent =
      capability === 'plans'
        ? plansPercent(mine.filter((t) => ratio(t) >= 1).length, mine.length)
        : productPercent(mine.map(ratio));
    return {
      capability,
      percent,
      raw: ratio(lowest) * 100,
      meanPercent: (sum / mine.length) * 100,
      targetCount: mine.length,
      weakestTarget: lowest,
    };
  });

  const scored = capabilities.filter((c) => c.targetCount > 0);
  const overall = scored.length ? scored.reduce((n, c) => n + c.percent, 0) / scored.length : 0;
  // Lowest percent; a tie goes to the one with the lower mean, then to the earlier capability.
  const weakest = [...(scored.length ? scored : capabilities)].sort(
    (x, y) =>
      x.percent - y.percent ||
      x.meanPercent - y.meanPercent ||
      CAPABILITY_ORDER.indexOf(x.capability) - CAPABILITY_ORDER.indexOf(y.capability),
  )[0]!.capability;
  return { overall, capabilities, weakest };
}

/**
 * The preparedness score for a date and horizon. A capability scores the product of its targets'
 * cover ratios (each capped at 1), so an empty medication, a forgotten dog or a missing baby
 * cannot hide behind the rest; plans score the share done to the power 1.5. The overall score is
 * the mean over capabilities. Over 100% is "enough" and is capped.
 */
export function score(
  doc: Document,
  packs: Packs,
  asOf: string,
  horizonDays: number = doc.settings.horizonDays,
): Score {
  const result = scoreFrom(analyse(doc, packs, asOf, horizonDays));
  const next = HORIZONS.find((h) => h > horizonDays);
  if (next === undefined) return result;
  return {
    ...result,
    nextHorizonDays: next,
    nextHorizonPreview: scoreFrom(analyse(doc, packs, asOf, next)).overall,
  };
}
