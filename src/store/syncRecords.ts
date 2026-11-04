import * as Y from 'yjs';
import type { Document } from '../model';
import { applyInit } from './init';
import { deepEqual, toPlain } from './yconvert';

/**
 * Work out, from three plain snapshots, what a pull changed: `base` (the state both devices had
 * at the last sync), `local` (this device before the merge) and `remote` (the Drive copy).
 *
 * The CRDT has already merged by the time anyone asks; this is only for telling the person. A
 * "record" is the unit they recognise: one item, one location, one member, the home, the
 * settings. Two devices changing different fields of one record is not a conflict (the CRDT
 * keeps both); the same field set to two different values, or a record deleted on one side and
 * edited on the other, is.
 */

/** The root key of the document map inside the Yjs doc (the same one the store uses). */
export const DOC_ROOT = 'doc';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The plain document inside a Yjs update, without opening a store. */
export function plainFromBytes(bytes: Uint8Array): Obj {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, bytes);
    return toPlain(ydoc.getMap(DOC_ROOT)) as Obj;
  } finally {
    ydoc.destroy();
  }
}

/** What a brand-new document looks like (the shared first-run content, before any edit). */
export function freshPlain(schemaVersion: number): Obj {
  const ydoc = new Y.Doc();
  try {
    applyInit(ydoc, ydoc.getMap(DOC_ROOT), schemaVersion);
    return toPlain(ydoc.getMap(DOC_ROOT)) as Obj;
  } finally {
    ydoc.destroy();
  }
}

/**
 * True when `local` holds something `remote` has not seen: a structure it lacks, or a deletion it
 * lacks. A deletion adds no clock, so state vectors alone would call "I deleted x" and "I did
 * nothing" the same.
 */
export function hasUnseenChanges(localBytes: Uint8Array, remoteBytes: Uint8Array): boolean {
  const remote = new Y.Doc();
  try {
    Y.applyUpdate(remote, remoteBytes);
    return !Y.snapshotContainsUpdate(Y.snapshot(remote), localBytes);
  } finally {
    remote.destroy();
  }
}

/** The household has no answers yet: nothing the person would lose by taking Drive's copy. */
export function isBlank(doc: Document): boolean {
  return (
    Object.keys(doc.locations).length === 0 &&
    Object.keys(doc.assets).length === 0 &&
    Object.keys(doc.items).length === 0 &&
    Object.keys(doc.floors).length === 0 &&
    Object.keys(doc.plans).length === 0 &&
    Object.keys(doc.reviews).length === 0 &&
    Object.keys(doc.customTypes).length === 0 &&
    doc.household.members.length === 0 &&
    doc.household.pets.length === 0
  );
}

const COLLECTIONS = [
  'locations',
  'assets',
  'items',
  'floors',
  'plans',
  'reviews',
  'customTypes',
] as const;
const LISTS = ['members', 'pets'] as const;

/** Every record of a plain document, keyed `collection/id` (or `home`, `settings`). */
export function recordsOf(plain: Obj): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const c of COLLECTIONS) {
    const bucket = plain[c];
    if (isObj(bucket)) for (const [id, v] of Object.entries(bucket)) out.set(`${c}/${id}`, v);
  }
  const household = plain.household;
  if (isObj(household)) {
    for (const l of LISTS) {
      const list = household[l];
      if (Array.isArray(list)) {
        for (const e of list) {
          if (isObj(e) && typeof e.id === 'string') out.set(`household.${l}/${e.id}`, e);
        }
      }
    }
  }
  if (plain.home !== undefined) out.set('home', plain.home);
  if (plain.settings !== undefined) out.set('settings', plain.settings);
  return out;
}

export interface FieldChange {
  field: string;
  /** This device's value (undefined: not set here). */
  mine: unknown;
  /** The other device's value. */
  theirs: unknown;
}

export interface Conflict {
  /** `items/<id>`, `household.members/<id>`, `home`, ... */
  key: string;
  /** A name the person recognises. */
  title: string;
  /** What kind of thing it is: "Item", "Member", "Home" ... */
  noun: string;
  /** Present on this device / the other device (false: deleted there). */
  minePresent: boolean;
  theirsPresent: boolean;
  fields: FieldChange[];
  /** The whole record on each side, kept so a choice can be applied later. */
  mineRecord?: unknown;
  theirsRecord?: unknown;
}

export interface Classified {
  conflicts: Conflict[];
  /** Records the other device changed that this one did not (applied silently). */
  remoteOnly: number;
}

const NOUNS: Record<string, string> = {
  locations: 'Location',
  assets: 'Asset',
  items: 'Item',
  floors: 'Minimum level',
  plans: 'Plan item',
  reviews: 'Review',
  customTypes: 'Custom item',
  'household.members': 'Member',
  'household.pets': 'Pet',
  home: 'Home',
  settings: 'Settings',
};

function describe(key: string, record: unknown): { noun: string; title: string } {
  const slash = key.indexOf('/');
  const collection = slash < 0 ? key : key.slice(0, slash);
  const id = slash < 0 ? '' : key.slice(slash + 1);
  const noun = NOUNS[collection] ?? collection;
  if (collection === 'home') return { noun, title: 'Your home' };
  if (collection === 'settings') return { noun, title: 'Your settings' };
  const r = isObj(record) ? record : {};
  const name = typeof r.name === 'string' && r.name ? r.name : undefined;
  const typeId = typeof r.typeId === 'string' ? r.typeId : undefined;
  return { noun, title: name ?? typeId ?? id };
}

const fieldsOf = (...records: unknown[]): string[] => {
  const names = new Set<string>();
  for (const r of records) if (isObj(r)) for (const k of Object.keys(r)) names.add(k);
  return Array.from(names).sort();
};
const get = (r: unknown, f: string): unknown => (isObj(r) ? r[f] : undefined);

/** Compares base, local and remote record by record. */
export function classify(base: Obj, local: Obj, remote: Obj): Classified {
  const b = recordsOf(base);
  const l = recordsOf(local);
  const r = recordsOf(remote);
  const keys = new Set<string>([...b.keys(), ...l.keys(), ...r.keys()]);
  const conflicts: Conflict[] = [];
  let remoteOnly = 0;

  for (const key of Array.from(keys).sort()) {
    const bv = b.get(key);
    const lv = l.get(key);
    const rv = r.get(key);
    const remoteChanged = !deepEqual(bv, rv);
    const localChanged = !deepEqual(bv, lv);
    if (!remoteChanged || deepEqual(lv, rv)) continue; // nothing new from the other device
    if (!localChanged) {
      remoteOnly++;
      continue;
    }

    // Both changed, and differently. Which fields did both sides move to different values?
    let fields: FieldChange[];
    if (isObj(lv) && isObj(rv)) {
      fields = fieldsOf(bv, lv, rv)
        .filter(
          (f) =>
            !deepEqual(get(bv, f), get(lv, f)) &&
            !deepEqual(get(bv, f), get(rv, f)) &&
            !deepEqual(get(lv, f), get(rv, f)),
        )
        .map((f) => ({ field: f, mine: get(lv, f), theirs: get(rv, f) }));
      if (fields.length === 0) {
        remoteOnly++; // different fields of one record: the CRDT kept both
        continue;
      }
    } else if (isObj(lv) || isObj(rv)) {
      // Deleted on one side, edited on the other: list what the surviving side has.
      const kept = isObj(lv) ? lv : rv;
      fields = fieldsOf(kept).map((f) => ({
        field: f,
        mine: get(lv, f),
        theirs: get(rv, f),
      }));
    } else {
      fields = [{ field: 'value', mine: lv, theirs: rv }];
    }
    const { noun, title } = describe(key, lv ?? rv);
    conflicts.push({
      key,
      title,
      noun,
      minePresent: lv !== undefined,
      theirsPresent: rv !== undefined,
      fields,
      mineRecord: lv,
      theirsRecord: rv,
    });
  }
  return { conflicts, remoteOnly };
}

const clone = <T>(v: T): T => (v === undefined ? v : (structuredClone(v) as T));

/**
 * Makes `draft` carry one side's values for a conflicting record (a new change on top of the
 * merge, so the CRDT history stays consistent).
 */
export function applyChoice(draft: Document, conflict: Conflict, side: 'mine' | 'theirs'): void {
  const wanted = side === 'mine' ? conflict.mineRecord : conflict.theirsRecord;
  const target = draft as unknown as Obj;
  const key = conflict.key;
  const slash = key.indexOf('/');
  const collection = slash < 0 ? key : key.slice(0, slash);
  const id = slash < 0 ? '' : key.slice(slash + 1);

  // The container holding this record, and how to read, write and remove it there.
  let container: Obj | unknown[];
  if (collection === 'home' || collection === 'settings') {
    if (wanted === undefined) return; // a singleton cannot be deleted
    const cur = target[collection];
    if (isObj(cur) && isObj(wanted)) patchFields(cur, wanted, conflict);
    else target[collection] = clone(wanted);
    return;
  }
  if (collection === 'household.members' || collection === 'household.pets') {
    container = (draft.household as unknown as Obj)[
      collection.slice('household.'.length)
    ] as unknown[];
    const index = container.findIndex((e) => isObj(e) && e.id === id);
    if (wanted === undefined) {
      if (index >= 0) container.splice(index, 1);
    } else if (index < 0) container.push(clone(wanted));
    else {
      const cur = container[index];
      if (isObj(cur) && isObj(wanted)) patchFields(cur, wanted, conflict);
      else container[index] = clone(wanted);
    }
    return;
  }
  container = target[collection] as Obj;
  if (wanted === undefined) delete container[id];
  else if (isObj(container[id]) && isObj(wanted))
    patchFields(container[id] as Obj, wanted, conflict);
  else container[id] = clone(wanted);
}

/** Sets only the conflicting fields, so changes to other fields that merged cleanly are kept. */
function patchFields(current: Obj, wanted: Obj, conflict: Conflict): void {
  for (const { field } of conflict.fields) {
    if (wanted[field] === undefined) delete current[field];
    else current[field] = clone(wanted[field]);
  }
}
