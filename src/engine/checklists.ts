import type {
  ChecklistPhase,
  ChecklistsPack,
  ChecklistStep,
  Document,
  Packs,
  Region,
} from '../model';
import { CHECKLIST_PHASES } from '../model';
import { compareText } from '../util';
import { peopleAt } from './context';

/**
 * The bundled checklist packs for a region, in `packs.all` order. A pack must declare the
 * household's `region` (strict equality): a pack with no `region` is offered to nobody, so a
 * missing region never sends one region's advice to another. This deliberately ignores `settings.packs`: checklists are not switched on or off
 * like guidance, and enabling a pack never changes targets or the score.
 */
export function checklistPacks(packs: Packs, region: Region): ChecklistsPack[] {
  return packs.all.flatMap((p) => (p.kind === 'checklists' && p.region === region ? [p] : []));
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

export interface ChecklistStepView {
  id: string;
  packId: string;
  text: string;
  phase: ChecklistPhase;
  /** The selected scenarios that supplied this step, in the step's own scenario order. */
  scenarioIds: string[];
  source: string;
  sourceTitle?: string;
  sourceChecked?: string;
}

export interface ChecklistPhaseGroup {
  phase: ChecklistPhase;
  steps: ChecklistStepView[];
}

export interface ChecklistView {
  /** The selected scenarios that exist, in pack order (never the caller's order). */
  scenarios: { id: string; name: string }[];
  /** In phase order; phases with no steps are omitted. */
  groups: ChecklistPhaseGroup[];
}

/**
 * The combined checklist for the chosen scenarios: the union of their applicable steps, each step
 * once, ordered by phase, then pack order, then `order`, then step id. The order of `scenarioIds`
 * never affects the result; unknown ids contribute nothing.
 */
export function checklist(
  doc: Document,
  packs: Packs,
  scenarioIds: readonly string[],
  asOf: string,
): ChecklistView {
  const chosen = new Set(scenarioIds);
  const scenarios: { id: string; name: string }[] = [];
  const entries: { step: ChecklistStep; pack: ChecklistsPack; packIndex: number; by: string[] }[] =
    [];
  checklistPacks(packs, doc.settings.region).forEach((pack, packIndex) => {
    const picked = new Set<string>();
    for (const s of pack.scenarios) {
      if (!chosen.has(s.id)) continue;
      picked.add(s.id);
      scenarios.push({ id: s.id, name: s.name });
    }
    for (const step of pack.steps) {
      const by = step.scenarios.filter((id) => picked.has(id));
      if (by.length === 0 || !isStepApplicable(step, doc, asOf)) continue;
      entries.push({ step, pack, packIndex, by });
    }
  });

  entries.sort(
    (a, b) =>
      CHECKLIST_PHASES.indexOf(a.step.phase) - CHECKLIST_PHASES.indexOf(b.step.phase) ||
      a.packIndex - b.packIndex ||
      a.step.order - b.step.order ||
      compareText(a.step.id, b.step.id),
  );

  const groups: ChecklistPhaseGroup[] = [];
  for (const { step, pack, by } of entries) {
    const src = pack.sources?.find((s) => s.url === step.source);
    const view: ChecklistStepView = {
      id: step.id,
      packId: pack.id,
      text: step.text,
      phase: step.phase,
      scenarioIds: by,
      source: step.source,
      ...(src ? { sourceTitle: src.title, sourceChecked: src.checked } : {}),
    };
    let group = groups.find((g) => g.phase === step.phase);
    if (!group) {
      group = { phase: step.phase, steps: [] };
      groups.push(group);
    }
    group.steps.push(view);
  }
  return { scenarios, groups };
}
