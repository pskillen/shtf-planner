import { describe, expect, it } from 'vitest';
import { emptyDocument } from './document';
import {
  SchemaTooNewError,
  migrate,
  migrateWith,
  reconcile,
  reconcileWith,
  type MigrationStep,
} from './migrate';

const doc = () => emptyDocument('local', '2026-01-01T00:00:00.000Z');

describe('migrate', () => {
  it('passes a v1 document unchanged', () => {
    expect(migrate(doc())).toEqual(doc());
    expect(reconcile(doc())).toEqual(doc());
  });

  it('refuses a newer schema with a typed error', () => {
    const newer = { ...doc(), meta: { ...doc().meta, schemaVersion: 2 } };
    expect(() => migrate(newer)).toThrow(SchemaTooNewError);
    try {
      migrate(newer);
    } catch (e) {
      expect((e as SchemaTooNewError).found).toBe(2);
      expect((e as SchemaTooNewError).supported).toBe(1);
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

// A fake schema 2: every location gets a `size` it lacked before. The step is per record and
// idempotent: a location that already has a size is left alone.
const addSize: MigrationStep = {
  from: 1,
  to: 2,
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
    const out = migrateWith(withLoc(), [addSize], 2);
    expect(out.locations.l!.size).toBe('M');
    expect(out.meta.schemaVersion).toBe(2);
  });

  it('steps are idempotent per record', () => {
    const once = migrateWith(withLoc(), [addSize], 2);
    const twice = migrateWith({ ...once, meta: { ...once.meta, schemaVersion: 1 } }, [addSize], 2);
    expect(twice).toEqual(once);
    // a record already in the new shape keeps its own value
    expect(migrateWith(withLoc('L'), [addSize], 2).locations.l!.size).toBe('L');
  });

  it('reconcileWith brings an old-shaped record forward in an already-migrated document', () => {
    const merged = withLoc(); // an old client wrote this, but the document says schema 2
    (merged.meta as Record<string, unknown>).schemaVersion = 2;
    const out = reconcileWith(merged, [addSize], 2);
    expect(out.locations.l!.size).toBe('M');
    expect(out.meta.schemaVersion).toBe(2);
    // and reconciling again changes nothing
    expect(reconcileWith(out, [addSize], 2)).toEqual(out);
  });

  it('reconcileWith refuses a newer document', () => {
    const merged = withLoc();
    (merged.meta as Record<string, unknown>).schemaVersion = 3;
    expect(() => reconcileWith(merged, [addSize], 2)).toThrow(SchemaTooNewError);
  });

  it('fails readably when a step is missing', () => {
    expect(() => migrateWith(doc(), [], 2)).toThrow(/No migration from schema version 1/);
  });
});
