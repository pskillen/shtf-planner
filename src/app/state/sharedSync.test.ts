import { afterEach, describe, expect, it, vi } from 'vitest';

const forgetDeviceData = vi.hoisted(() => vi.fn(async () => {}));
const getStore = vi.hoisted(() => vi.fn(async () => ({ tag: 'store' })));
const syncStop = vi.hoisted(() => vi.fn());

vi.mock('../../store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../store')>();
  return {
    ...mod,
    forgetDeviceData,
    createDrivePort: () => ({}),
    createIdbPersistence: () => ({}),
    createSync: vi.fn(() => ({
      start: vi.fn(async () => {}),
      stop: syncStop,
    })),
  };
});

vi.mock('./sharedStore', () => ({ getStore }));

describe('startFreshHousehold', () => {
  afterEach(() => {
    vi.resetModules();
    forgetDeviceData.mockClear();
    getStore.mockClear();
    syncStop.mockClear();
  });

  it('forgets local data but keeps the Drive sign-in', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const { startFreshHousehold } = await import('./sharedSync');
    await startFreshHousehold();
    expect(forgetDeviceData).toHaveBeenCalledWith(
      { tag: 'store' },
      expect.anything(),
      expect.anything(),
      { keepDrive: true },
    );
    expect(assign).toHaveBeenCalledWith('/app');
    vi.unstubAllGlobals();
  });
});
