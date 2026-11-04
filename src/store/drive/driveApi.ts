// Adapted from Codeplug Studio (src/integrations/cloud/driveApi.ts) and the prototype's Drive
// client: Drive v3 REST over fetch, with the folder find-or-create, binary and JSON uploads, and
// the 401/403/409 error mapping.

import {
  APP_ROOT_FOLDER_NAME,
  DRIVE_FOLDER_MIME,
  DriveAuthError,
  DriveNameConflictError,
  DriveNetworkError,
  DriveNotFoundError,
  DriveScopeError,
  type DriveFileMetadata,
} from './driveTypes';

export interface WriteFileParams {
  parentId: string;
  name: string;
  mimeType: string;
  content: Uint8Array | string;
  /** Update this file in place; without it a new file is created. */
  fileId?: string;
}

export interface DriveApiClient {
  /**
   * The app's folders named "SHTF Planner" among the files `drive.file` lets it see, oldest
   * first. More than one means two devices raced to create it; callers use the first.
   */
  findAppFolders(accessToken: string): Promise<DriveFileMetadata[]>;
  createFolder(parentId: string, name: string, accessToken: string): Promise<DriveFileMetadata>;
  /** The folder's files, oldest first. Throws `DriveNotFoundError` when the folder is gone. */
  listChildren(parentId: string, accessToken: string): Promise<DriveFileMetadata[]>;
  getFileMetadata(fileId: string, accessToken: string): Promise<DriveFileMetadata>;
  readBytes(fileId: string, accessToken: string): Promise<Uint8Array>;
  readText(fileId: string, accessToken: string): Promise<string>;
  writeFile(params: WriteFileParams, accessToken: string): Promise<DriveFileMetadata>;
  /** The signed-in account's email, for the Data screen ("Connected as ..."). */
  getUserEmail(accessToken: string): Promise<string>;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,mimeType,parents,modifiedTime';

async function parseDriveError(response: Response): Promise<never> {
  let detail = '';
  let status = '';
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string } };
    detail = body.error?.message ?? '';
    status = body.error?.status ?? '';
  } catch {
    // Not JSON: the HTTP status is all there is.
  }
  if (response.status === 401 || status === 'UNAUTHENTICATED') {
    throw new DriveAuthError(detail || undefined);
  }
  if (response.status === 403) throw new DriveScopeError(detail || undefined);
  if (response.status === 404) throw new DriveNotFoundError(detail || undefined);
  if (response.status === 409) throw new DriveNameConflictError(detail || undefined);
  throw new DriveNetworkError(detail || `Drive API error ${response.status}`);
}

async function driveFetch(
  fetchImpl: typeof fetch,
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
    });
  } catch (err) {
    throw new DriveNetworkError(err instanceof Error ? err.message : undefined);
  }
  if (!response.ok) await parseDriveError(response);
  return response;
}

function multipartBody(boundary: string, metadata: string, mimeType: string, content: Uint8Array) {
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--\r\n`);
  return new Blob([preamble, new Uint8Array(content), closing]);
}

export function createDriveApiClient(fetchImpl: typeof fetch = fetch): DriveApiClient {
  // `fetch` called unbound throws "Illegal invocation" in browsers.
  const doFetch: typeof fetch = (input, init) => fetchImpl(input, init);
  const list = async (query: string, accessToken: string, orderBy?: string) => {
    const fields = encodeURIComponent(`files(${FILE_FIELDS})`);
    const order = orderBy ? `&orderBy=${encodeURIComponent(orderBy)}` : '';
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${fields}&spaces=drive${order}`;
    const response = await driveFetch(doFetch, url, accessToken);
    const body = (await response.json()) as { files?: DriveFileMetadata[] };
    return (body.files ?? []).filter((f) => !!f.id && !!f.name);
  };

  return {
    findAppFolders: (accessToken) =>
      list(
        `mimeType='${DRIVE_FOLDER_MIME}' and name='${APP_ROOT_FOLDER_NAME}' and trashed=false`,
        accessToken,
        'createdTime',
      ),

    // Oldest first, as for folders: if two devices raced to create a file, the oldest wins.
    listChildren: (parentId, accessToken) =>
      list(`'${parentId}' in parents and trashed=false`, accessToken, 'createdTime'),

    async createFolder(parentId, name, accessToken) {
      const response = await driveFetch(
        doFetch,
        `${DRIVE_API_BASE}/files?fields=${encodeURIComponent(FILE_FIELDS)}`,
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] }),
        },
      );
      return (await response.json()) as DriveFileMetadata;
    },

    async getFileMetadata(fileId, accessToken) {
      const response = await driveFetch(
        doFetch,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`,
        accessToken,
      );
      return (await response.json()) as DriveFileMetadata;
    },

    async readBytes(fileId, accessToken) {
      const response = await driveFetch(
        doFetch,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
        accessToken,
      );
      return new Uint8Array(await response.arrayBuffer());
    },

    async readText(fileId, accessToken) {
      const response = await driveFetch(
        doFetch,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
        accessToken,
      );
      return response.text();
    },

    async writeFile({ parentId, name, mimeType, content, fileId }, accessToken) {
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      const fields = encodeURIComponent(FILE_FIELDS);
      if (fileId) {
        const response = await driveFetch(
          doFetch,
          `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${fields}`,
          accessToken,
          {
            method: 'PATCH',
            headers: { 'Content-Type': mimeType },
            body: new Uint8Array(bytes),
          },
        );
        const body = (await response.json()) as DriveFileMetadata;
        return { ...body, name: body.name ?? name };
      }
      const boundary = `shtf_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
      const response = await driveFetch(
        doFetch,
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=${fields}`,
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipartBody(boundary, metadata, mimeType, bytes),
        },
      );
      return (await response.json()) as DriveFileMetadata;
    },

    async getUserEmail(accessToken) {
      // Drive's own `about`, which `drive.file` allows (the userinfo endpoint would need an
      // extra scope).
      const response = await driveFetch(
        doFetch,
        `${DRIVE_API_BASE}/about?fields=${encodeURIComponent('user(emailAddress)')}`,
        accessToken,
      );
      const body = (await response.json()) as { user?: { emailAddress?: string } };
      return body.user?.emailAddress ?? '';
    },
  };
}
