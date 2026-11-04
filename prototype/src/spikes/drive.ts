import { button, el, logBox } from '../ui';
import { generateDoc } from '../gen';
import type { Lib } from './crdt-common';
import { FOLDER_NAME, driveApi, loadToken, requestToken, saveToken, stubFetch, type Meta, type Token } from './drive-api';

// Spike C: Google Drive under drive.file. Real mode needs VITE_GOOGLE_CLIENT_ID (+ VITE_GOOGLE_API_KEY for the Picker)
// in prototype/.env.local; without it (or with ?stub=1) a localStorage-backed stub exercises the same flow.

const CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
const API_KEY: string = (import.meta.env.VITE_GOOGLE_API_KEY ?? '').trim();
const STUB = !CLIENT_ID || new URLSearchParams(location.search).get('stub') === '1';
const PROJECT_NUMBER = CLIENT_ID.split('-')[0]; // Picker setAppId wants the Cloud project number

const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12);

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

async function pick(token: string): Promise<{ id: string; name: string; mimeType: string }[]> {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((r) => window.gapi.load('picker', { callback: () => r() }));
  const g = window.google;
  return new Promise((resolve) => {
    const mine = new g.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
    const shared = new g.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true).setOwnedByMe(false);
    new g.picker.PickerBuilder()
      .addView(mine)
      .addView(shared)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(PROJECT_NUMBER)
      .setCallback((d: any) => {
        if (d.action === g.picker.Action.PICKED) resolve(d.docs.map((x: any) => ({ id: x.id, name: x.name, mimeType: x.mimeType })));
        if (d.action === g.picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}

export function mount(root: HTMLElement) {
  const { pre, log } = logBox();
  const fetchImpl = STUB ? stubFetch() : fetch.bind(window);
  let token: Token | null = loadToken();
  if (STUB && !token) token = { accessToken: 'stub', expiresAt: Date.now() + 3600e3, grantedAt: Date.now() };
  const api = driveApi(fetchImpl, () => {
    if (!token) throw new Error('not connected');
    return token.accessToken;
  });
  let folderId = localStorage.getItem('shtf-proto:folderId') ?? '';
  let picked: { id: string; name: string; mimeType: string } | null = null;
  const libName = el('select');
  libName.append(new Option('yjs', 'yjs'), new Option('automerge', 'automerge'));
  const getLib = async (): Promise<Lib<any>> => (libName.value === 'yjs' ? (await import('./crdt-yjs')).yLib : (await import('./crdt-am')).amLib);

  const time = async <T,>(label: string, f: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    try {
      const r = await f();
      log(`${label}: ok in ${Math.round(performance.now() - t)} ms`);
      return r;
    } catch (e) {
      log(`${label}: FAILED in ${Math.round(performance.now() - t)} ms: ${String(e)}`);
      throw e;
    }
  };

  const fmtMeta = (m: Meta) => `${m.name} id=${m.id} parents=${JSON.stringify(m.parents)} ownedByMe=${m.ownedByMe} canEdit=${m.capabilities?.canEdit} owners=${m.owners?.map((o) => o.emailAddress)} mod=${m.modifiedTime}`;

  async function connect(prompt: '' | 'consent' | 'none') {
    if (STUB) { log('STUB mode: no real sign-in'); return; }
    token = await time(`token request prompt='${prompt}'`, () => requestToken(CLIENT_ID, prompt));
    log(`token granted; expires in ${Math.round((token.expiresAt - Date.now()) / 1000)} s`);
    log('account: ' + (await api.about()));
  }

  async function status() {
    if (!token) return log('no token');
    const left = Math.round((token.expiresAt - Date.now()) / 1000);
    log(`token granted ${new Date(token.grantedAt).toLocaleTimeString()}, ${left >= 0 ? left + ' s left' : 'EXPIRED ' + -left + ' s ago'}`);
    try { log('about() with stored token: ' + (await api.about())); } catch (e) { log('about() failed: ' + String(e)); }
  }

  async function findFolders() {
    const f = await time('find folders', () => api.findFolders());
    log(`found ${f.length} folder(s) named "${FOLDER_NAME}"`);
    f.forEach((m) => log('  ' + fmtMeta(m)));
    return f;
  }

  async function resolve() {
    const f = await findFolders();
    if (f.length > 1) log('WARNING: duplicates found');
    if (f.length) folderId = f[0].id;
    else {
      const c = await time('create folder', () => api.createFolder(FOLDER_NAME));
      folderId = c.id;
      log('created folder ' + c.id + ' (none was visible to this app)');
    }
    localStorage.setItem('shtf-proto:folderId', folderId);
    log('using folder ' + folderId);
  }

  async function writeBoth() {
    if (!folderId) await resolve();
    const lib = await getLib();
    const base = generateDoc(42);
    const s = lib.init(base);
    const bin = lib.save(s);
    const json = new TextEncoder().encode(JSON.stringify(lib.toJSON(s)));
    const kids = await api.children(folderId);
    for (const [name, bytes, mime] of [['household.bin', bin, 'application/octet-stream'], ['household.json', json, 'application/json']] as const) {
      const ex = kids.find((k) => k.name === name);
      const m = await time(`${ex ? 'update' : 'create'} ${name} (${bytes.length} B)`, () => api.write({ parent: folderId, name, bytes, mime, fileId: ex?.id }));
      log(`  -> id ${m.id}`);
    }
    log(`written with ${lib.name}; household.bin sha256[:12]=${await sha(bin)}`);
  }

  async function readBack() {
    if (!folderId) throw new Error('no folder yet');
    const lib = await getLib();
    const kids = await time('list folder', () => api.children(folderId));
    kids.forEach((k) => log('  ' + k.name + ' ' + k.id));
    const bin = kids.find((k) => k.name === 'household.bin');
    const js = kids.find((k) => k.name === 'household.json');
    if (bin) {
      const b = await time('read household.bin', () => api.read(bin.id));
      const doc = lib.toJSON(lib.load(b));
      const first = Object.keys(doc.items)[0];
      log(`  bin ${b.length} B sha256[:12]=${await sha(b)} items=${Object.keys(doc.items).length} first item ${first} qty=${doc.items[first]?.qty}`);
    }
    if (js) {
      const j = await time('read household.json', () => api.read(js.id));
      log(`  json ${j.length} B parses=${(() => { try { JSON.parse(new TextDecoder().decode(j)); return true; } catch { return false; } })()}`);
    }
  }

  async function editAndWrite(fileId?: string) {
    const lib = await getLib();
    let id = fileId;
    if (!id) {
      const kids = await api.children(folderId);
      id = kids.find((k) => k.name === 'household.bin')?.id;
    }
    if (!id) throw new Error('household.bin not found');
    const b = await api.read(id);
    const s = lib.load(b);
    const doc = lib.toJSON(s);
    const first = Object.keys(doc.items)[0];
    const q = doc.items[first].qty;
    lib.setQty(s, first, q + 1);
    const out = lib.save(s);
    const m = await time(`write edited bin (${out.length} B)`, () => api.write({ parent: folderId, name: 'household.bin', bytes: out, mime: 'application/octet-stream', fileId: id }));
    log(`  item ${first} qty ${q} -> ${q + 1}; file ${m.id} modified ${m.modifiedTime}`);
  }

  async function doPick() {
    if (STUB) return log('Picker needs real mode');
    if (!API_KEY) return log('Picker needs VITE_GOOGLE_API_KEY');
    if (!token) throw new Error('connect first');
    const r = await pick(token.accessToken);
    log('picker returned: ' + JSON.stringify(r));
    picked = r[0] ?? null;
    if (picked) {
      const m = await time('meta of picked', () => api.meta(picked!.id));
      log('  ' + fmtMeta(m));
    }
  }

  const needPicked = () => {
    if (!picked) throw new Error('pick something first');
    return picked;
  };

  root.append(
    el('h3', { textContent: 'Spike C: Drive (drive.file)' }),
    el('p', { textContent: STUB ? 'STUB MODE (no client id): flow runs against a fake Drive in localStorage.' : `REAL MODE. Origin ${location.origin}. Picker key set: ${!!API_KEY}` }),
    el('div', {}, 'CRDT bytes from: ', libName),
    el('div', {}, el('b', { textContent: '1 Auth ' }), button('Connect', () => connect('')), button('Force consent', () => connect('consent')), button('Silent only (prompt none)', () => connect('none')), button('Token status', status), button('Forget token', () => { token = null; saveToken(null); log('token cleared'); })),
    el('div', {}, el('b', { textContent: '2 Folder ' }), button('Find folders', async () => { await findFolders(); }), button('Resolve (find or create)', resolve), button('Reset stored folder id', () => { folderId = ''; localStorage.removeItem('shtf-proto:folderId'); log('folder id cleared'); })),
    el('div', {}, el('b', { textContent: '3 Files ' }), button('Write household.bin + .json', writeBoth), button('Read back + verify', readBack), button('Edit qty+1 and write', () => editAndWrite())),
    el('div', {}, el('b', { textContent: '4 Second account ' }), button('Open Picker', doPick), button('Read picked', async () => { const p = needPicked(); const b = await time('read picked', () => api.read(p.id)); log(`  ${b.length} B sha256[:12]=${await sha(b)}`); }), button('Edit+write picked', () => editAndWrite(needPicked().id)), button('List children of picked', async () => { const k = await time('children', () => api.children(needPicked().id)); log(JSON.stringify(k.map((x) => x.name))); }), button('Find household* anywhere', async () => { const f = await time('search', () => api.list("name contains 'household' and trashed=false")); f.forEach((m) => log('  ' + fmtMeta(m))); log(`${f.length} result(s)`); })),
    pre,
  );
  log(`mode=${STUB ? 'stub' : 'real'} origin=${location.origin} UA=${navigator.userAgent}`);
}
