import { describe, expect, it, vi } from 'vitest';
import {
  CameraStream,
  boxToVideoRect,
  browserName,
  captureSize,
  startingZoom,
  stripPointToVideo,
} from './camera';

function fakeTrack(caps: Record<string, unknown>, refuse: string[] = []) {
  const applied: Array<Record<string, unknown>> = [];
  return {
    applied,
    stop: vi.fn(),
    getCapabilities: () => caps,
    getSettings: () => ({}),
    applyConstraints: async (c: { advanced: Array<Record<string, unknown>> }) => {
      const one = c.advanced[0]!;
      if (refuse.some((r) => r in one))
        throw new DOMException('not allowed', 'OverconstrainedError');
      applied.push(one);
    },
  };
}

function setup(caps: Record<string, unknown>, opts: { refuse?: string[]; saved?: string } = {}) {
  const track = fakeTrack(caps, opts.refuse);
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  const store = new Map<string, string>(
    opts.saved ? [['shtf.camera.zoom:chrome', opts.saved]] : [],
  );
  const cam = new CameraStream({
    mediaDevices: {
      getUserMedia: async () => stream,
      getSupportedConstraints: () => ({ pointsOfInterest: true }) as never,
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  });
  const video = { play: async () => undefined, srcObject: null } as unknown as HTMLVideoElement;
  return { cam, track, store, video };
}

const CHROME = {
  torch: true,
  zoom: { min: 1, max: 7, step: 0.1 },
  focusMode: ['continuous', 'single-shot'],
};

describe('camera constraints', () => {
  it('reports what Chrome offers and applies continuous focus and the default zoom', async () => {
    const { cam, track, video } = setup(CHROME);
    await cam.start(video);
    expect(cam.capabilities()).toEqual({
      torch: true,
      zoom: { min: 1, max: 7, step: 0.1 },
      focusModes: ['continuous', 'single-shot'],
      pointsOfInterest: true,
    });
    expect(track.applied).toEqual([{ focusMode: 'continuous' }, { zoom: 1.75 }]);
  });

  it('reports nothing for a browser that says nothing (Firefox), and applies nothing', async () => {
    const { cam, track, video } = setup({});
    await cam.start(video);
    expect(cam.capabilities()).toMatchObject({ torch: false, focusModes: [] });
    expect(cam.capabilities().zoom).toBeUndefined();
    expect(track.applied).toEqual([]);
  });

  it('records a refusal, keeps going, and never throws', async () => {
    const { cam, video } = setup(CHROME, { refuse: ['torch'] });
    await cam.start(video);
    expect(await cam.setTorch(true)).toBe(false);
    expect(cam.refused.torch).toMatch(/OverconstrainedError/);
    expect(cam.torchOn).toBe(false);
    expect(await cam.setZoom(3)).toBe(true);
    expect(cam.zoom).toBe(3);
  });

  it('remembers the zoom per browser and starts from it next time', async () => {
    const first = setup(CHROME);
    await first.cam.start(first.video);
    await first.cam.setZoom(4);
    expect(first.store.get('shtf.camera.zoom:chrome')).toBe('4');
    const next = setup(CHROME, { saved: '4' });
    await next.cam.start(next.video);
    expect(next.track.applied).toContainEqual({ zoom: 4 });
  });

  it('keeps the zoom inside the camera range', () => {
    expect(startingZoom({ min: 1, max: 1.5 }, null)).toBe(1.5);
    expect(startingZoom({ min: 2, max: 7 }, null)).toBe(2);
    expect(startingZoom({ min: 1, max: 7 }, '9')).toBe(7);
    expect(startingZoom({ min: 1, max: 7 }, 'nonsense')).toBe(1.75);
  });

  it('stop releases the tracks', async () => {
    const { cam, track, video } = setup(CHROME);
    await cam.start(video);
    cam.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(cam.running).toBe(false);
  });

  it('lets go of a camera that was granted after stop() (the screen was left while it asked)', async () => {
    const { cam, track, video } = setup(CHROME);
    let grant: (s: MediaStream) => void = () => undefined;
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const pending = new CameraStream({
      mediaDevices: {
        getUserMedia: () => new Promise<MediaStream>((r) => (grant = r)),
        getSupportedConstraints: () => ({}),
      },
    });
    const started = pending.start(video);
    pending.stop(); // left before the person tapped Allow
    grant(stream);
    await started;
    expect(track.stop).toHaveBeenCalled();
    expect(pending.running).toBe(false);
    expect(video.srcObject).toBeNull();
    void cam;
  });

  it('rejects start when there is no camera', async () => {
    const cam = new CameraStream({
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException('denied', 'NotAllowedError');
        },
        getSupportedConstraints: () => ({}),
      },
    });
    await expect(cam.start({} as HTMLVideoElement)).rejects.toThrow();
  });
});

describe('geometry', () => {
  it('maps a box through object-fit: cover', () => {
    // A 1920x1080 frame in a 400x200 strip: scale 400/1920 on the width fills it, the height
    // overflows (1080 * 0.2083 = 225 > 200), cropping 12.5 px top and bottom.
    const r = boxToVideoRect({ x: 0, y: 0, w: 1, h: 1 }, { w: 400, h: 200 }, { w: 1920, h: 1080 });
    expect(r.sx).toBe(0);
    expect(r.sw).toBe(1920);
    expect(r.sy).toBe(60);
    expect(r.sh).toBe(960);
  });

  it('crops the sides when the strip is taller than the frame', () => {
    const r = boxToVideoRect({ x: 0, y: 0, w: 1, h: 1 }, { w: 100, h: 100 }, { w: 200, h: 100 });
    expect(r).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100 });
  });

  it('maps a tapped point', () => {
    const p = stripPointToVideo(0.5, 0.5, { w: 400, h: 200 }, { w: 1920, h: 1080 });
    expect(p.x).toBeCloseTo(0.5, 2);
    expect(p.y).toBeCloseTo(0.5, 2);
  });

  it('sizes a capture: height capped, width never below 480', () => {
    expect(captureSize(1700, 300, 1080)).toEqual({ w: 1700, h: 300 });
    expect(captureSize(1700, 600, 256)).toEqual({ w: 725, h: 256 });
    expect(captureSize(1000, 1000, 256)).toEqual({ w: 480, h: 480 });
    expect(captureSize(300, 300, 256)).toEqual({ w: 300, h: 300 });
  });

  it('names the browser family without a version', () => {
    expect(
      browserName('Mozilla/5.0 (Android 14; Mobile; rv:159.0) Gecko/159.0 Firefox/159.0'),
    ).toBe('firefox');
    expect(
      browserName(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
      ),
    ).toBe('chrome');
  });
});
