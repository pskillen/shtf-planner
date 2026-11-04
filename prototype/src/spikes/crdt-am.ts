import * as A from '@automerge/automerge';
import { next } from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import type { Doc } from '../gen';
import { getAt, type Ev, type Lib, type Path } from './crdt-common';

export { A, Repo, IndexedDBStorageAdapter, BroadcastChannelNetworkAdapter };
void next;

type S = { d: A.Doc<Doc> };

function setAt(d: any, path: Path, v: unknown) {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path[path.length - 1]] = v;
}

export const amLib: Lib<S> = {
  name: 'automerge',
  init: (doc) => ({ d: A.from(structuredClone(doc)) }),
  fork: (s) => ({ d: A.clone(s.d) }),
  setQty: (s, id, qty) => { s.d = A.change(s.d, (d) => { if (d.items[id]) d.items[id].qty = qty; }); },
  addItem: (s, it) => { s.d = A.change(s.d, (d) => { d.items[it.id] = it; }); },
  delItem: (s, id) => { s.d = A.change(s.d, (d) => { delete d.items[id]; }); },
  setPath: (s, path, v) => { s.d = A.change(s.d, (d) => setAt(d, path, v)); },
  toJSON: (s) => JSON.parse(JSON.stringify(s.d)),
  save: (s) => A.save(s.d),
  load: (b) => ({ d: A.load<Doc>(b) }),
  merge: (a, b) => ({ d: A.merge(a.d, b.d) }),

  // The which-copy extraction: Automerge computes the diff between two sets of heads for us.
  // We only translate patches to our event shape and look up old values in a view at the base heads.
  changesBy(base, b) {
    const before = A.view(b.d, A.getHeads(base.d));
    const patches = A.diff(b.d, A.getHeads(base.d), A.getHeads(b.d));
    const evs: Ev[] = [];
    const created: Path[] = [];
    const seen = new Set<string>();
    const scalar = (path: Path) => {
      // strings are text objects in Automerge 3: an overwrite arrives as put('') + splices,
      // so resolve the old and new value from the two views instead of the patch payload.
      const k = path.join('/');
      if (seen.has(k)) return;
      seen.add(k);
      evs.push({ kind: 'put', path, old: getAt(before, path), val: getAt(b.d, path) });
    };
    for (const p of patches) {
      if (created.some((c) => c.every((k, i) => p.path[i] === k))) continue;
      if (p.action === 'put' && p.value && typeof p.value === 'object') {
        evs.push({ kind: 'create', path: p.path });
        created.push(p.path);
      } else if (p.action === 'put') {
        scalar(p.path);
      } else if (p.action === 'splice') {
        scalar(p.path.slice(0, -1));
      } else if (p.action === 'del') {
        evs.push({ kind: 'del', path: p.path });
      } else if (p.action === 'insert') {
        evs.push({ kind: 'create', path: p.path });
      }
    }
    return evs;
  },
};
