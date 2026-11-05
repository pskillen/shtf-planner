// OCR engines behind one interface. Input is a preprocessed Gray image (one or two lines of text).
import { type Gray, gray, resize, toBMP } from './image.ts';

export type OcrOut = { text: string; conf: number }; // conf 0..1
export type Engine = {
  name: string;
  init(): Promise<void>;
  read(g: Gray): Promise<OcrOut>;
  dispose(): Promise<void>;
};

export type Assets = {
  /** fetch bytes (browser: fetch; node: fs) */
  bytes(path: string): Promise<Uint8Array>;
  /** base URL/dir for engine files, e.g. '/ocr' */
  base: string;
};

// Letters that can occur in month names and BB / USE BY / BEST BEFORE / EXP labels.
export const WHITELIST = '0123456789/.-: ABCDEFGHIJLMNOPRSTUVY';

// ---------------------------------------------------------------- Tesseract.js
export type TessOpts = { workerOpts?: Record<string, unknown>; psm?: string; noWhitelist?: boolean };
export function tesseractEngine(importTess: () => Promise<any>, opts: TessOpts = {}): Engine {
  let worker: any;
  return {
    name: 'tesseract',
    async init() {
      const T = await importTess();
      const createWorker = T.createWorker ?? T.default?.createWorker;
      worker = await createWorker('eng', 1, { logger: () => {}, ...opts.workerOpts }, { load_system_dawg: '0', load_freq_dawg: '0' });
      await worker.setParameters({
        ...(opts.noWhitelist ? {} : { tessedit_char_whitelist: WHITELIST }),
        tessedit_pageseg_mode: opts.psm ?? '6', // a block of lines: real labels have two or three (psm 7, one line, returned junk on the phone)
        preserve_interword_spaces: '1',
      });
    },
    async read(g) {
      const { data } = await worker.recognize(toBMP(g));
      return { text: String(data.text ?? '').trim(), conf: (data.confidence ?? 0) / 100 };
    },
    async dispose() { await worker?.terminate(); },
  };
}

// ---------------------------------------------------------------- PaddleOCR (PP-OCR mobile) via onnxruntime-web
/** `det`, `rec` and `dict` name files in the paddle folder (defaults: det.onnx, rec.onnx, dict.txt); `label` is the engine's name in logs. */
export type PaddleOpts = { mode: 'det+rec' | 'rec'; threads?: number; det?: string; rec?: string; dict?: string; label?: string };
export type Ort = any;

export function paddleEngine(ort: Ort, assets: Assets, opts: PaddleOpts): Engine {
  let det: any, rec: any;
  let dict: string[] = [];
  const dir = assets.base + '/paddle';
  const at = (f: string) => (f.startsWith('/') ? f : `${dir}/${f}`); // an absolute path is for the node bench
  return {
    name: opts.label ?? (opts.mode === 'rec' ? 'paddle-rec' : 'paddle'),
    async init() {
      const so = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      const [recB, dictB] = await Promise.all([assets.bytes(at(opts.rec ?? 'rec.onnx')), assets.bytes(at(opts.dict ?? 'dict.txt'))]);
      rec = await ort.InferenceSession.create(recB, so);
      dict = ['', ...new TextDecoder().decode(dictB).split('\n').filter((l) => l.length > 0), ' '];
      if (opts.mode === 'det+rec') det = await ort.InferenceSession.create(await assets.bytes(at(opts.det ?? 'det.onnx')), so);
    },
    async read(g) {
      let boxes: Box[];
      if (opts.mode === 'rec') boxes = [{ x: 0, y: 0, w: g.w, h: g.h }];
      else boxes = await detect(ort, det, g);
      if (!boxes.length) return { text: '', conf: 0 };
      const parts: string[] = [];
      let cs = 0;
      for (const b of boxes) {
        const r = await recognise(ort, rec, dict, g, b);
        if (r.text) { parts.push(r.text); cs += r.conf; }
      }
      return { text: parts.join('\n'), conf: parts.length ? cs / parts.length : 0 };
    },
    async dispose() { await det?.release?.(); await rec?.release?.(); },
  };
}

type Box = { x: number; y: number; w: number; h: number };

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

async function detect(ort: Ort, session: any, g: Gray): Promise<Box[]> {
  // scale: min side >= 96 (tiny crops detect poorly), max side <= 960, both multiples of 32
  let s = 1;
  if (Math.min(g.w, g.h) < 96) s = 96 / Math.min(g.w, g.h);
  if (Math.max(g.w, g.h) * s > 960) s = 960 / Math.max(g.w, g.h);
  const W = Math.max(32, Math.round((g.w * s) / 32) * 32), H = Math.max(32, Math.round((g.h * s) / 32) * 32);
  const r = resize(g, W, H);
  const plane = W * H;
  const f = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const v = r.d[i] / 255;
    f[i] = (v - MEAN[0]) / STD[0]; f[plane + i] = (v - MEAN[1]) / STD[1]; f[2 * plane + i] = (v - MEAN[2]) / STD[2];
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, H, W]) });
  const prob = out[session.outputNames[0]].data as Float32Array;
  // threshold + connected components -> boxes, unclipped, mapped back to g coordinates
  const bin = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) bin[i] = prob[i] > 0.3 ? 1 : 0;
  const seen = new Uint8Array(plane);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let i = 0; i < plane; i++) {
    if (!bin[i] || seen[i]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0, ps = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!; const x = p % W, y = (p / W) | 0;
      n++; ps += prob[p];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= plane || seen[q] || !bin[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    if (n < 12 || ps / n < 0.5) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const d = (bw * bh * 1.6) / (2 * (bw + bh)); // DB unclip, axis-aligned
    const ux0 = Math.max(0, x0 - d), uy0 = Math.max(0, y0 - d), ux1 = Math.min(W, x1 + d), uy1 = Math.min(H, y1 + d);
    boxes.push({ x: ux0 / (W / g.w), y: uy0 / (H / g.h), w: (ux1 - ux0) / (W / g.w), h: (uy1 - uy0) / (H / g.h) });
  }
  // reading order: rows then columns
  boxes.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y));
  return boxes.filter((b) => b.w > 4 && b.h > 4);
}

async function recognise(ort: Ort, session: any, dict: string[], g: Gray, b: Box): Promise<OcrOut> {
  const H = 48;
  const c = gray(Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h)));
  for (let y = 0; y < c.h; y++) {
    const sy = Math.min(g.h - 1, Math.round(b.y) + y);
    for (let x = 0; x < c.w; x++) c.d[y * c.w + x] = g.d[sy * g.w + Math.min(g.w - 1, Math.round(b.x) + x)];
  }
  const W = Math.min(1280, Math.max(16, Math.round((c.w * H) / c.h / 8) * 8));
  const r = resize(c, W, H);
  const plane = W * H;
  const f = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { const v = (r.d[i] / 255 - 0.5) / 0.5; f[i] = v; f[plane + i] = v; f[2 * plane + i] = v; }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, H, W]) });
  const o = out[session.outputNames[0]];
  const [, T, C] = o.dims as number[];
  const data = o.data as Float32Array;
  let text = '', prev = 0, cs = 0, cn = 0;
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -Infinity;
    for (let k = 0; k < C; k++) { const v = data[t * C + k]; if (v > bv) { bv = v; best = k; } }
    if (best !== 0 && best !== prev) { text += dict[best] ?? ''; cs += bv; cn++; }
    prev = best;
  }
  return { text, conf: cn ? cs / cn : 0 };
}
