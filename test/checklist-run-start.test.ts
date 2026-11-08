import { describe, expect, it } from 'vitest';
import { buildCatalogueSnapshot, checklistPacks, startRun } from '../src/engine';
import { DocumentSchema, emptyDocument } from '../src/model';
import { bundledPacks } from '../src/packs';

describe('starting a run on the bundled catalogue', () => {
  const packs = bundledPacks();
  const doc = emptyDocument('local', '2026-01-01T00:00:00Z');
  const all = checklistPacks(packs, doc.settings.region).flatMap((p) =>
    p.scenarios.map((s) => s.id),
  );

  it('snapshots every region scenario and a state per step, and the document parses', () => {
    const run = startRun(doc, packs, {
      runId: 'run-real',
      started: '2026-11-15T10:00:00Z',
      asOf: '2026-11-15',
      scenarioIds: all.slice(0, 1),
    });
    expect(run).toBeDefined();
    const snap = run!.catalogue;
    expect(snap.scenarios.map((s) => s.id)).toEqual(all);
    expect(snap.steps.length).toBeGreaterThan(0);
    expect(new Set(snap.steps.map((s) => s.id)).size).toBe(snap.steps.length);
    expect(Object.keys(doc.checklistStepStates)).toHaveLength(snap.steps.length);
    expect(snap).toEqual(buildCatalogueSnapshot(doc, packs, '2026-11-15'));
    expect(DocumentSchema.safeParse(doc).success).toBe(true);
  });
});
