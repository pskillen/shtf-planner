// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraStrip } from '../src/app/components/CameraStrip';

/** A camera whose permission prompt the test answers by hand. */
function pendingCamera() {
  const tracks: Array<{ stop: ReturnType<typeof vi.fn>; live: boolean }> = [];
  const waiting: Array<(s: MediaStream) => void> = [];
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        waiting.push(resolve);
      }),
  );
  const grant = async (n = waiting.length - 1) => {
    const track = { live: true, stop: vi.fn() };
    track.stop.mockImplementation(() => void (track.live = false));
    tracks.push(track);
    const stream = {
      getVideoTracks: () => [{ ...track, getCapabilities: () => ({}), getSettings: () => ({}) }],
      getTracks: () => [track],
    } as unknown as MediaStream;
    await act(async () => waiting[n]!(stream));
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, getSupportedConstraints: () => ({}) },
  });
  return { tracks, getUserMedia, grant };
}

beforeEach(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});
afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('the camera strip lets go of a camera granted late', () => {
  it('after the screen is left while the browser was still asking', async () => {
    const cam = pendingCamera();
    const { unmount } = render(<CameraStrip mode="barcode" />);
    expect(cam.getUserMedia).toHaveBeenCalledTimes(1);
    unmount();
    await cam.grant();
    expect(cam.tracks[0]!.live).toBe(false);
  });

  it('after the page was hidden while it was asking, and opens it again when visible', async () => {
    const cam = pendingCamera();
    render(<CameraStrip mode="barcode" />);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    await cam.grant(0);
    expect(cam.tracks[0]!.live).toBe(false);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(cam.getUserMedia).toHaveBeenCalledTimes(2);
    await cam.grant(1);
    expect(cam.tracks[1]!.live).toBe(true);
  });

  it('Try again: the failed attempt leaves nothing on, and a late first grant is let go', async () => {
    const cam = pendingCamera();
    // First attempt is refused.
    cam.getUserMedia.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    render(<CameraStrip mode="barcode" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(cam.getUserMedia).toHaveBeenCalledTimes(2);
    await cam.grant(0);
    expect(cam.tracks[0]!.live).toBe(true);
  });
});
