import { generateDoc, rng, uid, type Doc, type ItemInstance } from '../gen';

export type Path = (string | number)[];
export type Ev =
  | { kind: 'create'; path: Path }
  | { kind: 'del'; path: Path }
  | { kind: 'put'; path: Path; old: unknown; val: unknown };

/** Shared formatter: same for both libraries, so not counted in the per-library code size. */
export function fmt(e: Ev): string {
  const p = e.path;
  if (e.kind === 'create') return `${p.join('/')} added`;
  if (e.kind === 'del') return `${p.join('/')} removed`;
  const last = p[p.length - 1];
  const rec = p.slice(0, -1).join('/');
  return `${rec} ${last} ${JSON.stringify(e.old)} → ${JSON.stringify(e.val)}`;
}

/** A device-side library adapter. State is opaque to the harness. */
export interface Lib<S> {
  name: string;
  init(doc: Doc): S;
  fork(s: S): S;
  setQty(s: S, id: string, qty: number): void;
  addItem(s: S, it: ItemInstance): void;
  delItem(s: S, id: string): void;
  setPath(s: S, path: Path, v: unknown): void;
  toJSON(s: S): Doc;
  save(s: S): Uint8Array;
  load(b: Uint8Array): S;
  /** Merge b into a (a is mutated or replaced; returns the merged state). */
  merge(a: S, b: S): S;
  /** What did b change relative to base (a past ancestor common to both)? */
  changesBy(base: S, b: S): Ev[];
}

export function opsSequence(doc: Doc, seed: number, n: number) {
  // pre-compute a plan of operations against ids that exist in this device's view
  const r = rng(seed);
  const ids = Object.keys(doc.items);
  return { r, ids, n };
}

export function runEdits<S>(lib: Lib<S>, s: S, ids: string[], seed: number, n: number) {
  const r = rng(seed);
  const live = [...ids];
  for (let i = 0; i < n; i++) {
    const x = r();
    if (x < 0.7 && live.length) {
      lib.setQty(s, live[Math.floor(r() * live.length)], 1 + Math.floor(r() * 12));
    } else if (x < 0.85) {
      const id = uid(r);
      lib.addItem(s, { id, typeId: 'new', qty: 1 + Math.floor(r() * 12), locationId: 'x', added: '2025-01-01' });
      live.push(id);
    } else if (live.length) {
      const k = Math.floor(r() * live.length);
      lib.delItem(s, live[k]);
      live.splice(k, 1);
    }
  }
}

export function getAt(o: any, p: Path) {
  for (const k of p) o = o?.[k];
  return o;
}

export const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

export { generateDoc };
