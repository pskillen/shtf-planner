import { button, el, logBox } from '../ui';
import { generateDoc } from '../gen';
import type { Lib } from './crdt-common';

// Spike D: env + schema guard living inside the CRDT document (meta), so it syncs.
const BUILD_ENV: string = import.meta.env.VITE_BUILD_ENV ?? 'local';
const SUPPORTED_SCHEMA = 2;

type Outcome =
  | { status: 'refused'; message: string }
  | { status: 'ok'; banner?: string; migrated: boolean };

// The guard: pure function of (state, app env). Never writes when refusing.
function openGuarded<S>(lib: Lib<S>, bytes: Uint8Array, appEnv: string): { outcome: Outcome; state?: S } {
  const state = lib.load(bytes);
  const meta = lib.toJSON(state).meta;
  if (meta.schemaVersion > SUPPORTED_SCHEMA) {
    return { outcome: { status: 'refused', message: `This household file is schema v${meta.schemaVersion}; this app supports up to v${SUPPORTED_SCHEMA}. Update the app. Nothing was changed.` } };
  }
  let migrated = false;
  if (meta.schemaVersion < SUPPORTED_SCHEMA) {
    migrate(lib, state, meta.schemaVersion);
    migrated = true;
  }
  const banner = meta.env !== appEnv ? `This household file was last written by ${meta.env}` : undefined;
  return { outcome: { status: 'ok', banner, migrated }, state };
}

// Trivial v1 -> v2: add household.notes, bump version.
function migrate<S>(lib: Lib<S>, s: S, from: number) {
  if (from < 2) {
    lib.setPath(s, ['household', 'notes'], '');
    lib.setPath(s, ['meta', 'schemaVersion'], 2);
  }
}

// Every user write stamps the env of the build that made it.
function write<S>(lib: Lib<S>, s: S, appEnv: string, edit: () => void) {
  edit();
  if ((lib.toJSON(s).meta.env) !== appEnv) lib.setPath(s, ['meta', 'env'], appEnv);
}

async function run(log: (s: string) => void) {
  const libs = [(await import('./crdt-am')).amLib, (await import('./crdt-yjs')).yLib] as Lib<any>[];
  const results: Record<string, boolean> = {};
  for (const lib of libs) {
    // Case 1: written by dev, opened by a prod build -> banner, loads fine.
    const dev = lib.save(lib.init(generateDoc(1, 'dev', 2)));
    const c1 = openGuarded(lib, dev, 'prod');
    const ok1 = c1.outcome.status === 'ok' && c1.outcome.banner === 'This household file was last written by dev';
    log(`[${lib.name}] case 1 (env dev opened by prod): ${JSON.stringify(c1.outcome)} -> ${ok1 ? 'PASS' : 'FAIL'}`);

    // Case 2: newer schema -> refused, nothing written back.
    const future = lib.save(lib.init(generateDoc(1, 'dev', 3)));
    const snapshot = future.slice();
    const c2 = openGuarded(lib, future, 'prod');
    const untouched = future.length === snapshot.length && future.every((b, i) => b === snapshot[i]) && c2.state === undefined;
    const ok2 = c2.outcome.status === 'refused' && untouched;
    log(`[${lib.name}] case 2 (schema 3 opened by app supporting ${SUPPORTED_SCHEMA}): ${JSON.stringify(c2.outcome)}; no state returned, bytes untouched=${untouched} -> ${ok2 ? 'PASS' : 'FAIL'}`);

    // Case 3: older schema -> migrated forward; env updated on the next write.
    const old = lib.save(lib.init(generateDoc(1, 'dev', 1)));
    const c3 = openGuarded(lib, old, 'prod');
    const s3 = c3.state!;
    const afterOpen = lib.toJSON(s3).meta;
    const migratedOk = c3.outcome.status === 'ok' && c3.outcome.migrated && afterOpen.schemaVersion === 2 && (lib.toJSON(s3) as any).household.notes === '';
    const envStillDev = afterOpen.env === 'dev'; // open alone does not claim authorship
    write(lib, s3, 'prod', () => lib.setPath(s3, ['household', 'members', 0, 'name'], 'Edited'));
    const envNow = lib.toJSON(s3).meta.env;
    const ok3 = migratedOk && envStillDev && envNow === 'prod';
    log(`[${lib.name}] case 3 (v1 file): migrated=${migratedOk}, env after open=${afterOpen.env}, env after first write=${envNow} -> ${ok3 ? 'PASS' : 'FAIL'}`);

    // Syncs: a second device receiving the bytes sees the new env + version.
    const synced = lib.toJSON(lib.load(lib.save(s3))).meta;
    const ok4 = synced.env === 'prod' && synced.schemaVersion === 2;
    log(`[${lib.name}] meta travels with the document: ${JSON.stringify(synced)} -> ${ok4 ? 'PASS' : 'FAIL'}`);
    results[lib.name] = ok1 && ok2 && ok3 && ok4;
  }
  (window as any).__results = results;
  log('summary ' + JSON.stringify(results));
}

export function mount(root: HTMLElement) {
  const { pre, log } = logBox();
  root.append(
    el('h3', { textContent: 'Spike D: env + schema guard' }),
    el('p', { textContent: `This build: env=${BUILD_ENV}, supports schema <= ${SUPPORTED_SCHEMA}. Cases below simulate an app env of prod.` }),
    button('Run the three cases', () => run(log)),
    pre,
  );
}
