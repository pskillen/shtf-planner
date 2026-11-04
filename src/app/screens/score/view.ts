import type { CapabilityScore, Coverage, Score, Target } from '../../../engine';
import { CAPABILITY_LABEL } from '../../labels';
import { formatAmount } from '../gaps/view';

export interface ScoreBar {
  capability: CapabilityScore['capability'];
  name: string;
  /** Whole percent, 0 to 100. */
  percent: number;
  /** At or over target. */
  enough: boolean;
  /** What holds it back, in numbers: "Heat: 0 of 18 hours". Empty when there is no coverage to say. */
  shortfall: string;
  /** The rule's own words for the weakest target, shown after the shortfall in muted type. */
  reason: string;
}

export interface ScoreView {
  overall: number;
  weakest: string;
  bars: ScoreBar[];
  next?: { days: number; percent: number };
}

/** A percentage for a person: a whole number, never 100 until it truly is. */
export const wholePercent = (n: number): number =>
  n >= 100 ? 100 : Math.min(99, Math.max(0, Math.round(n)));

/**
 * The words for a target: the rule that asks for most of it (for water, the drinking rule for
 * people, not the pets add-on), else its label.
 */
function reasonOf(t: Target | undefined): string {
  if (!t) return '';
  const main = t.rules.reduce<Target['rules'][number] | undefined>(
    (best, r) => (best === undefined || r.contribution > best.contribution ? r : best),
    undefined,
  );
  return main?.text ?? t.label;
}

/**
 * What the Score tab shows, taken straight from `score()`. The scoring rule lives in the engine:
 * this orders the bars (weakest first, the way the engine breaks a tie), rounds, and picks the
 * words. A capability with no targets takes no part in the score and has no bar.
 */
export function scoreView(
  score: Score,
  from: { coverage?: readonly Coverage[]; region?: 'UK' | 'US' } = {},
): ScoreView {
  const cover = new Map((from.coverage ?? []).map((c) => [c.targetId, c.amount]));
  const planCover = (from.coverage ?? []).filter((c) => c.targetId.startsWith('plan:'));
  const shortfallOf = (c: CapabilityScore): string => {
    const t = c.weakestTarget;
    const name = CAPABILITY_LABEL[c.capability];
    if (!t || cover.size === 0) return '';
    if (c.capability === 'plans') {
      return `${name}: ${planCover.filter((p) => p.amount >= 1).length} of ${c.targetCount} done`;
    }
    const unit = t.unit === 'h' ? 'hours' : t.unit;
    const region = from.region ?? 'UK';
    const have = formatAmount(Math.min(cover.get(t.id) ?? 0, t.amount), unit, region);
    const need = formatAmount(t.amount, unit, region);
    // "0 of 18 hours": the unit once, after the second number
    const tail = need.slice(need.indexOf(' '));
    return `${name}: ${have.endsWith(tail) ? have.slice(0, -tail.length) : have} of ${need}`;
  };
  const bars = score.capabilities
    .filter((c) => c.targetCount > 0)
    .sort((a, b) => a.percent - b.percent || a.meanPercent - b.meanPercent)
    .map((c): ScoreBar => ({
      capability: c.capability,
      name: CAPABILITY_LABEL[c.capability],
      percent: wholePercent(c.percent),
      enough: c.percent >= 100,
      shortfall: shortfallOf(c),
      reason: reasonOf(c.weakestTarget),
    }));
  return {
    overall: wholePercent(score.overall),
    weakest: CAPABILITY_LABEL[score.weakest],
    bars,
    ...(score.nextHorizonDays !== undefined && score.nextHorizonPreview !== undefined
      ? { next: { days: score.nextHorizonDays, percent: wholePercent(score.nextHorizonPreview) } }
      : {}),
  };
}
