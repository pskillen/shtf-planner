import type { BrowserContext, Route } from '@playwright/test';

/**
 * A fake Google for the e2e suite: Google Identity Services is replaced by a stub that returns a
 * token, and the Drive v3 calls the app makes are answered from memory. One `backend` is shared
 * by every browser context in a test, so two contexts are two devices on one Drive account.
 * Nothing leaves the machine.
 */
export interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  data: Buffer;
  modifiedTime: string;
}

export interface Backend {
  files: Map<string, FakeFile>;
  /** Drive requests answered, by "METHOD path". */
  log: string[];
  byName(name: string): FakeFile | undefined;
}

export function createBackend(): Backend {
  const files = new Map<string, FakeFile>();
  return {
    files,
    log: [],
    byName: (name) => Array.from(files.values()).find((f) => f.name === name),
  };
}

export const CLIENT_ID = 'e2e-fake-client.apps.googleusercontent.com';

/** Replaces `https://accounts.google.com/gsi/client`. `window.__gis.closeNext` closes the popup. */
const GIS_STUB = `
window.__gis = { closeNext: false, requests: 0 };
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) {
    return { requestAccessToken(opts) {
      window.__gis.requests++;
      if (window.__gis.closeNext) {
        window.__gis.closeNext = false;
        cfg.error_callback && cfg.error_callback({ type: 'popup_closed' });
        return;
      }
      cfg.callback({ access_token: 'e2e-token', expires_in: 3600 });
    } };
  },
  revoke(token, cb) { cb(); },
} } };
`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const meta = (f: FakeFile) => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  parents: f.parents,
  modifiedTime: f.modifiedTime,
});

/** Splits a multipart/related body into its JSON metadata and its raw content. */
function parseMultipart(body: Buffer, contentType: string) {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  if (!boundary) throw new Error('no multipart boundary');
  const marker = Buffer.from(`--${boundary}`);
  const first = body.indexOf(marker);
  const second = body.indexOf(marker, first + marker.length);
  const third = body.indexOf(marker, second + marker.length);
  const headerEnd = (from: number) => body.indexOf('\r\n\r\n', from) + 4;
  const metaStart = headerEnd(first);
  const metadata = JSON.parse(body.subarray(metaStart, second - 2).toString('utf8')) as {
    name: string;
    parents: string[];
    mimeType: string;
  };
  const dataStart = headerEnd(second);
  const data = body.subarray(dataStart, third - 2);
  return { metadata, data };
}

let clock = 0;
let ids = 0;
const stamp = () => `2026-01-01T00:00:${String(++clock).padStart(6, '0')}Z`;

export async function installFakeGoogle(
  context: BrowserContext,
  backend: Backend,
  { clientId = CLIENT_ID }: { clientId?: string } = {},
): Promise<void> {
  // Sync takes its client id from the build; this build has none, so keep one in the browser.
  await context.addInitScript((id) => {
    try {
      localStorage.setItem('shtf-planner:drive:clientId', id);
    } catch {
      // Not available on about:blank.
    }
  }, clientId);

  await context.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: GIS_STUB }),
  );

  await context.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    backend.log.push(`${method} ${url.pathname}`);

    if (url.pathname === '/drive/v3/about') {
      return json(route, { user: { emailAddress: 'e2e@example.test' } });
    }

    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const name = /name='([^']+)'/.exec(q)?.[1];
      const folder = q.includes('application/vnd.google-apps.folder');
      const found = Array.from(backend.files.values()).filter(
        (f) =>
          (!parent || f.parents.includes(parent)) &&
          (!name || f.name === name) &&
          (!folder || f.mimeType === 'application/vnd.google-apps.folder'),
      );
      return json(route, { files: found.map(meta) });
    }

    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const body = req.postDataJSON() as { name: string; mimeType: string; parents: string[] };
      const f: FakeFile = {
        id: `fake-${++ids}`,
        name: body.name,
        mimeType: body.mimeType,
        parents: body.parents,
        data: Buffer.alloc(0),
        modifiedTime: stamp(),
      };
      backend.files.set(f.id, f);
      return json(route, meta(f));
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (one && method === 'GET') {
      const f = backend.files.get(one[1]!);
      if (!f) return json(route, { error: { message: 'not found' } }, 404);
      if (url.searchParams.get('alt') === 'media') {
        return route.fulfill({ status: 200, headers: CORS, body: f.data });
      }
      return json(route, meta(f));
    }

    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { metadata, data } = parseMultipart(
        req.postDataBuffer() ?? Buffer.alloc(0),
        req.headers()['content-type'] ?? '',
      );
      const f: FakeFile = {
        id: `fake-${++ids}`,
        name: metadata.name,
        mimeType: metadata.mimeType,
        parents: metadata.parents,
        data: Buffer.from(data),
        modifiedTime: stamp(),
      };
      backend.files.set(f.id, f);
      return json(route, meta(f));
    }

    const upload = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (upload && method === 'PATCH') {
      const f = backend.files.get(upload[1]!);
      if (!f) return json(route, { error: { message: 'not found' } }, 404);
      f.data = Buffer.from(req.postDataBuffer() ?? Buffer.alloc(0));
      f.modifiedTime = stamp();
      return json(route, meta(f));
    }

    return json(
      route,
      { error: { message: `fake drive: unhandled ${method} ${url.pathname}` } },
      500,
    );
  });
}
