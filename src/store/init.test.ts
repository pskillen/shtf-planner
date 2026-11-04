import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { applyInit, hash32, initClientId, initContent } from './init';

const encoded = (schemaVersion: number): Uint8Array => {
  const ydoc = new Y.Doc();
  applyInit(ydoc, ydoc.getMap('doc'), schemaVersion);
  return Y.encodeStateAsUpdate(ydoc);
};
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// GOLDEN. This pins the first-run content of a schema-1 document (the containers and every default
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
const GOLDEN_CLIENT_ID = 1367784727;
const GOLDEN_SHA256 = '408408d842d5fe8eeaed0eff48603c9290ec45c348c38337415372e689b10cc4';

describe('first-run content is frozen', () => {
  it('writes exactly the pinned operations under the pinned client id', () => {
    const message =
      'The first-run document content changed. It is frozen per schema version: add the change in a migration step instead (see docs/features/data-model/).';
    expect(initClientId(), message).toBe(GOLDEN_CLIENT_ID);
    expect(sha(encoded(1)), message).toBe(GOLDEN_SHA256);
  });

  it('is deterministic', () => {
    expect(sha(encoded(1))).toBe(sha(encoded(1)));
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
