import type { CapabilityId, Document, Packs } from '../model';
import { HORIZONS } from './assumptions';
import { analyse } from './coverage';
import { suggestContext } from './gaps';
import { closeHours, closeStore } from './suggest';
import { fmt } from './context';

export interface PreviewRow {
  capability: CapabilityId;
  label: string;
  amount: number;
  unit: string;
  /** What that looks like in the item catalogue: "about 3 × Water can (10 L)". */
  example: string;
}

export interface PreviewHorizon {
  horizonDays: number;
  rows: PreviewRow[];
}

/**
 * What 3, 7, 14 and 28 days would need for this household on `asOf`, ignoring what it already
 * has (plan items are left out). Each row has an example from the catalogue.
 */
export function preview(doc: Document, packs: Packs, asOf: string): PreviewHorizon[] {
  return HORIZONS.map((horizonDays) => {
    const a = analyse(doc, packs, asOf, horizonDays);
    // Examples assume cooking works, so food is not steered away from rice and pasta.
    const ctx = { ...suggestContext(packs, a), cookingMet: true };
    const rows: PreviewRow[] = [];
    for (const t of a.targets) {
      if (t.kind === 'plan') continue;
      let example: string;
      switch (t.kind) {
        case 'store': {
          const s = closeStore(ctx, t.store as string, t.amount, 1)[0];
          example = s ? `about ${s.label}` : `${fmt(t.amount)} ${t.unit}`;
          break;
        }
        case 'hours': {
          const s = closeHours(ctx, doc, t.capability, t.amount);
          example = s.length
            ? `about ${s.map((x) => x.label).join(' and ')}`
            : `${fmt(t.amount)} hours`;
          break;
        }
        case 'medication':
          example = `${fmt(Math.ceil(t.amount))} doses of ${t.label}`;
          break;
        case 'range':
          example = `a vehicle charged or fuelled to drive ${fmt(t.amount)} km`;
          break;
        default:
          example = `one ${t.label} that needs no mains power`;
      }
      rows.push({
        capability: t.capability,
        label: t.label,
        amount: t.amount,
        unit: t.unit,
        example,
      });
    }
    return { horizonDays, rows };
  });
}
