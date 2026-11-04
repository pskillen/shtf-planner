// Adapted from Codeplug Studio (src/integrations/cloud/loadGoogleIdentity.ts).

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

/** The one third-party script the app loads, and only when the person connects Drive. */
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
      reject(new Error(message));
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

/** The OAuth web client id this build was made with; empty means Drive sync is off. */
export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
}
