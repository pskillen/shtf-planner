/**
 * Grey-image helpers for the date reader. Plain typed-array code, so the same pipeline runs in
 * the page, in the worker and in the node tests. Pictures live in memory only: nothing here
 * stores, saves or sends one.
 */
import { OCR_H } from '../tunables';

export interface Gray {
  w: number;
  h: number;
  d: Uint8ClampedArray;
}

export const gray = (w: number, h: number): Gray => ({ w, h, d: new Uint8ClampedArray(w * h) });

/** Grey levels of an RGBA frame (the same weights the barcode loop uses). */
export function fromRGBA(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const g = gray(w, h);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) {
    g.d[i] = (rgba[j]! * 77 + rgba[j + 1]! * 150 + rgba[j + 2]! * 29) >> 8;
  }
  return g;
}

/** Bilinear when enlarging, box average when shrinking. */
export function resize(g: Gray, width: number, height: number): Gray {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const o = gray(w, h);
  const sx = g.w / w;
  const sy = g.h / h;
  const shrink = sx > 1.5 || sy > 1.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (shrink) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.min(g.w, Math.floor((x + 1) * sx)));
        const y0 = Math.floor(y * sy);
        const y1 = Math.max(y0 + 1, Math.min(g.h, Math.floor((y + 1) * sy)));
        let s = 0;
        let n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            s += g.d[yy * g.w + xx]!;
            n++;
          }
        }
        o.d[y * w + x] = s / n;
      } else {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5);
        const fy = Math.max(0, (y + 0.5) * sy - 0.5);
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(g.w - 1, x0 + 1);
        const y1 = Math.min(g.h - 1, y0 + 1);
        const ax = fx - x0;
        const ay = fy - y0;
        const a = g.d[y0 * g.w + x0]! * (1 - ax) + g.d[y0 * g.w + x1]! * ax;
        const b = g.d[y1 * g.w + x0]! * (1 - ax) + g.d[y1 * g.w + x1]! * ax;
        o.d[y * w + x] = a * (1 - ay) + b * ay;
      }
    }
  }
  return o;
}

export const resizeToHeight = (g: Gray, h: number): Gray => resize(g, (g.w * h) / g.h, h);

/** Contrast stretch between the 2nd and 98th percentile. */
export function stretch(g: Gray): Gray {
  const hist = new Uint32Array(256);
  for (const v of g.d) hist[v]!++;
  const n = g.d.length;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    if (acc >= n * 0.02) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]!;
    if (acc >= n * 0.02) {
      hi = i;
      break;
    }
  }
  if (hi - lo < 8) hi = lo + 8;
  const o = gray(g.w, g.h);
  const k = 255 / (hi - lo);
  for (let i = 0; i < n; i++) o.d[i] = (g.d[i]! - lo) * k;
  return o;
}

/**
 * Local-mean threshold via an integral image. Output is 0 (ink) or 255 (paper). Assumes dark
 * ink; use {@link invert} first otherwise.
 */
export function adaptive(g: Gray, win = 0, c = 8): Gray {
  const { w, h } = g;
  const size = win || Math.max(15, Math.round(h / 3) | 1);
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g.d[y * w + x]!;
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1]! + row;
    }
  }
  const o = gray(w, h);
  const r = size >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const s =
        I[y1 * (w + 1) + x1]! -
        I[y0 * (w + 1) + x1]! -
        I[y1 * (w + 1) + x0]! +
        I[y0 * (w + 1) + x0]!;
      const m = s / ((x1 - x0) * (y1 - y0));
      o.d[y * w + x] = g.d[y * w + x]! < m - c ? 0 : 255;
    }
  }
  return o;
}

export function invert(g: Gray): Gray {
  const o = gray(g.w, g.h);
  for (let i = 0; i < g.d.length; i++) o.d[i] = 255 - g.d[i]!;
  return o;
}

export function rotate(g: Gray, deg: 0 | 90 | 180 | 270): Gray {
  if (deg === 0) return g;
  const { w, h } = g;
  if (deg === 180) {
    const o = gray(w, h);
    for (let i = 0; i < w * h; i++) o.d[i] = g.d[w * h - 1 - i]!;
    return o;
  }
  const o = gray(h, w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (deg === 90) o.d[x * h + (h - 1 - y)] = g.d[y * w + x]!;
      else o.d[(w - 1 - x) * h + y] = g.d[y * w + x]!;
    }
  }
  return o;
}

/** Fraction of pixels at or above `level` (blown out to white). */
export function saturatedShare(g: Gray, level = 250): number {
  let n = 0;
  for (const v of g.d) if (v >= level) n++;
  return n / g.d.length;
}

/** Cheap sharpness: mean absolute horizontal and vertical gradient, on a copy at most 160 px wide. */
export function sharpness(g: Gray): number {
  const k = Math.min(1, 160 / g.w);
  const s = k < 1 ? resize(g, g.w * k, g.h * k) : g;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < s.h - 1; y++) {
    for (let x = 0; x < s.w - 1; x++) {
      const i = y * s.w + x;
      sum += Math.abs(s.d[i]! - s.d[i + 1]!) + Math.abs(s.d[i]! - s.d[i + s.w]!);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** A small thumbnail of the frame, for "is it moving". */
export const thumb = (g: Gray, w = 32, h = 8): Gray => resize(g, w, h);

/** Mean absolute difference between two same-size thumbnails (0 to 255). Different sizes differ fully. */
export function frameDiff(a: Gray, b: Gray): number {
  if (a.w !== b.w || a.h !== b.h) return 255;
  let s = 0;
  for (let i = 0; i < a.d.length; i++) s += Math.abs(a.d[i]! - b.d[i]!);
  return s / a.d.length;
}

/** The crop at the resolution the camera gave us, but never smaller than OCR_H high. */
export const fit = (g: Gray): Gray => (g.h < OCR_H ? resizeToHeight(g, OCR_H) : g);
const small = (g: Gray): boolean => g.h <= OCR_H * 1.25;

export interface Variant {
  name: string;
  apply: (g: Gray) => Gray;
  /** True when this variant would give the same picture as an earlier one for this crop. */
  redundant?: (g: Gray) => boolean;
}

/**
 * Cheapest likely first. The shrunk, contrast-stretched crop read the most dates on the bench;
 * native resolution rescues framing looser than the box; inverted polarity is for light print on
 * dark; adaptive threshold is last because it is the one that makes confident wrong reads. Only
 * the upright picture is tried (no rotation), and no dilation.
 */
export const VARIANTS: Variant[] = [
  { name: 'stretch@64', apply: (g) => stretch(resizeToHeight(g, OCR_H)) },
  { name: 'stretch', apply: (g) => stretch(fit(g)), redundant: small },
  { name: 'inv@64', apply: (g) => invert(stretch(resizeToHeight(g, OCR_H))) },
  { name: 'inv', apply: (g) => invert(stretch(fit(g))), redundant: small },
  { name: 'adapt', apply: (g) => adaptive(stretch(fit(g))) },
];

/** The variants worth trying for this crop (a crop that is already small skips the native-size ones). */
export const variantsFor = (g: Gray): Variant[] => VARIANTS.filter((v) => !v.redundant?.(g));
