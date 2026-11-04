import * as Y from 'yjs';
import { traceSteps, type MigrationStep } from '../model';
import { hash32 } from './init';
import { sortKeys } from './yconvert';

/**
 * Containers a migration step creates are written under a fixed client id.
 *
 * The same race as a first run (see `init.ts`): two replicas that both run a step that adds
 * `contacts: {}` before they sync would otherwise each create a rival `contacts` map, and after
 * the merge only one map, and so one device's records, survives. So the *empty containers* a step
 * creates are written under a client id that is a hash of the step (name and versions) and of the
 * containers it creates. Every replica writes the same operations, which merge as one. The
 * records inside them are written normally, under the device's own id.
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

/** The client id for the containers one step creates: a hash of the step and of what it makes. */
export function stepClientId(step: MigrationStep, created: Created[]): number {
  const wanted = [...created].sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
  return hash32(
    JSON.stringify(sortKeys({ name: step.name, from: step.from, to: step.to, created: wanted })),
  );
}

/**
 * Before a brought-forward document is written back, creates the containers the steps make, each
 * step's under its own fixed client id. Containers already in the document are left alone.
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
      const created = createdContainers(input, output);
      const missing = created.filter((c) => {
        const at = locate(root, c.path);
        return at !== undefined && at.parent.get(at.key) === undefined;
      });
      if (missing.length === 0) continue;
      ydoc.clientID = stepClientId(step, created);
      ydoc.transact(() => {
        for (const c of missing) {
          const at = locate(root, c.path);
          if (at && at.parent.get(at.key) === undefined) at.parent.set(at.key, toYShape(c.shape));
        }
      }, 'reconcile');
    }
  } finally {
    ydoc.clientID = real;
  }
}
