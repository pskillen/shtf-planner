import { describe, expect, it } from 'vitest';
import { isComplete, pruneReaderCaches, READER_CACHE, readerDownloaded } from './cache';

const ALL = [
  'https://app.test/assets/ort-wasm-simd-threaded.jsep-abc123.wasm',
  'https://app.test/ocr/paddle/det-fp16.onnx',
  'https://app.test/ocr/paddle/rec-fp16.onnx',
  'https://app.test/ocr/paddle/dict.txt',
];

/** A fake CacheStorage: a Map of cache name to the URLs in it. */
function fakeStore(initial: Record<string, string[]>, failing = false) {
  const m = new Map(Object.entries(initial));
  const store = {
    has: async (n: string) => m.has(n),
    keys: async () => {
      if (failing) throw new Error('boom');
      return [...m.keys()];
    },
    delete: async (n: string) => m.delete(n),
    open: async (n: string) => ({
      keys: async () => (m.get(n) ?? []).map((url) => ({ url })),
    }),
  } as unknown as CacheStorage;
  return { store, names: () => [...m.keys()] };
}

describe('isComplete', () => {
  it('is true only with the wasm, both models and the dictionary', () => {
    expect(isComplete(ALL)).toBe(true);
    for (let i = 0; i < ALL.length; i++) {
      expect(isComplete(ALL.filter((_, j) => j !== i))).toBe(false);
    }
    expect(isComplete([])).toBe(false);
  });
});

describe('readerDownloaded', () => {
  it('is true when the current cache holds everything', async () => {
    expect(await readerDownloaded(fakeStore({ [READER_CACHE]: ALL }).store)).toBe(true);
  });
  it('is false with no cache or a partial one', async () => {
    expect(await readerDownloaded(fakeStore({}).store)).toBe(false);
    expect(await readerDownloaded(fakeStore({ [READER_CACHE]: ALL.slice(1) }).store)).toBe(false);
    expect(await readerDownloaded(fakeStore({ 'date-reader-old': ALL }).store)).toBe(false);
  });
  it('is null with no Cache Storage', async () => {
    expect(await readerDownloaded(null)).toBeNull();
  });
});

describe('pruneReaderCaches', () => {
  it('deletes old date-reader caches only', async () => {
    const f = fakeStore({
      'date-reader-old1': [],
      'date-reader-old2': [],
      [READER_CACHE]: ALL,
      'workbox-precache-v2-https://app.test/': [],
    });
    await pruneReaderCaches(f.store);
    expect(f.names().sort()).toEqual(
      [READER_CACHE, 'workbox-precache-v2-https://app.test/'].sort(),
    );
  });
  it('swallows a rejecting store', async () => {
    await expect(pruneReaderCaches(fakeStore({}, true).store)).resolves.toBeUndefined();
  });
});
