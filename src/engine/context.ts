import type { CapabilityId, Document, Item, Packs, RiskTag, Rule } from '../model';
import { ageInMonths } from './dates';

/** Capabilities in the order the app lists them (also the tie-break for the weakest). */
export const CAPABILITY_ORDER: readonly CapabilityId[] = [
  'water',
  'food',
  'heat',
  'cooking',
  'light',
  'power',
  'comms',
  'sanitation',
  'medical',
  'mobility',
  'plans',
];

export interface Person {
  id: string;
  ageMonths: number;
  tags: readonly RiskTag[];
}

/** The household members already born on `asOf`, with their age in months on that date. */
export function peopleAt(doc: Document, asOf: string): Person[] {
  return doc.household.members
    .map((m) => ({ id: m.id, ageMonths: ageInMonths(m.dob, asOf), tags: m.tags }))
    .filter((p) => p.ageMonths >= 0);
}

/** An item's `ageBand` (half-open) fits at least one person, or the item has no band. */
export function fitsHousehold(item: Item, people: readonly Person[]): boolean {
  const band = item.ageBand;
  if (!band) return true;
  return people.some((p) => p.ageMonths >= band.fromMonths && p.ageMonths < band.toMonths);
}

/**
 * The guidance rules in force: every rule of every enabled guidance pack whose smallest horizon
 * band is at most `horizonDays` (a 3-day pack still applies at 14 days; a 14-day pack adds its
 * own from 14). A pack with no bands always applies. If every banded pack is above the horizon,
 * the lowest-banded one applies anyway, so a 3-day horizon is never left without water guidance.
 */
export function guidanceRules(doc: Document, packs: Packs, horizonDays: number): Rule[] {
  const guidance = packs
    .enabledPacks(doc.settings)
    .flatMap((p) => (p.kind === 'guidance' ? [p] : []));
  const banded = guidance.filter((p) => p.horizonBands.length > 0);
  const lowest = (p: (typeof guidance)[number]) => Math.min(...p.horizonBands);
  let active = banded.filter((p) => lowest(p) <= horizonDays);
  if (active.length === 0 && banded.length > 0) {
    const first = Math.min(...banded.map(lowest));
    active = banded.filter((p) => lowest(p) === first);
  }
  const chosen = new Set<string>([
    ...guidance.filter((p) => p.horizonBands.length === 0).map((p) => p.id),
    ...active.map((p) => p.id),
  ]);
  return guidance.filter((p) => chosen.has(p.id)).flatMap((p) => p.rules);
}

/** Splits `ns:local` and returns `local`. */
export const localId = (id: string): string => id.slice(id.indexOf(':') + 1);

/** A short number for labels: whole when whole, else one decimal. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
