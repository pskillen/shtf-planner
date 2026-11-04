// Throwaway Drive client for spike C, adapted from Codeplug Studio's integrations/cloud/*.
// Pattern: GIS token flow (loadGoogleIdentity + webGoogleAuth), Drive v3 REST (driveApi), token in localStorage (drivePrefs).

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const FOLDER_NAME = 'SHTF Planner';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type Fetch = typeof fetch;
export type Meta = { id: string; name: string; mimeType?: string; parents?: string[]; modifiedTime?: string; ownedByMe?: boolean; capabilities?: { canEdit?: boolean }; owners?: { emailAddress?: string }[] };

// ---- Google Identity Services (loader as in Studio's loadGoogleIdentity.ts) ----
declare global { interface Window { google?: any; gapi?: any } }
let gisPromise: Promise<any> | null = null;
export function loadGis(): Promise<any> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  return (gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('GIS failed to init')));
    s.onerror = () => reject(new Error('GIS failed to load'));
    document.head.appendChild(s);
  }));
}

export type Token = { accessToken: string; expiresAt: number; grantedAt: number };
const TOKEN_KEY = 'shtf-proto:drive:token';
export const saveToken = (t: Token | null) => { try { t ? localStorage.setItem(TOKEN_KEY, JSON.stringify(t)) : localStorage.removeItem(TOKEN_KEY); } catch { /* */ } };
export const loadToken = (): Token | null => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null'); } catch { return null; } };

/** One token request. prompt '' lets GIS decide (silent when consent exists); 'consent' forces the dialog. */
export async function requestToken(clientId: string, prompt: '' | 'consent' | 'none' = ''): Promise<Token> {
  const g = await loadGis();
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r: any) => {
        if (r.error) return reject(new Error(r.error + (r.error_description ? ': ' + r.error_description : '')));
        const now = Date.now();
        const t = { accessToken: r.access_token, expiresAt: now + (r.expires_in ?? 3600) * 1000, grantedAt: now };
        saveToken(t);
        resolve(t);
      },
      error_callback: (e: any) => reject(new Error('gis error: ' + (e.type ?? '') + ' ' + (e.message ?? ''))),
    });
    client.requestAccessToken({ prompt });
  });
}

// ---- Drive v3 REST ----
export function driveApi(fetchImpl: Fetch, token: () => string) {
  const h = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token()}`, ...extra });
  const ok = async (r: Response) => {
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error?.message ?? ''; } catch { /* */ }
      throw new Error(`Drive ${r.status} ${msg}`);
    }
    return r;
  };
  const api = {
    async about(): Promise<string> {
      const j = await (await ok(await fetchImpl(`${API}/about?fields=user(emailAddress,displayName)`, { headers: h() }))).json();
      return j.user?.emailAddress ?? '?';
    },
    async list(q: string, fields = 'files(id,name,mimeType,parents,modifiedTime,ownedByMe)'): Promise<Meta[]> {
      const j = await (await ok(await fetchImpl(`${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&spaces=drive`, { headers: h() }))).json();
      return j.files ?? [];
    },
    async findFolders(): Promise<Meta[]> {
      return api.list(`mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME}' and trashed=false`);
    },
    async createFolder(name: string, parent = 'root'): Promise<Meta> {
      return (await ok(await fetchImpl(`${API}/files?fields=id,name,parents`, { method: 'POST', headers: h({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }) }))).json();
    },
    async children(parent: string): Promise<Meta[]> {
      return api.list(`'${parent}' in parents and trashed=false`);
    },
    async meta(id: string): Promise<Meta> {
      return (await ok(await fetchImpl(`${API}/files/${id}?fields=${encodeURIComponent('id,name,mimeType,parents,modifiedTime,ownedByMe,capabilities/canEdit,owners/emailAddress')}`, { headers: h() }))).json();
    },
    async read(id: string): Promise<Uint8Array> {
      return new Uint8Array(await (await ok(await fetchImpl(`${API}/files/${id}?alt=media`, { headers: h() }))).arrayBuffer());
    },
    async write(p: { parent: string; name: string; bytes: Uint8Array; mime: string; fileId?: string }): Promise<Meta> {
      if (p.fileId) {
        return (await ok(await fetchImpl(`${UPLOAD}/files/${p.fileId}?uploadType=media&fields=id,name,modifiedTime`, { method: 'PATCH', headers: h({ 'Content-Type': p.mime }), body: p.bytes as BodyInit }))).json();
      }
      const boundary = 'shtf' + Date.now();
      const enc = new TextEncoder();
      const pre = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: p.name, parents: [p.parent], mimeType: p.mime })}\r\n--${boundary}\r\nContent-Type: ${p.mime}\r\n\r\n`);
      const post = enc.encode(`\r\n--${boundary}--\r\n`);
      const body = new Blob([pre, p.bytes as BlobPart, post]);
      return (await ok(await fetchImpl(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`, { method: 'POST', headers: h({ 'Content-Type': `multipart/related; boundary=${boundary}` }), body }))).json();
    },
  };
  return api;
}

// ---- Stub Drive, used until the real client id exists. Mimics only the calls above, persisted in localStorage. ----
type StubFile = Meta & { data?: string };
export function stubFetch(): Fetch {
  const KEY = 'shtf-proto:stub-drive';
  const get = (): StubFile[] => JSON.parse(localStorage.getItem(KEY) ?? '[]');
  const put = (f: StubFile[]) => localStorage.setItem(KEY, JSON.stringify(f));
  const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
  let n = Number(localStorage.getItem(KEY + ':n') ?? '0');
  const nid = () => { localStorage.setItem(KEY + ':n', String(++n)); return 'stub' + n; };
  return async (input, init) => {
    const url = new URL(String(input));
    const files = get();
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/about')) return json({ user: { emailAddress: 'stub@example.invalid' } });
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = /name='([^']+)'/.exec(q)?.[1];
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const isFolder = q.includes(FOLDER_MIME);
      return json({ files: files.filter((f) => (!name || f.name === name) && (!parent || f.parents?.includes(parent)) && (!isFolder || f.mimeType === FOLDER_MIME)).map(({ data, ...m }) => m) });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const b = JSON.parse(String(init!.body));
      const f: StubFile = { id: nid(), ...b, ownedByMe: true };
      put([...files, f]);
      return json(f);
    }
    const mm = /\/files\/([^/]+)$/.exec(url.pathname);
    if (mm && method === 'GET') {
      const f = files.find((x) => x.id === mm[1]);
      if (!f) return json({ error: { message: 'not found' } }, 404);
      if (url.searchParams.get('alt') === 'media') return new Response(un64(f.data ?? '') as BodyInit);
      const { data, ...m } = f;
      return json({ ...m, capabilities: { canEdit: true } });
    }
    if (url.pathname.startsWith('/upload/drive/v3/files') && method === 'POST') {
      const text = await new Response(init!.body).arrayBuffer();
      const bytes = new Uint8Array(text);
      const dec = new TextDecoder('latin1').decode(bytes);
      const i1 = dec.indexOf('\r\n\r\n') + 4;
      const j1 = dec.indexOf('\r\n--', i1);
      const meta = JSON.parse(dec.slice(i1, j1));
      const start = dec.indexOf('\r\n\r\n', j1) + 4;
      const end = dec.lastIndexOf('\r\n--');
      const f: StubFile = { id: nid(), ...meta, data: b64(bytes.slice(start, end)), ownedByMe: true, modifiedTime: new Date().toISOString() };
      put([...files, f]);
      return json({ id: f.id, name: f.name });
    }
    if (url.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      const id = url.pathname.split('/').pop()!;
      const f = files.find((x) => x.id === id)!;
      f.data = b64(new Uint8Array(await new Response(init!.body).arrayBuffer()));
      f.modifiedTime = new Date().toISOString();
      put(files);
      return json({ id: f.id, name: f.name });
    }
    return json({ error: { message: 'stub: unhandled ' + method + ' ' + url.pathname } }, 500);
  };
}
