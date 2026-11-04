// Adapted from Codeplug Studio (src/integrations/cloud/driveTypes.ts). Web only: the Android
// APK flow is not copied.

/** The only Drive scope the app asks for: files and folders it created itself. */
export const DRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export const DRIVE_ROOT_FOLDER_ID = 'root';

/**
 * The app-owned folder created on first connect. Under `drive.file` the app only sees what it
 * created, and that grant belongs to the (Google account, OAuth client) pair rather than one
 * browser, so a second device finds the same folder by name.
 */
export const APP_ROOT_FOLDER_NAME = 'SHTF Planner';

/** The two files a push writes: the CRDT's binary state, and a readable JSON sidecar. */
export const YJS_FILE_NAME = 'household.yjs';
export const JSON_FILE_NAME = 'household.json';

export const YJS_MIME = 'application/octet-stream';
export const JSON_MIME = 'application/json';

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  /** RFC 3339, as Drive reports it. Compared as an opaque string, never against the clock. */
  modifiedTime?: string;
}

export class DriveAuthError extends Error {
  readonly code = 'auth' as const;
  constructor(message = 'Google Drive authentication expired or missing.') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

/** The person closed the Google popup or said no. Quiet: back to "Connect", no error banner. */
export class DriveCancelledError extends Error {
  readonly code = 'cancelled' as const;
  constructor(message = 'Google sign-in was cancelled.') {
    super(message);
    this.name = 'DriveCancelledError';
  }
}

export class DriveNetworkError extends Error {
  readonly code = 'network' as const;
  constructor(message = 'Google Drive request failed.') {
    super(message);
    this.name = 'DriveNetworkError';
  }
}

export class DriveScopeError extends Error {
  readonly code = 'scope' as const;
  constructor(message = 'Google Drive permission was denied.') {
    super(message);
    this.name = 'DriveScopeError';
  }
}

export class DriveNameConflictError extends Error {
  readonly code = 'nameConflict' as const;
  constructor(message = 'A file with that name already exists.') {
    super(message);
    this.name = 'DriveNameConflictError';
  }
}

export class DriveConfigError extends Error {
  readonly code = 'config' as const;
  constructor(message = 'Google Drive is not configured for this build.') {
    super(message);
    this.name = 'DriveConfigError';
  }
}

/** A sentence for the status pill and the Data screen. */
export function driveErrorMessage(err: unknown): string {
  if (err instanceof DriveAuthError) return 'Reconnect Google Drive';
  if (err instanceof DriveScopeError) {
    return 'Google Drive refused access. Reconnect and allow access to files this app creates.';
  }
  if (err instanceof DriveConfigError) return err.message;
  if (err instanceof DriveNameConflictError) return err.message;
  if (err instanceof DriveNetworkError) return 'Could not reach Google Drive.';
  return err instanceof Error ? err.message : String(err);
}
