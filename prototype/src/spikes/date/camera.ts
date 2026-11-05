import { el } from '../../ui';
import { type Gray, fromRGBA } from './image.ts';
import { type MonthYear, addMonths, fmtMY } from './parse.ts';

/** "Chrome 131 Android", "Firefox 133 Android": enough to tell which browser the owner was using. */
export function browserName(ua = navigator.userAgent): string {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '';
  const m = /(Firefox|FxiOS|EdgA?|Edg|OPR|SamsungBrowser|HeadlessChrome|Chrome|CriOS|Version)\/(\d+)/.exec(ua);
  const name = !m ? 'unknown browser' : m[1] === 'Version' ? 'Safari' : m[1] === 'FxiOS' ? 'Firefox' : m[1] === 'CriOS' || m[1] === 'HeadlessChrome' ? 'Chrome' : m[1].startsWith('Edg') ? 'Edge' : m[1] === 'OPR' ? 'Opera' : m[1];
  return `${name}${m ? ' ' + m[2] : ''}${os ? ' ' + os : ''}`;
}
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
/** The zoom the owner last chose, per browser: the same phone may run Chrome and Firefox and they zoom differently. */
const zoomKey = () => 'date-spike-zoom:' + browserName().replace(/ \d+/, '');
export const DEFAULT_ZOOM = 1.75;

type Dict = Record<string, any>;
const msg = (e: unknown) => (e instanceof Error ? e.name + (e.message ? ': ' + e.message : '') : String(e)).slice(0, 80);

/** One camera stream shared by barcode and date reading, so it stays open between the two. */
export class Cam {
  video = el('video', { autoplay: true, playsInline: true, muted: true });
  box = el('div');
  wrap = el('div', {}, this.video, this.box);
  /** What the screens put on the page: the strip plus the one-line camera-control report under it. */
  ui = el('div');
  stream: MediaStream | null = null;
  /** What this browser/camera told us (empty objects when it says nothing, as Firefox may). */
  caps: Dict = {};
  settings: Dict = {};
  supported: Dict = {};
  /** Result of each constraint we tried, on its own: 'ok', or the reason it was refused. */
  applied: Dict = {};
  zoom: number | null = null;
  lastTap = '';
  private zoomRow = el('div');
  private zoomInput = el('input', { type: 'range' });
  private zoomLabel = el('span');
  private details = el('details');
  private detailsSummary = el('summary');
  private detailsBody = el('pre');
  private ring = el('div');
  private stepLabel = el('div');
  mode: 'barcode' | 'date' = 'date';
  /** The framing box as fractions of the visible strip (not of the whole video frame). */
  frac = { x: 0.06, y: 0.22, w: 0.88, h: 0.56 };
  torchOn = false;

  constructor() {
    // A short strip, not the whole viewfinder: a third of the screen at most, so the controls stay on screen.
    this.wrap.style.cssText = 'position:relative;width:100%;height:min(30vh,260px);min-height:140px;background:#000;overflow:hidden;border-radius:8px;';
    this.video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;max-height:none;';
    this.box.style.cssText = 'position:absolute;border:3px solid #fc0;box-shadow:0 0 0 9999px rgba(0,0,0,.45);border-radius:6px;pointer-events:none;';
    const s = this.box.style;
    s.left = this.frac.x * 100 + '%'; s.top = this.frac.y * 100 + '%'; s.width = this.frac.w * 100 + '%'; s.height = this.frac.h * 100 + '%';
    this.stepLabel.style.cssText = 'position:absolute;left:6px;top:6px;font-size:20px;font-weight:800;letter-spacing:.5px;padding:2px 10px;border-radius:6px;display:none;pointer-events:none;';
    this.wrap.append(this.stepLabel);
    this.wrap.style.boxSizing = 'border-box';
    this.setBoxVisible(true);
    this.buildControls();
  }

  /**
   * Stocktake steps look different at a glance: barcode is blue with a wide, short box and a "1 BARCODE" chip; date is yellow with the
   * taller box and a "2 DATE" chip. `label` false (the date screen on its own) leaves the chip off but still sets the box.
   */
  setMode(mode: 'barcode' | 'date', label = true) {
    this.mode = mode;
    const c = mode === 'barcode' ? '#2aa8ff' : '#fc0';
    this.frac = mode === 'barcode' ? { x: 0.04, y: 0.36, w: 0.92, h: 0.28 } : { x: 0.06, y: 0.22, w: 0.88, h: 0.56 };
    const s = this.box.style;
    s.left = this.frac.x * 100 + '%'; s.top = this.frac.y * 100 + '%'; s.width = this.frac.w * 100 + '%'; s.height = this.frac.h * 100 + '%';
    s.borderColor = c;
    this.wrap.style.border = label ? `5px solid ${c}` : '0';
    this.stepLabel.textContent = mode === 'barcode' ? '1 BARCODE' : '2 DATE';
    this.stepLabel.style.background = c; this.stepLabel.style.color = '#001';
    this.stepLabel.style.display = label ? 'block' : 'none';
  }

  setBoxVisible(v: boolean) {
    this.box.style.display = v ? 'block' : 'none';
  }

  /** Hide the strip (e.g. while the month picker needs the room). The stream keeps running. */
  setStripVisible(v: boolean) {
    this.ui.style.display = v ? 'block' : 'none';
  }

  get running() { return !!this.stream; }

  async start(heightIdeal = 1080) {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: (heightIdeal * 16) / 9 }, height: { ideal: heightIdeal } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    if (!this.video.videoWidth) await new Promise((r) => this.video.addEventListener('loadedmetadata', r, { once: true }));
    await this.setUpControls();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.torchOn = false;
    this.caps = {}; this.settings = {}; this.applied = {}; this.zoom = null; this.lastTap = '';
    this.zoomRow.style.display = 'none';
    this.showReport();
  }

  info() {
    const t = this.stream?.getVideoTracks()[0];
    if (!t) return 'camera off';
    const s = t.getSettings();
    return `camera ${s.width}x${s.height} torch=${this.torchSupported()} BarcodeDetector=${'BarcodeDetector' in window}`;
  }

  torchSupported() {
    const t = this.stream?.getVideoTracks()[0];
    return !!(t && (t.getCapabilities?.() as any)?.torch);
  }

  async setTorch(on: boolean) {
    const t = this.stream?.getVideoTracks()[0];
    if (!t || !this.torchSupported()) throw new Error('Torch not available in this browser/camera');
    if (!(await this.applyOne('torch', on))) throw new Error('Torch refused: ' + this.applied.torch);
    this.torchOn = on;
    this.showReport();
  }

  private track() { return this.stream?.getVideoTracks()[0]; }

  /** Apply one constraint on its own. A refusal is recorded, never thrown: the camera keeps running. */
  async applyOne(name: string, value: unknown): Promise<boolean> {
    const t = this.track();
    if (!t) return false;
    try {
      await t.applyConstraints({ advanced: [{ [name]: value }] } as MediaTrackConstraints);
      this.applied[name] = 'ok';
      this.readSettings();
      return true;
    } catch (e) {
      this.applied[name] = 'refused ' + msg(e);
      return false;
    }
  }

  private readSettings() {
    const t = this.track();
    try { this.settings = (t?.getSettings?.() as Dict) ?? {}; } catch { this.settings = {}; }
  }

  /** The point-of-interest constraint: Chrome lists it as supported; it is rarely in getCapabilities(). */
  get focusPoint(): boolean {
    return !!(this.supported.pointsOfInterest || 'pointsOfInterest' in this.caps || 'pointsOfInterest' in this.settings);
  }
  get focusModes(): string[] { return Array.isArray(this.caps.focusMode) ? this.caps.focusMode : []; }
  get zoomRange(): { min: number; max: number; step: number } | null {
    const z = this.caps.zoom;
    return z && typeof z.min === 'number' && typeof z.max === 'number' && z.max > z.min ? { min: z.min, max: z.max, step: z.step || 0.1 } : null;
  }

  private async setUpControls() {
    const t = this.track();
    this.caps = {}; this.applied = {}; this.lastTap = '';
    try { this.caps = (t?.getCapabilities?.() as Dict) ?? {}; } catch { this.caps = {}; }
    try { this.supported = (navigator.mediaDevices.getSupportedConstraints?.() as Dict) ?? {}; } catch { this.supported = {}; }
    this.readSettings();
    if (this.focusModes.includes('continuous')) await this.applyOne('focusMode', 'continuous');
    const z = this.zoomRange;
    if (z) {
      const saved = parseFloat(store.get(zoomKey()) ?? '');
      const want = Math.min(z.max, Math.max(z.min, Number.isFinite(saved) ? saved : DEFAULT_ZOOM));
      this.zoomInput.min = String(z.min); this.zoomInput.max = String(z.max); this.zoomInput.step = String(z.step);
      await this.setZoom(want, false);
      this.zoomRow.style.display = 'flex';
    }
    this.showReport();
  }

  async setZoom(v: number, remember = true) {
    const z = this.zoomRange;
    if (!z) return;
    v = Math.min(z.max, Math.max(z.min, v));
    this.zoom = v;
    this.zoomInput.value = String(v);
    this.zoomLabel.textContent = v.toFixed(1) + 'x';
    if (remember) store.set(zoomKey(), String(v));
    await this.applyOne('zoom', v);
    this.showReport();
  }

  /** Tap on the strip: focus there, if the browser can. Never throws. */
  async focusAt(px: number, py: number) {
    if (!this.running || !this.focusPoint) return;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const cw = this.wrap.clientWidth || vw, ch = this.wrap.clientHeight || vh;
    const k0 = Math.max(cw / vw, ch / vh), visW = cw / k0, visH = ch / k0;
    const x = Math.min(1, Math.max(0, ((vw - visW) / 2 + (px / cw) * visW) / vw));
    const y = Math.min(1, Math.max(0, ((vh - visH) / 2 + (py / ch) * visH) / vh));
    this.ring.style.cssText = `position:absolute;left:${px - 22}px;top:${py - 22}px;width:44px;height:44px;border:2px solid #fff;border-radius:50%;pointer-events:none;display:block;box-shadow:0 0 0 1px #000;`;
    setTimeout(() => { this.ring.style.display = 'none'; }, 900);
    const a = await this.applyOne('pointsOfInterest', [{ x, y }]);
    let b = true;
    if (this.focusModes.includes('single-shot')) b = await this.applyOne('focusMode', 'single-shot');
    this.lastTap = a && b ? `ok at ${x.toFixed(2)},${y.toFixed(2)}` : `refused (${this.applied.pointsOfInterest}${b ? '' : '; ' + this.applied.focusMode})`;
    if (this.focusModes.includes('continuous')) setTimeout(() => { void this.applyOne('focusMode', 'continuous').then(() => this.showReport()); }, 1500);
    this.showReport();
  }

  private buildControls() {
    this.ui.append(this.wrap, this.details);
    // zoom slider: a thin bar over the bottom of the strip, only shown when the camera reports a zoom range
    this.zoomRow.style.cssText = 'position:absolute;left:0;right:0;bottom:0;display:none;align-items:center;gap:8px;padding:2px 10px;background:rgba(0,0,0,.45);color:#fff;font-size:13px;';
    this.zoomInput.style.cssText = 'flex:1;margin:0;height:24px;';
    this.zoomLabel.style.cssText = 'min-width:36px;text-align:right;';
    const minus = el('button', { textContent: '-' }), plus = el('button', { textContent: '+' });
    for (const b of [minus, plus]) b.style.cssText = 'font-size:18px;line-height:1;width:34px;height:30px;margin:0;padding:0;';
    const step = () => Math.max(this.zoomRange?.step || 0.1, 0.25);
    minus.onclick = (e) => { e.stopPropagation(); void this.setZoom((this.zoom ?? 1) - step()); };
    plus.onclick = (e) => { e.stopPropagation(); void this.setZoom((this.zoom ?? 1) + step()); };
    let timer: number | undefined;
    this.zoomInput.oninput = () => { this.zoomLabel.textContent = (+this.zoomInput.value).toFixed(1) + 'x'; clearTimeout(timer); timer = window.setTimeout(() => void this.setZoom(+this.zoomInput.value), 120); };
    this.zoomRow.append(el('span', { textContent: 'zoom' }), minus, this.zoomInput, plus, this.zoomLabel);
    this.zoomRow.onclick = (e) => e.stopPropagation();
    this.ring.style.display = 'none';
    this.wrap.append(this.ring, this.zoomRow);
    this.wrap.addEventListener('click', (e) => {
      const r = this.wrap.getBoundingClientRect();
      void this.focusAt(e.clientX - r.left, e.clientY - r.top);
    });
    this.detailsSummary.style.cssText = 'font-size:13px;cursor:pointer;padding:2px 0;opacity:.85;';
    this.detailsBody.style.cssText = 'font-size:12px;margin:2px 0;white-space:pre-wrap;word-break:break-word;';
    this.details.append(this.detailsSummary, this.detailsBody);
    this.showReport();
  }

  /** The short line under the strip (and its expanded form). */
  private showReport() {
    this.detailsSummary.textContent = this.shortLine();
    this.detailsBody.textContent = this.report().join('\n');
  }

  private shortLine(): string {
    const b = browserName();
    if (!this.running) return `Camera: ${b}, camera off`;
    const bits: string[] = [];
    if (this.zoomRange) bits.push(`zoom ${this.zoom?.toFixed(1) ?? '?'}x`);
    if (this.focusModes.length) bits.push(`focus ${this.settings.focusMode ?? this.focusModes[0]}`);
    if (this.focusPoint) bits.push(this.focusModes.length ? 'tap to focus' : 'tap to focus (untested)');
    if (this.torchSupported()) bits.push('torch');
    return bits.length ? `Camera: ${b}, ${bits.join(', ')}` : `Camera: ${b}, zoom and focus control not supported here`;
  }

  /** What the browser reported and what we asked for, one fact per line. */
  report(): string[] {
    const L: string[] = [`browser: ${browserName()}`];
    if (!this.running) return [...L, 'camera off'];
    const s = this.settings;
    L.push(`stream: ${this.video.videoWidth}x${this.video.videoHeight}`);
    L.push(`getCapabilities: ${typeof this.track()?.getCapabilities === 'function' ? (Object.keys(this.caps).length ? 'yes' : 'yes, but empty') : 'not available'}`);
    L.push(`torch: ${this.torchSupported() ? 'supported' : 'not supported'}${this.torchOn ? ', on' : ''}`);
    const z = this.zoomRange;
    L.push(`zoom: ${z ? `${z.min}-${z.max} (step ${z.step}), asked ${this.zoom?.toFixed(2)}, camera says ${s.zoom ?? '?'}, ${this.applied.zoom ?? 'not applied'}` : 'not supported'}`);
    L.push(`focusMode: ${this.focusModes.length ? `offered ${this.focusModes.join('/')}, now ${s.focusMode ?? '?'}, ${this.applied.focusMode ?? 'not set'}` : 'not supported'}`);
    L.push(`pointsOfInterest: ${this.focusPoint ? `supported (${this.supported.pointsOfInterest ? 'constraint known' : 'in capabilities'}), now ${JSON.stringify(s.pointsOfInterest ?? null)}${this.lastTap ? ', last tap ' + this.lastTap : ', not tried yet'}` : 'not supported'}`);
    return L;
  }

  /** One line for the top of Copy summary: browser, what it supported, the zoom used. */
  summaryLine(): string {
    const z = this.zoomRange;
    const yn = (ok: boolean) => (ok ? 'yes' : 'no');
    return `camera: ${browserName()} | torch ${yn(this.torchSupported())} | zoom ${z ? `${z.min}-${z.max}, used ${this.zoom?.toFixed(1)}x` : 'no'} | focusMode ${this.focusModes.length ? this.focusModes.join('/') + ' (now ' + (this.settings.focusMode ?? '?') + ')' : 'no'} | pointsOfInterest ${yn(this.focusPoint)}${this.lastTap ? ' (tap ' + this.lastTap + ')' : ''} | stream ${this.video.videoWidth || '-'}x${this.video.videoHeight || '-'}`;
  }

  /** The framed region as a Gray image, at most 256 px high. The strip shows the video with object-fit: cover, so map through that. */
  captureBox(): Gray {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const cw = this.wrap.clientWidth || vw, ch = this.wrap.clientHeight || vh;
    const k0 = Math.max(cw / vw, ch / vh);
    const visW = cw / k0, visH = ch / k0;
    const offX = (vw - visW) / 2, offY = (vh - visH) / 2;
    const sx = offX + this.frac.x * visW, sy = offY + this.frac.y * visH, sw = this.frac.w * visW, sh = this.frac.h * visH;
    const k = Math.min(1, 256 / sh);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return fromRGBA(d.data, c.width, c.height);
  }
}

export function grayToCanvas(g: Gray, maxW = 480, extra = ''): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  const id = new ImageData(g.w, g.h);
  for (let i = 0; i < g.d.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g.d[i]; id.data[i * 4 + 3] = 255; }
  c.getContext('2d')!.putImageData(id, 0, 0);
  c.style.cssText = `max-width:${maxW}px;width:100%;border:1px solid #888;display:block;${extra}`;
  return c;
}

export async function fileToGray(f: File): Promise<Gray> {
  const bmp = await createImageBitmap(f);
  const c = document.createElement('canvas');
  const k = Math.min(1, 256 / bmp.height);
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return fromRGBA(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

/** Month-year picker: year buttons + 12 month buttons. onPick fires on a month tap. */
export function monthYearPicker(start: MonthYear | null, onPick: (v: MonthYear) => void) {
  const now = new Date();
  let year = start?.year ?? now.getFullYear();
  const box = el('div');
  const yr = el('b', { textContent: String(year) });
  yr.style.cssText = 'font-size:22px;min-width:64px;display:inline-block;text-align:center;';
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;';
  const draw = () => {
    yr.textContent = String(year);
    grid.replaceChildren();
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((n, i) => {
      const b = el('button', { textContent: n });
      b.style.cssText = 'padding:14px 0;font-size:18px;margin:0;' + (start && start.year === year && start.month === i + 1 ? 'outline:3px solid #fc0;' : '');
      b.onclick = () => onPick({ month: i + 1, year });
      grid.append(b);
    });
  };
  const nav = (label: string, d: number) => { const b = el('button', { textContent: label }); b.style.cssText = 'font-size:20px;padding:8px 18px;'; b.onclick = () => { year += d; draw(); }; return b; };
  box.append(nav('-', -1), yr, nav('+', 1), grid);
  draw();
  return box;
}

export function bigValue(v: MonthYear | null) {
  const d = el('div', { textContent: v ? fmtMY(v) : '--/----' });
  d.style.cssText = 'font-size:44px;font-weight:700;margin:6px 0;';
  return d;
}

export { addMonths, fmtMY };
