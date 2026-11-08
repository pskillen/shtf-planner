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

/** The run, if it is still open and the step has a state record; the commands below need both. */
function openState(draft: Document, runId: string, stepId: string) {
  const run = draft.checklistRuns[runId];
  if (!run || run.finished !== undefined) return undefined;
  return draft.checklistStepStates[checklistStateKey(runId, stepId)];
}

/**
 * Tick a step. Returns `false`, writing nothing, when the run is unknown or finished, the step has
 * no state, or it is already ticked (the first tick time stands, to avoid needless merge churn).
 */
export function setStepDone(draft: Document, runId: string, stepId: string, at: string): boolean {
  const state = openState(draft, runId, stepId);
  if (!state || state.doneAt !== undefined) return false;
  state.doneAt = at;
  return true;
}

/** Untick a step, keeping its note. `false` when nothing changed (as for `setStepDone`). */
export function clearStepDone(draft: Document, runId: string, stepId: string): boolean {
  const state = openState(draft, runId, stepId);
  if (!state || state.doneAt === undefined) return false;
  delete state.doneAt;
  return true;
}

/**
 * Set a step's note, exactly as given (nothing is trimmed). An empty note deletes the field.
 * `false` when nothing changed, including writing the value already there.
 */
export function setStepNote(draft: Document, runId: string, stepId: string, note: string): boolean {
  const state = openState(draft, runId, stepId);
  if (!state || state.note === (note === '' ? undefined : note)) return false;
  if (note === '') delete state.note;
  else state.note = note;
  return true;
}

/**
 * Replace the run's selected scenarios. Only catalogue ids count, each once, in the caller's
 * order; with none left the call is refused. `false` when refused or unchanged.
 */
export function setRunScenarios(
  draft: Document,
  runId: string,
  scenarioIds: readonly string[],
): boolean {
  const run = draft.checklistRuns[runId];
  if (!run || run.finished !== undefined) return false;
  const known = new Set(run.catalogue.scenarios.map((s) => s.id));
  const next = [...new Set(scenarioIds)].filter((id) => known.has(id));
  if (next.length === 0) return false;
  if (next.length === run.scenarios.length && next.every((id, i) => id === run.scenarios[i])) {
    return false;
  }
  run.scenarios = next;
  return true;
}

/** Finish an open run. `false` for an unknown run or one already finished (its time stands). */
export function finishRun(draft: Document, runId: string, at: string): boolean {
  const run = draft.checklistRuns[runId];
  if (!run || run.finished !== undefined) return false;
  run.finished = at;
  return true;
}
