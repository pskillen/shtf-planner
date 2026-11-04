import {
  DriveAuthError,
  DriveCancelledError,
  DriveNetworkError,
  type DrivePort,
  type DriveRemoteFile,
  type DriveWrite,
} from './drive';

/**
 * An in-memory Google Drive for tests: one `cloud` shared by any number of devices, each with its
 * own `DrivePort`. Test support only; nothing in the app imports it.
 */
export interface FakeCloud {
  /** Every file by id. */
  files: Map<
    string,
    { id: string; name: string; folderId: string; bytes: Uint8Array; modifiedTime: string }
  >;
  /** Number of uploads, by file name. */
  writes: Record<string, number>;
  /** A new device's port: not connected until `connect()`. */
  port(options?: FakePortOptions): FakePort;
  /** Content of a file by name, as text. */
  text(name: string): string | undefined;
  /** Replaces a file's content (another device, or a hand edit) and bumps its time. */
  put(name: string, content: Uint8Array | string): void;
}

export interface FakePortOptions {
  email?: string;
}

export interface FakePort extends DrivePort {
  /** Every call fails like a dead network while true. */
  offline: boolean;
  /** The token has expired and cannot be renewed without the person. */
  authExpired: boolean;
  /** The next `connect()` is cancelled (the popup was closed). */
  cancelNextConnect: boolean;
  /** Runs once, right after the next `listFiles` has read Drive: another device acts in the gap. */
  afterNextList?: () => Promise<void>;
  /** Folder lookups made. */
  calls: { list: number; read: number };
}

export function createFakeCloud(): FakeCloud {
  const files: FakeCloud['files'] = new Map();
  const writes: Record<string, number> = {};
  let clock = 0;
  let nextId = 0;
  const stamp = () => `2026-01-01T00:00:${String(++clock).padStart(6, '0')}Z`;
  const folderId = 'folder-1';
  const enc = new TextEncoder();

  const byName = (name: string) => Array.from(files.values()).find((f) => f.name === name);

  const cloud: FakeCloud = {
    files,
    writes,
    text: (name) => {
      const f = byName(name);
      return f ? new TextDecoder().decode(f.bytes) : undefined;
    },
    put(name, content) {
      const bytes = typeof content === 'string' ? enc.encode(content) : content.slice();
      const f = byName(name);
      if (f) {
        f.bytes = bytes;
        f.modifiedTime = stamp();
      } else {
        const id = `file-${++nextId}`;
        files.set(id, { id, name, folderId, bytes, modifiedTime: stamp() });
      }
    },
    port(options = {}) {
      let connected = false;
      const port: FakePort = {
        offline: false,
        authExpired: false,
        cancelNextConnect: false,
        calls: { list: 0, read: 0 },
        configured: () => true,
        isConnected: () => connected,
        accountEmail: () => (connected ? (options.email ?? 'me@example.test') : null),
        async connect() {
          if (port.cancelNextConnect) {
            port.cancelNextConnect = false;
            throw new DriveCancelledError();
          }
          connected = true;
          port.authExpired = false;
        },
        async disconnect() {
          connected = false;
        },
        async renew() {
          return !port.authExpired;
        },
        async folder() {
          gate();
          return folderId;
        },
        async listFiles(id): Promise<DriveRemoteFile[]> {
          gate();
          port.calls.list++;
          const seen = Array.from(files.values())
            .filter((f) => f.folderId === id)
            .map(({ id: fid, name, modifiedTime }) => ({ id: fid, name, modifiedTime }));
          const hook = port.afterNextList;
          port.afterNextList = undefined;
          await hook?.();
          return seen;
        },
        async readBytes(id) {
          gate();
          port.calls.read++;
          const f = files.get(id);
          if (!f) throw new DriveNetworkError('not found');
          return f.bytes.slice();
        },
        async readText(id) {
          return new TextDecoder().decode(await port.readBytes(id));
        },
        async write(params: DriveWrite): Promise<DriveRemoteFile> {
          gate();
          const bytes =
            typeof params.content === 'string'
              ? enc.encode(params.content)
              : params.content.slice();
          writes[params.name] = (writes[params.name] ?? 0) + 1;
          const existing = params.fileId ? files.get(params.fileId) : undefined;
          if (existing) {
            existing.bytes = bytes;
            existing.modifiedTime = stamp();
            return { id: existing.id, name: existing.name, modifiedTime: existing.modifiedTime };
          }
          const id = `file-${++nextId}`;
          const modifiedTime = stamp();
          files.set(id, { id, name: params.name, folderId: params.folderId, bytes, modifiedTime });
          return { id, name: params.name, modifiedTime };
        },
      };
      function gate(): void {
        if (port.offline) throw new DriveNetworkError('Failed to fetch');
        if (port.authExpired) throw new DriveAuthError();
      }
      return port;
    },
  };
  return cloud;
}
