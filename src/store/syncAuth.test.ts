import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type DocumentStore } from './documentStore';
import { DriveAuthError, createDrivePort, type DriveApiClient } from './drive';
import { memoryStorage } from './drive/testStorage';
import type { DriveAuthProvider } from './drive/webGoogleAuth';
import { createSync, type Sync, type SyncHost } from './sync';
import { createMemoryPersistence } from './syncPersistence';

/** The real `DrivePort` over a faked Google, to count how often anything asks Google. */
describe('after one failed silent renewal', () => {
  let clock = 1_000_000;
  let store: DocumentStore | undefined;
  let sync: Sync | undefined;
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(async () => {
    sync?.stop();
    await store?.close();
    vi.unstubAllGlobals();
  });

  it('nothing asks Google again until the person presses Connect', async () => {
    let allow = true;
    const authorize = vi.fn(async () => {
      if (!allow) throw new DriveAuthError('popup blocked');
      return { accessToken: `t${authorize.mock.calls.length}`, expiresAt: clock + 3_600_000 };
    });
    const auth: DriveAuthProvider = { authorize, revoke: vi.fn(async () => {}) };
    const api = {
      findAppFolders: vi.fn(async () => [{ id: 'f', name: 'SHTF Planner' }]),
      createFolder: vi.fn(),
      listChildren: vi.fn(async () => []),
      readBytes: vi.fn(),
      readText: vi.fn(),
      writeFile: vi.fn(async (p: { name: string }) => ({
        id: `id-${p.name}`,
        name: p.name,
        modifiedTime: String(clock++),
      })),
      getUserEmail: vi.fn(async () => 'me@example.test'),
    } as unknown as DriveApiClient;
    const handlers = new Map<string, Set<() => void>>();
    const host: SyncHost = {
      isOnline: () => true,
      isVisible: () => true,
      on(event, cb) {
        const set = handlers.get(event) ?? new Set();
        set.add(cb);
        handlers.set(event, set);
        return () => void set.delete(cb);
      },
    };
    const fire = (e: string) => handlers.get(e)?.forEach((cb) => cb());

    store = await openStore({
      name: `auth-${Math.random()}`,
      env: 'local',
      deviceId: 'a',
      channel: false,
    });
    const s = createSync({
      store,
      drive: createDrivePort({ api, auth, getClientId: () => 'client', now: () => clock }),
      persistence: createMemoryPersistence(),
      env: 'local',
      host,
      now: () => clock,
      debounceMs: 10,
      pollMs: 20,
      retryMs: 10_000_000,
    });
    sync = s;
    await s.start();
    await s.connect();
    expect(authorize).toHaveBeenCalledTimes(1); // the button press
    expect(s.state().status.kind).toBe('synced');

    // an hour later the token is gone and Google needs the person
    clock += 2 * 3_600_000;
    allow = false;
    store.change('edit', (d) => {
      d.home.area = '90';
    });
    await new Promise((r) => setTimeout(r, 60));
    await s.whenIdle();
    expect(s.state().status).toMatchObject({ kind: 'error', reconnect: true });
    expect(authorize).toHaveBeenCalledTimes(2); // exactly one renewal attempt

    for (let i = 0; i < 4; i++) fire('visible');
    fire('online');
    store.change('edit again', (d) => {
      d.home.area = '95';
    });
    await s.checkDrive();
    await new Promise((r) => setTimeout(r, 100)); // poll ticks and the push timer
    await s.whenIdle();
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(s.state().status).toMatchObject({ kind: 'error', reconnect: true });

    // the button works, and the edits go out
    allow = true;
    await s.connect();
    expect(authorize).toHaveBeenCalledTimes(3);
    expect(s.state().status.kind).toBe('synced');
  });
});
