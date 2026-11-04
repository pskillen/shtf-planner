// Lazy, cached engines for the browser. Everything is served from /ocr (same origin): no CDN, no upload.
import { type Engine, paddleEngine, tesseractEngine } from './engines.ts';

export type EngineId = 'tesseract' | 'paddle' | 'paddle-rec';
export const ENGINE_LABEL: Record<EngineId, string> = {
  tesseract: 'Tesseract.js',
  paddle: 'PaddleOCR det+rec',
  'paddle-rec': 'PaddleOCR rec only',
};

const abs = (p: string) => new URL(p, document.baseURI).href;
const cache = new Map<EngineId, Promise<{ engine: Engine; loadMs: number }>>();
export const loadTimes: Partial<Record<EngineId, number>> = {};

export function getEngine(id: EngineId): Promise<Engine> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const t0 = performance.now();
      let engine: Engine;
      if (id === 'tesseract') {
        engine = tesseractEngine(() => import('tesseract.js'), {
          workerOpts: { workerPath: abs('ocr/tess/worker.min.js'), corePath: abs('ocr/tess/'), langPath: abs('ocr/tess'), cacheMethod: 'none' },
        });
      } else {
        const ort: any = await import('onnxruntime-web');
        ort.env.wasm.wasmPaths = abs('ocr/ort/');
        ort.env.wasm.numThreads = 1; // threads need cross-origin isolation; see README notes
        engine = paddleEngine(ort, { base: abs('ocr'), bytes: async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer()) }, { mode: id === 'paddle-rec' ? 'rec' : 'det+rec' });
      }
      await engine.init();
      const loadMs = performance.now() - t0;
      loadTimes[id] = loadMs;
      return { engine, loadMs };
    })();
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p.then((x) => x.engine);
}

/** Gzipped sizes of what each engine downloads (compressed here with CompressionStream, level unknown: an estimate). */
export const ASSETS: Record<EngineId, string[]> = {
  tesseract: ['ocr/tess/worker.min.js', 'ocr/tess/tesseract-core-simd-lstm.wasm.js', 'ocr/tess/eng.traineddata.gz'],
  paddle: ['ocr/ort/ort-wasm-simd-threaded.wasm', 'ocr/ort/ort-wasm-simd-threaded.mjs', 'ocr/paddle/det.onnx', 'ocr/paddle/rec.onnx', 'ocr/paddle/dict.txt'],
  'paddle-rec': ['ocr/ort/ort-wasm-simd-threaded.wasm', 'ocr/ort/ort-wasm-simd-threaded.mjs', 'ocr/paddle/rec.onnx', 'ocr/paddle/dict.txt'],
};

export async function measureSizes(gz: (b: Uint8Array) => Promise<number>): Promise<string[]> {
  const out: string[] = [];
  const memo = new Map<string, [number, number]>();
  for (const id of Object.keys(ASSETS) as EngineId[]) {
    let raw = 0, z = 0;
    for (const a of ASSETS[id]) {
      if (!memo.has(a)) {
        const b = new Uint8Array(await (await fetch(abs(a))).arrayBuffer());
        // .gz files are already compressed: count as-is
        memo.set(a, [b.length, a.endsWith('.gz') ? b.length : await gz(b)]);
      }
      raw += memo.get(a)![0]; z += memo.get(a)![1];
    }
    out.push(`${ENGINE_LABEL[id]}: ${(raw / 1e6).toFixed(1)} MB raw, ~${(z / 1e6).toFixed(1)} MB gzipped` + (loadTimes[id] ? `, first load ${Math.round(loadTimes[id]!)} ms` : ''));
  }
  return out;
}
