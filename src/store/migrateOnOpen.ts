import {
  MIGRATIONS,
  SCHEMA_VERSION,
  SchemaTooNewError,
  SchemaTooOldError,
  reconcileWith,
  type Document,
  type Env,
  type MigrationStep,
} from '../model';

/** What opening (or merging into) a stored document found. */
export type Loaded =
  | { kind: 'ok'; doc: Document }
  | { kind: 'too-new'; error: SchemaTooNewError }
  /** From before the stock model (schema 4): never migrated, the household starts afresh. */
  | { kind: 'too-old'; error: SchemaTooOldError }
  | { kind: 'invalid'; error: Error };

/**
 * Brings a stored or merged document to the current schema: runs the migration steps from its
 * version (and, for a document already at the current version, over its records, so old-shaped
 * records an older client wrote are brought forward; steps are idempotent per record). A newer
 * schema is reported, not touched: the store goes read-only so the app can say "update this
 * device".
 */
export function bringForward(
  raw: unknown,
  steps: readonly MigrationStep[] = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): Loaded {
  try {
    return { kind: 'ok', doc: reconcileWith(raw, steps, target) };
  } catch (e) {
    if (e instanceof SchemaTooNewError) return { kind: 'too-new', error: e };
    if (e instanceof SchemaTooOldError) return { kind: 'too-old', error: e };
    return { kind: 'invalid', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

const DEVICE_KEY = 'shtf.deviceId';
const randomId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `d-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/**
 * This device's id: random, kept in localStorage, so `meta.devices` can say which devices have
 * written to the document. Falls back to an id for this session when storage is unavailable.
 */
export function getDeviceId(storage?: Pick<Storage, 'getItem' | 'setItem'>): string {
  try {
    const store = storage ?? globalThis.localStorage;
    const existing = store.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh = randomId();
    store.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

/**
 * The first write by this build: stamp `meta.env` with the build's environment and add this
 * device to `meta.devices`. Touches nothing that is already right.
 */
export function stampOpen(draft: Document, env: Env, deviceId: string): void {
  if (draft.meta.env !== env) draft.meta.env = env;
  if (!draft.meta.devices.includes(deviceId)) draft.meta.devices.push(deviceId);
}
