import { button, el, gz, logBox } from '../ui';
import { generateDoc, type Doc } from '../gen';
import { fmt, getAt, median, runEdits, type Lib } from './crdt-common';

type AnyLib = Lib<any>;

async function getLibs() {
  const t0 = performance.now();
  const am = await import('./crdt-am');
  const tAm = performance.now() - t0;
  const t1 = performance.now();
  const y = await import('./crdt-yjs');
  const tY = performance.now() - t1;
  return { am, y, tAm, tY };
}

const time = <T,>(f: () => T): [T, number] => {
  const t = performance.now();
  const r = f();
  return [r, performance.now() - t];
};

async function sumIdb(dbName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      let total = 0;
      const stores = Array.from(db.objectStoreNames);
      if (!stores.length) { db.close(); return resolve(0); }
      const tx = db.transaction(stores, 'readonly');
      let pending = stores.length;
      for (const s of stores) {
        const req = tx.objectStore(s).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) {
            const v = c.value;
            total += v instanceof Uint8Array ? v.byteLength : v?.binary?.byteLength ?? v?.byteLength ?? JSON.stringify(v ?? '').length;
            c.continue();
          } else if (--pending === 0) { db.close(); resolve(total); }
        };
      }
    };
  });
}

export function mount(root: HTMLElement) {
  const { pre, log } = logBox();
  root.append(el('h3', { textContent: 'Spike B: Automerge 3 vs Yjs' }));
  const out = el('div');
  const results: Record<string, any> = ((window as any).__results = {});

  async function bench(lib: AnyLib) {
    const base = generateDoc(42);
    const baseJson = JSON.stringify(base);
    const r: Record<string, number | string> = {};
    r.jsonBytes = baseJson.length;
    r.jsonGz = await gz(baseJson);
    const [s0, tInit] = time(() => lib.init(base));
    r.initMs = Math.round(tInit);
    const b0 = lib.save(s0);
    r.initBytes = b0.length;
    r.initGz = await gz(b0);
    const ids = Object.keys(base.items);
    const devA = lib.fork(s0);
    const devB = lib.fork(s0);
    const [, tEdA] = time(() => runEdits(lib, devA, ids, 1, 1000));
    const [, tEdB] = time(() => runEdits(lib, devB, ids, 2, 1000));
    r.editMsPer1000 = Math.round((tEdA + tEdB) / 2);
    r.bytesAEdits = lib.save(devA).length;
    const bytesB = lib.save(devB);
    const aCopy = lib.load(lib.save(devA)); // measure merge on freshly loaded state
    const bCopy = lib.load(bytesB);
    const [merged, tMerge] = time(() => lib.merge(aCopy, bCopy));
    r.mergeMs = Math.round(tMerge * 10) / 10;
    const mergedBytes = lib.save(merged);
    r.afterBytes = mergedBytes.length;
    r.afterGz = await gz(mergedBytes);
    // load from bytes, median of 7
    const loads: number[] = [];
    for (let i = 0; i < 7; i++) loads.push(time(() => lib.load(mergedBytes))[1]);
    r.loadFromBytesMs = Math.round(median(loads) * 10) / 10;
    const finalJson = JSON.stringify(lib.toJSON(merged));
    r.finalJsonBytes = finalJson.length;
    r.itemsAfter = Object.keys(lib.toJSON(merged).items).length;
    return { r, mergedBytes };
  }

  async function runBench() {
    const L = await getLibs();
    results.importMs = { automerge: Math.round(L.tAm), yjs: Math.round(L.tY) };
    log(`dynamic import ms (chunk + wasm init): automerge ${Math.round(L.tAm)}, yjs ${Math.round(L.tY)}`);
    for (const lib of [L.am.amLib, L.y.yLib] as AnyLib[]) {
      const { r, mergedBytes } = await bench(lib);
      results[lib.name] = r;
      log(lib.name + ' ' + JSON.stringify(r));
      void mergedBytes;
    }
  }

  // ---- IndexedDB cold-load measurement via the real storage adapters ----
  async function persist() {
    const L = await getLibs();
    const base = generateDoc(42);
    for (const lib of [L.am.amLib, L.y.yLib] as AnyLib[]) {
      const ids = Object.keys(base.items);
      const s0 = lib.init(base);
      const a = lib.fork(s0), b = lib.fork(s0);
      runEdits(lib, a, ids, 1, 1000);
      runEdits(lib, b, ids, 2, 1000);
      const merged = lib.merge(a, b);
      const bytes = lib.save(merged);
      if (lib.name === 'automerge') {
        indexedDB.deleteDatabase('automerge');
        await new Promise((r) => setTimeout(r, 200));
        const repo = new L.am.Repo({ storage: new L.am.IndexedDBStorageAdapter() });
        const h = repo.import<Doc>(bytes);
        await repo.flush();
        localStorage.setItem('am-bench-id', h.documentId);
        await repo.shutdown?.();
        log(`automerge persisted; idb bytes ${await sumIdb('automerge')}`);
      } else {
        indexedDB.deleteDatabase('y-bench');
        await new Promise((r) => setTimeout(r, 200));
        const d = new L.y.Y.Doc();
        const p = new L.y.IndexeddbPersistence('y-bench', d);
        await p.whenSynced;
        L.y.Y.applyUpdate(d, bytes);
        await new Promise((r) => setTimeout(r, 300));
        await p.destroy();
        log(`yjs persisted; idb bytes ${await sumIdb('y-bench')}`);
      }
    }
  }

  async function coldLoad(which: 'am' | 'yjs') {
    const t0 = performance.now();
    const L = await getLibs();
    const tImport = performance.now() - t0;
    const t1 = performance.now();
    let items = 0;
    if (which === 'am') {
      const repo = new L.am.Repo({ storage: new L.am.IndexedDBStorageAdapter() });
      const h = await repo.find<Doc>(localStorage.getItem('am-bench-id') as any);
      await h.whenReady();
      items = Object.keys(h.doc().items).length;
    } else {
      const d = new L.y.Y.Doc();
      const p = new L.y.IndexeddbPersistence('y-bench', d);
      await p.whenSynced;
      items = Object.keys(L.y.root(d).toJSON().items).length;
    }
    const tLoad = performance.now() - t1;
    const r = { lib: which, importMs: Math.round(tImport), idbLoadMs: Math.round(tLoad), items, ua: navigator.userAgent };
    results['cold-' + which] = r;
    log('cold load ' + JSON.stringify(r));
  }

  // ---- Which-copy screen + same-record correctness ----
  async function whichCopy() {
    const L = await getLibs();
    const table = el('table');
    out.replaceChildren(table);
    for (const lib of [L.am.amLib, L.y.yLib] as AnyLib[]) {
      const base = generateDoc(7);
      const ids = Object.keys(base.items);
      const X = ids[0], D = ids[1];
      const s0 = lib.init(base);
      const devA = lib.fork(s0);
      const devB = lib.fork(s0);
      lib.setQty(devA, X, base.items[X].qty === 4 ? 3 : 4); // A's own edit of the same record
      lib.setQty(devB, X, base.items[X].qty === 2 ? 3 : 2);
      lib.addItem(devB, { id: 'newitem', typeId: 't', qty: 1, locationId: 'l', added: '2025-01-01' });
      lib.delItem(devB, D);
      lib.setPath(devB, ['home', 'assets', 3, 'answers', 'litres'], 99);
      lib.setPath(devB, ['household', 'members', 1, 'name'], 'Samuel');
      const bBytes = lib.save(devB); // "B's state arrives as bytes"
      const received = lib.load(bBytes);
      const [evs, ms] = time(() => lib.changesBy(s0, received));
      const lines = evs.map(fmt).sort();
      const qB = base.items[X].qty === 2 ? 3 : 2;
      const expected = [
        `items/${X} qty ${base.items[X].qty} → ${qB}`,
        `items/newitem added`,
        `items/${D} removed`,
        `home/assets/3/answers litres ${JSON.stringify(getAt(base, ['home', 'assets', 3, 'answers', 'litres']))} → 99`,
        `household/members/1 name ${JSON.stringify(base.household.members[1].name)} → "Samuel"`,
      ].sort();
      const ok = JSON.stringify(lines) === JSON.stringify(expected);
      const merged = lib.merge(lib.fork(devA), received);
      const winner = lib.toJSON(merged).items[X].qty;
      log(`[${lib.name}] which-copy ${ok ? 'CORRECT' : 'MISMATCH'} in ${ms.toFixed(1)} ms; same-record merged qty=${winner} (A wrote ${base.items[X].qty === 4 ? 3 : 4}, B wrote ${qB})`);
      for (const l of lines) log('   ' + l);
      if (!ok) { log('   expected:'); for (const l of expected) log('   ' + l); }
      // concurrent edits of the same string field: does the merge keep one writer's value whole?
      const sa = lib.fork(s0), sb = lib.fork(s0);
      lib.setPath(sa, ['household', 'members', 1, 'name'], 'Samantha');
      lib.setPath(sb, ['household', 'members', 1, 'name'], 'Samuel');
      const strMerged = lib.toJSON(lib.merge(sa, sb)).household.members[1].name;
      log(`   concurrent string edit Samantha vs Samuel merged to ${JSON.stringify(strMerged)}`);
      results['which-' + lib.name] = { ok, lines, merged_qty: winner, strMerged };
      const tr = el('tr', {}, el('td', { textContent: lib.name }), el('td', { textContent: ok ? 'correct' : 'MISMATCH' }), el('td', { textContent: lines.join('\n') }));
      table.append(tr);
    }
  }

  // ---- JSON sidecar ----
  async function sidecar() {
    const L = await getLibs();
    for (const lib of [L.am.amLib, L.y.yLib] as AnyLib[]) {
      const base = generateDoc(42);
      const s = lib.init(base);
      const json = JSON.stringify(lib.toJSON(s));
      const s2 = lib.init(JSON.parse(json));
      const json2 = JSON.stringify(lib.toJSON(s2));
      // Automerge returns map keys sorted, so compare canonically (sorted keys).
      const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x);
      const same = canon(JSON.parse(json)) === canon(JSON.parse(json2)) && canon(JSON.parse(json)) === canon(base);
      log(`[${lib.name}] sidecar ${json.length} bytes, reload into fresh doc identical=${same}`);
      results['sidecar-' + lib.name] = { bytes: json.length, same };
    }
  }

  // ---- Multi-tab ----
  async function multiTab(which: 'am' | 'yjs') {
    const L = await getLibs();
    const box = el('div');
    root.append(box);
    const small = generateDoc(1);
    const firstId = Object.keys(small.items)[0];
    const show = el('div', { textContent: '...' });
    box.append(el('h4', { textContent: `Live doc (${which}): item ${firstId}` }), show);
    const render = (q: unknown) => { show.textContent = `qty = ${q}   [${new Date().toLocaleTimeString()}]`; (window as any).__qty = q; };
    if (which === 'am') {
      const repo = new L.am.Repo({ storage: new L.am.IndexedDBStorageAdapter('am-live'), network: [new L.am.BroadcastChannelNetworkAdapter()] });
      let url = localStorage.getItem('am-live-url');
      let h;
      if (url) { h = await repo.find<Doc>(url as any); await h.whenReady(); }
      else { h = repo.create<Doc>(small); localStorage.setItem('am-live-url', h.url); }
      render(h.doc().items[firstId]?.qty);
      h.on('change', ({ doc }) => render(doc.items[firstId]?.qty));
      box.append(button('qty + 1', () => { h.change((d) => { d.items[firstId].qty++; }); }));
    } else {
      const d = new L.y.Y.Doc();
      const p = new L.y.IndexeddbPersistence('y-live', d);
      const bc = new BroadcastChannel('y-live-relay');
      d.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'bc') bc.postMessage(u); });
      bc.onmessage = (e) => L.y.Y.applyUpdate(d, new Uint8Array(e.data), 'bc');
      await p.whenSynced;
      if (!L.y.root(d).has('items')) d.transact(() => { for (const [k, v] of Object.entries(small)) L.y.root(d).set(k, L.y.toY(v)); });
      const q = () => (L.y.root(d).get('items') as any).get(firstId)?.get('qty');
      render(q());
      d.on('update', () => render(q()));
      box.append(button('qty + 1', () => { (L.y.root(d).get('items') as any).get(firstId).set('qty', q() + 1); }));
    }
  }

  const params = new URLSearchParams(location.search);
  root.append(
    el('p', { textContent: 'Desktop: run all buttons in order. Phone: same, then use "reload & cold load".' }),
    button('1 Benchmark (bytes, edits, merge, load)', runBench),
    button('2 Persist to IndexedDB', persist),
    button('3a Cold load AM', () => coldLoad('am')),
    button('3b Cold load Yjs', () => coldLoad('yjs')),
    button('4 Which-copy', whichCopy),
    button('5 JSON sidecar', sidecar),
    el('br'),
    button('Multi-tab AM (open in 2 tabs)', () => multiTab('am')),
    button('Multi-tab Yjs (open in 2 tabs)', () => multiTab('yjs')),
    button('Reload (fresh JS context)', () => location.reload()),
    el('p', { textContent: 'Phone/UA: ' + navigator.userAgent }),
    pre,
    out,
  );
  const auto = params.get('auto');
  if (auto === 'coldam') coldLoad('am');
  if (auto === 'coldyjs') coldLoad('yjs');
}
