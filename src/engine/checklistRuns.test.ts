import { describe, expect, it } from 'vitest';
import {
  emptyDocument,
  type ChecklistStep,
  type ChecklistsPack,
  type Document,
  type Pack,
  type Packs,
} from '../model';
import { buildCatalogueSnapshot, checklistStateKey, startRun } from './checklistRuns';

const NOW = '2026-11-15';
const RUN = 'run-1';

function step(id: string, over: Partial<ChecklistStep> = {}): ChecklistStep {
  return {
    id,
    text: `Do the ${id} Thing`,
    scenarios: ['a:power'],
    phase: 'immediate',
    order: 1,
    source: 'assumption',
    ...over,
  };
}

function pack(over: Partial<ChecklistsPack> = {}): ChecklistsPack {
  return {
    format: 1,
    id: 'a',
    version: 3,
    name: 'a',
    kind: 'checklists',
    region: 'UK',
    scenarios: [
      { id: 'a:power', name: 'Power cut' },
      { id: 'a:flood', name: 'Flood' },
    ],
    steps: [
      step('a:late', { phase: 'first-days', scenarios: ['a:power', 'a:flood'] }),
      step('a:b', { order: 2 }),
      step('a:a', { order: 2 }),
      step('a:flood-only', { scenarios: ['a:flood'], phase: 'coming' }),
      step('a:pets', { requires: { pets: true } }),
      step('a:risky', { requires: { risk: 'grid' } }),
    ],
    sources: [{ url: 'https://example.org/x', title: 'X', checked: '2026-01-01' }],
    ...over,
  } as ChecklistsPack;
}

const packsOf = (...all: Pack[]): Packs => ({ all }) as unknown as Packs;

const fresh = (): Document => emptyDocument('local', '2026-01-01T00:00:00Z');
const input = (scenarioIds: string[], runId = RUN) => ({
  runId,
  started: '2026-11-15T10:00:00Z',
  asOf: NOW,
  scenarioIds,
});

describe('buildCatalogueSnapshot', () => {
  it('covers every region scenario and applicable step in canonical order', () => {
    const snap = buildCatalogueSnapshot(fresh(), packsOf(pack()), NOW);
    expect(snap.packs).toEqual([{ id: 'a', version: 3 }]);
    expect(snap.scenarios.map((s) => s.id)).toEqual(['a:power', 'a:flood']);
    expect(snap.steps.map((s) => s.id)).toEqual(['a:flood-only', 'a:a', 'a:b', 'a:late']);
    const late = snap.steps.find((s) => s.id === 'a:late');
    expect(late?.scenarios).toEqual(['a:power', 'a:flood']);
    expect(late?.packId).toBe('a');
  });

  it('applies household requirements', () => {
    const d = fresh();
    d.household.pets = [{ id: 'p1', kind: 'dog', name: 'Bran' }] as never;
    d.home.risks = ['grid'];
    const ids = buildCatalogueSnapshot(d, packsOf(pack()), NOW).steps.map((s) => s.id);
    expect(ids).toContain('a:pets');
    expect(ids).toContain('a:risky');
  });

  it('carries the source title and checked date, and the step order', () => {
    const p = pack({ steps: [step('a:s', { source: 'https://example.org/x', order: 7 })] });
    const [s] = buildCatalogueSnapshot(fresh(), packsOf(p), NOW).steps;
    expect(s).toMatchObject({ sourceTitle: 'X', sourceChecked: '2026-01-01', order: 7 });
  });

  it('ignores packs of another region', () => {
    const snap = buildCatalogueSnapshot(fresh(), packsOf(pack({ region: 'US' })), NOW);
    expect(snap).toEqual({ packs: [], scenarios: [], steps: [] });
  });
});

describe('startRun', () => {
  it('writes the run and a state for every step, including unselected scenarios', () => {
    const d = fresh();
    const run = startRun(d, packsOf(pack()), input(['a:power']));
    expect(run?.scenarios).toEqual(['a:power']);
    expect(d.checklistRuns[RUN]).toBe(run);
    const flood = run!.catalogue.steps.find((s) => s.id === 'a:flood-only');
    expect(flood).toBeDefined();
    expect(d.checklistStepStates[checklistStateKey(RUN, 'a:flood-only')]).toEqual({
      runId: RUN,
      stepId: 'a:flood-only',
    });
    expect(Object.keys(d.checklistStepStates)).toHaveLength(run!.catalogue.steps.length);
  });

  it('keeps its snapshot when live data and the packs are changed in place afterwards', () => {
    const d = fresh();
    const p = pack();
    const live = packsOf(p);
    startRun(d, live, input(['a:power']));
    const before = structuredClone(d.checklistRuns[RUN]);
    const statesBefore = structuredClone(d.checklistStepStates);
    d.home.risks = ['grid', 'flood'];
    d.household.pets = [{ id: 'p1', kind: 'dog', name: 'Bran' }] as never;
    d.settings.region = 'US';
    p.version = 99;
    p.name = 'renamed';
    for (const sc of p.scenarios) sc.name = 'renamed';
    for (const st of p.steps) {
      st.text = 'rewritten';
      st.phase = 'coming';
      st.order = 50;
      st.scenarios.push('a:other');
    }
    p.steps.length = 1;
    expect(d.checklistRuns[RUN]).toEqual(before);
    expect(d.checklistStepStates).toEqual(statesBefore);
    expect(buildCatalogueSnapshot(d, live, NOW).steps).toEqual([]);
  });

  it('shares no object with the packs', () => {
    const d = fresh();
    const p = pack();
    const run = startRun(d, packsOf(p), input(['a:power']))!;
    const owned = new Set<object>();
    const collect = (v: unknown): void => {
      if (typeof v !== 'object' || v === null || owned.has(v)) return;
      owned.add(v);
      Object.values(v).forEach(collect);
    };
    collect(p);
    const shared: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (typeof v !== 'object' || v === null) return;
      if (owned.has(v)) shared.push(path);
      Object.entries(v).forEach(([k, c]) => walk(c, `${path}.${k}`));
    };
    walk(run, 'run');
    walk(d.checklistStepStates, 'states');
    expect(shared).toEqual([]);
  });

  it('keys states as runId|stepId, literally', () => {
    expect(checklistStateKey('r1', 's1')).toBe('r1|s1');
    const d = fresh();
    startRun(d, packsOf(pack()), input(['a:power']));
    expect(Object.keys(d.checklistStepStates)).toContain('run-1|a:flood-only');
    expect(Object.keys(d.checklistStepStates)).not.toContain('a:flood-only|run-1');
  });

  it('keeps the step text exactly, capitals included', () => {
    const [s] = buildCatalogueSnapshot(
      fresh(),
      packsOf(pack({ steps: [step('a:s', { text: 'Fill the BATH' })] })),
      NOW,
    ).steps;
    expect(s?.text).toBe('Fill the BATH');
  });

  it("keeps canonical pack order and each pack's own step order across two packs", () => {
    const b = pack({
      id: 'b',
      scenarios: [{ id: 'b:power', name: 'B power' }],
      steps: [
        step('b:x', { scenarios: ['b:power'], order: 5 }),
        step('b:y', { scenarios: ['b:power'], order: 6 }),
      ],
    });
    const a = pack({
      scenarios: [{ id: 'a:power', name: 'A power' }],
      steps: [step('a:x', { order: 1 }), step('a:y', { order: 2 })],
    });
    const snap = buildCatalogueSnapshot(fresh(), packsOf(b, a), NOW);
    expect(snap.packs.map((x) => x.id)).toEqual(['b', 'a']);
    expect(snap.scenarios.map((x) => x.id)).toEqual(['b:power', 'a:power']);
    expect(snap.steps.map((x) => [x.id, x.order])).toEqual([
      ['b:x', 5],
      ['b:y', 6],
      ['a:x', 1],
      ['a:y', 2],
    ]);
    const d = fresh();
    startRun(d, packsOf(b, a), input(['a:power', 'b:power']));
    expect(Object.keys(d.checklistStepStates)).toHaveLength(4);
  });

  it('writes nothing when the region has no pack', () => {
    const d = fresh();
    d.settings.region = 'US';
    const before = structuredClone(d);
    expect(startRun(d, packsOf(pack()), input(['a:power']))).toBeUndefined();
    expect(d).toEqual(before);
  });

  it('writes nothing when the run id already exists', () => {
    const d = fresh();
    const p = packsOf(pack());
    startRun(d, p, input(['a:power']));
    const before = structuredClone(d);
    expect(startRun(d, p, input(['a:flood']))).toBeUndefined();
    expect(d).toEqual(before);
  });

  it('writes nothing for an empty or unknown selection', () => {
    const d = fresh();
    const before = structuredClone(d);
    expect(startRun(d, packsOf(pack()), input([]))).toBeUndefined();
    expect(startRun(d, packsOf(pack()), input(['nope']))).toBeUndefined();
    expect(d).toEqual(before);
  });

  it('selects only known ids, once each', () => {
    const d = fresh();
    const run = startRun(d, packsOf(pack()), input(['a:flood', 'nope', 'a:flood']));
    expect(run?.scenarios).toEqual(['a:flood']);
  });
});
