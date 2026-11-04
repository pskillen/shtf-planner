import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Doc } from '../gen';
import type { Ev, Lib, Path } from './crdt-common';

export { Y, IndexeddbPersistence };

export function toY(v: any): any {
  if (Array.isArray(v)) {
    const a = new Y.Array();
    a.push(v.map(toY));
    return a;
  }
  if (v && typeof v === 'object') {
    const m = new Y.Map();
    for (const [k, x] of Object.entries(v)) if (x !== undefined) m.set(k, toY(x));
    return m;
  }
  return v;
}

export const root = (d: Y.Doc) => d.getMap('doc');

function walk(d: Y.Doc, path: Path): any {
  let o: any = root(d);
  for (const k of path) o = o instanceof Y.Array ? o.get(k as number) : o.get(k as string);
  return o;
}

export const yLib: Lib<Y.Doc> = {
  name: 'yjs',
  init(doc) {
    const d = new Y.Doc();
    d.transact(() => {
      for (const [k, v] of Object.entries(doc)) root(d).set(k, toY(v));
    });
    return d;
  },
  fork(s) {
    const d = new Y.Doc();
    Y.applyUpdate(d, Y.encodeStateAsUpdate(s));
    return d;
  },
  setQty: (s, id, qty) => { (walk(s, ['items', id]) as Y.Map<unknown> | undefined)?.set('qty', qty); },
  addItem: (s, it) => { (walk(s, ['items']) as Y.Map<unknown>).set(it.id, toY(it)); },
  delItem: (s, id) => { (walk(s, ['items']) as Y.Map<unknown>).delete(id); },
  setPath: (s, path, v) => { walk(s, path.slice(0, -1)).set(path[path.length - 1], v); },
  toJSON: (s) => root(s).toJSON() as Doc,
  save: (s) => Y.encodeStateAsUpdate(s),
  load(b) {
    const d = new Y.Doc();
    Y.applyUpdate(d, b);
    return d;
  },
  merge(a, b) {
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    return a;
  },

  // The which-copy extraction: Yjs has no diff between states. We replay b's changes onto a
  // copy of base with an observer and walk the events (old values come with 'update'/'delete').
  changesBy(base, b) {
    const d = yLib.fork(base);
    const evs: Ev[] = [];
    root(d).observeDeep((events) => {
      for (const e of events) {
        const path = e.path as Path;
        if (e instanceof Y.YMapEvent) {
          for (const [key, ch] of e.changes.keys) {
            const p = [...path, key];
            if (ch.action === 'delete') evs.push({ kind: 'del', path: p });
            else if (ch.action === 'add') {
              const v = (e.target as Y.Map<unknown>).get(key);
              evs.push(v instanceof Y.AbstractType ? { kind: 'create', path: p } : { kind: 'put', path: p, old: undefined, val: v });
            } else {
              evs.push({ kind: 'put', path: p, old: ch.oldValue, val: (e.target as Y.Map<unknown>).get(key) });
            }
          }
        } else if (e instanceof Y.YArrayEvent) {
          let i = 0;
          for (const op of e.changes.delta) {
            if (op.retain) i += op.retain;
            if (op.insert) { evs.push({ kind: 'create', path: [...path, i] }); i += (op.insert as unknown[]).length; }
            if (op.delete) evs.push({ kind: 'del', path: [...path, i] });
          }
        }
      }
    });
    Y.applyUpdate(d, Y.encodeStateAsUpdate(b, Y.encodeStateVector(d)));
    return evs;
  },
};
void ({} as Doc);
