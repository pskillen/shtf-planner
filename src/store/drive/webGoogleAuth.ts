// Adapted from Codeplug Studio (src/integrations/cloud/webGoogleAuth.ts, driveAuthProvider.ts).
// The token flow only: no refresh tokens, no native redirect.

import { DriveAuthError, DriveCancelledError, DRIVE_OAUTH_SCOPE } from './driveTypes';
import type { DriveSession } from './drivePrefs';
import { loadGoogleIdentity, type GoogleIdentityClient } from './loadGoogleIdentity';

export interface DriveAuthTokens {
  accessToken: string;
  expiresAt: number;
}

export interface DriveAuthProvider {
  /**
   * One token request with `prompt: ''`: Google shows nothing when consent already exists, and
   * its popup when it does not. Called from a button press (connect) or, once, without one
   * (renewal), where a blocked popup surfaces as a `DriveAuthError`.
   */
  authorize(clientId: string): Promise<DriveAuthTokens>;
  revoke(session: DriveSession): Promise<void>;
}

function requestAccessToken(
  identity: GoogleIdentityClient,
  clientId: string,
  now: () => number,
): Promise<DriveAuthTokens> {
  return new Promise((resolve, reject) => {
    const client = identity.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_OAUTH_SCOPE,
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
    async authorize(clientId) {
      const identity = await loadIdentity();
      return requestAccessToken(identity, clientId, now);
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
