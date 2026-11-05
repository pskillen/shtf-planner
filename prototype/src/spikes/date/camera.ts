import { el } from '../../ui';
import { type Gray, fromRGBA } from './image.ts';
import { type MonthYear, addMonths, fmtMY } from './parse.ts';

/** One camera stream shared by barcode and date reading, so it stays open between the two. */
export class Cam {
  video = el('video', { autoplay: true, playsInline: true, muted: true });
  box = el('div');
  wrap = el('div', {}, this.video, this.box);
  stream: MediaStream | null = null;
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
    this.setBoxVisible(true);
  }

  setBoxVisible(v: boolean) {
    this.box.style.display = v ? 'block' : 'none';
  }

  /** Hide the strip (e.g. while the month picker needs the room). The stream keeps running. */
  setStripVisible(v: boolean) {
    this.wrap.style.display = v ? 'block' : 'none';
  }

  get running() { return !!this.stream; }

  async start(heightIdeal = 1080) {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: (heightIdeal * 16) / 9 }, height: { ideal: heightIdeal }, advanced: [{ focusMode: 'continuous' } as any] } as MediaTrackConstraints,
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    if (!this.video.videoWidth) await new Promise((r) => this.video.addEventListener('loadedmetadata', r, { once: true }));
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.torchOn = false;
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
    await t.applyConstraints({ advanced: [{ torch: on } as any] });
    this.torchOn = on;
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
