import * as Y from 'yjs';

/**
 * Plain JSON <-> Yjs types, so the rest of the app sees a plain document and the CRDT sees
 * fine-grained edits.
 *
 * - An object becomes a `Y.Map`, so records keyed by id (`items`, `assets`, ...) merge per record
 *   and per field: concurrent adds, and edits to different fields, never conflict.
 * - An array whose elements are objects with a string `id` (`members`, `pets`, `medication`)
 *   becomes a `Y.Array` of `Y.Map`s diffed by id, so editing one member never clobbers another.
 * - Any other array (lists of tags, risks, pack ids, device ids) becomes a `Y.Array` of values
 *   diffed as a set: removed values are deleted, new ones appended, and duplicates from concurrent
 *   adds are dropped on read.
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json | undefined };
type Obj = { [k: string]: unknown };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasId = (v: unknown): v is Obj & { id: string } => isObj(v) && typeof v.id === 'string';

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Recursively freezes a plain value. */
export function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/** The same value with every object's keys in sorted order, so JSON output is byte-stable. */
export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) {
    const out: Obj = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/** Builds the Yjs type for a plain value. */
export function toY(v: unknown): unknown {
  if (Array.isArray(v)) {
    const arr = new Y.Array<unknown>();
    arr.push(v.map(toY));
    return arr;
  }
  if (isObj(v)) {
    const map = new Y.Map<unknown>();
    for (const [k, x] of Object.entries(v)) if (x !== undefined) map.set(k, toY(x));
    return map;
  }
  return v;
}

/** Reads a Yjs value back to plain JSON, dropping duplicates that concurrent array adds make. */
export function toPlain(v: unknown): Json {
  if (v instanceof Y.Map) {
    const out: { [k: string]: Json } = {};
    v.forEach((x, k) => {
      out[k] = toPlain(x);
    });
    return out;
  }
  if (v instanceof Y.Array) {
    const items = v.toArray().map(toPlain);
    if (items.some(hasId)) {
      const seen = new Set<string>();
      return items.filter((e) => {
        if (!hasId(e)) return true;
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
    }
    const out: Json[] = [];
    for (const e of items) if (!out.some((o) => deepEqual(o, e))) out.push(e);
    return out;
  }
  return v as Json;
}

function syncKey(map: Y.Map<unknown>, key: string, prev: unknown, next: unknown): void {
  if (deepEqual(prev, next)) return;
  const cur = map.get(key);
  if (isObj(next) && cur instanceof Y.Map) syncMap(cur, isObj(prev) ? prev : {}, next);
  else if (Array.isArray(next) && cur instanceof Y.Array) {
    syncArray(cur, Array.isArray(prev) ? prev : [], next);
  } else map.set(key, toY(next));
}

/** Writes the difference between `prev` and `next` (both plain) into `map`. */
export function syncMap(map: Y.Map<unknown>, prev: Obj, next: Obj): void {
  for (const key of Array.from(map.keys())) {
    if (next[key] === undefined) map.delete(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) syncKey(map, key, prev[key], value);
  }
}

function syncArray(arr: Y.Array<unknown>, prev: unknown[], next: unknown[]): void {
  const keyed = next.some(hasId) || prev.some(hasId);
  if (!keyed) {
    // A set of plain values.
    const wanted = next;
    const current = arr.toArray();
    for (let i = current.length - 1; i >= 0; i--) {
      if (!wanted.some((w) => deepEqual(w, current[i]))) arr.delete(i, 1);
    }
    const remaining = arr.toArray();
    const added = wanted.filter((w) => !remaining.some((c) => deepEqual(c, w)));
    if (added.length > 0) arr.push(added.map(toY));
    return;
  }
  // Records with ids: update in place, delete the missing, insert the new.
  const nextIds = new Set(next.filter(hasId).map((e) => e.id));
  for (let i = arr.length - 1; i >= 0; i--) {
    const el = arr.get(i);
    const id = el instanceof Y.Map ? el.get('id') : undefined;
    if (typeof id !== 'string' || !nextIds.has(id)) arr.delete(i, 1);
  }
  const prevById = new Map(prev.filter(hasId).map((e) => [e.id, e]));
  next.forEach((el, index) => {
    if (!hasId(el)) return;
    let found: Y.Map<unknown> | undefined;
    for (const c of arr.toArray()) {
      if (c instanceof Y.Map && c.get('id') === el.id) {
        found = c;
        break;
      }
    }
    if (found) syncMap(found, prevById.get(el.id) ?? {}, el);
    else arr.insert(Math.min(index, arr.length), [toY(el)]);
  });
}
