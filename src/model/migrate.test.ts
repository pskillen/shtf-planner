import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, emptyDocument } from './document';
import {
  MIGRATIONS,
  OLDEST_SCHEMA_VERSION,
  SchemaTooNewError,
  addChecklistRuns,
  SchemaTooOldError,
  migrate,
  migrateWith,
  reconcile,
  reconcileWith,
  traceSteps,
  type MigrationStep,
} from './migrate';

const doc = () => emptyDocument('local', '2026-01-01T00:00:00.000Z');
/** A document stamped with another schema version (its shape does not matter: it is refused first). */
const at = (v: number): Record<string, unknown> => {
  const d = doc();
  return { ...d, meta: { ...d.meta, schemaVersion: v } };
};

describe('migrate', () => {
  it('has one step, 4 to 5, and still opens nothing older than 4', () => {
    expect(MIGRATIONS.map((s) => [s.from, s.to, s.name])).toEqual([[4, 5, 'add-checklist-runs']]);
    expect(OLDEST_SCHEMA_VERSION).toBe(4);
    expect(SCHEMA_VERSION).toBe(5);
  });

  it('passes a current document unchanged', () => {
    expect(migrate(doc())).toEqual(doc());
    expect(reconcile(doc())).toEqual(doc());
  });

  it.each([3, 2, 1])('refuses a schema-%i household as too old, never migrating it', (v) => {
    expect(() => migrate(at(v))).toThrow(SchemaTooOldError);
    expect(() => reconcile(at(v))).toThrow(SchemaTooOldError);
    try {
      migrate(at(v));
    } catch (e) {
      expect((e as SchemaTooOldError).found).toBe(v);
      expect((e as SchemaTooOldError).oldest).toBe(4);
      expect((e as Error).message).toMatch(/Start a new household/);
    }
  });

  it('refuses a newer schema with a typed error', () => {
    const newer = at(SCHEMA_VERSION + 1);
    expect(() => migrate(newer)).toThrow(SchemaTooNewError);
    try {
      migrate(newer);
    } catch (e) {
      expect((e as SchemaTooNewError).found).toBe(SCHEMA_VERSION + 1);
      expect((e as SchemaTooNewError).supported).toBe(SCHEMA_VERSION);
      expect((e as Error).message).toMatch(/Update this device/);
    }
  });

  it('refuses things that are not documents', () => {
    expect(() => migrate({})).toThrow(/Not a SHTF Planner document/);
    expect(() => migrate(null)).toThrow(/Not a SHTF Planner document/);
  });

  it('does not change its input', () => {
    const input = doc();
    const copy = structuredClone(input);
    migrate(input);
    expect(input).toEqual(copy);
  });
});

// A fake schema 6 on top of the real 5: every location gets a `size` it lacked before. The step
// is per record and idempotent: a location that already has a size is left alone.
const addSize: MigrationStep = {
  from: 5,
  to: 6,
  name: 'locations get a size',
  up(raw) {
    const locations = { ...(raw.locations as Record<string, Record<string, unknown>>) };
    for (const [id, loc] of Object.entries(locations)) {
      locations[id] = loc.size === undefined ? { ...loc, size: 'M' } : loc;
    }
    return { ...raw, locations };
  },
};
const withLoc = (size?: string) => {
  const d = doc() as unknown as Record<string, unknown>;
  d.locations = {
    l: { id: 'l', name: 'Shed', kind: 'stored', conditions: [], ...(size ? { size } : {}) },
  };
  return d;
};

describe('migration steps', () => {
  it('migrateWith runs the steps from the stored version and stamps the target', () => {
    const out = migrateWith(withLoc(), [addSize], 6);
    expect(out.locations.l!.size).toBe('M');
    expect(out.meta.schemaVersion).toBe(6);
  });

  it('steps are idempotent per record', () => {
    const once = migrateWith(withLoc(), [addSize], 6);
    const twice = migrateWith({ ...once, meta: { ...once.meta, schemaVersion: 5 } }, [addSize], 6);
    expect(twice).toEqual(once);
    // a record already in the new shape keeps its own value
    expect(migrateWith(withLoc('L'), [addSize], 6).locations.l!.size).toBe('L');
  });

  it('reconcileWith brings an old-shaped record forward in an already-migrated document', () => {
    const merged = withLoc(); // an old client wrote this, but the document says schema 6
    (merged.meta as Record<string, unknown>).schemaVersion = 6;
    const out = reconcileWith(merged, [addSize], 6);
    expect(out.locations.l!.size).toBe('M');
    expect(out.meta.schemaVersion).toBe(6);
    // and reconciling again changes nothing
    expect(reconcileWith(out, [addSize], 6)).toEqual(out);
  });

  it('reconcileWith refuses a newer document', () => {
    const merged = withLoc();
    (merged.meta as Record<string, unknown>).schemaVersion = 7;
    expect(() => reconcileWith(merged, [addSize], 6)).toThrow(SchemaTooNewError);
  });

  it('a version below the first step is too old, not a missing step', () => {
    const steps = [...MIGRATIONS, addSize];
    expect(() => migrateWith(at(3), steps, 6)).toThrow(SchemaTooOldError);
    expect(() => reconcileWith(at(3), steps, 6)).toThrow(SchemaTooOldError);
    expect(() => traceSteps(at(3), steps, 6)).toThrow(SchemaTooOldError);
    try {
      migrateWith(at(3), steps, 6);
    } catch (e) {
      expect((e as SchemaTooOldError).oldest).toBe(4);
    }
  });

  it('a gap in the steps stops the walk with SchemaTooOldError at the gap', () => {
    const later: MigrationStep = { from: 7, to: 8, name: 'x', up: (r) => r };
    expect(() => migrateWith(withLoc(), [addSize, later], 8)).toThrow(SchemaTooOldError);
  });
});

// The real 4 to 5 step: two empty containers, nothing else.
describe('add-checklist-runs (schema 4 to 5)', () => {
  /** A schema-4 document: today's shape without the two containers. */
  const v4 = (): Record<string, unknown> => {
    const d = doc() as unknown as Record<string, unknown>;
    delete d.checklistRuns;
    delete d.checklistStepStates;
    return { ...d, meta: { ...(d.meta as object), schemaVersion: 4 } };
  };
  const run = (id: string, scenarios: string[] = ['power-cut']) => ({
    id,
    scenarios,
    started: '2026-11-01T10:00:00.000Z',
    catalogue: { packs: [{ id: 'checklists-base', version: 1 }], scenarios: [], steps: [] },
  });

  it('migrates a schema-4 document to empty containers and schema 5', () => {
    const out = migrate(v4());
    expect(out.meta.schemaVersion).toBe(5);
    expect(out.checklistRuns).toEqual({});
    expect(out.checklistStepStates).toEqual({});
  });

  it('adds only the two containers', () => {
    const before = v4();
    const after = addChecklistRuns.up(structuredClone(before));
    const { checklistRuns, checklistStepStates, ...rest } = after;
    expect(checklistRuns).toEqual({});
    expect(checklistStepStates).toEqual({});
    expect(rest).toEqual(before);
  });

  it('re-running changes nothing', () => {
    const once = migrate(v4());
    expect(reconcile(once)).toEqual(once);
    expect(addChecklistRuns.up(structuredClone(once) as never)).toEqual(once);
    expect(migrate(once)).toEqual(once);
  });

  it('leaves existing maps, and the runs in them, alone', () => {
    const withRuns = {
      ...doc(),
      checklistRuns: { r1: run('r1') },
      checklistStepStates: { 'r1|s1': { runId: 'r1', stepId: 's1', note: 'x' } },
    };
    expect(migrate(withRuns)).toEqual(withRuns);
    expect(reconcile(withRuns)).toEqual(withRuns);
    // even a schema-4 stamp with maps present (an offline device's merge) keeps them
    const stamped = { ...withRuns, meta: { ...withRuns.meta, schemaVersion: 4 } };
    expect(migrate(stamped).checklistRuns).toEqual(withRuns.checklistRuns);
  });

  it('still refuses a newer document', () => {
    expect(() => migrate(at(6))).toThrow(SchemaTooNewError);
  });

  it('accepts a merged run whose scenarios hold duplicates or are empty', () => {
    const merged = {
      ...doc(),
      checklistRuns: {
        dup: run('dup', ['power-cut', 'power-cut']),
        none: run('none', []),
      },
    };
    const out = migrate(merged);
    expect(out.checklistRuns['dup']!.scenarios).toEqual(['power-cut', 'power-cut']);
    expect(out.checklistRuns['none']!.scenarios).toEqual([]);
  });
});
