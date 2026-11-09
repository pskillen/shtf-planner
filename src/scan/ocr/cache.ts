/**
 * The date reader's runtime cache. Its wasm, models and dictionary are not precached: the service
 * worker keeps them in this cache the first time they are fetched (vite.config.ts), so the install
 * stays small for a household that never reads dates. No React; uses `caches` only when it exists.
 */

export const READER_CACHE: string =
  typeof __DATE_READER_CACHE__ !== 'undefined' ? __DATE_READER_CACHE__ : 'date-reader-dev';

/** About how much the first use downloads (gzip): wasm 5.2 MB plus the models. */
export const READER_DOWNLOAD_MB = 10;

const PREFIX = 'date-reader-';

const paths = (urls: readonly string[]): string[] =>
  urls.map((u) => {
    try {
      return new URL(u, 'https://x.invalid').pathname;
    } catch {
      return u;
    }
  });

/** True when the cached URLs include the wasm, both models and the dictionary. */
export function isComplete(urls: readonly string[]): boolean {
  const p = paths(urls);
  return (
    p.some((x) => /^\/assets\/[^/]+\.wasm$/.test(x)) &&
    ['/ocr/paddle/det-fp16.onnx', '/ocr/paddle/rec-fp16.onnx', '/ocr/paddle/dict.txt'].every((f) =>
      p.includes(f),
    )
  );
}

const defaultStore = (): CacheStorage | null => (typeof caches === 'undefined' ? null : caches);

/** true, false, or null when this browser has no Cache Storage. */
export async function readerDownloaded(
  store: CacheStorage | null | undefined = defaultStore(),
): Promise<boolean | null> {
  if (!store) return null;
  try {
    if (!(await store.has(READER_CACHE))) return false;
    const cache = await store.open(READER_CACHE);
    const keys = await cache.keys();
    return isComplete(keys.map((r) => r.url));
  } catch {
    return null;
  }
}

/** Deletes every `date-reader-*` cache except READER_CACHE. Never throws. */
export async function pruneReaderCaches(
  store: CacheStorage | null | undefined = defaultStore(),
): Promise<void> {
  if (!store) return;
  try {
    const names = await store.keys();
    await Promise.all(
      names.filter((n) => n.startsWith(PREFIX) && n !== READER_CACHE).map((n) => store.delete(n)),
    );
  } catch {
    // Nothing to prune with: the old cache just stays until the next start.
  }
}
