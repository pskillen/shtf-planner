import * as Y from 'yjs';
import { traceSteps, type MigrationStep } from '../model';
import { hash32 } from './init';
import { sortKeys } from './yconvert';

/**
 * Containers a migration step creates are written under a fixed client id.
 *
 * The same race as a first run (see `init.ts`): two replicas that both run a step that adds
 * `contacts: {}` before they sync would otherwise each create a rival `contacts` map, and after
 * the merge only one map, and so one device's records, survives. So each *empty container* a step
 * creates is written, in its own transaction, under a client id that is a hash of the step (name
 * and versions) and of that container (its path and initial shape). Every replica writes the same
 * operations for it, which merge as one, whatever else each replica holds: a container inside a
 * record (`assets.<id>.maintenance`) agrees wherever the record exists. The records inside the
 * containers are written normally, under the device's own id.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The empty skeleton of a container: objects keep their nested containers, arrays are `[]`. */
export type Shape = { [key: string]: Shape } | [];

function shapeOf(value: unknown): Shape {
  if (Array.isArray(value)) return [];
  const out: { [key: string]: Shape } = {};
  for (const [k, v] of Object.entries(value as Obj)) {
    if (Array.isArray(v) || isObj(v)) out[k] = shapeOf(v);
  }
  return out;
}

export interface Created {
  path: string[];
  shape: Shape;
}

/** The containers present in `after` at a path where `before` has nothing, outermost only. */
export function createdContainers(before: unknown, after: unknown, path: string[] = []): Created[] {
  if (!isObj(after)) return [];
  const out: Created[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (!Array.isArray(value) && !isObj(value)) continue;
    const prev = isObj(before) ? before[key] : undefined;
    if (prev === undefined) out.push({ path: [...path, key], shape: shapeOf(value) });
    else if (isObj(value) && isObj(prev))
      out.push(...createdContainers(prev, value, [...path, key]));
  }
  return out;
}

function toYShape(shape: Shape): Y.Map<unknown> | Y.Array<unknown> {
  if (Array.isArray(shape)) return new Y.Array<unknown>();
  const map = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(shape)) map.set(k, toYShape(v));
  return map;
}

/** The Yjs parent map and key for `path`, or undefined when the parent is missing. */
function locate(
  root: Y.Map<unknown>,
  path: string[],
): { parent: Y.Map<unknown>; key: string } | undefined {
  let node: unknown = root;
  for (const k of path.slice(0, -1)) {
    if (!(node instanceof Y.Map)) return undefined;
    node = node.get(k);
  }
  return node instanceof Y.Map ? { parent: node, key: path[path.length - 1]! } : undefined;
}

/**
 * The client id for one container a step creates: a hash of the step (name, versions) and of that
 * container alone (its path and initial shape). It never depends on which other containers the
 * replica happens to create, so replicas holding different record sets still agree.
 */
export function stepClientId(step: MigrationStep, created: Created): number {
  return hash32(
    JSON.stringify(
      sortKeys({
        name: step.name,
        from: step.from,
        to: step.to,
        path: created.path,
        shape: created.shape,
      }),
    ),
  );
}

/**
 * Before a brought-forward document is written back, creates the containers the steps make, each
 * in its own transaction under its own fixed client id. Containers already in the document are
 * left alone.
 */
export function ensureStepContainers(
  ydoc: Y.Doc,
  root: Y.Map<unknown>,
  plain: unknown,
  steps: readonly MigrationStep[],
  target: number,
): void {
  const real = ydoc.clientID;
  try {
    for (const { step, input, output } of traceSteps(plain, steps, target)) {
      for (const c of createdContainers(input, output)) {
        const at = locate(root, c.path);
        if (!at || at.parent.get(at.key) !== undefined) continue;
        ydoc.clientID = stepClientId(step, c);
        ydoc.transact(() => at.parent.set(at.key, toYShape(c.shape)), 'reconcile');
      }
    }
  } finally {
    ydoc.clientID = real;
  }
}
