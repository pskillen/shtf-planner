import type { Conflict } from './syncRecords';

/** The IndexedDB database holding the sync state, beside (not inside) the document's own. */
export const SYNC_DB_NAME = 'shtf-planner-sync';

/**
 * What sync remembers between visits. Kept apart from the document so forgetting the device, or
 * a lost record, never touches the household.
 */
export interface SyncRecord {
  /** Drive ids, found by name on first connect. */
  folderId?: string;
  yjsFileId?: string;
  jsonFileId?: string;
  /** Drive's `modifiedTime` of `household.yjs` as of our last pull or push. */
  remoteModified?: string;
  /** ISO time of the last successful pull or push. */
  lastSyncedAt?: string;
  /** Edits made here that Drive does not have yet. */
  dirty: boolean;
  dirtySince?: string;
  edits: number;
  /** Which-copy questions still waiting for an answer. */
  conflicts: Conflict[];
}

export const emptySyncRecord = (): SyncRecord => ({ dirty: false, edits: 0, conflicts: [] });

export interface SyncPersistence {
  load(): Promise<{ record: SyncRecord; base?: Uint8Array }>;
  /** Merges `patch` into the record. Cheap: no document bytes. */
  save(patch: Partial<SyncRecord>): Promise<void>;
  /** The document as of the last successful pull or push (the common point to compare to). */
  saveBase(base: Uint8Array): Promise<void>;
  clear(): Promise<void>;
  /** Releases the IndexedDB connection (so the database can be deleted). */
  close(): Promise<void>;
}

export function createMemoryPersistence(): SyncPersistence {
  let record = emptySyncRecord();
  let base: Uint8Array | undefined;
  return {
    load: async () => ({ record: structuredClone(record), base }),
    save: async (patch) => {
      record = { ...record, ...structuredClone(patch) };
    },
    saveBase: async (b) => {
      base = b.slice();
    },
    clear: async () => {
      record = emptySyncRecord();
      base = undefined;
    },
    close: async () => {},
  };
}

const STORE = 'kv';

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Two keys: `record` (small, written on every edit) and `base` (the document's bytes). */
export function createIdbPersistence(name: string = SYNC_DB_NAME): SyncPersistence {
  let db: Promise<IDBDatabase> | undefined;
  const open = () => (db ??= openDb(name));
  return {
    async load() {
      const d = await open();
      const tx = d.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const [rec, base] = await Promise.all([
        request(store.get('record') as IDBRequest<Partial<SyncRecord> | undefined>),
        request(store.get('base') as IDBRequest<Uint8Array | undefined>),
      ]);
      return { record: { ...emptySyncRecord(), ...rec }, base };
    },
    async save(patch) {
      const d = await open();
      const tx = d.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cur =
        (await request(store.get('record') as IDBRequest<Partial<SyncRecord> | undefined>)) ?? {};
      store.put({ ...cur, ...patch }, 'record');
      await done(tx);
    },
    async saveBase(base) {
      const d = await open();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(base, 'base');
      await done(tx);
    },
    async clear() {
      const d = await open();
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await done(tx);
    },
    async close() {
      if (!db) return;
      (await db).close();
      db = undefined;
    },
  };
}

/** Deletes the whole sync database (used when the person forgets this device's data). */
export function deleteSyncDatabase(name: string = SYNC_DB_NAME): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
