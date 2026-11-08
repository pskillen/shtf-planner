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
    text: id,
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

  it('keeps its snapshot when the household and packs change afterwards', () => {
    const d = fresh();
    startRun(d, packsOf(pack()), input(['a:power']));
    const before = structuredClone(d.checklistRuns[RUN]);
    d.home.risks = ['grid', 'flood'];
    d.household.pets = [{ id: 'p1', kind: 'dog', name: 'Bran' }] as never;
    d.settings.region = 'US';
    const changed = packsOf(pack({ version: 4, steps: [step('a:new', { text: 'rewritten' })] }));
    expect(buildCatalogueSnapshot(d, changed, NOW).steps).toEqual([]);
    d.settings.region = 'UK';
    expect(buildCatalogueSnapshot(d, changed, NOW)).not.toEqual(before!.catalogue);
    expect(d.checklistRuns[RUN]).toEqual(before);
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
