import type { CapabilityId, Document, Packs } from '../../../model';
import { HORIZONS } from '../../labels';

export interface PreviewRow {
  capability: CapabilityId;
  label: string;
  /** `null` when the amount is not worked out in this build. */
  amount: number | null;
  unit: string;
  /** "about 28 × 10 L cans" */
  example: string;
}

export interface HorizonPreview {
  horizonDays: (typeof HORIZONS)[number];
  rows: PreviewRow[];
}

/** True while `previewFor` is the stand-in below and not the engine. */
export const PREVIEW_IS_STUB = true;

/**
 * What this household would need at each horizon.
 *
 * STUB: the planning engine is not in this build, and screens never compute targets themselves, so
 * this lists the capabilities with no amounts. When the engine lands, replace the body with a call
 * to its `preview(doc, packs, asOf)` (same result shape) and set `PREVIEW_IS_STUB` to false; the
 * table does not change.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- the stub ignores its inputs; the engine will not */
export function previewFor(_doc: Document, _packs: Packs, _asOf: string): HorizonPreview[] {
  const rows: PreviewRow[] = (
    [
      ['water', 'Drinking water'],
      ['food', 'Food'],
      ['heat', 'Heat'],
      ['cooking', 'Cooking'],
      ['power', 'Power'],
    ] as const
  ).map(([capability, label]) => ({ capability, label, amount: null, unit: '', example: '' }));
  return HORIZONS.map((horizonDays) => ({ horizonDays, rows }));
}

/* eslint-enable @typescript-eslint/no-unused-vars */

/** Units that measure energy, time or distance, not something you carry or count: never "biggest". */
const NOT_STORAGE = new Set(['Wh', 'kWh', 'kcal', 'h', 'hours', 'days', 'km', 'W']);

/**
 * The rows with the biggest asks, by amount at the longest horizon, among those measured in
 * storage units (litres, kilograms, items). Energy, time and distance rows are skipped: a
 * thousand kcal is not "bigger" than ten litres. Returns the rows' `label`s.
 */
export function biggestAsks(preview: readonly HorizonPreview[], count = 3): string[] {
  const longest = [...preview].sort((a, b) => b.horizonDays - a.horizonDays)[0];
  if (!longest) return [];
  return longest.rows
    .filter((r) => r.amount !== null && r.amount > 0 && !NOT_STORAGE.has(r.unit))
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, count)
    .map((r) => r.label);
}
