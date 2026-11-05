import { describe, expect, it, vi } from 'vitest';
import {
  DriveAuthError,
  DriveCancelledError,
  DrivePopupBlockedError,
  DRIVE_OAUTH_SCOPE,
} from './driveTypes';
import type { GoogleIdentityClient, GoogleTokenResponse } from './loadGoogleIdentity';
import { createWebAuthProvider } from './webGoogleAuth';

type Config = Parameters<GoogleIdentityClient['accounts']['oauth2']['initTokenClient']>[0];

function provider(act: (config: Config) => void) {
  const requestAccessToken = vi.fn();
  const revoke = vi.fn((_token: string, cb: () => void) => cb());
  const identity: GoogleIdentityClient = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => ({
          requestAccessToken: (o) => {
            requestAccessToken(o);
            act(config);
          },
        }),
        revoke,
      },
    },
  };
  const auth = createWebAuthProvider({ loadIdentity: async () => identity, now: () => 1000 });
  return { auth, requestAccessToken, revoke };
}
const respond = (r: GoogleTokenResponse) => (c: Config) => c.callback(r);

describe('webGoogleAuth', () => {
  it('returns the token with its expiry, asking for drive.file only and no forced prompt', async () => {
    let scope = '';
    const { auth, requestAccessToken } = provider((c) => {
      scope = c.scope;
      c.callback({ access_token: 'abc', expires_in: 3600 });
    });
    expect(await auth.authorize('client')).toEqual({
      accessToken: 'abc',
      expiresAt: 1000 + 3600_000,
    });
    expect(scope).toBe(DRIVE_OAUTH_SCOPE);
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('passes the saved account to Google as login_hint, and makes one request', async () => {
    let hint: string | undefined;
    const { auth, requestAccessToken } = provider((c) => {
      hint = c.login_hint;
      c.callback({ access_token: 'abc' });
    });
    await auth.authorize('client', { loginHint: 'me@example.test' });
    expect(hint).toBe('me@example.test');
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' });
  });

  it('sends no login_hint when no account is saved', async () => {
    let config: Config | undefined;
    const { auth } = provider((c) => {
      config = c;
      c.callback({ access_token: 'abc' });
    });
    await auth.authorize('client');
    expect(config).not.toHaveProperty('login_hint');
  });

  it('a window the browser would not open is the blocked-popup error', async () => {
    const blocked = provider((c) =>
      c.error_callback?.({ type: 'popup_failed_to_open', message: 'blocked' }),
    );
    await expect(blocked.auth.authorize('c')).rejects.toBeInstanceOf(DrivePopupBlockedError);
  });

  it('preload loads the script without asking for a token', async () => {
    const loadIdentity = vi.fn(async () => {
      throw new Error('offline');
    });
    const auth = createWebAuthProvider({ loadIdentity, now: () => 1 });
    auth.preload();
    expect(loadIdentity).toHaveBeenCalledTimes(1);
    await Promise.resolve(); // the failure is swallowed
  });

  it('a closed popup (both callbacks) and access_denied are quiet cancels', async () => {
    const closed = provider((c) => c.error_callback?.({ type: 'popup_closed' }));
    await expect(closed.auth.authorize('c')).rejects.toBeInstanceOf(DriveCancelledError);
    const byUser = provider(respond({ error: 'popup_closed_by_user' }));
    await expect(byUser.auth.authorize('c')).rejects.toBeInstanceOf(DriveCancelledError);
    const denied = provider(respond({ error: 'access_denied' }));
    await expect(denied.auth.authorize('c')).rejects.toBeInstanceOf(DriveCancelledError);
  });

  it('other failures (a popup that could not open, no token) are auth errors', async () => {
    const blocked = provider((c) =>
      c.error_callback?.({ type: 'popup_failed_to_open', message: 'blocked' }),
    );
    await expect(blocked.auth.authorize('c')).rejects.toBeInstanceOf(DriveAuthError);
    const none = provider(respond({}));
    await expect(none.auth.authorize('c')).rejects.toBeInstanceOf(DriveAuthError);
    const err = provider(respond({ error: 'invalid_client' }));
    await expect(err.auth.authorize('c')).rejects.toBeInstanceOf(DriveAuthError);
  });

  it('revokes the token', async () => {
    const { auth, revoke } = provider(() => {});
    await auth.revoke({ accessToken: 'abc', expiresAt: 1 });
    expect(revoke).toHaveBeenCalledWith('abc', expect.any(Function));
  });
});
