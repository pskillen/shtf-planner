import type { CapabilityScore, Score } from '../../../engine';
import { CAPABILITY_LABEL } from '../../labels';

export interface ScoreBar {
  capability: CapabilityScore['capability'];
  name: string;
  /** Whole percent, 0 to 100. */
  percent: number;
  /** At or over target. */
  enough: boolean;
  /** The weakest target's own words: why this is the capability's score. */
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
 * What the Score tab shows, taken straight from `score()`. The scoring rule lives in the engine:
 * this orders the bars (weakest first, the way the engine breaks a tie), rounds, and picks the
 * words. A capability with no targets takes no part in the score and has no bar.
 */
export function scoreView(score: Score): ScoreView {
  const bars = score.capabilities
    .filter((c) => c.targetCount > 0)
    .sort((a, b) => a.percent - b.percent || a.meanPercent - b.meanPercent)
    .map((c): ScoreBar => ({
      capability: c.capability,
      name: CAPABILITY_LABEL[c.capability],
      percent: wholePercent(c.percent),
      enough: c.percent >= 100,
      reason: c.weakestTarget?.rules[0]?.text ?? c.weakestTarget?.label ?? '',
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
