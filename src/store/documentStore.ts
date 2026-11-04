import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  DocumentSchema,
  MIGRATIONS,
  SCHEMA_VERSION,
  SchemaTooNewError,
  type Document,
  type Env,
  type MigrationStep,
} from '../model';
import { bringForward, getDeviceId, stampOpen, type Loaded } from './migrateOnOpen';
import { applyInit } from './init';
import { ensureStepContainers } from './stepContainers';
import { deepEqual, deepFreeze, sortKeys, syncMap, toPlain } from './yconvert';

/** The one document's id in IndexedDB. One document per browser profile. */
export const DOCUMENT_DB_NAME = 'shtf-planner-document';

export type StoreStatus =
  | { kind: 'ok' }
  /** The document is from a newer build: `change` throws `SchemaTooNewError`. Update this device. */
  | { kind: 'too-new'; found: number; supported: number; error: SchemaTooNewError }
  /** The document does not validate and could not be brought forward: read-only. */
  | { kind: 'invalid'; error: Error };

export type StoreListener = (doc: Document, status: StoreStatus) => void;

export interface DocumentStore {
  /** A plain, deeply frozen snapshot. Do not mutate it; use `change`. */
  get(): Document;
  /** `ok`, or why the store is read-only. */
  status(): StoreStatus;
  /**
   * Runs `fn` on a plain draft of the current document and writes only what changed, in one
   * transaction labelled `label`. Throws `SchemaTooNewError` when the store is read-only. In dev
   * builds the draft is validated against the schema first and nothing is written if it fails.
   */
  change(label: string, fn: (draft: Document) => void): void;
  /** Called after every change, local or merged. Returns an unsubscribe function. */
  subscribe(listener: StoreListener): () => void;
  /** JSON with sorted keys: two exports of the same document are byte-identical. */
  export(): string;
  /** Replaces the whole document with one exported earlier (migrated and validated first). */
  importJson(json: string, mode: 'replace'): void;
  /** An opaque sync point (the encoded state vector, base64) for "what changed since". */
  heads(): string;
  /** The CRDT's full binary state, for Drive (P6). */
  bytes(): Uint8Array;
  /** Merges another device's `bytes()`; goes read-only if it carries a newer schema. */
  mergeBytes(bytes: Uint8Array): void;
  /** Resolves when everything written so far is in IndexedDB. */
  flush(): Promise<void>;
  /** Flushes, then releases IndexedDB and the tab channel. */
  close(): Promise<void>;
}

export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export interface OpenOptions {
  /** IndexedDB database name. Default `DOCUMENT_DB_NAME`. */
  name?: string;
  /** The build environment to stamp. Default `__BUILD_ENV__`. */
  env?: Env;
  /** This device's id. Default: kept in localStorage. */
  deviceId?: string;
  /** Tab-sync channel factory; `false` disables it. Default `BroadcastChannel`. */
  channel?: false | ((name: string) => ChannelLike);
  /** Migration steps and target schema; tests inject a fake v2. */
  steps?: readonly MigrationStep[];
  schemaVersion?: number;
  /** Validate every `change` against the schema. Default: dev builds only. */
  validate?: boolean;
}

const REMOTE = Symbol('tab-relay');
const ROOT = 'doc';

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};

const buildEnv = (): Env => (typeof __BUILD_ENV__ !== 'undefined' ? __BUILD_ENV__ : 'local');

/**
 * Opens the household document: loads it from IndexedDB (creating an empty one on first run),
 * brings it to the current schema, stamps this build and device, and keeps other tabs of this
 * browser in step through a BroadcastChannel.
 */
export async function openStore(options: OpenOptions = {}): Promise<DocumentStore> {
  const name = options.name ?? DOCUMENT_DB_NAME;
  const env = options.env ?? buildEnv();
  const steps = options.steps ?? MIGRATIONS;
  const target = options.schemaVersion ?? SCHEMA_VERSION;
  const validate = options.validate ?? import.meta.env.DEV;
  const device = options.deviceId ?? getDeviceId();

  const ydoc = new Y.Doc();
  const root = ydoc.getMap<unknown>(ROOT);
  const persistence = new IndexeddbPersistence(name, ydoc);
  await persistence.whenSynced;

  let snapshot: Document = deepFreeze({}) as Document;
  let invalid: Error | undefined;
  let status: StoreStatus = { kind: 'ok' };
  const listeners = new Set<StoreListener>();
  let closed = false;

  function refresh(): void {
    const plain = toPlain(root) as unknown as Document;
    snapshot = deepFreeze(plain);
    const found = (plain.meta as { schemaVersion?: unknown } | undefined)?.schemaVersion;
    if (typeof found === 'number' && found > target) {
      const error = new SchemaTooNewError(found, target);
      status = { kind: 'too-new', found, supported: target, error };
    } else if (invalid) status = { kind: 'invalid', error: invalid };
    else status = { kind: 'ok' };
    for (const l of Array.from(listeners)) l(snapshot, status);
  }

  /** Writes `next` over the current document as a diff, in one transaction. */
  function write(next: Document, origin: string): void {
    ydoc.transact(() => {
      syncMap(
        root,
        snapshot as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>,
      );
    }, origin);
  }

  /** After a merge, a tab update or an open: check the schema and bring old shapes forward. */
  function afterRemote(): void {
    const plain = toPlain(root);
    const result: Loaded = bringForward(plain, steps, target);
    if (result.kind === 'ok') {
      invalid = undefined;
      if (!deepEqual(result.doc, plain)) {
        ensureStepContainers(ydoc, root, plain, steps, target);
        snapshot = deepFreeze(toPlain(root) as unknown as Document);
        write(result.doc, 'reconcile');
      }
    } else if (result.kind === 'invalid') invalid = result.error;
    refresh();
  }

  /**
   * Creates a first-run document: the shared content (containers and every default value) under
   * a fixed client id (see `init.ts`), then the values that differ per device under this
   * device's own id, so real edits always win over the defaults.
   */
  function initialise(): void {
    applyInit(ydoc, root, target);
    ydoc.transact(() => {
      const meta = root.get('meta') as Y.Map<unknown>;
      meta.set('env', env);
      meta.set('createdAt', new Date().toISOString());
    }, 'init');
  }

  root.observeDeep(() => refresh());

  // Tabs of this browser: relay local transactions, answer a peer's state vector.
  let channel: ChannelLike | undefined;
  const makeChannel =
    options.channel === false
      ? undefined
      : (options.channel ??
        (typeof BroadcastChannel !== 'undefined'
          ? (n: string) => new BroadcastChannel(n) as unknown as ChannelLike
          : undefined));
  if (makeChannel) {
    channel = makeChannel(`${name}-sync`);
    channel.onmessage = (event) => {
      const msg = event.data as { t?: string; u?: Uint8Array; sv?: Uint8Array } | null;
      if (!msg || closed) return;
      if (msg.t === 'update' && msg.u) {
        Y.applyUpdate(ydoc, msg.u, REMOTE);
        afterRemote();
      } else if (msg.t === 'sv' && msg.sv) {
        const missing = Y.encodeStateAsUpdate(ydoc, msg.sv);
        if (missing.length > 2) channel?.postMessage({ t: 'update', u: missing });
      }
    };
    ydoc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE && !closed) channel?.postMessage({ t: 'update', u });
    });
    channel.postMessage({ t: 'sv', sv: Y.encodeStateVector(ydoc) });
  }

  // First run: an empty document. Otherwise bring what is stored forward.
  if (root.size === 0) {
    initialise();
  } else {
    afterRemote();
  }

  function readOnlyError(): Error {
    if (status.kind === 'too-new') return status.error;
    if (status.kind === 'invalid') return status.error;
    return new Error('The store is read-only.');
  }

  const store: DocumentStore = {
    get: () => snapshot,
    status: () => status,
    change(label, fn) {
      if (status.kind !== 'ok') throw readOnlyError();
      const draft = structuredClone(snapshot) as Document;
      fn(draft);
      if (validate) DocumentSchema.parse(draft);
      if (deepEqual(draft, snapshot)) return;
      write(draft, label);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    export: () => JSON.stringify(sortKeys(snapshot), null, 2) + '\n',
    importJson(json, mode) {
      if (mode !== 'replace') throw new Error(`Unknown import mode "${String(mode)}".`);
      // A document from a newer build is never overwritten by an import: update this device
      // first. An `invalid` store is the recovery case, so it may be replaced.
      if (status.kind === 'too-new') throw status.error;
      const result = bringForward(JSON.parse(json), steps, target);
      if (result.kind === 'too-new') throw result.error;
      if (result.kind === 'invalid') throw result.error;
      const next = result.doc;
      // The live document's identity survives a restore: its creation time, and the devices that
      // have written to it (the import's own devices are added, not substituted).
      const live = snapshot.meta as Partial<Document['meta']> | undefined;
      if (live?.createdAt) next.meta.createdAt = live.createdAt;
      next.meta.devices = Array.from(new Set([...(live?.devices ?? []), ...next.meta.devices]));
      stampOpen(next, env, device);
      invalid = undefined;
      write(next, 'import');
      refresh();
    },
    heads: () => toBase64(Y.encodeStateVector(ydoc)),
    bytes: () => Y.encodeStateAsUpdate(ydoc),
    mergeBytes(bytes) {
      Y.applyUpdate(ydoc, bytes, 'merge');
      afterRemote();
    },
    async flush() {
      const db = persistence.db;
      if (!db) return;
      // A read of the updates store queues behind the pending writes to it.
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction('updates', 'readonly').objectStore('updates').count();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async close() {
      if (closed) return;
      await store.flush();
      closed = true;
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
      listeners.clear();
      await persistence.destroy();
      ydoc.destroy();
    },
  };

  if (status.kind === 'ok') {
    store.change('open', (draft) => stampOpen(draft, env, device));
  }
  return store;
}
