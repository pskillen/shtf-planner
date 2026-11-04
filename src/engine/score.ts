import type { CapabilityId, Document, Packs } from '../model';
import { HORIZONS } from './assumptions';
import { CAPABILITY_ORDER } from './context';
import { analyse, type Analysis } from './coverage';
import type { Target } from './targets';

export interface CapabilityScore {
  capability: CapabilityId;
  /** 0 to 100: the lowest cover ratio among the capability's targets, capped at 100. */
  percent: number;
  /** The same ratio as a percentage without the cap (250 is two and a half times enough). */
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
    return {
      capability,
      percent: Math.min(100, ratio(lowest) * 100),
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
 * The preparedness score for a date and horizon. Each capability scores the cover ratio of its
 * weakest target, so an empty medication cannot hide behind a full first aid kit; the overall
 * score is the mean over capabilities. Over 100% is "enough" and is capped.
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
