import { DocumentSchema, SCHEMA_VERSION, type Document } from './document';

/** The document is from a newer build than this one: read-only until the app is updated. */
export class SchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;
  constructor(found: number, supported: number = SCHEMA_VERSION) {
    super(
      `This document uses schema version ${found}, but this app understands up to ${supported}. Update this device.`,
    );
    this.name = 'SchemaTooNewError';
    this.found = found;
    this.supported = supported;
  }
}

type Raw = Record<string, unknown>;

/**
 * One `v(from)` to `v(to)` step over the raw document.
 *
 * Steps MUST be idempotent per record: running a step on a record that is already in the new shape
 * changes nothing. An older client can keep editing offline after another device migrated the
 * document, and its old-shaped records then merge into the newer document; the store re-runs the
 * steps after every merge (`reconcile`) to bring them forward.
 */
export interface MigrationStep {
  from: number;
  to: number;
  name: string;
  up: (doc: Raw) => Raw;
}

/**
 * Schema 2 adds `customTypes`, the household's own item types. The step only creates the empty
 * container (it is per record and idempotent: one that exists is kept). The store writes the
 * container under a fixed client id (`src/store/stepContainers.ts`) so two devices that migrate
 * before they sync still share one.
 */
const addCustomTypes: MigrationStep = {
  from: 1,
  to: 2,
  name: 'custom item types',
  up: (raw) => ({ ...raw, customTypes: (raw.customTypes as Raw | undefined) ?? {} }),
};

/**
 * Schema 3 adds `barcodes` (remembered barcode to item type) and `scans` (scans waiting to be
 * sorted). Like schema 2 it only creates the empty containers; the store writes each under a fixed
 * client id. The two optional expiry settings are absent until set, so no step writes them.
 */
const addScanning: MigrationStep = {
  from: 2,
  to: 3,
  name: 'barcodes and scans',
  up: (raw) => ({
    ...raw,
    barcodes: (raw.barcodes as Raw | undefined) ?? {},
    scans: (raw.scans as Raw | undefined) ?? {},
  }),
};

/** Ordered `v(n)` to `v(n+1)` steps. */
export const MIGRATIONS: readonly MigrationStep[] = [addCustomTypes, addScanning];

function versionOf(raw: unknown): number {
  const meta = (raw as { meta?: { schemaVersion?: unknown } } | null)?.meta;
  const v = meta?.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error('Not a SHTF Planner document (meta.schemaVersion is missing or invalid).');
  }
  return v;
}

function runSteps(
  raw: Raw,
  fromVersion: number,
  steps: readonly MigrationStep[],
  target: number,
): Raw {
  let doc = raw;
  let v = fromVersion;
  while (v < target) {
    const step = steps.find((s) => s.from === v);
    if (!step) throw new Error(`No migration from schema version ${v} to ${v + 1}.`);
    doc = step.up(doc);
    v = step.to;
    doc = { ...doc, meta: { ...(doc.meta as Raw), schemaVersion: v } };
  }
  return doc;
}

/** `migrate` with the step list and target injected (tests use a fake v2). */
export function migrateWith(
  raw: unknown,
  steps: readonly MigrationStep[],
  target: number,
): Document {
  const found = versionOf(raw);
  if (found > target) throw new SchemaTooNewError(found, target);
  const input = structuredClone(raw) as Raw;
  return DocumentSchema.parse(runSteps(input, found, steps, target));
}

/**
 * Brings any document of this schema or older up to `SCHEMA_VERSION`, validated. Throws
 * `SchemaTooNewError` for a newer one. Pure: the input is not changed.
 */
export function migrate(raw: unknown): Document {
  return migrateWith(raw, MIGRATIONS, SCHEMA_VERSION);
}

/**
 * Re-runs every step on a document already at `target`, to bring forward records an older client
 * wrote after the document was migrated. Safe because steps are idempotent per record.
 */
export function reconcileWith(
  raw: unknown,
  steps: readonly MigrationStep[],
  target: number,
): Document {
  const found = versionOf(raw);
  if (found > target) throw new SchemaTooNewError(found, target);
  const input = structuredClone(raw) as Raw;
  const first = steps.length > 0 ? Math.min(...steps.map((s) => s.from)) : target;
  const all = runSteps(input, Math.min(found, first), steps, target);
  return DocumentSchema.parse({ ...all, meta: { ...(all.meta as Raw), schemaVersion: target } });
}

/** What one step did to a document: the raw document before it and after it. */
export interface StepTrace {
  step: MigrationStep;
  input: Raw;
  output: Raw;
}

/**
 * The steps `reconcileWith` would run on `raw`, each with its input and output, in order. The
 * store uses it to find the containers a step creates (see `src/store/stepContainers.ts`).
 */
export function traceSteps(
  raw: unknown,
  steps: readonly MigrationStep[],
  target: number,
): StepTrace[] {
  const found = versionOf(raw);
  if (found > target) throw new SchemaTooNewError(found, target);
  const first = steps.length > 0 ? Math.min(...steps.map((s) => s.from)) : target;
  let doc = structuredClone(raw) as Raw;
  let v = Math.min(found, first);
  const out: StepTrace[] = [];
  while (v < target) {
    const step = steps.find((s) => s.from === v);
    if (!step) throw new Error(`No migration from schema version ${v} to ${v + 1}.`);
    const output = step.up(structuredClone(doc));
    out.push({ step, input: doc, output });
    v = step.to;
    doc = { ...output, meta: { ...(output.meta as Raw), schemaVersion: v } };
  }
  return out;
}

export function reconcile(raw: unknown): Document {
  return reconcileWith(raw, MIGRATIONS, SCHEMA_VERSION);
}
