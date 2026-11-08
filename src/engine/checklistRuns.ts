import type {
  ChecklistCatalogueSnapshot,
  ChecklistRun,
  ChecklistSnapshotStep,
  Document,
  Packs,
} from '../model';
import { checklist, checklistPacks } from './checklists';

/** The key of a step's tick and note in `doc.checklistStepStates`. */
export function checklistStateKey(runId: string, stepId: string): string {
  return `${runId}|${stepId}`;
}

/**
 * Everything a run needs from the packs, as they are now: every scenario the region offers, and
 * every household-applicable step of those scenarios (selected or not), in canonical order (phase,
 * pack, `order`, step id). Pure; the caller decides what to do with it.
 */
export function buildCatalogueSnapshot(
  doc: Document,
  packs: Packs,
  asOf: string,
): ChecklistCatalogueSnapshot {
  const regional = checklistPacks(packs, doc.settings.region);
  const scenarios = regional.flatMap((p) => p.scenarios.map((s) => ({ id: s.id, name: s.name })));
  const orderOf = new Map<string, number>();
  for (const p of regional) for (const s of p.steps) orderOf.set(s.id, s.order);

  const view = checklist(
    doc,
    packs,
    scenarios.map((s) => s.id),
    asOf,
  );
  const steps: ChecklistSnapshotStep[] = view.groups.flatMap((g) =>
    g.steps.map((s) => ({
      id: s.id,
      packId: s.packId,
      text: s.text,
      phase: s.phase,
      order: orderOf.get(s.id) ?? 0,
      scenarios: [...s.scenarioIds],
      source: s.source,
      ...(s.sourceTitle !== undefined ? { sourceTitle: s.sourceTitle } : {}),
      ...(s.sourceChecked !== undefined ? { sourceChecked: s.sourceChecked } : {}),
    })),
  );
  return {
    packs: regional.map((p) => ({ id: p.id, version: p.version })),
    scenarios,
    steps,
  };
}

/**
 * Start a run inside the caller's single `change`: freeze the catalogue and write one empty state
 * per snapshotted step (hidden scenarios included). Nothing recomputes the snapshot afterwards.
 * Returns `undefined`, writing nothing, when the run id is taken or no selected id is in the
 * catalogue. Only ids in the catalogue are selected, each once, in the caller's order.
 */
export function startRun(
  draft: Document,
  packs: Packs,
  input: { runId: string; started: string; asOf: string; scenarioIds: readonly string[] },
): ChecklistRun | undefined {
  if (draft.checklistRuns[input.runId]) return undefined;
  const catalogue = buildCatalogueSnapshot(draft, packs, input.asOf);
  const known = new Set(catalogue.scenarios.map((s) => s.id));
  const scenarios = [...new Set(input.scenarioIds)].filter((id) => known.has(id));
  if (scenarios.length === 0) return undefined;

  const run: ChecklistRun = {
    id: input.runId,
    scenarios,
    started: input.started,
    catalogue,
  };
  draft.checklistRuns[run.id] = run;
  for (const step of catalogue.steps) {
    draft.checklistStepStates[checklistStateKey(run.id, step.id)] = {
      runId: run.id,
      stepId: step.id,
    };
  }
  return run;
}
