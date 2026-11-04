import { HORIZONS, preview, score, type PreviewHorizon, type PreviewRow } from '../../../engine';
import type { Document, Packs } from '../../../model';

export type { PreviewHorizon, PreviewRow };

/**
 * What this household would need at each horizon (3, 7, 14 and 28 days), from the planning engine.
 * Screens never work targets out themselves.
 */
export function previewFor(doc: Document, packs: Packs, asOf: string): PreviewHorizon[] {
  return preview(doc, packs, asOf);
}

/** The key a row keeps across the four horizons: its capability and its short name. */
export const rowKey = (row: Pick<PreviewRow, 'capability' | 'label'>): string =>
  `${row.capability}|${row.label}`;

/**
 * The rows that are the biggest ask: the weakest row of each of the three capabilities furthest
 * short of their target at the longest horizon (so a thousand kcal is not "bigger" than ten
 * litres). The engine's own score says how far each capability is and which of its targets holds
 * it back; ties are broken the way it breaks them for "weakest". Plans are never one. The keys are
 * `rowKey`s, so a table row can ask for itself.
 */
export function biggestAsks(
  doc: Document,
  packs: Packs,
  asOf: string,
  count = 3,
): ReadonlySet<string> {
  const longest = Math.max(...HORIZONS);
  const result = score(doc, packs, asOf, longest);
  const order = result.capabilities.filter((c) => c.targetCount > 0 && c.capability !== 'plans');
  order.sort((a, b) => a.percent - b.percent || a.meanPercent - b.meanPercent);
  return new Set(
    order.slice(0, count).flatMap((c) => (c.weakestTarget ? [rowKey(c.weakestTarget)] : [])),
  );
}
