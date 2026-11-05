// Adapted from Codeplug Studio (src/integrations/cloud/loadGoogleIdentity.ts).

import { DriveNetworkError } from './driveTypes';

export interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface GoogleIdentityClient {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        /** The saved account, so Google can go straight through without a chooser. */
        login_hint?: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => GoogleTokenClient;
      revoke: (accessToken: string, callback: () => void) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityClient;
  }
}

/** The one third-party script the app loads, and only once the person has connected Drive (at the tap, then at each start-up). */
export const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let loadPromise: Promise<GoogleIdentityClient> | null = null;

export function resetGoogleIdentityLoaderForTests(): void {
  loadPromise = null;
}

export function loadGoogleIdentity(): Promise<GoogleIdentityClient> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services require a browser window.'));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GoogleIdentityClient>((resolve, reject) => {
    const fail = (message: string) => {
      loadPromise = null; // let a later attempt retry
      reject(new DriveNetworkError(message));
    };
    const done = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else fail('Google Identity Services failed to initialise.');
    };
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => fail('Failed to load Google Identity Services.'));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = done;
    script.onerror = () => fail('Failed to load Google Identity Services.');
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * A client id kept in this browser instead of built in: for tests and local development (the
 * e2e suite fakes Google with it). Used only when the build has none, and never in a production
 * build, where a stray value in storage must not redirect sign-in to another client.
 */
export const CLIENT_ID_OVERRIDE_KEY = 'shtf-planner:drive:clientId';

const isProductionBuild = () => typeof __BUILD_ENV__ !== 'undefined' && __BUILD_ENV__ === 'prod';

/** The OAuth web client id this build was made with; empty means Drive sync is off. */
export function getGoogleClientId(): string {
  const built = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  if (built || isProductionBuild()) return built;
  try {
    return globalThis.localStorage?.getItem(CLIENT_ID_OVERRIDE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}
