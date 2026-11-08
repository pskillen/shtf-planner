import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../model';
import { MIGRATIONS } from '../model/migrate';
import { applyInit, hash32, initClientId, initContent } from './init';

const encoded = (schemaVersion: number): Uint8Array => {
  const ydoc = new Y.Doc();
  applyInit(ydoc, ydoc.getMap('doc'), schemaVersion);
  return Y.encodeStateAsUpdate(ydoc);
};
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// GOLDEN. This pins the first-run content of a schema-4 document (the containers and every default
// value of `emptyDocument`) and the client id it is written under. It is frozen: devices that
// start from nothing write these exact operations and Yjs merges them as one. If you edited
// `emptyDocument`, `DEFAULT_PACKS` or the order of keys, devices on the old and new build would
// write rival copies of the same containers when they merge, and one device's records would be
// lost. Do not just update the hashes. Leave the first-run content alone, and add the new field or
// container in a migration step (src/model/migrate.ts). See docs/features/data-model/.
//
// A Yjs upgrade that changes the update encoding also fails this test, with the same message even
// though nothing in our content changed. Check the Yjs changelog before re-pinning the hash, so
// nobody re-pins blindly over a real content change.
const GOLDEN_CLIENT_ID = 2301581126;
const GOLDEN_SHA256 = 'cad012d8233e57ad54043658461465e54ee04db202a8a4deeef618498319775f';

describe('first-run content is frozen', () => {
  it('writes exactly the pinned operations under the pinned client id', () => {
    const message =
      'The first-run document content changed. It is frozen per schema version: add the change in a migration step instead (see docs/features/data-model/).';
    expect(initClientId(), message).toBe(GOLDEN_CLIENT_ID);
    expect(sha(encoded(4)), message).toBe(GOLDEN_SHA256);
  });

  it('is deterministic', () => {
    expect(sha(encoded(4))).toBe(sha(encoded(4)));
  });

  it('keeps per-device values out of the shared content', () => {
    const meta = (initContent() as { meta: Record<string, unknown> }).meta;
    expect(Object.keys(meta).sort()).toEqual(['devices', 'packVersions']);
  });

  it('derives a different client id for different content', () => {
    expect(hash32('{"a":1}')).not.toBe(hash32('{"a":2}'));
    expect(hash32('')).not.toBe(0);
  });

  it('writes the schema version under an id that grows with it, so the higher one wins', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    applyInit(a, a.getMap('doc'), 1);
    applyInit(b, b.getMap('doc'), 2);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const version = (d: Y.Doc) =>
      (d.getMap('doc').get('meta') as Y.Map<unknown>).get('schemaVersion');
    expect(version(a)).toBe(2);
    expect(version(b)).toBe(2);
  });
});

describe('the frozen content follows the schema it was written for', () => {
  it('equals emptyDocument() apart from the per-device meta', () => {
    // Containers added by a migration step (schema 5 onward) are not in the frozen literal.
    const { meta: fresh, ...rest } = emptyDocument('local', '2026-01-01T00:00:00.000Z');
    const trimmed: Record<string, unknown> = { ...rest };
    delete trimmed.checklistRuns;
    delete trimmed.checklistStepStates;
    const { meta: frozen, ...frozenRest } = initContent() as Record<string, unknown> & {
      meta: Record<string, unknown>;
    };
    expect(frozenRest).toEqual(trimmed);
    // The frozen literal plus the migration steps is the current shape.
    expect(MIGRATIONS.reduce((doc, step) => step.up(doc), frozenRest)).toEqual(rest);
    expect(frozen).toEqual({ devices: fresh.devices, packVersions: fresh.packVersions });
  });
});
