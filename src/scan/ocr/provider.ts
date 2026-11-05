import type { Provider } from './paddle';

/** What the worker needs to pick a provider; everything browser-specific is passed in. */
export interface ProviderDeps<E extends { release(): Promise<void> }> {
  preferWebGpu: boolean;
  /** True when `navigator.gpu` exists and `requestAdapter()` gave an adapter. Says why not otherwise. */
  gpu(): Promise<{ ok: true } | { ok: false; why: string }>;
  /** Creates both sessions on a provider. Rejects when either will not create. */
  create(ep: Provider): Promise<E>;
  /** Reads the synthetic label and says whether it came out as 06/2027. Also the warm-up. */
  selfTest(engine: E, ep: Provider): Promise<boolean>;
}

export interface Chosen<E> {
  engine: E;
  ep: Provider;
  /** Why WASM and not WebGPU, for the "About the date reader" line; empty when WebGPU is in use. */
  reason: string;
}

const messageOf = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 120);

/**
 * WebGPU only when the person has not turned it off, the browser has it, an adapter comes back,
 * both sessions create and the self-test reads the label right. Any failure releases what was
 * made and recreates both sessions on WASM (and runs the self-test there too, as the warm-up).
 * A WASM failure is not caught: there is nothing left to fall back to.
 */
export async function chooseProvider<E extends { release(): Promise<void> }>(
  deps: ProviderDeps<E>,
): Promise<Chosen<E>> {
  let reason: string;
  if (!deps.preferWebGpu) {
    reason = 'WebGPU is switched off';
  } else {
    const gpu = await deps.gpu();
    if (!gpu.ok) {
      reason = gpu.why;
    } else {
      let engine: E | undefined;
      try {
        engine = await deps.create('webgpu');
        if (await deps.selfTest(engine, 'webgpu')) return { engine, ep: 'webgpu', reason: '' };
        reason = 'WebGPU read the test label wrong';
      } catch (e) {
        reason = `WebGPU failed: ${messageOf(e)}`;
      }
      try {
        await engine?.release();
      } catch {
        // Already gone.
      }
    }
  }
  const engine = await deps.create('wasm');
  await deps.selfTest(engine, 'wasm');
  return { engine, ep: 'wasm', reason };
}
