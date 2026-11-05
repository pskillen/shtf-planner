import { SCHEMA_VERSION, type Env } from '../model';
import type { DocumentStore } from './documentStore';
import {
  DriveAuthError,
  DrivePopupBlockedError,
  DriveCancelledError,
  DriveNetworkError,
  DriveNotFoundError,
  JSON_FILE_NAME,
  JSON_MIME,
  YJS_FILE_NAME,
  YJS_MIME,
  driveErrorMessage,
  type DrivePort,
  type DriveRemoteFile,
} from './drive';
import { emptySyncRecord, type SyncPersistence, type SyncRecord } from './syncPersistence';
import {
  applyChoice,
  classify,
  freshPlain,
  hasUnseenChanges,
  isBlank,
  plainFromBytes,
  type Conflict,
} from './syncRecords';

/**
 * Drive sync: the household document, kept in step with `household.yjs` and `household.json`
 * in the user's own "SHTF Planner" Drive folder. Automatic: one push per burst of edits, a pull
 * on open, on focus and every ten minutes. This module is the contract for the status pill, the
 * Data screen and the acceptance checklist: the `SyncStatus` union and the two file names.
 */

export type SyncStatus =
  | { kind: 'disconnected' }
  | { kind: 'synced'; at: string }
  | { kind: 'pending'; since: string; edits: number }
  | { kind: 'pushing' }
  | { kind: 'pulling' }
  /** Drive has changes that are not applied yet: a question is waiting for the person. */
  | { kind: 'remoteNewer'; at: string }
  | { kind: 'offline'; since: string; edits: number }
  /** `reconnect`: the fix is the Connect button. */
  | { kind: 'error'; message: string; reconnect?: boolean };

export interface EnvWarning {
  /** `meta.env` of the file on Drive. */
  fileEnv: string;
  buildEnv: string;
}

export interface SyncState {
  status: SyncStatus;
  /** A client id is built in. */
  configured: boolean;
  connected: boolean;
  account: string | null;
  /** The which-copy dialog: non-empty while questions are waiting. */
  conflicts: Conflict[];
  /** A pull is waiting on continue / don't sync: the file on Drive was written by another build. */
  envWarning: EnvWarning | null;
  /** `meta.env` of the file on Drive as last read (null before the first look). */
  fileEnv: string | null;
  /** This build's environment. */
  buildEnv: string;
  /** This device has data and Drive has a household: ask before merging them. */
  firstConnect: boolean;
  /** A one-line message to toast ("3 changes from your other device"). */
  notice: { id: number; text: string } | null;
  /** ISO time of the last look at Drive. */
  checkedAt: string | null;
}

export type SyncListener = (state: SyncState) => void;

/** The browser bits the engine listens to, replaceable in tests. */
export interface SyncHost {
  isOnline(): boolean;
  isVisible(): boolean;
  /** Registers a listener; returns the remover. */
  on(event: 'online' | 'offline' | 'visible' | 'hidden', cb: () => void): () => void;
}

export function browserHost(): SyncHost {
  return {
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    on(event, cb) {
      if (event === 'online' || event === 'offline') {
        window.addEventListener(event, cb);
        return () => window.removeEventListener(event, cb);
      }
      const handler = () => {
        if ((document.visibilityState === 'hidden') === (event === 'hidden')) cb();
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
  };
}

export interface SyncOptions {
  store: DocumentStore;
  drive: DrivePort;
  persistence: SyncPersistence;
  /** This build's environment (compared with the file's `meta.env`). */
  env: Env;
  host?: SyncHost;
  now?: () => number;
  /** Idle time after the last edit before a push. Default 5 s. */
  debounceMs?: number;
  /** How often to look at Drive while the page is visible. Default 10 minutes. */
  pollMs?: number;
  /** Wait before retrying after a network failure. Default 30 s, doubling to 5 minutes. */
  retryMs?: number;
}

export const NEWER_VERSION_MESSAGE = 'Your other device runs a newer version; update this one';
export const RECONNECT_MESSAGE = 'Reconnect Google Drive';

export interface Sync {
  state(): SyncState;
  subscribe(listener: SyncListener): () => void;
  /** Loads what sync remembers and starts listening (edits, focus, network, timers). */
  start(): Promise<void>;
  stop(): void;
  /**
   * From a tap (the Connect and Reconnect buttons): Google's one window, then the first pull.
   * Quiet if the window is closed; a window the browser blocked says so.
   */
  connect(): Promise<void>;
  /** Test builds only: forgets the Drive token as if it had expired; the next sync trigger finds out. */
  dropToken(): void;
  /** Forgets the connection on this device. The document and the files on Drive stay. */
  disconnect(): Promise<void>;
  /** Pushes now (after a review ends, from "Push now"). Resolves when it has settled. */
  flush(): Promise<void>;
  /** Looks at Drive now ("Check Drive"). */
  checkDrive(): Promise<void>;
  /** Answers the which-copy dialog; keys absent from `choices` stay as merged. */
  resolveConflicts(choices: Record<string, 'mine' | 'theirs'>): Promise<void>;
  resolveAll(side: 'mine' | 'theirs'): Promise<void>;
  /** The other-build dialog: merge anyway, or leave sync off for this visit. */
  resolveEnv(choice: 'continue' | 'dont-sync'): Promise<void>;
  /** The first-connect question. */
  resolveFirstConnect(choice: 'merge' | 'cancel'): Promise<void>;
  dismissNotice(): void;
  /** Resolves when no operation is running or queued (for tests and the e2e hook). */
  whenIdle(): Promise<void>;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function createSync(options: SyncOptions): Sync {
  const { store, drive, persistence, env } = options;
  const host = options.host ?? browserHost();
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? 5000;
  const pollMs = options.pollMs ?? 10 * 60_000;
  const retryBaseMs = options.retryMs ?? 30_000;
  const iso = () => new Date(now()).toISOString();

  let rec: SyncRecord = emptySyncRecord();
  let base: Uint8Array | undefined;
  let started = false;
  /** A fault shown instead of the idle status: offline or error. */
  let problem: SyncStatus | undefined;
  let busy: SyncStatus | undefined;
  let paused = false;
  let envWarning: EnvWarning | null = null;
  let fileEnv: string | null = null;
  let firstConnect = false;
  let firstConnectOk = false;
  const envAccepted = new Set<string>();
  let notice: SyncState['notice'] = null;
  let noticeId = 0;
  let checkedAt: string | null = null;
  let merging = false;
  let editSeq = 0;
  let retryDelay = retryBaseMs;

  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const removers: Array<() => void> = [];
  let unsubscribeStore: (() => void) | undefined;

  const listeners = new Set<SyncListener>();
  let snapshot: SyncState;

  // ---- state ----------------------------------------------------------------------------

  const connected = () => drive.isConnected();

  function idleStatus(): SyncStatus {
    if (!connected()) return { kind: 'disconnected' };
    if (problem) {
      if (problem.kind === 'offline') return { ...problem, edits: rec.edits };
      return problem;
    }
    if (rec.conflicts.length > 0 || envWarning || firstConnect) {
      return { kind: 'remoteNewer', at: checkedAt ?? iso() };
    }
    if (rec.dirty) return { kind: 'pending', since: rec.dirtySince ?? iso(), edits: rec.edits };
    return { kind: 'synced', at: rec.lastSyncedAt ?? iso() };
  }

  function publish(): void {
    snapshot = {
      status: busy ?? idleStatus(),
      configured: drive.configured(),
      connected: connected(),
      account: drive.accountEmail(),
      conflicts: rec.conflicts,
      envWarning,
      fileEnv,
      buildEnv: env,
      firstConnect,
      notice,
      checkedAt,
    };
    for (const l of Array.from(listeners)) l(snapshot);
  }
  snapshot = {
    status: { kind: 'disconnected' },
    configured: drive.configured(),
    connected: false,
    account: null,
    conflicts: [],
    envWarning: null,
    fileEnv: null,
    buildEnv: env,
    firstConnect: false,
    notice: null,
    checkedAt: null,
  };

  function setBusy(status: SyncStatus | undefined): void {
    busy = status;
    publish();
  }

  function toast(text: string): void {
    notice = { id: ++noticeId, text };
  }

  async function save(patch: Partial<SyncRecord>): Promise<void> {
    rec = { ...rec, ...patch };
    await persistence.save(patch);
  }

  // ---- queue ----------------------------------------------------------------------------

  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    queued++;
    const run = queue.then(fn, fn);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      queued--;
    });
  }

  /** Queues a pull-and-push unless one is already waiting its turn. */
  let syncWaiting: Promise<void> | undefined;
  function requestSync(): Promise<void> {
    syncWaiting ??= enqueue(() => {
      syncWaiting = undefined;
      return syncOnce();
    });
    return syncWaiting;
  }

  // ---- gates ----------------------------------------------------------------------------

  /** A silent renewal failed: only the Connect button gets past this. */
  const needsReconnect = () => problem?.kind === 'error' && problem.reconnect === true;

  /** Everything that stops sync from touching Drive. */
  function blocked(): boolean {
    return (
      !connected() ||
      paused ||
      needsReconnect() ||
      store.status().kind !== 'ok' ||
      rec.conflicts.length > 0 ||
      envWarning !== null ||
      firstConnect
    );
  }

  // ---- errors ---------------------------------------------------------------------------

  function fail(err: unknown): void {
    busy = undefined;
    if (err instanceof DriveCancelledError) {
      publish();
      return;
    }
    if (err instanceof DriveAuthError) {
      problem = { kind: 'error', message: RECONNECT_MESSAGE, reconnect: true };
    } else if (err instanceof DriveNetworkError || !host.isOnline()) {
      problem =
        problem?.kind === 'offline' ? problem : { kind: 'offline', since: iso(), edits: rec.edits };
      scheduleRetry();
    } else {
      problem = { kind: 'error', message: driveErrorMessage(err) };
    }
    publish();
  }

  function scheduleRetry(): void {
    if (retryTimer || !started) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
      void requestSync();
    }, retryDelay);
  }

  function clearProblem(): void {
    problem = undefined;
    retryDelay = retryBaseMs;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  // ---- dirty tracking -------------------------------------------------------------------

  function onLocalEdit(): void {
    if (merging || !started || !connected()) return;
    editSeq++;
    const wasDirty = rec.dirty;
    rec = {
      ...rec,
      dirty: true,
      dirtySince: wasDirty ? rec.dirtySince : iso(),
      edits: rec.edits + 1,
    };
    void persistence.save({ dirty: true, dirtySince: rec.dirtySince, edits: rec.edits });
    publish();
    if (!paused) schedulePush(); // "Don't sync": counted as unsent, but nothing is sent
  }

  function schedulePush(): void {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = undefined;
      void enqueue(pushOnly);
    }, debounceMs);
  }

  function cancelPushTimer(): void {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = undefined;
  }

  async function markDirty(): Promise<void> {
    editSeq++;
    await save({
      dirty: true,
      dirtySince: rec.dirty ? rec.dirtySince : iso(),
      edits: Math.max(rec.edits, 1),
    });
  }

  /**
   * Edits Drive has not got, worked out from the store against the last state both sides had
   * (deletions included), so a flag that was lost or never written cannot hide them.
   */
  async function deriveDirty(): Promise<void> {
    if (rec.dirty || !base || store.status().kind !== 'ok') return;
    if (hasUnseenChanges(store.bytes(), base)) await markDirty();
  }

  /**
   * Another tab of this browser may have synced since we last looked: its sync state is the one
   * on disk. Takes it, so tabs share the record and the base (a first-connect question answered
   * there is answered here). Unsent edits seen on either side stay unsent.
   */
  async function refresh(): Promise<void> {
    const loaded = await persistence.load();
    const mine = rec;
    rec = {
      ...loaded.record,
      dirty: loaded.record.dirty || mine.dirty,
      dirtySince: mine.dirty ? mine.dirtySince : loaded.record.dirtySince,
      edits: Math.max(loaded.record.edits, mine.edits),
    };
    base = loaded.base ?? base;
    if (firstConnect && base) {
      firstConnect = false;
      firstConnectOk = false;
    }
  }

  // ---- reading Drive --------------------------------------------------------------------

  interface Remote {
    folderId: string;
    yjs?: DriveRemoteFile;
    json?: DriveRemoteFile;
  }

  async function look(): Promise<Remote> {
    let folderId = rec.folderId ?? (await drive.folder());
    let files: DriveRemoteFile[];
    try {
      files = await drive.listFiles(folderId);
    } catch (e) {
      if (!(e instanceof DriveNotFoundError)) throw e;
      // The remembered folder was deleted or trashed: find it by name again (or make a new one).
      folderId = await drive.folder();
      files = await drive.listFiles(folderId);
    }
    const yjs = files.find((f) => f.name === YJS_FILE_NAME);
    const json = files.find((f) => f.name === JSON_FILE_NAME);
    checkedAt = iso();
    await save({ folderId, yjsFileId: yjs?.id, jsonFileId: json?.id });
    return { folderId, yjs, json };
  }

  type Pulled = 'none' | 'merged' | 'blocked';

  /**
   * Looks at the sidecar, then (if the file changed) downloads and merges. Returns `blocked` when
   * a question or an error stops the merge, `none` when there was nothing to do.
   */
  async function pull(remote: Remote): Promise<Pulled> {
    const { yjs, json } = remote;
    if (!yjs) return 'none';
    if (yjs.modifiedTime === rec.remoteModified) return 'none';

    // The sidecar is small and plain: refuse a newer schema, and notice another build's file,
    // before downloading the CRDT.
    if (json) {
      let meta: { schemaVersion?: unknown; env?: unknown } | undefined;
      try {
        meta = (JSON.parse(await drive.readText(json.id)) as { meta?: typeof meta }).meta;
      } catch (e) {
        if (e instanceof DriveAuthError || e instanceof DriveNetworkError) throw e;
        meta = undefined; // unreadable sidecar: the CRDT's own meta is checked below
      }
      if (meta && !guard(meta)) return 'blocked';
    }

    const bytes = await drive.readBytes(yjs.id);
    let remotePlain: Record<string, unknown>;
    try {
      remotePlain = plainFromBytes(bytes);
    } catch {
      problem = { kind: 'error', message: 'The copy on Drive could not be read.' };
      return 'blocked';
    }
    const remoteMeta = remotePlain.meta as { schemaVersion?: unknown; env?: unknown } | undefined;
    if (!guard(remoteMeta)) return 'blocked';

    const localDoc = store.get();
    const localBlank = isBlank(localDoc);
    if (!base && !localBlank && !firstConnectOk) {
      firstConnect = true;
      return 'blocked';
    }

    const basePlain = base ? plainFromBytes(base) : freshPlain(SCHEMA_VERSION);
    const localPlain = JSON.parse(JSON.stringify(localDoc)) as Record<string, unknown>;
    const localBytes = store.bytes();

    merging = true;
    try {
      store.mergeBytes(bytes);
    } finally {
      merging = false;
    }
    const status = store.status();
    if (status.kind !== 'ok') {
      problem = {
        kind: 'error',
        message:
          status.kind === 'too-new' ? NEWER_VERSION_MESSAGE : 'The merged household is not valid.',
      };
      return 'blocked';
    }

    const { conflicts, remoteOnly } = classify(basePlain, localPlain, remotePlain);
    const wasFirst = !base;
    base = bytes;
    await persistence.saveBase(bytes);
    // Drive has a copy that lacks something we have (unsent edits, a deletion, or a first connect
    // with data): push the merge. The base is now Drive's state, so a later pull still sees our
    // unsent edits as ours.
    const needsPush = rec.dirty || hasUnseenChanges(localBytes, bytes);
    await save({
      remoteModified: yjs.modifiedTime,
      lastSyncedAt: iso(),
      conflicts,
    });
    if (needsPush && !rec.dirty) await markDirty();

    if (wasFirst && localBlank) toast('Loaded your household from Google Drive');
    else if (remoteOnly > 0 || conflicts.length > 0) {
      const n = remoteOnly + conflicts.length;
      toast(`${n} change${n === 1 ? '' : 's'} from your other device`);
    }
    firstConnect = false;
    firstConnectOk = false;
    return 'merged';
  }

  /** Returns false (and records why) when the file on Drive must not be merged. */
  function guard(meta: { schemaVersion?: unknown; env?: unknown } | undefined): boolean {
    const version = meta?.schemaVersion;
    if (typeof version === 'number' && version > SCHEMA_VERSION) {
      problem = { kind: 'error', message: NEWER_VERSION_MESSAGE };
      return false;
    }
    const seenEnv = typeof meta?.env === 'string' ? meta.env : undefined;
    if (seenEnv) fileEnv = seenEnv;
    if (seenEnv && seenEnv !== env && !envAccepted.has(seenEnv)) {
      envWarning = { fileEnv: seenEnv, buildEnv: env };
      return false;
    }
    return true;
  }

  // ---- the operations -------------------------------------------------------------------

  /**
   * Runs one pass; if a folder or file we remembered by id has gone, forgets the ids, so the next
   * look finds them by name again, and runs it once more. That is not "offline".
   */
  async function recoveringIds(pass: () => Promise<void>): Promise<void> {
    try {
      return await pass();
    } catch (e) {
      if (!(e instanceof DriveNotFoundError)) throw e;
      await save({
        folderId: undefined,
        yjsFileId: undefined,
        jsonFileId: undefined,
        remoteModified: undefined,
      });
      return pass();
    }
  }

  /** Pull, then push if there is anything to send. */
  async function syncOnce(): Promise<void> {
    await refresh();
    if (blocked()) return publish();
    if (!host.isOnline()) {
      fail(new DriveNetworkError());
      return;
    }
    try {
      await deriveDirty();
      await recoveringIds(async () => {
        setBusy({ kind: 'pulling' });
        const remote = await look();
        if ((await pull(remote)) === 'blocked') return;
        if (!remote.yjs && !rec.dirty) await markDirty(); // nothing on Drive yet: send ours
        clearProblem();
        await pushIfDirty();
      });
    } catch (e) {
      fail(e);
      return;
    }
    finish();
  }

  /** The debounced push: the same, but it first checks nobody else wrote in the meantime. */
  async function pushOnly(): Promise<void> {
    await refresh();
    if (blocked() || !rec.dirty) return publish();
    if (!host.isOnline()) {
      fail(new DriveNetworkError());
      return;
    }
    try {
      await recoveringIds(async () => {
        setBusy({ kind: 'pushing' });
        const remote = await look();
        if ((await pull(remote)) === 'blocked') return; // merge anything newer first
        clearProblem();
        await pushIfDirty();
      });
    } catch (e) {
      fail(e);
      return;
    }
    finish();
  }

  /** How many times a push re-reads Drive and merges before giving up for now. */
  const MAX_PUSH_ROUNDS = 5;

  async function pushIfDirty(): Promise<void> {
    if (!rec.dirty || blocked()) return;
    setBusy({ kind: 'pushing' });
    // Look again immediately before writing: if the file moved since we last pulled, someone
    // wrote in the meantime, and overwriting it would drop their edits.
    let remote: Remote | undefined;
    for (let round = 0; round < MAX_PUSH_ROUNDS && !remote; round++) {
      const fresh = await look();
      if (!fresh.yjs || fresh.yjs.modifiedTime === rec.remoteModified) {
        remote = fresh;
      } else {
        if ((await pull(fresh)) === 'blocked') return;
        if (!rec.dirty || blocked()) return;
      }
    }
    if (!remote) {
      schedulePush(); // Drive keeps moving: try again shortly
      return;
    }
    const seq = editSeq;
    const bytes = store.bytes();
    const text = store.export();
    const yjs = await drive.write({
      folderId: remote.folderId,
      name: YJS_FILE_NAME,
      mimeType: YJS_MIME,
      content: bytes,
      fileId: remote.yjs?.id,
    });
    base = bytes;
    await persistence.saveBase(bytes);
    await save({ yjsFileId: yjs.id, remoteModified: yjs.modifiedTime });
    const json = await drive.write({
      folderId: remote.folderId,
      name: JSON_FILE_NAME,
      mimeType: JSON_MIME,
      content: text,
      fileId: remote.json?.id,
    });
    const stillDirty = editSeq !== seq;
    await save({
      jsonFileId: json.id,
      lastSyncedAt: iso(),
      dirty: stillDirty,
      dirtySince: stillDirty ? rec.dirtySince : undefined,
      edits: stillDirty ? rec.edits : 0,
    });
    if (stillDirty) schedulePush();
  }

  function finish(): void {
    busy = undefined;
    publish();
  }

  // ---- public ---------------------------------------------------------------------------

  const sync: Sync = {
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async start() {
      if (started) return;
      const loaded = await persistence.load();
      rec = loaded.record;
      base = loaded.base;
      if (connected()) await deriveDirty();
      if (connected()) drive.warmUp(); // so Reconnect opens Google's window straight from the tap
      started = true;
      unsubscribeStore = store.subscribe(onLocalEdit);
      removers.push(
        host.on('hidden', () => {
          if (rec.dirty && !blocked()) {
            cancelPushTimer();
            void enqueue(pushOnly);
          }
        }),
        host.on('visible', () => void requestSync()),
        host.on('online', () => {
          if (connected()) drive.warmUp(); // the script may have failed to load offline
          if (!needsReconnect() && !paused) clearProblem();
          void requestSync();
        }),
        host.on('offline', () => {
          if (!connected() || needsReconnect() || paused) return;
          problem = { kind: 'offline', since: iso(), edits: rec.edits };
          publish();
        }),
      );
      pollTimer = setInterval(() => {
        if (host.isVisible()) void requestSync();
      }, pollMs);
      if (!host.isOnline() && connected()) {
        problem = { kind: 'offline', since: iso(), edits: rec.edits };
      }
      publish();
      if (connected()) void requestSync();
    },

    stop() {
      started = false;
      unsubscribeStore?.();
      unsubscribeStore = undefined;
      for (const r of removers.splice(0)) r();
      cancelPushTimer();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
    },

    async connect() {
      try {
        await drive.connect();
      } catch (e) {
        if (e instanceof DriveCancelledError) return publish(); // quiet: still "Connect"
        if (e instanceof DrivePopupBlockedError) toast(e.message); // the pill alone would not say why
        problem = {
          kind: 'error',
          message: driveErrorMessage(e),
          reconnect: e instanceof DriveAuthError,
        };
        publish();
        return;
      }
      clearProblem();
      paused = false;
      await enqueue(async () => {
        const account = drive.accountEmail() ?? undefined;
        if (base && (!account || rec.account !== account)) {
          // Another Google account, or one we cannot tell apart from the last (the email could
          // not be read): its folder, files and history are not ours to compare with, so start
          // afresh and ask first rather than merge silently.
          base = undefined;
          rec = emptySyncRecord();
          await persistence.clear();
        }
        if (account) await save({ account });
        await deriveDirty(); // edits made while disconnected
      });
      await requestSync(); // publishes as it starts: no "Synced" flash before the first pull
    },

    dropToken() {
      drive.dropToken();
    },

    async disconnect() {
      cancelPushTimer();
      await enqueue(async () => {
        await drive.disconnect();
        clearProblem();
        envWarning = null;
        firstConnect = false;
        firstConnectOk = false;
        paused = false;
        // Only the connection goes. The last synced state, the Drive ids and any which-copy
        // questions stay: connecting again on the same account compares against what both sides
        // last had, and a question left open is still open (nothing is pushed until answered).
        publish();
      });
    },

    async flush() {
      cancelPushTimer();
      await enqueue(pushOnly);
    },

    async checkDrive() {
      if (!needsReconnect() && !paused) clearProblem(); // a reconnect waits for the button, not a retry
      await requestSync();
    },

    async resolveConflicts(choices) {
      await enqueue(async () => {
        const pending = rec.conflicts;
        const chosen = pending.filter((c) => hasOwn(choices, c.key));
        if (chosen.length === 0) return;
        try {
          store.change('sync:which-copy', (draft) => {
            for (const c of chosen) applyChoice(draft, c, choices[c.key]!);
          });
        } catch (e) {
          problem = { kind: 'error', message: e instanceof Error ? e.message : String(e) };
          publish();
          return;
        }
        const left = pending.filter((c) => !hasOwn(choices, c.key));
        await save({ conflicts: left });
        // The merge was never sent: whatever the person chose, Drive needs the result.
        await markDirty();
        publish();
        if (left.length === 0) {
          await pushOnly();
        }
      });
    },

    resolveAll: (side) =>
      sync.resolveConflicts(Object.fromEntries(rec.conflicts.map((c) => [c.key, side]))),

    async resolveEnv(choice) {
      if (!envWarning) return;
      if (choice === 'dont-sync') {
        paused = true;
        problem = {
          kind: 'error',
          message: `Sync is off: the file on Drive was last written by ${envWarning.fileEnv}`,
        };
        envWarning = null; // answered: the banner and its buttons go, the message stays
        publish();
        return;
      }
      envAccepted.add(envWarning.fileEnv);
      envWarning = null;
      paused = false;
      problem = undefined;
      publish();
      await requestSync();
    },

    async resolveFirstConnect(choice) {
      if (!firstConnect) return;
      // Another tab may have answered already: then this question is stale.
      await enqueue(refresh);
      if (!firstConnect) {
        publish();
        return sync.checkDrive();
      }
      if (choice === 'cancel') return sync.disconnect();
      firstConnect = false;
      firstConnectOk = true;
      publish();
      await requestSync();
    },

    dismissNotice() {
      if (!notice) return;
      notice = null;
      publish();
    },

    async whenIdle() {
      // Loop: an operation can queue another (a merge that needs a push).
      while (queued > 0) await queue;
    },
  };

  return sync;
}
