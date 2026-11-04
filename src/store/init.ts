import * as Y from 'yjs';
import { emptyDocument } from '../model';
import { sortKeys, syncMap } from './yconvert';

/**
 * First-run initialisation, deterministic on purpose.
 *
 * Two devices that start from nothing and later merge must not end up with rival copies of the
 * same container or the same default value: Yjs breaks ties between concurrent sets of one key
 * by client id, not by time, so a default written under a random id can beat a real edit made on
 * another device. So every first-run device writes the identical *content* of a new document (the
 * containers and every default value) under one fixed client id, as identical operations that
 * merge as one. Real edits then descend from those shared items and always win.
 *
 * Only values that legitimately differ per device (`meta.createdAt`, `meta.env`, `meta.devices`)
 * are written under the device's own client id, by the caller.
 *
 * The fixed id is a hash of the content itself, so two different contents can never share an id
 * (which would corrupt the structure when they merge). The schema version is deliberately not in
 * the hash: a newer build starts from the same containers and adds its own in a migration step,
 * so its fresh devices still share these; `meta.schemaVersion` has its own id (below). The
 * consequence is that this content is frozen: editing `emptyDocument` or the lists it uses
 * changes the id, and a golden test (`init.test.ts`) fails to say so. A schema change adds
 * containers in its migration step instead (see `docs/features/data-model/`); the first such
 * change freezes the schema-1 content here as a literal.
 */

const SCHEMA_CLIENT_BASE = 0x53480000;

/** A fixed timestamp for the content that is hashed; `meta.createdAt` is not part of it. */
const HASH_NOW = '2000-01-01T00:00:00.000Z';

/** FNV-1a over UTF-16 code units, 32 bits, never zero. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 1 : h;
}

/** The values and containers of a new document that are the same on every device. */
export function initContent(): Record<string, unknown> {
  const fresh = emptyDocument('local', HASH_NOW);
  const { devices, packVersions } = fresh.meta;
  // createdAt, env and the schema version are written separately (see `applyInit`).
  return { ...fresh, meta: { devices, packVersions } };
}

/** The client id the shared content is written under: a hash of that content. */
export function initClientId(): number {
  return hash32(JSON.stringify(sortKeys(initContent())));
}

/**
 * Writes the shared first-run content, then `meta.schemaVersion` under a client id that grows with
 * the version, so when two devices on different builds both start from nothing the higher schema
 * wins that one key.
 */
export function applyInit(ydoc: Y.Doc, root: Y.Map<unknown>, schemaVersion: number): void {
  const real = ydoc.clientID;
  try {
    ydoc.clientID = initClientId();
    ydoc.transact(() => syncMap(root, {}, initContent()), 'init');
    ydoc.clientID = SCHEMA_CLIENT_BASE + schemaVersion;
    ydoc.transact(
      () => (root.get('meta') as Y.Map<unknown>).set('schemaVersion', schemaVersion),
      'init',
    );
  } finally {
    ydoc.clientID = real;
  }
}
