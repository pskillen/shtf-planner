/**
 * PaddleOCR on onnxruntime-web: PP-OCRv3 mobile text detection finds the lines, PP-OCRv5 English
 * mobile recognition reads each one. Both models are the float16-weight files in
 * `public/ocr/paddle/` (the calculation stays float32).
 *
 * The runtime is passed in (`ort`), so the worker gives it the WebGPU-capable build and the node
 * test gives it the plain one. Nothing here touches the page, the network or storage.
 */
import type * as OrtModule from 'onnxruntime-web';
import { gray, resize, type Gray } from './image';

export type Ort = typeof OrtModule;
export type Provider = 'webgpu' | 'wasm';

/** What one read of one picture gave: the lines joined with a newline, and the reader's confidence (0 to 1). */
export interface OcrOut {
  text: string;
  conf: number;
}

/** The pictures-to-text part the frame reader needs. */
export interface Engine {
  read(g: Gray): Promise<OcrOut>;
}

export interface PaddleFiles {
  det: Uint8Array;
  rec: Uint8Array;
  /** `dict.txt`: one character a line. */
  dict: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** Detection: scale so the short side is at least this (a tiny crop detects poorly)... */
const DET_MIN_SIDE = 96;
/** ...and the long side at most this; both rounded to a multiple of 32. */
const DET_MAX_SIDE = 960;
/** A pixel is text when its probability is above this. */
const DET_THRESHOLD = 0.3;
/** A component needs this many pixels and this mean probability to count. */
const DET_MIN_PIXELS = 12;
const DET_MIN_MEAN = 0.5;
/** The DB unclip ratio. */
const DET_UNCLIP = 1.6;
/** Recognition: each box is resized to this height. */
const REC_H = 48;

export class Paddle implements Engine {
  private constructor(
    private readonly ort: Ort,
    private readonly det: OrtModule.InferenceSession,
    private readonly rec: OrtModule.InferenceSession,
    private readonly dict: string[],
  ) {}

  /** Creates both sessions on one execution provider. Rejects when either will not create. */
  static async create(ort: Ort, files: PaddleFiles, ep: Provider): Promise<Paddle> {
    const options: OrtModule.InferenceSession.SessionOptions = {
      executionProviders: [ep],
      graphOptimizationLevel: 'all',
    };
    const rec = await ort.InferenceSession.create(files.rec, options);
    let det: OrtModule.InferenceSession;
    try {
      det = await ort.InferenceSession.create(files.det, options);
    } catch (e) {
      await rec.release();
      throw e;
    }
    const dict = ['', ...files.dict.split('\n').filter((l) => l.length > 0), ' '];
    return new Paddle(ort, det, rec, dict);
  }

  async read(g: Gray): Promise<OcrOut> {
    const boxes = await this.detect(g);
    if (!boxes.length) return { text: '', conf: 0 };
    const parts: string[] = [];
    let total = 0;
    for (const b of boxes) {
      const r = await this.recognise(g, b);
      if (r.text) {
        parts.push(r.text);
        total += r.conf;
      }
    }
    return { text: parts.join('\n'), conf: parts.length ? total / parts.length : 0 };
  }

  async release(): Promise<void> {
    await this.det.release();
    await this.rec.release();
  }

  private async detect(g: Gray): Promise<Box[]> {
    let s = 1;
    if (Math.min(g.w, g.h) < DET_MIN_SIDE) s = DET_MIN_SIDE / Math.min(g.w, g.h);
    if (Math.max(g.w, g.h) * s > DET_MAX_SIDE) s = DET_MAX_SIDE / Math.max(g.w, g.h);
    const W = Math.max(32, Math.round((g.w * s) / 32) * 32);
    const H = Math.max(32, Math.round((g.h * s) / 32) * 32);
    const r = resize(g, W, H);
    const plane = W * H;
    const f = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      const v = r.d[i]! / 255;
      f[i] = (v - MEAN[0]) / STD[0];
      f[plane + i] = (v - MEAN[1]) / STD[1];
      f[2 * plane + i] = (v - MEAN[2]) / STD[2];
    }
    const name = this.det.inputNames[0]!;
    const out = await this.det.run({ [name]: new this.ort.Tensor('float32', f, [1, 3, H, W]) });
    const prob = out[this.det.outputNames[0]!]!.data as Float32Array;

    // Threshold, then connected components (4-neighbour) into boxes, unclipped, mapped back.
    const bin = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) bin[i] = prob[i]! > DET_THRESHOLD ? 1 : 0;
    const seen = new Uint8Array(plane);
    const boxes: Box[] = [];
    const stack: number[] = [];
    for (let i = 0; i < plane; i++) {
      if (!bin[i] || seen[i]) continue;
      let x0 = W;
      let y0 = H;
      let x1 = 0;
      let y1 = 0;
      let n = 0;
      let ps = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        const x = p % W;
        const y = (p / W) | 0;
        n++;
        ps += prob[p]!;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (const q of [p - 1, p + 1, p - W, p + W]) {
          if (q < 0 || q >= plane || seen[q] || !bin[q]) continue;
          if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
      if (n < DET_MIN_PIXELS || ps / n < DET_MIN_MEAN) continue;
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const d = (bw * bh * DET_UNCLIP) / (2 * (bw + bh)); // DB unclip, axis-aligned
      const ux0 = Math.max(0, x0 - d);
      const uy0 = Math.max(0, y0 - d);
      const ux1 = Math.min(W, x1 + d);
      const uy1 = Math.min(H, y1 + d);
      boxes.push({
        x: ux0 / (W / g.w),
        y: uy0 / (H / g.h),
        w: (ux1 - ux0) / (W / g.w),
        h: (uy1 - uy0) / (H / g.h),
      });
    }
    // Reading order: rows, then columns.
    boxes.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y));
    return boxes.filter((b) => b.w > 4 && b.h > 4);
  }

  private async recognise(g: Gray, b: Box): Promise<OcrOut> {
    const c = gray(Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h)));
    for (let y = 0; y < c.h; y++) {
      const sy = Math.min(g.h - 1, Math.round(b.y) + y);
      for (let x = 0; x < c.w; x++) {
        c.d[y * c.w + x] = g.d[sy * g.w + Math.min(g.w - 1, Math.round(b.x) + x)]!;
      }
    }
    const W = Math.min(1280, Math.max(16, Math.round((c.w * REC_H) / c.h / 8) * 8));
    const r = resize(c, W, REC_H);
    const plane = W * REC_H;
    const f = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      const v = (r.d[i]! / 255 - 0.5) / 0.5;
      f[i] = v;
      f[plane + i] = v;
      f[2 * plane + i] = v;
    }
    const name = this.rec.inputNames[0]!;
    const out = await this.rec.run({ [name]: new this.ort.Tensor('float32', f, [1, 3, REC_H, W]) });
    const o = out[this.rec.outputNames[0]!]!;
    const [, T, C] = o.dims as readonly number[];
    const data = o.data as Float32Array;
    // Greedy CTC: the best class at each step, repeats and blanks dropped.
    let text = '';
    let prev = 0;
    let sum = 0;
    let kept = 0;
    for (let t = 0; t < T!; t++) {
      let best = 0;
      let bv = -Infinity;
      for (let k = 0; k < C!; k++) {
        const v = data[t * C! + k]!;
        if (v > bv) {
          bv = v;
          best = k;
        }
      }
      if (best !== 0 && best !== prev) {
        text += this.dict[best] ?? '';
        sum += bv;
        kept++;
      }
      prev = best;
    }
    return { text, conf: kept ? sum / kept : 0 };
  }
}
