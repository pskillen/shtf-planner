import { describe, expect, it, vi, type Mock } from 'vitest';
import type { Provider } from './paddle';
import { chooseProvider, type ProviderDeps } from './provider';

interface Fake {
  ep: Provider;
  release: Mock<() => Promise<void>>;
}

function deps(over: Partial<ProviderDeps<Fake>> = {}) {
  const made: Fake[] = [];
  const d: ProviderDeps<Fake> = {
    preferWebGpu: true,
    gpu: async () => ({ ok: true }),
    create: vi.fn(async (ep: Provider) => {
      const f = { ep, release: vi.fn(async () => undefined) };
      made.push(f);
      return f;
    }),
    selfTest: vi.fn(async () => true),
    ...over,
  };
  return { d, made };
}

describe('choosing the execution provider', () => {
  it('uses WebGPU when it is wanted, present, creates and passes the self-test', async () => {
    const { d } = deps();
    const c = await chooseProvider(d);
    expect(c).toMatchObject({ ep: 'webgpu', reason: '' });
    expect(d.create).toHaveBeenCalledTimes(1);
  });

  it('uses WASM, and says why, when the person switched WebGPU off', async () => {
    const { d } = deps({ preferWebGpu: false });
    const c = await chooseProvider(d);
    expect(c.ep).toBe('wasm');
    expect(c.reason).toMatch(/switched off/);
    expect(d.create).toHaveBeenCalledWith('wasm');
    expect(d.selfTest).toHaveBeenCalledTimes(1); // the warm-up
  });

  it('uses WASM when the browser has no WebGPU or no adapter', async () => {
    const { d } = deps({ gpu: async () => ({ ok: false, why: 'This browser has no WebGPU' }) });
    const c = await chooseProvider(d);
    expect(c).toMatchObject({ ep: 'wasm', reason: 'This browser has no WebGPU' });
    expect(d.create).toHaveBeenCalledTimes(1);
  });

  it('releases WebGPU and recreates on WASM when a session will not create', async () => {
    let n = 0;
    const { d, made } = deps({
      create: vi.fn(async (ep: Provider) => {
        if (ep === 'webgpu' && n++ === 0) throw new Error('shader compile failed');
        const f = { ep, release: vi.fn(async () => undefined) };
        made.push(f);
        return f;
      }),
    });
    const c = await chooseProvider(d);
    expect(c.ep).toBe('wasm');
    expect(c.reason).toMatch(/WebGPU failed: shader compile failed/);
  });

  it('releases WebGPU and falls back to WASM when the self-test reads wrong', async () => {
    const { d, made } = deps({ selfTest: vi.fn(async (_e, ep) => ep === 'wasm') });
    const c = await chooseProvider(d);
    expect(c.ep).toBe('wasm');
    expect(c.reason).toMatch(/read the test label wrong/);
    expect(made[0]!.ep).toBe('webgpu');
    expect(made[0]!.release).toHaveBeenCalledTimes(1);
    expect(made[1]!.ep).toBe('wasm');
  });

  it('does not hide a WASM failure: there is nothing to fall back to', async () => {
    const { d } = deps({
      preferWebGpu: false,
      create: vi.fn(async () => {
        throw new Error('out of memory');
      }),
    });
    await expect(chooseProvider(d)).rejects.toThrow('out of memory');
  });
});
