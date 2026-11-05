import type { CapabilityId, Document, Packs, ResourceId } from '../model';
import { HORIZONS } from './assumptions';
import { analyse } from './coverage';
import { suggestContext } from './gaps';
import { resourceExample } from './examples';
import { closeHours } from './suggest';
import { fmt } from './context';
import type { Target, TargetKind } from './targets';

export interface PreviewRow {
  capability: CapabilityId;
  /** The target's short name, lower case: "water", "heat", "radio". */
  label: string;
  /** What a screen shows for the row, in sentence case: "Drinking water", "Power for phones". */
  title: string;
  amount: number;
  unit: string;
  /**
   * What that looks like in the shops, worded as an example and never an instruction: "e.g. 4 ×
   * Bottled water (6 × 2 L)". Food is a short mix of staples; see `examples.ts`.
   */
  example: string;
}

export interface PreviewHorizon {
  horizonDays: (typeof HORIZONS)[number];
  rows: PreviewRow[];
}

const RESOURCE_TITLES: Partial<Record<ResourceId, string>> = {
  waterL: 'Drinking water',
  foodKcal: 'Food',
  formulaG: 'Infant formula',
  petFoodKcal: 'Pet food',
  lumenHours: 'Light',
  batteryWh: 'Power for phones',
  sanitationUses: 'Toilet',
  hygieneUses: 'Hygiene supplies',
  nappies: 'Nappies',
  firstAid: 'First aid',
};

const KIND_TITLES: Partial<Record<TargetKind, string>> = {
  range: 'Driving range',
  device: 'Radio',
};

const CAPABILITY_TITLES: Partial<Record<CapabilityId, string>> = {
  heat: 'Heat',
  cooking: 'Cooking',
};

/** The sentence-case name a screen shows for a target (a medication is shown by its own name). */
function titleOf(t: Target): string {
  if (t.kind === 'medication') return t.label;
  if (t.kind === 'resource') return RESOURCE_TITLES[t.resource as ResourceId] ?? sentence(t.label);
  return KIND_TITLES[t.kind] ?? CAPABILITY_TITLES[t.capability] ?? sentence(t.label);
}

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

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
        case 'resource': {
          const text = resourceExample(ctx, t.resource as string, t.amount);
          example = text ? `e.g. ${text}` : `about ${fmt(t.amount)} ${t.unit}`;
          break;
        }
        case 'hours': {
          const s = closeHours(ctx, doc, t.capability, t.amount);
          example = s.length
            ? `e.g. ${s.map((x) => x.label).join(' and ')}`
            : `${fmt(t.amount)} hours`;
          break;
        }
        case 'medication':
          example = `${fmt(Math.ceil(t.amount))} doses of ${t.label}`;
          break;
        case 'range':
          example = `about the same as a vehicle charged or fuelled to drive ${fmt(t.amount)} km`;
          break;
        default:
          example = `e.g. a wind-up or battery-powered ${t.label}`;
      }
      rows.push({
        capability: t.capability,
        label: t.label,
        title: titleOf(t),
        amount: t.amount,
        unit: t.unit,
        example,
      });
    }
    return { horizonDays, rows };
  });
}
