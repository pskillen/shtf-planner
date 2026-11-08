import type { ChecklistsPack, ChecklistStep, Document, Packs, Region } from '../model';
import { compareText } from '../util';
import { peopleAt } from './context';

/**
 * The bundled checklist packs for a region, in `packs.all` order. A pack with no `region` suits
 * every region. This deliberately ignores `settings.packs`: checklists are not switched on or off
 * like guidance, and enabling a pack never changes targets or the score.
 */
export function checklistPacks(packs: Packs, region: Region): ChecklistsPack[] {
  return packs.all.flatMap((p) =>
    p.kind === 'checklists' && (p.region === undefined || p.region === region) ? [p] : [],
  );
}

export interface ChecklistScenarioView {
  id: string;
  name: string;
  packId: string;
  /** One of the scenario's `risks` is declared on the home. Nothing is selected because of it. */
  riskMatch: boolean;
}

/**
 * Every scenario the household could pick: those whose risks the home declares first, then pack
 * order, then name. Picking is the household's; this never selects anything.
 */
export function checklistScenarios(doc: Document, packs: Packs): ChecklistScenarioView[] {
  const declared = new Set<string>(doc.home.risks);
  const regional = checklistPacks(packs, doc.settings.region);
  const out: ChecklistScenarioView[] = [];
  for (const pack of regional) {
    for (const s of pack.scenarios) {
      out.push({
        id: s.id,
        name: s.name,
        packId: pack.id,
        riskMatch: (s.risks ?? []).some((r) => declared.has(r)),
      });
    }
  }
  const packOrder = regional.map((p) => p.id);
  return out.sort(
    (a, b) =>
      Number(b.riskMatch) - Number(a.riskMatch) ||
      packOrder.indexOf(a.packId) - packOrder.indexOf(b.packId) ||
      compareText(a.name, b.name),
  );
}

/**
 * Whether a step suits this household on `asOf`. The `requires` fields combine with AND. Only a
 * step that names a `risk` is filtered by the home's risks; `asset` means any owned asset of a
 * listed type; `pets` means at least one pet; `memberTag` means a member already born on `asOf`.
 */
export function isStepApplicable(step: ChecklistStep, doc: Document, asOf: string): boolean {
  const r = step.requires;
  if (!r) return true;
  if (r.risk && !doc.home.risks.includes(r.risk)) return false;
  if (r.asset) {
    const owned = new Set(Object.values(doc.assets).map((a) => a.typeId));
    if (!r.asset.some((a) => owned.has(a))) return false;
  }
  if (r.pets && doc.household.pets.length === 0) return false;
  const tag = r.memberTag;
  if (tag && !peopleAt(doc, asOf).some((p) => p.tags.includes(tag))) return false;
  return true;
}
