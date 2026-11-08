import { CHECKLIST_PHASES } from '../model';
import type {
  ChecklistCatalogueSnapshot,
  ChecklistPhase,
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

/**
 * Finish an open run. `false` for an unknown run, one already finished (its time stands), or one
 * with no valid selected scenario (a bad merge: it would become a record showing no steps).
 */
export function finishRun(draft: Document, runId: string, at: string): boolean {
  const run = draft.checklistRuns[runId];
  if (!run || run.finished !== undefined) return false;
  const known = new Set(run.catalogue.scenarios.map((s) => s.id));
  if (!run.scenarios.some((id) => known.has(id))) return false;
  run.finished = at;
  return true;
}

/** One step of a run as a screen shows it: the frozen advice plus its tick and note. */
export interface ChecklistRunStepView extends ChecklistSnapshotStep {
  doneAt?: string;
  note?: string;
  /** The selected scenarios that supply this step (catalogue order of the step), never empty. */
  selectedScenarioIds: string[];
}

export interface ChecklistRunView {
  id: string;
  started: string;
  finished?: string;
  /** Every catalogue scenario, flagged when selected. */
  scenarios: { id: string; name: string; selected: boolean }[];
  /** Visible steps only, by checklist phase; empty phases are omitted. */
  groups: { phase: ChecklistPhase; steps: ChecklistRunStepView[] }[];
  /** Visible steps only. */
  done: number;
  total: number;
  /** Hidden steps that still carry a tick or a note. */
  hiddenWithState: number;
  /** A merge left no valid selected scenario: `groups` is empty. */
  needsScenario: boolean;
  packs: { id: string; version: number }[];
}

export interface ChecklistRunSummary {
  id: string;
  started: string;
  finished?: string;
  /** Selected scenario names, de-duplicated, in catalogue order. */
  scenarioNames: string[];
  done: number;
  total: number;
  needsScenario: boolean;
}

/**
 * A run as screens and print read it. Selected scenarios are de-duplicated and ids outside the
 * catalogue are ignored. A step is visible when a selected scenario supplies it; a shared step is
 * counted once. Reads the frozen catalogue and the states only, so it never touches plans or the
 * score, and shows late edits to a finished run as they are. `undefined` for an unknown run.
 */
export function checklistRunView(doc: Document, runId: string): ChecklistRunView | undefined {
  const run = doc.checklistRuns[runId];
  if (!run) return undefined;
  const catalogueIds = new Set(run.catalogue.scenarios.map((s) => s.id));
  const selected = new Set(run.scenarios.filter((id) => catalogueIds.has(id)));

  const byPhase = new Map<ChecklistPhase, ChecklistRunStepView[]>();
  let done = 0;
  let total = 0;
  let hiddenWithState = 0;
  for (const step of run.catalogue.steps) {
    const state = doc.checklistStepStates[checklistStateKey(runId, step.id)];
    const selectedScenarioIds = [...new Set(step.scenarios)].filter((id) => selected.has(id));
    if (selectedScenarioIds.length === 0) {
      if (state && (state.doneAt !== undefined || state.note !== undefined)) hiddenWithState += 1;
      continue;
    }
    total += 1;
    if (state?.doneAt !== undefined) done += 1;
    const view: ChecklistRunStepView = { ...step, selectedScenarioIds };
    if (state?.doneAt !== undefined) view.doneAt = state.doneAt;
    if (state?.note !== undefined) view.note = state.note;
    const list = byPhase.get(step.phase) ?? [];
    list.push(view);
    byPhase.set(step.phase, list);
  }

  return {
    id: run.id,
    started: run.started,
    ...(run.finished !== undefined ? { finished: run.finished } : {}),
    scenarios: run.catalogue.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      selected: selected.has(s.id),
    })),
    groups: CHECKLIST_PHASES.filter((p) => byPhase.has(p)).map((phase) => ({
      phase,
      steps: byPhase.get(phase)!,
    })),
    done,
    total,
    hiddenWithState,
    needsScenario: selected.size === 0,
    packs: run.catalogue.packs.map((p) => ({ ...p })),
  };
}

/** Every run, open and finished, newest started first (ties by id). */
export function checklistRunLists(doc: Document): {
  open: ChecklistRunSummary[];
  finished: ChecklistRunSummary[];
} {
  const runs = Object.values(doc.checklistRuns).sort(
    (a, b) => b.started.localeCompare(a.started) || a.id.localeCompare(b.id),
  );
  const open: ChecklistRunSummary[] = [];
  const finished: ChecklistRunSummary[] = [];
  for (const run of runs) {
    const view = checklistRunView(doc, run.id)!;
    const summary: ChecklistRunSummary = {
      id: run.id,
      started: run.started,
      ...(run.finished !== undefined ? { finished: run.finished } : {}),
      scenarioNames: view.scenarios.filter((s) => s.selected).map((s) => s.name),
      done: view.done,
      total: view.total,
      needsScenario: view.needsScenario,
    };
    (run.finished === undefined ? open : finished).push(summary);
  }
  return { open, finished };
}

/**
 * The open runs that include every one of the given scenarios (newest started first), for
 * offering to resume instead of starting again. Runs with extra scenarios count. Empty `ids`
 * matches nothing.
 */
export function openRunsIncluding(doc: Document, ids: readonly string[]): ChecklistRunSummary[] {
  if (ids.length === 0) return [];
  return checklistRunLists(doc).open.filter((summary) => {
    const selected = new Set(
      checklistRunView(doc, summary.id)
        ?.scenarios.filter((s) => s.selected)
        .map((s) => s.id),
    );
    return ids.every((id) => selected.has(id));
  });
}
