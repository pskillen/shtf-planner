import { vi } from 'vitest';
import { setOffClient } from '../../src/app/off';
import type { OffResult } from '../../src/scan/openFoodFacts';

/**
 * Fakes for the scanner in component tests. Call `vi.mock` for the two scan modules in the test
 * file itself (hoisting needs it there) with `fakeCameraModule` / `fakeBarcodeModule`.
 */
export const scanState: {
  onCode: ((code: string) => void) | undefined;
  caps: {
    torch: boolean;
    zoom?: { min: number; max: number; step: number };
    focusModes: string[];
    pointsOfInterest: boolean;
  };
  startFails: boolean;
} = {
  onCode: undefined,
  caps: { torch: false, focusModes: [], pointsOfInterest: false },
  startFails: false,
};

export function resetScan(): void {
  scanState.onCode = undefined;
  scanState.caps = { torch: false, focusModes: [], pointsOfInterest: false };
  scanState.startFails = false;
  setOffClient(undefined);
}

export const fakeCameraModule = () => ({
  CameraStream: class {
    zoom = 1.75;
    start = async () => {
      if (scanState.startFails) throw new Error('denied');
    };
    stop = () => undefined;
    capabilities = () => scanState.caps;
    setTorch = async () => true;
    setZoom = async () => true;
    focusAt = async () => true;
  },
});

export const fakeBarcodeModule = () => ({
  startBarcodeLoop: (_cam: unknown, onCode: (code: string) => void) => {
    scanState.onCode = onCode;
    return () => {
      if (scanState.onCode === onCode) scanState.onCode = undefined;
    };
  },
});

/** An Open Food Facts that answers from a table (a missing code is `not found`) and counts asks. */
export function fakeOff(answers: Record<string, OffResult>) {
  const lookup = vi.fn(
    async (code: string): Promise<OffResult> => answers[code] ?? { found: false, categories: [] },
  );
  setOffClient({ lookup });
  return lookup;
}
