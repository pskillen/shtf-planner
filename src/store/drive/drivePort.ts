// Adapted from Codeplug Studio (src/integrations/cloud/googleDrive.ts): the port the sync engine
// talks to. It owns the token and hides renewal, so the engine only sees "worked", "offline" or
// "needs the person".

import { createDriveApiClient, type DriveApiClient } from './driveApi';
import {
  clearDriveSession,
  clearDriveToken,
  driveSessionIsValid,
  isDriveConnected,
  loadDriveAccount,
  loadDriveSession,
  saveDriveSession,
  type DriveSession,
} from './drivePrefs';
import {
  APP_ROOT_FOLDER_NAME,
  DRIVE_ROOT_FOLDER_ID,
  DriveAuthError,
  DriveCancelledError,
  DriveConfigError,
  type DriveFileMetadata,
} from './driveTypes';
import { getGoogleClientId } from './loadGoogleIdentity';
import { createWebAuthProvider, type DriveAuthProvider } from './webGoogleAuth';

export interface DriveRemoteFile {
  id: string;
  name: string;
  /** Opaque: compared for equality with the value seen last time, never with the clock. */
  modifiedTime: string;
}

export interface DriveWrite {
  folderId: string;
  name: string;
  mimeType: string;
  content: Uint8Array | string;
  fileId?: string;
}

/** Everything the sync engine needs from Google Drive. Faked in tests and in the e2e suite. */
export interface DrivePort {
  /** A client id was built in. Without one Drive sync is off. */
  configured(): boolean;
  /** The person connected Drive on this device (the token itself may have expired). */
  isConnected(): boolean;
  accountEmail(): string | null;
  /**
   * Interactive: only from a tap, with nothing slow before the one Google window it opens.
   * Throws `DriveCancelledError` when the popup is closed and `DrivePopupBlockedError` when the
   * browser would not open it.
   */
  connect(): Promise<void>;
  /** Loads Google's script early (when Drive is connected), so a later tap opens the window at once. */
  warmUp(): void;
  /** Test builds only: forgets the token as if it had expired. Stays connected; asks no one. */
  dropToken(): void;
  disconnect(): Promise<void>;
  /**
   * A token request that needs no choosing; false means the person must press Reconnect. Google's
   * window only opens inside a tap, so with no live user activation it answers false at once
   * without asking. After any failure it answers false at once until `connect()` succeeds.
   */
  renew(): Promise<boolean>;
  /** The app folder, found by name or created. */
  folder(): Promise<string>;
  listFiles(folderId: string): Promise<DriveRemoteFile[]>;
  readBytes(fileId: string): Promise<Uint8Array>;
  readText(fileId: string): Promise<string>;
  write(params: DriveWrite): Promise<DriveRemoteFile>;
}

export interface DrivePortDeps {
  api: DriveApiClient;
  auth: DriveAuthProvider;
  getClientId: () => string;
  now: () => number;
  /** The page has a live user activation (a tap in the last few seconds). Default: the browser's. */
  hasUserActivation: () => boolean;
}

/** Inside a tap, a token with less than this left is renewed before it runs out. */
export const DRIVE_RENEW_AHEAD_MS = 5 * 60_000;

/**
 * `navigator.userActivation.isActive`. Where the API is missing (older browsers) the answer is no:
 * the browser would block an unprompted window there too, so the person gets the Reconnect button.
 */
export const browserHasUserActivation = (): boolean =>
  typeof navigator !== 'undefined' && navigator.userActivation?.isActive === true;

const toRemote = (f: DriveFileMetadata): DriveRemoteFile => ({
  id: f.id,
  name: f.name,
  modifiedTime: f.modifiedTime ?? '',
});

export function createDrivePort(deps?: Partial<DrivePortDeps>): DrivePort {
  const api = deps?.api ?? createDriveApiClient();
  const auth = deps?.auth ?? createWebAuthProvider();
  const getClientId = deps?.getClientId ?? getGoogleClientId;
  const now = deps?.now ?? Date.now;
  const hasUserActivation = deps?.hasUserActivation ?? browserHasUserActivation;

  let renewing: Promise<boolean> | undefined;
  /**
   * A silent renewal failed: Google needs the person. Nothing asks Google again, from any
   * trigger, until a button press connects successfully; a new page load starts unlatched.
   */
  let renewalFailed = false;

  /** A tap-less "renew early" was tried or refused for this token; do not nag on every tap. */
  let earlyRenewalSpent = false;

  function renew(): Promise<boolean> {
    if (renewalFailed) return Promise.resolve(false);
    // Google's window needs a tap behind it. Without one the browser blocks it (Android Chrome
    // asks "Allow this site to open?"), so do not ask: go straight to Reconnect.
    if (!renewing && !hasUserActivation()) {
      renewalFailed = true;
      clearDriveToken();
      return Promise.resolve(false);
    }
    renewing ??= (async () => {
      const clientId = getClientId();
      if (!clientId) return false;
      try {
        const tokens = await auth.authorize(clientId, {
          loginHint: loadDriveAccount() ?? undefined,
        });
        saveDriveSession({ ...tokens, accountEmail: loadDriveAccount() ?? undefined });
        earlyRenewalSpent = false;
        return true;
      } catch (err) {
        // Only "Google needs the person" is latched; a script that would not load or a dead
        // network is worth another try on the next trigger.
        if (err instanceof DriveAuthError || err instanceof DriveCancelledError) {
          renewalFailed = true;
        }
        clearDriveToken();
        return false;
      }
    })().finally(() => {
      renewing = undefined;
    });
    return renewing;
  }

  /**
   * Inside a tap, a token about to run out is renewed now, while Google's window is allowed. Not
   * being able to is no failure: the token still works, so nothing is latched or cleared, and the
   * next tap does not try again for this token.
   */
  async function renewEarly(current: DriveSession): Promise<DriveSession> {
    const clientId = getClientId();
    if (
      !clientId ||
      renewalFailed ||
      earlyRenewalSpent ||
      !current.expiresAt ||
      current.expiresAt - now() > DRIVE_RENEW_AHEAD_MS ||
      !hasUserActivation()
    ) {
      return current;
    }
    earlyRenewalSpent = true;
    try {
      const tokens = await auth.authorize(clientId, { loginHint: loadDriveAccount() ?? undefined });
      const renewed = { ...tokens, accountEmail: loadDriveAccount() ?? undefined };
      saveDriveSession(renewed);
      earlyRenewalSpent = false;
      return renewed;
    } catch {
      return current;
    }
  }

  async function session(): Promise<DriveSession> {
    const current = loadDriveSession();
    if (driveSessionIsValid(current, now())) return renewEarly(current);
    if (renewalFailed) throw new DriveAuthError();
    if (await renew()) {
      const renewed = loadDriveSession();
      if (renewed) return renewed;
    }
    throw new DriveAuthError();
  }

  /** Runs `fn` with a live token; on a 401 renews once and tries once more. */
  async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const s = await session();
    try {
      return await fn(s.accessToken);
    } catch (err) {
      if (!(err instanceof DriveAuthError)) throw err;
      clearDriveToken();
      if (!(await renew())) throw err;
      const renewed = loadDriveSession();
      if (!renewed) throw err;
      return fn(renewed.accessToken);
    }
  }

  return {
    configured: () => getClientId() !== '',
    isConnected: isDriveConnected,
    accountEmail: loadDriveAccount,

    async connect() {
      const clientId = getClientId();
      if (!clientId) throw new DriveConfigError();
      // One tap, one Google window: the request goes out straight from the tap (the script was
      // loaded at start-up), with the saved account as the hint. A second request would find the
      // tap's user activation already spent and be blocked.
      const tokens = await auth.authorize(clientId, {
        loginHint: loadDriveAccount() ?? undefined,
      });
      let accountEmail = loadDriveAccount() ?? undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          accountEmail = (await api.getUserEmail(tokens.accessToken)) || accountEmail;
          break;
        } catch {
          // Tried twice; sync treats an unreadable account as "cannot tell".
        }
      }
      saveDriveSession({ ...tokens, accountEmail });
      renewalFailed = false;
      earlyRenewalSpent = false;
    },

    warmUp() {
      if (getClientId() && isDriveConnected()) auth.preload();
    },

    dropToken: clearDriveToken,

    async disconnect() {
      const current = loadDriveSession();
      if (current) await auth.revoke(current);
      clearDriveSession();
    },

    renew,

    async folder() {
      return withToken(async (token) => {
        const found = await api.findAppFolders(token);
        const first = found[0];
        if (first) return first.id;
        const created = await api.createFolder(DRIVE_ROOT_FOLDER_ID, APP_ROOT_FOLDER_NAME, token);
        return created.id;
      });
    },

    async listFiles(folderId) {
      const files = await withToken((token) => api.listChildren(folderId, token));
      return files.map(toRemote);
    },

    readBytes: (fileId) => withToken((token) => api.readBytes(fileId, token)),
    readText: (fileId) => withToken((token) => api.readText(fileId, token)),

    async write({ folderId, name, mimeType, content, fileId }) {
      const file = await withToken((token) =>
        api.writeFile({ parentId: folderId, name, mimeType, content, fileId }, token),
      );
      return toRemote({ ...file, name: file.name ?? name });
    },
  };
}
