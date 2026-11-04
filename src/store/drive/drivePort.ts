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
  /** Interactive: only from a button. Throws `DriveCancelledError` when the popup is closed. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * One non-interactive token request; false means the person must press Reconnect. After a
   * failure it answers false at once, without asking Google, until `connect()` succeeds.
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
}

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

  let renewing: Promise<boolean> | undefined;
  /**
   * A silent renewal failed: Google needs the person. Nothing asks Google again, from any
   * trigger, until a button press connects successfully; a new page load starts unlatched.
   */
  let renewalFailed = false;

  function renew(): Promise<boolean> {
    if (renewalFailed) return Promise.resolve(false);
    renewing ??= (async () => {
      const clientId = getClientId();
      if (!clientId) return false;
      try {
        const tokens = await auth.authorize(clientId);
        saveDriveSession({ ...tokens, accountEmail: loadDriveAccount() ?? undefined });
        return true;
      } catch {
        renewalFailed = true;
        clearDriveToken();
        return false;
      }
    })().finally(() => {
      renewing = undefined;
    });
    return renewing;
  }

  async function session(): Promise<DriveSession> {
    const current = loadDriveSession();
    if (driveSessionIsValid(current, now())) return current;
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
      const tokens = await auth.authorize(clientId);
      let accountEmail = loadDriveAccount() ?? undefined;
      try {
        accountEmail = (await api.getUserEmail(tokens.accessToken)) || accountEmail;
      } catch {
        // The account label is a nicety.
      }
      saveDriveSession({ ...tokens, accountEmail });
      renewalFailed = false;
    },

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
