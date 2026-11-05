import { fromRGBA, type Gray } from './ocr/image';
import { CAPTURE_MAX_H, DEFAULT_ZOOM, FOCUS_HOLD_MS, type Box } from './tunables';

/**
 * One camera stream per screen, shared by the barcode step and (later) the date step: it stays
 * open between steps. Each camera setting (torch, zoom, focus) is applied on its own, because a
 * browser that refuses one should not lose the others; a refusal is recorded, never thrown.
 * Frames are only read to find a barcode or a best-before date; they never leave the phone and
 * are never stored.
 */

export interface CameraCapabilities {
  torch: boolean;
  zoom?: { min: number; max: number; step: number };
  focusModes: string[];
  pointsOfInterest: boolean;
}

type Dict = Record<string, unknown>;

/** The browser family, without a version: the same phone can run Chrome and Firefox. */
export function browserName(ua: string): string {
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/Edg(A|iOS)?\//.test(ua)) return 'edge';
  if (/SamsungBrowser\//.test(ua)) return 'samsung';
  if (/Chrome\/|CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

const zoomKey = (browser: string): string => `shtf.camera.zoom:${browser}`;

/** The zoom this browser last used, or the default, kept inside the camera's range. */
export function startingZoom(
  range: { min: number; max: number },
  saved: string | null,
  fallback: number = DEFAULT_ZOOM,
): number {
  const n = saved === null ? NaN : parseFloat(saved);
  const want = Number.isFinite(n) ? n : fallback;
  return Math.min(range.max, Math.max(range.min, want));
}

/** A rectangle in video pixels. */
export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Where a box on the visible strip falls in the video frame. The video fills the strip with
 * `object-fit: cover`: it is scaled until both sides are covered and the overflow is cropped
 * equally at the ends, so a fraction of the strip is not a fraction of the frame.
 */
export function boxToVideoRect(
  box: Box,
  strip: { w: number; h: number },
  video: { w: number; h: number },
): Rect {
  const scale = Math.max(strip.w / video.w, strip.h / video.h);
  const shownW = video.w * scale;
  const shownH = video.h * scale;
  const offX = (shownW - strip.w) / 2;
  const offY = (shownH - strip.h) / 2;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const x0 = clamp((offX + box.x * strip.w) / scale, video.w);
  const y0 = clamp((offY + box.y * strip.h) / scale, video.h);
  const x1 = clamp((offX + (box.x + box.w) * strip.w) / scale, video.w);
  const y1 = clamp((offY + (box.y + box.h) * strip.h) / scale, video.h);
  return {
    sx: Math.round(x0),
    sy: Math.round(y0),
    sw: Math.max(1, Math.round(x1 - x0)),
    sh: Math.max(1, Math.round(y1 - y0)),
  };
}

/** A point on the visible strip as a point in the frame, each 0 to 1 (what `pointsOfInterest` takes). */
export function stripPointToVideo(
  fx: number,
  fy: number,
  strip: { w: number; h: number },
  video: { w: number; h: number },
): { x: number; y: number } {
  const r = boxToVideoRect({ x: fx, y: fy, w: 0, h: 0 }, strip, video);
  return { x: r.sx / video.w, y: r.sy / video.h };
}

/** The size to draw a captured box at: never taller than `maxHeight`, never narrower than `minWidth`. */
export function captureSize(
  sw: number,
  sh: number,
  maxHeight: number,
  minWidth = 480,
): { w: number; h: number } {
  let scale = Math.min(1, maxHeight / sh);
  if (sw * scale < minWidth) scale = Math.min(1, minWidth / sw);
  return { w: Math.max(1, Math.round(sw * scale)), h: Math.max(1, Math.round(sh * scale)) };
}

export interface CameraOptions {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia' | 'getSupportedConstraints'>;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  userAgent?: string;
  /** Replaces the timer that returns focus to continuous after a tap (tests). */
  setTimeout?: typeof setTimeout;
}

export class CameraStream {
  /** Constraints the browser refused, by name, with the reason. */
  readonly refused: Record<string, string> = {};
  /** The last zoom applied. */
  zoom: number | undefined;
  torchOn = false;
  private video: HTMLVideoElement | undefined;
  private stream: MediaStream | undefined;
  private readonly opts: CameraOptions;
  private focusTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by `stop()`: a `start()` still waiting for permission sees it changed and lets go. */
  private epoch = 0;

  constructor(opts: CameraOptions = {}) {
    this.opts = opts;
  }

  private get storage(): CameraOptions['storage'] {
    try {
      return this.opts.storage ?? globalThis.localStorage;
    } catch {
      return undefined;
    }
  }

  private get browser(): string {
    return browserName(this.opts.userAgent ?? globalThis.navigator?.userAgent ?? '');
  }

  get running(): boolean {
    return this.stream !== undefined;
  }

  /** Opens the camera into `video`. Rejects when there is no camera or permission is refused. */
  async start(video: HTMLVideoElement): Promise<void> {
    if (this.stream) return;
    const devices = this.opts.mediaDevices ?? globalThis.navigator?.mediaDevices;
    if (!devices?.getUserMedia) throw new Error('No camera in this browser');
    const epoch = this.epoch;
    const stream = await devices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    if (epoch !== this.epoch) {
      // The screen was left (or the page hidden) while the browser was still asking: the camera
      // must not come on afterwards.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.video = video;
    video.srcObject = stream;
    await video.play?.().catch(() => undefined);
    if (epoch !== this.epoch) return;
    await this.setUp();
  }

  stop(): void {
    this.epoch++;
    clearTimeout(this.focusTimer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
    this.torchOn = false;
    this.zoom = undefined;
  }

  private track(): MediaStreamTrack | undefined {
    return this.stream?.getVideoTracks()[0];
  }

  /** What this browser and camera can do. Firefox may say nothing, which reads as nothing. */
  capabilities(): CameraCapabilities {
    const read = (f: () => unknown): Dict => {
      try {
        return (f() as Dict | undefined) ?? {};
      } catch {
        return {};
      }
    };
    const caps = read(() => this.track()?.getCapabilities?.());
    const supported = read(() =>
      (this.opts.mediaDevices ?? globalThis.navigator?.mediaDevices)?.getSupportedConstraints?.(),
    );
    const settings = read(() => this.track()?.getSettings?.());
    const z = caps.zoom as { min?: unknown; max?: unknown; step?: unknown } | undefined;
    const zoom =
      z && typeof z.min === 'number' && typeof z.max === 'number' && z.max > z.min
        ? { min: z.min, max: z.max, step: typeof z.step === 'number' && z.step > 0 ? z.step : 0.1 }
        : undefined;
    return {
      torch: caps.torch === true,
      ...(zoom ? { zoom } : {}),
      focusModes: Array.isArray(caps.focusMode)
        ? caps.focusMode.filter((m): m is string => typeof m === 'string')
        : [],
      pointsOfInterest:
        supported.pointsOfInterest === true ||
        'pointsOfInterest' in caps ||
        'pointsOfInterest' in settings,
    };
  }

  /** Applies one constraint on its own. A refusal is kept in `refused`; this never throws. */
  async applyOne(name: string, value: unknown): Promise<boolean> {
    const t = this.track();
    if (!t) return false;
    try {
      await t.applyConstraints({ advanced: [{ [name]: value }] } as MediaTrackConstraints);
      delete this.refused[name];
      return true;
    } catch (e) {
      this.refused[name] = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 80) : String(e);
      return false;
    }
  }

  private async setUp(): Promise<void> {
    const caps = this.capabilities();
    if (caps.focusModes.includes('continuous')) await this.applyOne('focusMode', 'continuous');
    if (caps.zoom) {
      const saved = (() => {
        try {
          return this.storage?.getItem(zoomKey(this.browser)) ?? null;
        } catch {
          return null;
        }
      })();
      await this.setZoom(startingZoom(caps.zoom, saved), false);
    }
  }

  async setTorch(on: boolean): Promise<boolean> {
    const ok = await this.applyOne('torch', on);
    if (ok) this.torchOn = on;
    return ok;
  }

  /** Sets the zoom (kept inside the camera's range) and remembers it for this browser. */
  async setZoom(value: number, remember = true): Promise<boolean> {
    const range = this.capabilities().zoom;
    if (!range) return false;
    const v = Math.min(range.max, Math.max(range.min, value));
    const ok = await this.applyOne('zoom', v);
    if (!ok) return false;
    this.zoom = v;
    if (remember) {
      try {
        this.storage?.setItem(zoomKey(this.browser), String(v));
      } catch {
        // Storage off: the zoom is just not remembered.
      }
    }
    return true;
  }

  /**
   * Focus where the person tapped (fractions of the visible strip): the point of interest, then
   * single-shot focus where offered, back to continuous after a moment.
   */
  async focusAt(fx: number, fy: number): Promise<boolean> {
    const caps = this.capabilities();
    const strip = this.stripSize();
    const frame = this.frameSize();
    if (!caps.pointsOfInterest || !strip || !frame) return false;
    const point = stripPointToVideo(fx, fy, strip, frame);
    const ok = await this.applyOne('pointsOfInterest', [point]);
    if (ok && caps.focusModes.includes('single-shot')) {
      await this.applyOne('focusMode', 'single-shot');
      clearTimeout(this.focusTimer);
      const later = this.opts.setTimeout ?? setTimeout;
      this.focusTimer = later(() => {
        if (caps.focusModes.includes('continuous')) void this.applyOne('focusMode', 'continuous');
      }, FOCUS_HOLD_MS);
    }
    return ok;
  }

  private stripSize(): { w: number; h: number } | undefined {
    const v = this.video;
    return v && v.clientWidth > 0 && v.clientHeight > 0
      ? { w: v.clientWidth, h: v.clientHeight }
      : undefined;
  }

  private frameSize(): { w: number; h: number } | undefined {
    const v = this.video;
    return v && v.videoWidth > 0 && v.videoHeight > 0
      ? { w: v.videoWidth, h: v.videoHeight }
      : undefined;
  }

  /** Whether a frame can be read yet. */
  ready(): boolean {
    return this.stripSize() !== undefined && this.frameSize() !== undefined;
  }

  /**
   * The pixels inside `box` (fractions of the visible strip), mapped through the video's
   * `object-fit: cover` crop, as RGBA. Never taller than `maxHeight` nor narrower than 480 px.
   */
  captureBox(box: Box, maxHeight = 256): ImageData {
    const v = this.video;
    const strip = this.stripSize();
    const frame = this.frameSize();
    if (!v || !strip || !frame) throw new Error('The camera is not ready');
    const r = boxToVideoRect(box, strip, frame);
    const size = captureSize(r.sw, r.sh, maxHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, size.w, size.h);
    return ctx.getImageData(0, 0, size.w, size.h);
  }

  /**
   * The box as a grey picture for the date reader: through the cover crop, at most `maxHeight`
   * pixels high (and never narrower than 480). In memory only.
   */
  captureGray(box: Box, maxHeight = CAPTURE_MAX_H): Gray {
    const frame = this.captureBox(box, maxHeight);
    return fromRGBA(frame.data, frame.width, frame.height);
  }
}
