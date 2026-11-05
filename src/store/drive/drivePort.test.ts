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
  DrivePopupBlockedError,
  driveErrorMessage,
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
    preload: vi.fn(),
    revoke: vi.fn(async () => {}),
  });
  // A tap is behind every call unless a test says otherwise.
  let tapped = true;
  beforeEach(() => {
    tapped = true;
  });
  const port = (api: DriveApiClient, a: DriveAuthProvider, clientId = 'client') =>
    createDrivePort({
      api,
      auth: a,
      getClientId: () => clientId,
      now: () => NOW,
      hasUserActivation: () => tapped,
    });

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

  it('a first connect asks once, with Google deciding what to show', async () => {
    const a = auth();
    await port(fakeApi(), a).connect();
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(a.authorize).toHaveBeenCalledWith('client', { loginHint: undefined });
  });

  it('Reconnect, already connected, makes exactly one Google request, hinting the saved account', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1, accountEmail: 'me@example.test' });
    const a = auth();
    await port(fakeApi(), a).connect();
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(a.authorize).toHaveBeenCalledWith('client', { loginHint: 'me@example.test' });
    expect(loadDriveSession()?.accessToken).toBe('fresh');
  });

  it('renewal with no user activation never asks Google and goes straight to Reconnect', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    tapped = false;
    const a = auth();
    const p = port(fakeApi(), a);
    await expect(p.listFiles('f')).rejects.toBeInstanceOf(DriveAuthError);
    expect(await p.renew()).toBe(false);
    expect(a.authorize).not.toHaveBeenCalled();
    expect(isDriveConnected()).toBe(true);
    expect(localStorage.getItem(DRIVE_ACCESS_TOKEN_KEY)).toBeNull();

    // the Reconnect tap works, and sync carries on
    tapped = true;
    await p.connect();
    expect(a.authorize).toHaveBeenCalledTimes(1);
    await expect(p.listFiles('f')).resolves.toEqual([]);
  });

  it('renewal inside a tap may still ask Google', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    const a = auth();
    await port(fakeApi(), a).listFiles('f');
    expect(a.authorize).toHaveBeenCalledTimes(1);
  });

  it('a token about to run out is renewed inside a tap, and left alone without one', async () => {
    const soon = { accessToken: 'soon', expiresAt: NOW + 12 * 60_000 };
    saveDriveSession(soon);
    const a = auth();
    const api = fakeApi();
    tapped = false;
    await port(api, a).listFiles('f');
    expect(a.authorize).not.toHaveBeenCalled();
    expect(api.listChildren).toHaveBeenLastCalledWith('f', 'soon');

    // The sync goes on with the working token; the new one is there for the next call.
    tapped = true;
    const p = port(api, a);
    await p.listFiles('f');
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(api.listChildren).toHaveBeenLastCalledWith('f', 'soon');
    await vi.waitFor(() => expect(loadDriveSession()?.accessToken).toBe('fresh'));
    await p.listFiles('f');
    expect(api.listChildren).toHaveBeenLastCalledWith('f', 'fresh');
  });

  it('a token with more than 15 minutes left is not renewed early, even inside a tap', async () => {
    saveDriveSession({ accessToken: 'plenty', expiresAt: NOW + 16 * 60_000 });
    const a = auth();
    const api = fakeApi();
    tapped = true;
    await port(api, a).listFiles('f');
    expect(a.authorize).not.toHaveBeenCalled();
    expect(api.listChildren).toHaveBeenLastCalledWith('f', 'plenty');
  });

  it('a Google window nobody answers does not hold the sync up', async () => {
    saveDriveSession({ accessToken: 'soon', expiresAt: NOW + 3 * 60_000 });
    const a = auth(() => new Promise(() => {}));
    const api = fakeApi();
    await port(api, a).listFiles('f');
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(api.listChildren).toHaveBeenCalledWith('f', 'soon');
  });

  it('a double tap on Reconnect makes one Google request', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    let release!: () => void;
    const a = auth(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ accessToken: 'fresh', expiresAt: NOW + 3_600_000 });
        }),
    );
    const api = fakeApi();
    const p = port(api, a);
    const first = p.connect();
    const second = p.connect();
    release();
    await Promise.all([first, second]);
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(api.getUserEmail).toHaveBeenCalledTimes(1);
  });

  it('a failed early renewal keeps the working token and is not repeated on every tap', async () => {
    saveDriveSession({ accessToken: 'soon', expiresAt: NOW + 3 * 60_000 });
    const a = auth(async () => {
      throw new DriveCancelledError();
    });
    const api = fakeApi();
    const p = port(api, a);
    await p.listFiles('f');
    await p.listFiles('f');
    expect(a.authorize).toHaveBeenCalledTimes(1);
    expect(api.listChildren).toHaveBeenLastCalledWith('f', 'soon');
    expect(loadDriveSession()?.accessToken).toBe('soon');
  });

  it('a blocked window on Reconnect surfaces its own error', async () => {
    saveDriveSession({ accessToken: 'old', expiresAt: NOW - 1 });
    const a = auth(async () => {
      throw new DrivePopupBlockedError();
    });
    const err = await port(fakeApi(), a)
      .connect()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DrivePopupBlockedError);
    expect(driveErrorMessage(err)).toBe("Your browser blocked Google's window. Tap Reconnect.");
  });

  it('warms Google up only when Drive is connected, and drops the token on request', async () => {
    const a = auth();
    const p = port(fakeApi(), a);
    p.warmUp();
    expect(a.preload).not.toHaveBeenCalled();
    saveDriveSession({ accessToken: 'tok', expiresAt: NOW + 3_600_000 });
    p.warmUp();
    expect(a.preload).toHaveBeenCalledTimes(1);
    p.dropToken();
    expect(loadDriveSession()).toBeNull();
    expect(p.isConnected()).toBe(true);
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
