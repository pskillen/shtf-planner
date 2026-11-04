import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveApiClient } from './driveApi';
import { createDrivePort } from './drivePort';
import {
  DRIVE_ACCESS_TOKEN_KEY,
  isDriveConnected,
  loadDriveSession,
  saveDriveSession,
} from './drivePrefs';
import {
  DriveAuthError,
  DriveCancelledError,
  DriveConfigError,
  DriveNetworkError,
} from './driveTypes';
import { memoryStorage } from './testStorage';
import type { DriveAuthProvider } from './webGoogleAuth';

function fakeApi(over: Partial<DriveApiClient> = {}): DriveApiClient {
  return {
    findAppFolders: vi.fn(async () => []),
    createFolder: vi.fn(async () => ({ id: 'created', name: 'SHTF Planner' })),
    listChildren: vi.fn(async () => []),
    getFileMetadata: vi.fn(),
    readBytes: vi.fn(),
    readText: vi.fn(),
    writeFile: vi.fn(),
    getUserEmail: vi.fn(async () => 'me@example.test'),
    ...over,
  } as DriveApiClient;
}

describe('drivePort', () => {
  const NOW = 10_000_000;
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  const auth = (impl?: DriveAuthProvider['authorize']): DriveAuthProvider => ({
    authorize: vi.fn(impl ?? (async () => ({ accessToken: 'fresh', expiresAt: NOW + 3_600_000 }))),
    revoke: vi.fn(async () => {}),
  });
  const port = (api: DriveApiClient, a: DriveAuthProvider, clientId = 'client') =>
    createDrivePort({ api, auth: a, getClientId: () => clientId, now: () => NOW });

  it('is unconfigured without a client id, and connecting says so', async () => {
    const p = port(fakeApi(), auth(), '');
    expect(p.configured()).toBe(false);
    await expect(p.connect()).rejects.toBeInstanceOf(DriveConfigError);
  });

  it('connect stores the token and the account', async () => {
    const p = port(fakeApi(), auth());
    await p.connect();
    expect(p.isConnected()).toBe(true);
    expect(p.accountEmail()).toBe('me@example.test');
    expect(loadDriveSession()?.accessToken).toBe('fresh');
  });

  it('a cancelled connect leaves nothing behind', async () => {
    const p = port(
      fakeApi(),
      auth(async () => {
        throw new DriveCancelledError();
      }),
    );
    await expect(p.connect()).rejects.toBeInstanceOf(DriveCancelledError);
    expect(isDriveConnected()).toBe(false);
  });

  it('finds the existing folder (the oldest) and only creates one when there is none', async () => {
    const api = fakeApi({
      findAppFolders: vi.fn(async () => [
        { id: 'old', name: 'SHTF Planner' },
        { id: 'dup', name: 'SHTF Planner' },
      ]),
    });
    const p = port(api, auth());
    await p.connect();
    expect(await p.folder()).toBe('old');
    expect(api.createFolder).not.toHaveBeenCalled();

    const empty = fakeApi();
    const q = port(empty, auth());
    await q.connect();
    expect(await q.folder()).toBe('created');
    expect(empty.createFolder).toHaveBeenCalledWith('root', 'SHTF Planner', 'fresh');
  });

  it('an expired token is renewed once, silently, before the call', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    const a = auth();
    const api = fakeApi();
    await port(api, a).listFiles('f');
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(api.listChildren).toHaveBeenCalledWith('f', 'fresh');
  });

  it('when renewal fails the call fails with an auth error and the person stays connected', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    const a = auth(async () => {
      throw new DriveAuthError('popup blocked');
    });
    const p = port(fakeApi(), a);
    await expect(p.listFiles('f')).rejects.toBeInstanceOf(DriveAuthError);
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(isDriveConnected()).toBe(true);
    expect(localStorage.getItem(DRIVE_ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('after a failed renewal it fails at once, without asking Google, until connect() works', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    let allow = false;
    const a = auth(async () => {
      if (!allow) throw new DriveAuthError('popup blocked');
      return { accessToken: 'fresh', expiresAt: NOW + 3_600_000 };
    });
    const p = port(fakeApi(), a);
    await expect(p.listFiles('f')).rejects.toBeInstanceOf(DriveAuthError);
    for (let i = 0; i < 3; i++) {
      await expect(p.listFiles('f')).rejects.toBeInstanceOf(DriveAuthError);
      await expect(p.folder()).rejects.toBeInstanceOf(DriveAuthError);
    }
    expect(await p.renew()).toBe(false);
    expect(a.authorize).toHaveBeenCalledTimes(1);

    allow = true;
    await p.connect();
    expect(a.authorize).toHaveBeenCalledTimes(2);
    await expect(p.listFiles('f')).resolves.toEqual([]);
  });

  it('a script that will not load is not latched: the next call may try again', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    const a = auth(async () => {
      throw new DriveNetworkError('Failed to load Google Identity Services.');
    });
    const p = port(fakeApi(), a);
    await expect(p.listFiles('f')).rejects.toBeInstanceOf(DriveAuthError);
    await expect(p.listFiles('f')).rejects.toBeInstanceOf(DriveAuthError);
    expect(a.authorize).toHaveBeenCalledTimes(2);
  });

  it('reads the account email again once when the first lookup fails', async () => {
    const getUserEmail = vi
      .fn<DriveApiClient['getUserEmail']>()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce('me@example.test');
    const p = port(fakeApi({ getUserEmail }), auth());
    await p.connect();
    expect(p.accountEmail()).toBe('me@example.test');
    expect(getUserEmail).toHaveBeenCalledTimes(2);
  });

  it('a 401 renews once and retries once, then gives up', async () => {
    saveDriveSession({ accessToken: 'stale', expiresAt: NOW + 3_600_000 });
    const list = vi
      .fn<DriveApiClient['listChildren']>()
      .mockRejectedValueOnce(new DriveAuthError())
      .mockResolvedValueOnce([{ id: 'a', name: 'n', modifiedTime: 't' }]);
    const files = await port(fakeApi({ listChildren: list }), auth()).listFiles('f');
    expect(files).toEqual([{ id: 'a', name: 'n', modifiedTime: 't' }]);
    expect(list.mock.calls.map((c) => c[1])).toEqual(['stale', 'fresh']);

    saveDriveSession({ accessToken: 'stale', expiresAt: NOW + 3_600_000 });
    const always = vi.fn<DriveApiClient['listChildren']>().mockRejectedValue(new DriveAuthError());
    await expect(
      port(fakeApi({ listChildren: always }), auth()).listFiles('f'),
    ).rejects.toBeInstanceOf(DriveAuthError);
    expect(always).toHaveBeenCalledTimes(2);
  });

  it('disconnect revokes and forgets', async () => {
    const a = auth();
    const p = port(fakeApi(), a);
    await p.connect();
    await p.disconnect();
    expect(a.revoke).toHaveBeenCalled();
    expect(p.isConnected()).toBe(false);
    expect(loadDriveSession()).toBeNull();
  });
});
