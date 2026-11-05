import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { startBarcodeLoop } from '../../scan/barcode';
import { CameraStream, type CameraCapabilities } from '../../scan/camera';
import { BARCODE_BOX, BARCODE_COLOUR, DATE_BOX, DATE_COLOUR, type Box } from '../../scan/tunables';
import { registerScanHandler } from '../state/debugScan';

export type StripMode = 'barcode' | 'date';

/**
 * A short strip of live camera with a framing box. One stream for the whole screen: the strip
 * opens the camera once and keeps it open between steps. In barcode mode with `scanning` on it
 * looks for a barcode and calls `onCode` once per code (turn `scanning` off and on again for the
 * next). Torch, zoom and tap to focus are shown only where the browser has them; otherwise one
 * line says so. Camera frames are read here and nowhere else, and never leave the phone.
 */
export function CameraStrip({
  mode,
  chip,
  scanning = false,
  onCode,
  onReady,
}: {
  mode: StripMode;
  /** The step chip, "1 BARCODE". */
  chip?: string;
  scanning?: boolean;
  onCode?: (code: string) => void;
  onReady?: (cam: CameraStream) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<CameraStream | null>(null);
  const [state, setState] = useState<'starting' | 'live' | 'none'>('starting');
  const [caps, setCaps] = useState<CameraCapabilities | undefined>(undefined);
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [torch, setTorch] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number } | undefined>(undefined);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  const [attempt, setAttempt] = useState(0);
  const live = useRef({ onCode, onReady });
  useEffect(() => {
    live.current = { onCode, onReady };
  });

  const box: Box = mode === 'barcode' ? BARCODE_BOX : DATE_BOX;
  const colour = mode === 'barcode' ? BARCODE_COLOUR : DATE_COLOUR;

  // The camera is held only while the page is showing: a hidden page lets it go.
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!visible || !video) return;
    const cam = new CameraStream();
    camRef.current = cam;
    let gone = false;
    cam
      .start(video)
      .then(() => {
        if (gone) return;
        setState('live');
        setCaps(cam.capabilities());
        setZoom(cam.zoom);
        live.current.onReady?.(cam);
      })
      .catch(() => {
        if (!gone) setState('none');
      });
    return () => {
      gone = true;
      cam.stop();
      if (camRef.current === cam) camRef.current = null;
      setState('starting');
      setTorch(false);
    };
  }, [visible, attempt]);

  // Looking for a barcode, while asked to and while there is a picture to look at.
  useEffect(() => {
    if (mode !== 'barcode' || !scanning) return;
    const cam = state === 'live' ? camRef.current : null;
    let stop: (() => void) | undefined;
    let done = false;
    const give = (code: string) => {
      if (done) return;
      done = true;
      stop?.();
      live.current.onCode?.(code);
    };
    // A code typed into the debug hook works even with no camera.
    const unregister = registerScanHandler(give);
    if (cam) stop = startBarcodeLoop(cam, give);
    return () => {
      done = true;
      stop?.();
      unregister();
    };
  }, [mode, scanning, state]);

  const known = caps && (caps.torch || caps.zoom || caps.pointsOfInterest);

  function tap(e: PointerEvent<HTMLDivElement>): void {
    const cam = camRef.current;
    if (!cam || !caps?.pointsOfInterest) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    setRing({ x: fx, y: fy });
    setTimeout(() => setRing(undefined), 1500);
    void cam.focusAt(fx, fy);
  }

  function changeZoom(v: number): void {
    const cam = camRef.current;
    if (!cam || !caps?.zoom) return;
    const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, v));
    setZoom(clamped);
    void cam.setZoom(clamped);
  }

  return (
    <div className="camera">
      <div
        className="camera-strip"
        style={{ borderColor: colour }}
        onPointerDown={tap}
        data-testid="camera-strip"
      >
        <video ref={videoRef} playsInline muted autoPlay className="camera-video" />
        {state === 'live' ? (
          <div
            className="camera-box"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              borderColor: colour,
            }}
          />
        ) : null}
        {chip ? (
          <span className="camera-chip" style={{ background: colour }}>
            {chip}
          </span>
        ) : null}
        {mode === 'barcode' && state === 'live' ? (
          <span className="camera-guide" aria-hidden="true" title="Hold the bars upright">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : null}
        {ring ? (
          <span
            className="camera-ring"
            style={{ left: `${ring.x * 100}%`, top: `${ring.y * 100}%` }}
            aria-hidden="true"
          />
        ) : null}
        {state === 'none' ? (
          <p className="camera-none" role="status">
            No camera. Allow it in the browser’s site settings, or type the number / find it by
            name.{' '}
            <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </p>
        ) : null}
      </div>
      {state === 'live' ? (
        known ? (
          <div className="camera-controls">
            {caps.torch ? (
              <button
                type="button"
                className={torch ? 'chip on' : 'chip'}
                aria-pressed={torch}
                onClick={() => {
                  const next = !torch;
                  void camRef.current?.setTorch(next).then((ok) => ok && setTorch(next));
                }}
              >
                Torch
              </button>
            ) : null}
            {caps.zoom && zoom !== undefined ? (
              <div className="camera-zoom" role="group" aria-label="Zoom">
                <button
                  type="button"
                  className="secondary"
                  aria-label="Zoom out"
                  onClick={() => changeZoom(zoom - Math.max(caps.zoom!.step, 0.25))}
                >
                  −
                </button>
                <input
                  type="range"
                  aria-label="Zoom level"
                  min={caps.zoom.min}
                  max={caps.zoom.max}
                  step={caps.zoom.step}
                  value={zoom}
                  onChange={(e) => changeZoom(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="secondary"
                  aria-label="Zoom in"
                  onClick={() => changeZoom(zoom + Math.max(caps.zoom!.step, 0.25))}
                >
                  +
                </button>
              </div>
            ) : null}
            {caps.pointsOfInterest ? (
              <span className="muted">Tap the picture to focus.</span>
            ) : null}
          </div>
        ) : (
          <p className="muted camera-fallback">
            Zoom, focus and torch aren’t available in this browser. Chrome has them.
          </p>
        )
      ) : null}
    </div>
  );
}
