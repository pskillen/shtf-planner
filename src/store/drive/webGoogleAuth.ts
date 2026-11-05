// Adapted from Codeplug Studio (src/integrations/cloud/webGoogleAuth.ts, driveAuthProvider.ts).
// The token flow only: no refresh tokens, no native redirect.

import {
  DriveAuthError,
  DriveCancelledError,
  DrivePopupBlockedError,
  DRIVE_OAUTH_SCOPE,
} from './driveTypes';
import type { DriveSession } from './drivePrefs';
import { loadGoogleIdentity, type GoogleIdentityClient } from './loadGoogleIdentity';

export interface DriveAuthTokens {
  accessToken: string;
  expiresAt: number;
}

export interface AuthorizeOptions {
  /** The saved account's email: Google goes straight through for it instead of asking who. */
  loginHint?: string;
}

export interface DriveAuthProvider {
  /**
   * Loads Google's script ahead of time, so nothing slow sits between a tap and the window it
   * opens. Quiet: a failure here is retried by `authorize`.
   */
  preload(): void;
  /**
   * Exactly one token request with `prompt: ''`: Google decides what to show. It opens a window,
   * so it only works inside a tap; a window the browser would not open is a
   * `DrivePopupBlockedError`.
   */
  authorize(clientId: string, options?: AuthorizeOptions): Promise<DriveAuthTokens>;
  revoke(session: DriveSession): Promise<void>;
}

function requestAccessToken(
  identity: GoogleIdentityClient,
  clientId: string,
  now: () => number,
  loginHint: string | undefined,
): Promise<DriveAuthTokens> {
  return new Promise((resolve, reject) => {
    const client = identity.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_OAUTH_SCOPE,
      ...(loginHint ? { login_hint: loginHint } : {}),
      callback: (response) => {
        if (response.error) {
          if (response.error === 'popup_closed_by_user' || response.error === 'access_denied') {
            reject(new DriveCancelledError(response.error_description));
            return;
          }
          reject(new DriveAuthError(response.error_description ?? response.error));
          return;
        }
        if (!response.access_token) {
          reject(new DriveAuthError('No access token returned.'));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: now() + (response.expires_in ?? 3600) * 1000,
        });
      },
      error_callback: (error) => {
        // Firefox closed the first popup after a few seconds in testing, and the retry worked:
        // a closed popup is a retryable cancel, not an error.
        if (error.type === 'popup_closed') {
          reject(new DriveCancelledError());
          return;
        }
        if (error.type === 'popup_failed_to_open') {
          reject(new DrivePopupBlockedError());
          return;
        }
        reject(new DriveAuthError(error.message ?? error.type));
      },
    });
    // `prompt: ''` lets Google decide: no dialog when consent already exists.
    client.requestAccessToken({ prompt: '' });
  });
}

export interface WebGoogleAuthDeps {
  loadIdentity: () => Promise<GoogleIdentityClient>;
  now: () => number;
}

export function createWebAuthProvider(deps?: Partial<WebGoogleAuthDeps>): DriveAuthProvider {
  const loadIdentity = deps?.loadIdentity ?? loadGoogleIdentity;
  const now = deps?.now ?? Date.now;
  return {
    preload() {
      loadIdentity().catch(() => {});
    },
    async authorize(clientId, options) {
      const identity = await loadIdentity();
      return requestAccessToken(identity, clientId, now, options?.loginHint);
    },
    async revoke(session) {
      if (!session.accessToken) return;
      try {
        const identity = await loadIdentity();
        await new Promise<void>((resolve) => {
          identity.accounts.oauth2.revoke(session.accessToken, () => resolve());
        });
      } catch {
        // Best effort.
      }
    },
  };
}
