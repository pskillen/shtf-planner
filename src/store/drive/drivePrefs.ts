// Adapted from Codeplug Studio (src/integrations/cloud/drivePrefs.ts), cut down to what a
// single app folder needs: the token, its expiry and the account. localStorage only; the sync
// state (file ids, last-synced bytes) lives in IndexedDB beside the document.

const PREFIX = 'shtf-planner:drive:';
export const DRIVE_ACCESS_TOKEN_KEY = `${PREFIX}accessToken`;
export const DRIVE_TOKEN_EXPIRES_AT_KEY = `${PREFIX}tokenExpiresAt`;
export const DRIVE_ACCOUNT_KEY = `${PREFIX}account`;
/** Set while the person has connected Drive on this device; survives an expired token. */
export const DRIVE_CONNECTED_KEY = `${PREFIX}connected`;

export const DRIVE_STORAGE_KEYS = [
  DRIVE_ACCESS_TOKEN_KEY,
  DRIVE_TOKEN_EXPIRES_AT_KEY,
  DRIVE_ACCOUNT_KEY,
  DRIVE_CONNECTED_KEY,
] as const;

export interface DriveSession {
  accessToken: string;
  expiresAt: number;
  accountEmail?: string;
}

/** Treat a token as expired this long before it is. */
export const DRIVE_TOKEN_REFRESH_BUFFER_MS = 60_000;

export function driveSessionIsValid(
  session: DriveSession | null,
  now: number = Date.now(),
): session is DriveSession {
  if (!session?.accessToken) return false;
  if (!session.expiresAt) return true;
  return session.expiresAt - DRIVE_TOKEN_REFRESH_BUFFER_MS > now;
}

function readItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Quota or disabled storage: the session just does not survive a reload.
  }
}

export function loadDriveSession(): DriveSession | null {
  const accessToken = readItem(DRIVE_ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  const expiresAt = Number(readItem(DRIVE_TOKEN_EXPIRES_AT_KEY) ?? 0) || 0;
  return {
    accessToken,
    expiresAt,
    accountEmail: readItem(DRIVE_ACCOUNT_KEY) || undefined,
  };
}

export function saveDriveSession(session: DriveSession): void {
  writeItem(DRIVE_ACCESS_TOKEN_KEY, session.accessToken);
  writeItem(DRIVE_TOKEN_EXPIRES_AT_KEY, String(session.expiresAt));
  if (session.accountEmail) writeItem(DRIVE_ACCOUNT_KEY, session.accountEmail);
  writeItem(DRIVE_CONNECTED_KEY, '1');
}

/** Drops the token only: the person is still "connected" and will be asked to reconnect. */
export function clearDriveToken(): void {
  writeItem(DRIVE_ACCESS_TOKEN_KEY, null);
  writeItem(DRIVE_TOKEN_EXPIRES_AT_KEY, null);
}

/** Disconnect: token, account and the connected marker. */
export function clearDriveSession(): void {
  for (const key of DRIVE_STORAGE_KEYS) writeItem(key, null);
}

export function isDriveConnected(): boolean {
  return readItem(DRIVE_CONNECTED_KEY) === '1';
}

export function loadDriveAccount(): string | null {
  return readItem(DRIVE_ACCOUNT_KEY);
}
