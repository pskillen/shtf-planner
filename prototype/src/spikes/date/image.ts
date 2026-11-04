// Grayscale image helpers. Pure typed-array code so the same pipeline runs in the browser and in the node bench.

export type Gray = { w: number; h: number; d: Uint8ClampedArray };

export const gray = (w: number, h: number): Gray => ({ w, h, d: new Uint8ClampedArray(w * h) });

export function fromRGBA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const g = gray(w, h);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) g.d[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

export function crop(g: Gray, x: number, y: number, w: number, h: number): Gray {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.min(g.w - x, Math.round(w)); h = Math.min(g.h - y, Math.round(h));
  const o = gray(w, h);
  for (let r = 0; r < h; r++) o.d.set(g.d.subarray((y + r) * g.w + x, (y + r) * g.w + x + w), r * w);
  return o;
}

export function resize(g: Gray, w: number, h: number): Gray {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const o = gray(w, h);
  const sx = g.w / w, sy = g.h / h;
  // area-ish: bilinear when enlarging, box average when shrinking
  const shrink = sx > 1.5 || sy > 1.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (shrink) {
        const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.min(g.w, Math.floor((x + 1) * sx)));
        const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.min(g.h, Math.floor((y + 1) * sy)));
        let s = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g.d[yy * g.w + xx]; n++; }
        o.d[y * w + x] = s / n;
      } else {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5), fy = Math.max(0, (y + 0.5) * sy - 0.5);
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1);
        const ax = fx - x0, ay = fy - y0;
        const a = g.d[y0 * g.w + x0] * (1 - ax) + g.d[y0 * g.w + x1] * ax;
        const b = g.d[y1 * g.w + x0] * (1 - ax) + g.d[y1 * g.w + x1] * ax;
        o.d[y * w + x] = a * (1 - ay) + b * ay;
      }
    }
  }
  return o;
}

export const resizeToHeight = (g: Gray, h: number) => resize(g, (g.w * h) / g.h, h);

/** Contrast stretch between the 2nd and 98th percentile. */
export function stretch(g: Gray): Gray {
  const hist = new Uint32Array(256);
  for (const v of g.d) hist[v]++;
  const n = g.d.length;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  if (hi - lo < 8) hi = lo + 8;
  const o = gray(g.w, g.h);
  const k = 255 / (hi - lo);
  for (let i = 0; i < n; i++) o.d[i] = (g.d[i] - lo) * k;
  return o;
}

/** Local-mean threshold via an integral image. Output is 0 (ink) / 255 (paper). Assumes dark ink; use invert() first otherwise. */
export function adaptive(g: Gray, win = 0, c = 8): Gray {
  const { w, h } = g;
  win = win || Math.max(15, Math.round(h / 3) | 1);
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g.d[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const o = gray(w, h);
  const r = win >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const m = s / ((x1 - x0) * (y1 - y0));
      o.d[y * w + x] = g.d[y * w + x] < m - c ? 0 : 255;
    }
  }
  return o;
}

export function invert(g: Gray): Gray {
  const o = gray(g.w, g.h);
  for (let i = 0; i < g.d.length; i++) o.d[i] = 255 - g.d[i];
  return o;
}

/** Grow dark pixels by `r` (joins dot-matrix dots). Separable min filter. */
export function dilateDark(g: Gray, r = 1): Gray {
  const { w, h } = g;
  const t = gray(w, h), o = gray(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 255;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.min(m, g.d[y * w + k]);
    t.d[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 255;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.min(m, t.d[k * w + x]);
    o.d[y * w + x] = m;
  }
  return o;
}

export function blur(g: Gray): Gray {
  const { w, h } = g;
  const o = gray(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += g.d[yy * w + xx]; n++; }
    }
    o.d[y * w + x] = s / n;
  }
  return o;
}

export function rotate(g: Gray, deg: 0 | 90 | 180 | 270): Gray {
  if (deg === 0) return g;
  const { w, h } = g;
  if (deg === 180) { const o = gray(w, h); for (let i = 0; i < w * h; i++) o.d[i] = g.d[w * h - 1 - i]; return o; }
  const o = gray(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (deg === 90) o.d[x * h + (h - 1 - y)] = g.d[y * w + x];
    else o.d[(w - 1 - x) * h + y] = g.d[y * w + x];
  }
  return o;
}

/** Fraction of pixels darker than 128. */
export function darkFraction(g: Gray) {
  let n = 0;
  for (const v of g.d) if (v < 128) n++;
  return n / g.d.length;
}

/** 24-bit uncompressed BMP, readable by Tesseract/leptonica in browser and node alike. */
export function toBMP(g: Gray): Uint8Array {
  const rowBytes = (g.w * 3 + 3) & ~3;
  const size = 54 + rowBytes * g.h;
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  b[0] = 0x42; b[1] = 0x4d;
  v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, g.w, true); v.setInt32(22, g.h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, rowBytes * g.h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  for (let y = 0; y < g.h; y++) {
    const dst = 54 + (g.h - 1 - y) * rowBytes;
    for (let x = 0; x < g.w; x++) { const p = g.d[y * g.w + x]; b[dst + x * 3] = p; b[dst + x * 3 + 1] = p; b[dst + x * 3 + 2] = p; }
  }
  return b;
}

export type Variant = { name: string; apply: (g: Gray) => Gray };

/** Height used for OCR input; dots need enough pixels. */
export const OCR_H = 64;

export const VARIANTS: Variant[] = [
  { name: 'stretch', apply: (g) => stretch(resizeToHeight(g, OCR_H)) },
  { name: 'adapt', apply: (g) => adaptive(stretch(resizeToHeight(g, OCR_H))) },
  { name: 'adapt+dilate', apply: (g) => dilateDark(adaptive(stretch(resizeToHeight(g, OCR_H))), 1) },
  { name: 'inv-adapt', apply: (g) => adaptive(invert(stretch(resizeToHeight(g, OCR_H)))) },
];
