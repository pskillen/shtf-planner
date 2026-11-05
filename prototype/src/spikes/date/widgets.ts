// Small UI pieces shared by the two date screens (#/date and #/stocktake): the status line, the frozen-result card,
// the compact button styles. Phone first: everything the owner taps must fit on screen at 360x740 without scrolling.
import { el } from '../../ui';
import { type Gray } from './image.ts';
import { grayToCanvas } from './camera.ts';
import { type ScanStatus, type StatusInfo } from './read-loop.ts';
import { type MonthYear, fmtMY } from './parse.ts';

const LOOK: Record<ScanStatus, { text: string; bg: string; fg: string }> = {
  ready: { text: 'Ready', bg: '#dde6f0', fg: '#123' },
  looking: { text: 'Looking for a date…', bg: '#f6d56b', fg: '#321' },
  reading: { text: 'Reading frame…', bg: '#6aa7e8', fg: '#012' },
  hold: { text: 'Hold still', bg: '#f0a35a', fg: '#310' },
  checking: { text: 'Checking…', bg: '#8fd0f2', fg: '#012' },
  got: { text: 'Got it', bg: '#3bb273', fg: '#021' },
  none: { text: 'No date found', bg: '#e46a6a', fg: '#200' },
};

/** One coloured status line. Exactly one state at a time; `what` is 'date' or 'barcode'. */
export function statusLine() {
  const box = el('div');
  box.style.cssText = 'font-size:19px;font-weight:700;padding:8px 10px;border-radius:8px;margin:6px 0;min-height:24px;line-height:24px;';
  box.setAttribute('role', 'status');
  const set = (s: ScanStatus, info?: StatusInfo, what = 'date', extra = '') => {
    const l = LOOK[s];
    let t = l.text.replace('date', what);
    if (s === 'looking') t += ` (${info?.frames ?? 0} frame${info?.frames === 1 ? '' : 's'} read)`;
    if (s === 'reading') t = `Reading frame ${(info?.frames ?? 0) + 1}…` + (info?.seen ? ` (${info.seen} seen once)` : '');
    if (s === 'checking') t = `Got ${info?.seen ?? 'a date'} once, checking…`;
    if (s === 'hold' && info) t += ` (${info.skipped} skipped)`;
    box.textContent = t + (extra ? '  ' + extra : '');
    box.style.background = l.bg; box.style.color = l.fg;
    box.dataset.state = s;
  };
  set('ready');
  return { box, set };
}

/** Buttons sized for a thumb but not for a billboard. */
export function styleBtn(b: HTMLElement, bg = '', fg = '#fff', size = 18) {
  b.style.cssText = `font-size:${size}px;padding:10px 12px;margin:3px 4px 3px 0;border:0;border-radius:8px;min-height:44px;${bg ? `background:${bg};color:${fg};` : ''}`;
  return b;
}

/** The frozen result: the exact crop that produced it, next to the value. */
export function resultCard(opts: { crop: Gray | null; value: MonthYear | null; yearAssumed: boolean; detail: string }) {
  const row = el('div');
  row.style.cssText = 'display:flex;gap:10px;align-items:center;margin:4px 0;';
  const left = el('div');
  left.style.cssText = 'flex:0 0 46%;min-width:0;';
  if (opts.crop) left.append(grayToCanvas(opts.crop, 400, 'border-radius:6px;max-height:110px;object-fit:contain;'));
  const right = el('div');
  right.style.cssText = 'flex:1;min-width:0;';
  const v = el('div', { textContent: opts.value ? fmtMY(opts.value) : '--/----' });
  v.style.cssText = 'font-size:38px;font-weight:700;line-height:1.1;';
  right.append(v);
  if (opts.yearAssumed) {
    const y = el('div', { textContent: 'year assumed' });
    y.style.cssText = 'font-size:14px;font-weight:700;color:#a40;';
    right.append(y);
  }
  const d = el('div', { textContent: opts.detail });
  d.style.cssText = 'font-size:11px;opacity:.75;word-break:break-all;max-height:3.6em;overflow:hidden;';
  right.append(d);
  row.append(left, right);
  return { row, value: v };
}

/** A small in-memory copy of a crop (at most 120 px wide) for the attempt log; not persisted. */
export function smallCrop(g: Gray, maxW = 120): Gray {
  const k = Math.min(1, maxW / g.w);
  if (k >= 1) return g;
  const w = Math.max(1, Math.round(g.w * k)), h = Math.max(1, Math.round(g.h * k));
  const o = { w, h, d: new Uint8ClampedArray(w * h) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.d[y * w + x] = g.d[Math.min(g.h - 1, Math.floor(y / k)) * g.w + Math.min(g.w - 1, Math.floor(x / k))];
  return o;
}
