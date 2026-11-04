import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PACKS } from '../model';
import { openStore, type DocumentStore } from './documentStore';

let counter = 0;
const open = (deviceId: string) =>
  openStore({
    name: `first-run-${++counter}-${Math.random().toString(36).slice(2)}`,
    env: 'local',
    deviceId,
    channel: false,
  });

/** A small seeded generator, so a failing trial can be replayed. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
}

const TYPES = ['flat', 'terrace', 'semi', 'detached', 'bungalow'] as const;
const HORIZONS = [7, 14, 28] as const;
const RISKS = ['flood', 'storm', 'snow', 'heat', 'grid'] as const;

const rawLength = (s: DocumentStore, path: string[]): number => {
  const y = new Y.Doc();
  Y.applyUpdate(y, s.bytes());
  let node: unknown = y.getMap('doc');
  for (const key of path) node = (node as Y.Map<unknown>).get(key);
  return (node as Y.Array<unknown>).length;
};

describe('first run on two devices (defaults never beat a real edit)', () => {
  it("a device's edits to defaults survive a merge with a fresh device, both orders, 60 trials", async () => {
    const next = rng(20260901);
    for (let trial = 0; trial < 60; trial++) {
      const type = TYPES[Math.floor(next() * TYPES.length)]!;
      const horizon = HORIZONS[Math.floor(next() * HORIZONS.length)]!;
      const risks = [RISKS[Math.floor(next() * RISKS.length)]!];
      const a = await open('a');
      const b = await open('b');
      a.change('edit defaults', (d) => {
        d.home.type = type;
        d.settings.horizonDays = horizon;
        d.home.risks = risks;
      });
      const ab = a.bytes();
      const bb = b.bytes();
      a.mergeBytes(bb);
      b.mergeBytes(ab);
      const c = await open('c');
      c.mergeBytes(bb);
      c.mergeBytes(ab);
      const d2 = await open('d');
      d2.mergeBytes(ab);
      d2.mergeBytes(bb);
      for (const s of [a, b, c, d2]) {
        expect(s.get().home.type, `trial ${trial}`).toBe(type);
        expect(s.get().settings.horizonDays, `trial ${trial}`).toBe(horizon);
        expect(s.get().home.risks, `trial ${trial}`).toEqual(risks);
      }
      await Promise.all([a.close(), b.close(), c.close(), d2.close()]);
    }
  }, 60_000);

  it('risks added concurrently on two fresh devices union', async () => {
    const a = await open('a');
    const b = await open('b');
    a.change('risk', (d) => {
      d.home.risks = ['storm'];
    });
    b.change('risk', (d) => {
      d.home.risks = ['snow'];
    });
    const ab = a.bytes();
    a.mergeBytes(b.bytes());
    b.mergeBytes(ab);
    for (const s of [a, b]) expect([...s.get().home.risks].sort()).toEqual(['snow', 'storm']);
    expect(a.export()).toBe(b.export());
  });

  it('two fresh devices merge without duplicate raw default values', async () => {
    const a = await open('a');
    const b = await open('b');
    const ab = a.bytes();
    a.mergeBytes(b.bytes());
    b.mergeBytes(ab);
    for (const s of [a, b]) {
      expect(rawLength(s, ['settings', 'packs'])).toBe(DEFAULT_PACKS.length);
      expect(s.get().settings.packs).toEqual([...DEFAULT_PACKS]);
    }
  });

  it('keeps both devices in meta.devices and a stable env', async () => {
    const a = await open('a');
    const b = await open('b');
    const ab = a.bytes();
    a.mergeBytes(b.bytes());
    b.mergeBytes(ab);
    expect(a.get().meta.createdAt).toBe(b.get().meta.createdAt);
    expect([...a.get().meta.devices].sort()).toEqual(['a', 'b']);
    expect(a.get().meta.env).toBe('local');
  });
});
