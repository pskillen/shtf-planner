import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { DocumentSchema, type ChecklistRun, type Document } from '../model';
import { openStore, type DocumentStore } from './documentStore';
import { applyChoice, classify, DOC_ROOT, plainFromBytes, type Classified } from './syncRecords';

/**
 * Two real stores (real Yjs, real IndexedDB shim) stand in for two phones. `meet` does what a
 * Drive pull does on each side: snapshot base, local and remote, classify, merge. Nothing here
 * calls a command; there are none yet, so records are written straight through `change`.
 */

const T0 = '2026-03-04T10:00:00.000Z';
const T1 = '2026-03-04T11:00:00.000Z';
const T2 = '2026-03-04T12:00:00.000Z';

const STEPS = [
  { id: 'prep', scenarios: ['s1'] },
  { id: 'shared', scenarios: ['s1', 's2'] },
  { id: 'other', scenarios: ['s2'] },
  { id: 'hidden', scenarios: ['s3'] },
] as const;

const run = (id: string, scenarios: string[]): ChecklistRun => ({
  id,
  scenarios,
  started: T0,
  catalogue: {
    packs: [{ id: 'checklists-base', version: 1 }],
    scenarios: [
      { id: 's1', name: 'Flood' },
      { id: 's2', name: 'Power cut' },
      { id: 's3', name: 'Heatwave' },
    ],
    steps: STEPS.map((s, i) => ({
      id: s.id,
      packId: 'checklists-base',
      text: `Step ${s.id}`,
      phase: 'immediate' as const,
      order: i,
      scenarios: [...s.scenarios],
      source: 'assumption',
    })),
  },
});

/** What starting a run writes: the run and one state per snapshotted step, hidden ones too. */
const start = (draft: Document, id: string, scenarios: string[]): void => {
  draft.checklistRuns[id] = run(id, scenarios);
  for (const s of STEPS) {
    draft.checklistStepStates[`${id}|${s.id}`] = { runId: id, stepId: s.id };
  }
};

let n = 0;
const open = (deviceId: string) =>
  openStore({
    name: `cl-${deviceId}-${n++}-${Math.random()}`,
    env: 'local',
    deviceId,
    channel: false,
    validate: true,
  });

/** Two devices that share a document with one run `r` (scenarios `s1` unless told) started. */
async function world(scenarios: string[] = ['s1'], seed?: (draft: Document) => void) {
  const a = await open('a');
  const b = await open('b');
  a.change('start run', (d) => {
    start(d, 'r', scenarios);
    seed?.(d);
  });
  b.mergeBytes(a.bytes());
  return { a, b, base: a.bytes() };
}

interface Meeting {
  /** What device A is told about B's copy, and B about A's. */
  fromA: Classified;
  fromB: Classified;
}

/** Both sides classify before either merges (as each would on its own pull), then both merge. */
function meet(a: DocumentStore, b: DocumentStore, base: Uint8Array): Meeting {
  const basePlain = plainFromBytes(base);
  const plainA = JSON.parse(JSON.stringify(a.get())) as Record<string, unknown>;
  const plainB = JSON.parse(JSON.stringify(b.get())) as Record<string, unknown>;
  const bytesA = a.bytes();
  const bytesB = b.bytes();
  const fromA = classify(basePlain, plainA, plainFromBytes(bytesB));
  const fromB = classify(basePlain, plainB, plainFromBytes(bytesA));
  a.mergeBytes(bytesB);
  b.mergeBytes(bytesA);
  expect(a.status().kind).toBe('ok');
  expect(b.status().kind).toBe('ok');
  expect(a.export()).toBe(b.export());
  expect(DocumentSchema.safeParse(a.get()).success).toBe(true);
  return { fromA, fromB };
}

const keys = (c: Classified) => c.conflicts.map((x) => x.key);
const tick = (d: Document, step: string, at: string) => {
  d.checklistStepStates[`r|${step}`]!.doneAt = at;
};
const note = (d: Document, step: string, text: string) => {
  d.checklistStepStates[`r|${step}`]!.note = text;
};

/** The scenarios array exactly as Yjs holds it, duplicates included. */
function rawScenarios(store: DocumentStore, runId: string): unknown[] {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, store.bytes());
  const runs = ydoc.getMap(DOC_ROOT).get('checklistRuns') as Y.Map<Y.Map<unknown>>;
  return (runs.get(runId)!.get('scenarios') as Y.Array<unknown>).toArray();
}

describe('two devices working one checklist run', () => {
  it('keeps different steps ticked on each device, with no conflict', async () => {
    const { a, b, base } = await world();
    a.change('tick', (d) => tick(d, 'prep', T1));
    b.change('tick', (d) => tick(d, 'shared', T2));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    for (const s of [a, b]) {
      expect(s.get().checklistStepStates['r|prep']!.doneAt).toBe(T1);
      expect(s.get().checklistStepStates['r|shared']!.doneAt).toBe(T2);
    }
  });

  it('keeps both when one device ticks a step and the other writes its note', async () => {
    const { a, b, base } = await world();
    a.change('tick', (d) => tick(d, 'prep', T1));
    b.change('note', (d) => note(d, 'prep', 'checked the meter'));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    expect(a.get().checklistStepStates['r|prep']).toEqual({
      runId: 'r',
      stepId: 'prep',
      doneAt: T1,
      note: 'checked the meter',
    });
  });

  it('asks, with both values, when the two devices write different notes', async () => {
    const { a, b, base } = await world();
    a.change('note', (d) => note(d, 'prep', 'from a'));
    b.change('note', (d) => note(d, 'prep', 'from b'));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toHaveLength(1);
    expect(m.fromA.conflicts[0]).toMatchObject({
      key: 'checklistStepStates/r|prep',
      noun: 'Checklist step',
      title: 'Step prep',
      fields: [{ field: 'note', mine: 'from a', theirs: 'from b' }],
    });
    expect(m.fromB.conflicts[0]!.fields).toEqual([
      { field: 'note', mine: 'from b', theirs: 'from a' },
    ]);
    // The CRDT has already picked one, the same on both devices.
    expect(['from a', 'from b']).toContain(a.get().checklistStepStates['r|prep']!.note);
  });

  it('shows a tick against an untick as a conflict, and the note survives', async () => {
    const { a, b, base } = await world(['s1'], (d) => {
      tick(d, 'prep', T0);
      note(d, 'prep', 'keep me');
    });
    a.change('untick', (d) => {
      delete d.checklistStepStates['r|prep']!.doneAt;
    });
    b.change('tick again', (d) => tick(d, 'prep', T1));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toHaveLength(1);
    expect(m.fromA.conflicts[0]!.fields).toEqual([
      { field: 'doneAt', mine: undefined, theirs: T1 },
    ]);
    expect(m.fromB.conflicts[0]!.fields).toEqual([
      { field: 'doneAt', mine: T1, theirs: undefined },
    ]);
    // A concurrent set beats a delete, so the later tick stands on both devices.
    for (const s of [a, b]) {
      expect(s.get().checklistStepStates['r|prep']).toMatchObject({ doneAt: T1, note: 'keep me' });
    }
  });

  it('lets two devices tick the same step at the same time without a conflict or a lost note', async () => {
    const { a, b, base } = await world();
    a.change('tick', (d) => tick(d, 'prep', T1));
    b.change('tick and note', (d) => {
      tick(d, 'prep', T1);
      note(d, 'prep', 'b wrote this');
    });
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    expect(a.get().checklistStepStates['r|prep']).toMatchObject({
      doneAt: T1,
      note: 'b wrote this',
    });
  });
});

describe('the same tick or finish at different moments', () => {
  it('raises no question when both devices tick one step at different times, either way round', async () => {
    const { a, b, base } = await world();
    a.change('tick', (d) => tick(d, 'prep', T1));
    b.change('tick later', (d) => tick(d, 'prep', T2));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    // One time stands, the same on both devices; the step is done.
    expect([T1, T2]).toContain(a.get().checklistStepStates['r|prep']!.doneAt);
  });

  it('raises no question when both devices finish one run at different times', async () => {
    const { a, b, base } = await world();
    a.change('finish', (d) => {
      d.checklistRuns.r!.finished = T1;
    });
    b.change('finish later', (d) => {
      d.checklistRuns.r!.finished = T2;
    });
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    expect([T1, T2]).toContain(a.get().checklistRuns.r!.finished);
  });

  it('still asks when one device re-ticks an already ticked step and the other unticks it', async () => {
    const { a, b, base } = await world(['s1'], (d) => tick(d, 'prep', T0));
    a.change('re-tick', (d) => tick(d, 'prep', T1));
    b.change('untick', (d) => {
      delete d.checklistStepStates['r|prep']!.doneAt;
    });
    const m = meet(a, b, base);
    expect(m.fromA.conflicts[0]!.fields).toEqual([
      { field: 'doneAt', mine: T1, theirs: undefined },
    ]);
    expect(m.fromB.conflicts[0]!.fields).toEqual([
      { field: 'doneAt', mine: undefined, theirs: T1 },
    ]);
  });

  it('still asks when one device unfinishes a run and the other finishes it', async () => {
    const { a, b, base } = await world(['s1'], (d) => {
      d.checklistRuns.r!.finished = T0;
    });
    a.change('reopen', (d) => {
      delete d.checklistRuns.r!.finished;
    });
    b.change('finish again', (d) => {
      d.checklistRuns.r!.finished = T2;
    });
    const m = meet(a, b, base);
    expect(m.fromA.conflicts[0]!.fields).toEqual([
      { field: 'finished', mine: undefined, theirs: T2 },
    ]);
    expect(m.fromB.conflicts[0]!.fields).toEqual([
      { field: 'finished', mine: T2, theirs: undefined },
    ]);
  });

  it('still asks about a note while the ticks, at different times, are not asked about', async () => {
    const { a, b, base } = await world();
    a.change('tick and note', (d) => {
      tick(d, 'prep', T1);
      note(d, 'prep', 'from a');
    });
    b.change('tick and note', (d) => {
      tick(d, 'prep', T2);
      note(d, 'prep', 'from b');
    });
    const m = meet(a, b, base);
    expect(m.fromA.conflicts[0]!.fields.map((f) => f.field)).toEqual(['note']);
  });
});

describe('two devices changing the scenarios of one run', () => {
  it('keeps different scenarios added on each device, hidden states intact', async () => {
    const { a, b, base } = await world(['s1']);
    a.change('add', (d) => void d.checklistRuns.r!.scenarios.push('s2'));
    b.change('add', (d) => void d.checklistRuns.r!.scenarios.push('s3'));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    for (const s of [a, b]) {
      expect([...s.get().checklistRuns.r!.scenarios].sort()).toEqual(['s1', 's2', 's3']);
      // Every snapshotted step still has its state, including the one only s3 uses.
      expect(Object.keys(s.get().checklistStepStates).sort()).toEqual(
        STEPS.map((x) => `r|${x.id}`).sort(),
      );
      expect(s.get().checklistRuns.r!.catalogue.steps).toHaveLength(STEPS.length);
    }
  });

  it('copes with both devices adding the same scenario: no conflict, a valid document', async () => {
    const { a, b, base } = await world(['s1']);
    a.change('add', (d) => void d.checklistRuns.r!.scenarios.push('s2'));
    b.change('add', (d) => void d.checklistRuns.r!.scenarios.push('s2'));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    // The merge really did leave a duplicate in the CRDT; readers see it once.
    expect(rawScenarios(a, 'r').filter((x) => x === 's2')).toHaveLength(2);
    expect(a.get().checklistRuns.r!.scenarios).toEqual(['s1', 's2']);
    // Removing it later removes every copy.
    a.change('remove', (d) => {
      d.checklistRuns.r!.scenarios = ['s1'];
    });
    expect(rawScenarios(a, 'r')).toEqual(['s1']);
  });

  it('surfaces one device removing a scenario while the other adds one', async () => {
    const { a, b, base } = await world(['s1', 's2']);
    a.change('remove', (d) => {
      d.checklistRuns.r!.scenarios = ['s1'];
    });
    b.change('add', (d) => void d.checklistRuns.r!.scenarios.push('s3'));
    const m = meet(a, b, base);
    expect(keys(m.fromA)).toEqual(['checklistRuns/r']);
    expect(keys(m.fromB)).toEqual(['checklistRuns/r']);
    expect(m.fromA.conflicts[0]!.fields).toEqual([
      { field: 'scenarios', mine: ['s1'], theirs: ['s1', 's2', 's3'] },
    ]);
    expect([...a.get().checklistRuns.r!.scenarios].sort()).toEqual(['s1', 's3']);
  });

  it('stays valid, and says so, when each device removes a different scenario and none is left', async () => {
    const { a, b, base } = await world(['s1', 's2']);
    a.change('remove', (d) => {
      d.checklistRuns.r!.scenarios = ['s2'];
    });
    b.change('remove', (d) => {
      d.checklistRuns.r!.scenarios = ['s1'];
    });
    const m = meet(a, b, base);
    expect(a.get().checklistRuns.r!.scenarios).toEqual([]);
    expect(keys(m.fromA)).toEqual(['checklistRuns/r']);
    expect(keys(m.fromB)).toEqual(['checklistRuns/r']);
    expect(m.fromA.conflicts[0]!.fields).toEqual([
      { field: 'scenarios', mine: ['s2'], theirs: ['s1'] },
    ]);
    // The empty run is still a normal document: it can be edited and merged again.
    a.change('pick again', (d) => void d.checklistRuns.r!.scenarios.push('s1'));
    b.mergeBytes(a.bytes());
    expect(b.get().checklistRuns.r!.scenarios).toEqual(['s1']);
  });
});

describe('finishing and starting across devices', () => {
  it('shows both the finish and an offline step edit after convergence (finish is no lock)', async () => {
    const { a, b, base } = await world();
    a.change('finish', (d) => {
      d.checklistRuns.r!.finished = T2;
    });
    b.change('tick offline', (d) => {
      tick(d, 'prep', T1);
      note(d, 'prep', 'done before the lights went');
    });
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    for (const s of [a, b]) {
      expect(s.get().checklistRuns.r!.finished).toBe(T2);
      expect(s.get().checklistStepStates['r|prep']).toMatchObject({
        doneAt: T1,
        note: 'done before the lights went',
      });
    }
  });

  it('keeps two runs started independently as two runs', async () => {
    const a = await open('a');
    const b = await open('b');
    const base = a.bytes();
    a.change('start', (d) => start(d, 'run-a', ['s1']));
    b.change('start', (d) => start(d, 'run-b', ['s2']));
    const m = meet(a, b, base);
    expect(m.fromA.conflicts).toEqual([]);
    expect(m.fromB.conflicts).toEqual([]);
    for (const s of [a, b]) {
      expect(Object.keys(s.get().checklistRuns).sort()).toEqual(['run-a', 'run-b']);
      expect(Object.keys(s.get().checklistStepStates)).toHaveLength(STEPS.length * 2);
    }
  });
});

describe('choosing a copy for a checklist conflict', () => {
  for (const side of ['mine', 'theirs'] as const) {
    it(`applyChoice(${side}) sets the run and the step to that device's values`, async () => {
      const { a, b, base } = await world(['s1', 's2']);
      a.change('edit', (d) => {
        d.checklistRuns.r!.scenarios = ['s1'];
        note(d, 'prep', 'from a');
      });
      b.change('edit', (d) => {
        d.checklistRuns.r!.scenarios.push('s3');
        note(d, 'prep', 'from b');
      });
      const m = meet(a, b, base);
      expect(keys(m.fromA)).toEqual(['checklistRuns/r', 'checklistStepStates/r|prep']);
      a.change('choose', (d) => {
        for (const c of m.fromA.conflicts) applyChoice(d, c, side);
      });
      const doc = a.get();
      expect(DocumentSchema.safeParse(doc).success).toBe(true);
      if (side === 'mine') {
        expect(doc.checklistRuns.r!.scenarios).toEqual(['s1']);
        expect(doc.checklistStepStates['r|prep']!.note).toBe('from a');
      } else {
        expect([...doc.checklistRuns.r!.scenarios].sort()).toEqual(['s1', 's2', 's3']);
        expect(doc.checklistStepStates['r|prep']!.note).toBe('from b');
      }
      // The choice is an ordinary change: it travels to the other device.
      b.mergeBytes(a.bytes());
      expect(b.export()).toBe(a.export());
    });
  }
});
