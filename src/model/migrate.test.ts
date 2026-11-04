import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, emptyDocument } from './document';
import {
  SchemaTooNewError,
  migrate,
  migrateWith,
  reconcile,
  reconcileWith,
  type MigrationStep,
} from './migrate';

const current = () => emptyDocument('local', '2026-01-01T00:00:00.000Z');
/** A schema-1 document: the shape before `customTypes`. */
const v1 = (): Record<string, unknown> => {
  const { customTypes: _omitted, ...rest } = current();
  void _omitted;
  return { ...rest, meta: { ...rest.meta, schemaVersion: 1 } };
};
/** A schema-2 document, the base the fake later steps below build on. */
const doc = () => current();

describe('migrate', () => {
  it('passes a current document unchanged', () => {
    expect(migrate(doc())).toEqual(doc());
    expect(reconcile(doc())).toEqual(doc());
  });

  it('brings a schema-1 document to schema 2 with an empty customTypes', () => {
    const out = migrate(v1());
    expect(out.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.customTypes).toEqual({});
    expect(out).toEqual(doc());
  });

  it('the schema-2 step keeps custom types that are already there', () => {
    const type = {
      id: 'custom:abc',
      name: 'Grandad’s soup',
      category: 'food',
      unit: 'tin',
      gives: [{ store: 'foodKcal', amount: 300 }],
      suitability: [],
      shelfLife: 'none',
      tags: [],
    };
    const raw = { ...v1(), customTypes: { 'custom:abc': type } };
    expect(migrate(raw).customTypes).toEqual({ 'custom:abc': type });
    expect(reconcile(raw).customTypes).toEqual({ 'custom:abc': type });
  });

  it('refuses a newer schema with a typed error', () => {
    const newer = { ...doc(), meta: { ...doc().meta, schemaVersion: 3 } };
    expect(() => migrate(newer)).toThrow(SchemaTooNewError);
    try {
      migrate(newer);
    } catch (e) {
      expect((e as SchemaTooNewError).found).toBe(3);
      expect((e as SchemaTooNewError).supported).toBe(2);
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

// A fake schema 3 on top of the real 2: every location gets a `size` it lacked before. The step
// is per record and idempotent: a location that already has a size is left alone.
const addSize: MigrationStep = {
  from: 2,
  to: 3,
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
    const out = migrateWith(withLoc(), [addSize], 3);
    expect(out.locations.l!.size).toBe('M');
    expect(out.meta.schemaVersion).toBe(3);
  });

  it('steps are idempotent per record', () => {
    const once = migrateWith(withLoc(), [addSize], 3);
    const twice = migrateWith({ ...once, meta: { ...once.meta, schemaVersion: 2 } }, [addSize], 3);
    expect(twice).toEqual(once);
    // a record already in the new shape keeps its own value
    expect(migrateWith(withLoc('L'), [addSize], 3).locations.l!.size).toBe('L');
  });

  it('reconcileWith brings an old-shaped record forward in an already-migrated document', () => {
    const merged = withLoc(); // an old client wrote this, but the document says schema 3
    (merged.meta as Record<string, unknown>).schemaVersion = 3;
    const out = reconcileWith(merged, [addSize], 3);
    expect(out.locations.l!.size).toBe('M');
    expect(out.meta.schemaVersion).toBe(3);
    // and reconciling again changes nothing
    expect(reconcileWith(out, [addSize], 3)).toEqual(out);
  });

  it('reconcileWith refuses a newer document', () => {
    const merged = withLoc();
    (merged.meta as Record<string, unknown>).schemaVersion = 4;
    expect(() => reconcileWith(merged, [addSize], 3)).toThrow(SchemaTooNewError);
  });

  it('fails readably when a step is missing', () => {
    expect(() => migrateWith(v1(), [], 2)).toThrow(/No migration from schema version 1/);
  });
});
