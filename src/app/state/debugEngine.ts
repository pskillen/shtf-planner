import { getStore } from './sharedStore';

/** Today as `YYYY-MM-DD`, for the console: the engine itself never reads the clock. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * With `?debug=1`, hangs the engine on `window.__shtf.engine`, bound to the live document and the
 * bundled packs with its custom item types merged in: `targets`, `coverage`, `gaps` and `score` take `(asOf?, horizonDays?)`, `preview`
 * takes `(asOf?)`. `asOf` is `YYYY-MM-DD` and defaults to today; `horizonDays` defaults to the
 * document's setting. Each returns a promise.
 */
export function installEngineDebug(hook: Record<string, unknown> | undefined): void {
  if (!hook) return;
  // Loaded on first call, so the engine and the packs stay out of the main chunk's way.
  const load = async () => {
    const [engine, { bundledPacks, packsFor }, doc] = await Promise.all([
      import('../../engine'),
      import('../../packs'),
      getStore().then((s) => s.get()),
    ]);
    return { engine, packs: packsFor(bundledPacks(), doc), doc };
  };
  hook.engine = {
    targets: async (asOf: string = today(), horizonDays?: number) => {
      const { engine, packs, doc } = await load();
      return engine.targets(doc, packs, asOf, horizonDays);
    },
    coverage: async (asOf: string = today(), horizonDays?: number) => {
      const { engine, packs, doc } = await load();
      return engine.coverage(doc, packs, asOf, horizonDays);
    },
    gaps: async (asOf: string = today(), horizonDays?: number) => {
      const { engine, packs, doc } = await load();
      return engine.gaps(doc, packs, asOf, horizonDays);
    },
    score: async (asOf: string = today(), horizonDays?: number) => {
      const { engine, packs, doc } = await load();
      return engine.score(doc, packs, asOf, horizonDays);
    },
    preview: async (asOf: string = today()) => {
      const { engine, packs, doc } = await load();
      return engine.preview(doc, packs, asOf);
    },
  };
}
