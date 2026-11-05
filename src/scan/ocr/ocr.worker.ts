/**
 * The date reader's worker: loads the two PaddleOCR models into onnxruntime-web (WebGPU when the
 * browser has it and passes the self-test, WASM otherwise) and reads the grey frames the page
 * sends. It runs off the page's thread so the screen stays smooth while it works.
 *
 * `onnxruntime-web/webgpu` is the one build that runs both providers from a single wasm file.
 * The wasm runs on one thread: threads need cross-origin isolation, which the app does not set
 * (decision 134). Frames arrive as bytes, are read and dropped; only a verdict goes back.
 */
import * as ort from 'onnxruntime-web/webgpu';
import { fromRGBA } from './image';
import type { FromWorker, ToWorker } from './messages';
import { Paddle, type Ort, type Provider } from './paddle';
import { chooseProvider } from './provider';
import { readFrame } from './reader';

// The page's DOM typings stand in for the worker's: only these two members are used.
interface Scope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as Scope;

const MODEL_DET = '/ocr/paddle/det-fp16.onnx';
const MODEL_REC = '/ocr/paddle/rec-fp16.onnx';
const MODEL_DICT = '/ocr/paddle/dict.txt';
const SELF_TEST = '/ocr/selftest.png';

const runtime = ort as unknown as Ort;
runtime.env.wasm.numThreads = 1;

async function bytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

let engine: Paddle | undefined;

async function selfTest(e: Paddle, todayIso: string): Promise<boolean> {
  try {
    const blob = await (await fetch(SELF_TEST)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const verdict = await readFrame(e, fromRGBA(px.data, px.width, px.height), todayIso);
    return verdict.value?.month === 6 && verdict.value.year === 2027;
  } catch {
    return false;
  }
}

async function init(preferWebGpu: boolean, todayIso: string): Promise<void> {
  const t0 = performance.now();
  try {
    const [det, rec, dictBytes] = await Promise.all([
      bytes(MODEL_DET),
      bytes(MODEL_REC),
      bytes(MODEL_DICT),
    ]);
    const dict = new TextDecoder().decode(dictBytes);
    const chosen = await chooseProvider<Paddle>({
      preferWebGpu,
      gpu: async () => {
        const gpu = (
          navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown | null> } }
        ).gpu;
        if (!gpu) return { ok: false, why: 'This browser has no WebGPU' };
        const adapter = await gpu.requestAdapter();
        return adapter ? { ok: true } : { ok: false, why: 'No graphics adapter for WebGPU' };
      },
      create: (ep: Provider) => Paddle.create(runtime, { det, rec, dict }, ep),
      selfTest: (e) => selfTest(e, todayIso),
    });
    engine = chosen.engine;
    scope.postMessage({
      type: 'ready',
      ep: chosen.ep,
      loadMs: Math.round(performance.now() - t0),
      reason: chosen.reason,
    });
  } catch (e) {
    scope.postMessage({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
  }
}

// One message at a time, in order: a read must not start before init has finished.
let chain: Promise<void> = Promise.resolve();

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  chain = chain.then(async () => {
    if (m.type === 'init') return init(m.preferWebGpu, m.todayIso);
    if (!engine) {
      scope.postMessage({ type: 'error', id: m.id, message: 'The reader is not loaded' });
      return;
    }
    try {
      const frame = { w: m.w, h: m.h, d: new Uint8ClampedArray(m.data) };
      const result = await readFrame(engine, frame, m.todayIso);
      scope.postMessage({ type: 'read', id: m.id, result });
    } catch (err) {
      scope.postMessage({
        type: 'error',
        id: m.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
};
