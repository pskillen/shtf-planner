import { describe, expect, it } from 'vitest';
import {
  checklistRunLists,
  checklistRunView,
  checklistStateKey,
  clearStepDone,
  finishRun,
  setRunScenarios,
  setStepDone,
  setStepNote,
} from '../src/engine';
import { DocumentSchema, emptyDocument, type Document } from '../src/model';

const step = (id: string, phase: 'coming' | 'immediate', scenarios: string[], order = 1) => ({
  id,
  packId: 'p',
  text: id,
  phase,
  order,
  scenarios,
  source: 'assumption',
});

function fixture(): Document {
  const doc = emptyDocument('local', '2026-01-01T00:00:00Z');
  const steps = [
    step('p:a', 'coming', ['p:power']),
    step('p:b', 'coming', ['p:power', 'p:flood']),
    step('p:c', 'immediate', ['p:flood']),
  ];
  doc.checklistRuns['r1'] = {
    id: 'r1',
    scenarios: ['p:power'],
    started: '2026-11-01T10:00:00Z',
    catalogue: {
      packs: [{ id: 'p', version: 2 }],
      scenarios: [
        { id: 'p:power', name: 'Power cut' },
        { id: 'p:flood', name: 'Flood' },
      ],
      steps,
    },
  };
  for (const s of steps) {
    doc.checklistStepStates[checklistStateKey('r1', s.id)] = { runId: 'r1', stepId: s.id };
  }
  return doc;
}

describe('run commands', () => {
  it('untick keeps the note; a note works without a tick; empty deletes the field', () => {
    const d = fixture();
    const k = checklistStateKey('r1', 'p:a');
    expect(setStepNote(d, 'r1', 'p:a', ' keep ')).toBe(true);
    expect(d.checklistStepStates[k]).toEqual({ runId: 'r1', stepId: 'p:a', note: ' keep ' });
    expect(setStepDone(d, 'r1', 'p:a', '2026-11-01T11:00:00Z')).toBe(true);
    expect(clearStepDone(d, 'r1', 'p:a')).toBe(true);
    expect(d.checklistStepStates[k]).toEqual({ runId: 'r1', stepId: 'p:a', note: ' keep ' });
    expect(setStepNote(d, 'r1', 'p:a', '')).toBe(true);
    expect('note' in d.checklistStepStates[k]!).toBe(false);
    expect(DocumentSchema.safeParse(d).success).toBe(true);
  });

  it('writes nothing when the value is unchanged', () => {
    const d = fixture();
    expect(setStepDone(d, 'r1', 'p:a', 't1')).toBe(true);
    expect(setStepDone(d, 'r1', 'p:a', 't2')).toBe(false);
    expect(d.checklistStepStates[checklistStateKey('r1', 'p:a')]!.doneAt).toBe('t1');
    expect(clearStepDone(d, 'r1', 'p:b')).toBe(false);
    expect(setStepNote(d, 'r1', 'p:b', '')).toBe(false);
    setStepNote(d, 'r1', 'p:b', 'x');
    expect(setStepNote(d, 'r1', 'p:b', 'x')).toBe(false);
    expect(setRunScenarios(d, 'r1', ['p:power'])).toBe(false);
  });

  it('is a no-op on a finished or unknown run, or an unknown step', () => {
    const d = fixture();
    expect(finishRun(d, 'r1', 'f1')).toBe(true);
    expect(finishRun(d, 'r1', 'f2')).toBe(false);
    expect(d.checklistRuns['r1']!.finished).toBe('f1');
    const before = structuredClone(d);
    expect(setStepDone(d, 'r1', 'p:a', 't')).toBe(false);
    expect(clearStepDone(d, 'r1', 'p:a')).toBe(false);
    expect(setStepNote(d, 'r1', 'p:a', 'n')).toBe(false);
    expect(setRunScenarios(d, 'r1', ['p:flood'])).toBe(false);
    expect(setStepDone(d, 'nope', 'p:a', 't')).toBe(false);
    expect(finishRun(d, 'nope', 't')).toBe(false);
    expect(d).toEqual(before);
    expect(setStepDone(fixture(), 'r1', 'p:zzz', 't')).toBe(false);
  });

  it('setRunScenarios keeps catalogue ids only, once each, and needs at least one', () => {
    const d = fixture();
    expect(setRunScenarios(d, 'r1', ['x', 'p:flood', 'p:flood'])).toBe(true);
    expect(d.checklistRuns['r1']!.scenarios).toEqual(['p:flood']);
    expect(setRunScenarios(d, 'r1', ['x'])).toBe(false);
    expect(setRunScenarios(d, 'r1', [])).toBe(false);
    expect(d.checklistRuns['r1']!.scenarios).toEqual(['p:flood']);
  });
});

describe('checklistRunView', () => {
  it('hides exclusive steps only, and re-adding a scenario restores their states', () => {
    const d = fixture();
    setStepDone(d, 'r1', 'p:c', 't');
    setStepNote(d, 'r1', 'p:c', 'garage');
    setStepDone(d, 'r1', 'p:a', 't');
    let v = checklistRunView(d, 'r1')!;
    expect(v.groups.map((g) => g.steps.map((s) => s.id))).toEqual([['p:a', 'p:b']]);
    expect(v).toMatchObject({ done: 1, total: 2, hiddenWithState: 1, needsScenario: false });
    expect(v.scenarios).toEqual([
      { id: 'p:power', name: 'Power cut', selected: true },
      { id: 'p:flood', name: 'Flood', selected: false },
    ]);
    expect(v.packs).toEqual([{ id: 'p', version: 2 }]);

    setRunScenarios(d, 'r1', ['p:flood']);
    v = checklistRunView(d, 'r1')!;
    expect(v.groups.map((g) => g.steps.map((s) => s.id))).toEqual([['p:b'], ['p:c']]);
    expect(v.hiddenWithState).toBe(1); // p:a is now hidden and ticked
    setRunScenarios(d, 'r1', ['p:power', 'p:flood']);
    v = checklistRunView(d, 'r1')!;
    expect(v.groups[1]!.steps[0]).toMatchObject({ doneAt: 't', note: 'garage' });
    expect(v).toMatchObject({ done: 2, total: 3, hiddenWithState: 0 });
  });

  it('counts a shared step once and lists only selected supplying scenarios', () => {
    const d = fixture();
    expect(checklistRunView(d, 'r1')!.groups[0]!.steps[1]!.selectedScenarioIds).toEqual([
      'p:power',
    ]);
    setRunScenarios(d, 'r1', ['p:power', 'p:flood']);
    const v = checklistRunView(d, 'r1')!;
    expect(v.total).toBe(3);
    expect(v.groups[0]!.steps[1]!.selectedScenarioIds).toEqual(['p:power', 'p:flood']);
  });

  it('de-duplicates merged scenarios and reports needsScenario when none are valid', () => {
    const d = fixture();
    d.checklistRuns['r1']!.scenarios = ['p:power', 'p:power', 'gone'];
    const v = checklistRunView(d, 'r1')!;
    expect(v.total).toBe(2);
    expect(v.scenarios.filter((s) => s.selected)).toHaveLength(1);
    expect(DocumentSchema.safeParse(d).success).toBe(true);

    d.checklistRuns['r1']!.scenarios = [];
    expect(checklistRunView(d, 'r1')).toMatchObject({
      needsScenario: true,
      groups: [],
      total: 0,
      done: 0,
    });
    expect(DocumentSchema.safeParse(d).success).toBe(true);
    expect(checklistRunView(d, 'nope')).toBeUndefined();
  });

  it('shows late edits to a finished run, with both doneAt and finished set', () => {
    const d = fixture();
    finishRun(d, 'r1', 'f');
    const state = d.checklistStepStates[checklistStateKey('r1', 'p:a')]!;
    state.doneAt = 'late';
    state.note = 'merged';
    const v = checklistRunView(d, 'r1')!;
    expect(v.finished).toBe('f');
    expect(v.groups[0]!.steps[0]).toMatchObject({ doneAt: 'late', note: 'merged' });
    expect(v.done).toBe(1);
  });

  it('lists open and finished runs, newest first, and leaves plans untouched', () => {
    const d = fixture();
    const plans = structuredClone(d.plans);
    const base = d.checklistRuns['r1']!;
    d.checklistRuns['r2'] = { ...structuredClone(base), id: 'r2', started: '2026-11-05T10:00:00Z' };
    d.checklistRuns['r3'] = {
      ...structuredClone(base),
      id: 'r3',
      started: '2026-10-01T10:00:00Z',
      finished: 'f',
    };
    setStepDone(d, 'r1', 'p:a', 't');
    const l = checklistRunLists(d);
    expect(l.open.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(l.finished.map((r) => r.id)).toEqual(['r3']);
    expect(l.open[1]).toMatchObject({ scenarioNames: ['Power cut'], done: 1, total: 2 });
    expect(d.plans).toEqual(plans);
  });
});
