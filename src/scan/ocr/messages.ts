import type { FrameVerdict } from '../../engine/datecode';
import type { Provider } from './paddle';

/** Page to worker. */
export type ToWorker =
  | {
      type: 'init';
      /** Use WebGPU when the browser has it and it passes the self-test; otherwise WASM. */
      preferWebGpu: boolean;
      /** Today as `YYYY-MM-DD`, for the self-test. */
      todayIso: string;
    }
  | {
      type: 'read';
      id: number;
      w: number;
      h: number;
      /** The grey pixels, transferred (a copy: the page keeps its own). */
      data: ArrayBuffer;
      todayIso: string;
    };

/** Worker to page. A verdict never carries pixels. */
export type FromWorker =
  | {
      type: 'ready';
      ep: Provider;
      loadMs: number;
      /** Why WASM and not WebGPU, when it is WASM; empty when WebGPU is in use. */
      reason: string;
    }
  | { type: 'failed'; message: string }
  | { type: 'read'; id: number; result: FrameVerdict }
  | { type: 'error'; id: number; message: string };
