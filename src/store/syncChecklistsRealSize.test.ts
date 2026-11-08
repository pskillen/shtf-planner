import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentSchema, type ChecklistRun, type Document } from '../model';
import checklistsUk from '../packs/data/checklists-uk.json';
import { openStore, type DocumentStore } from './documentStore';
import { createFakeCloud, type FakeCloud, type FakePort } from './fakeDrive';
import { createSync, type Sync, type SyncHost } from './sync';
import { createMemoryPersistence } from './syncPersistence';

/**
 * The storage contract for checklist runs, at the size phase 11 will really write: a run holding
 * every step of the bundled `checklists-uk` pack, with a state record for each, synced by three
 * devices through the real `createSync` engine over the fake Drive. `src/store` cannot import the
 * engine, so the skeleton below is built here from the pack JSON the way starting a run will.
 */

const pack = checklistsUk;
const SCENARIOS = pack.scenarios.map((s) => s.id);
const STEP_IDS = pack.steps.map((s) => s.id);
const RUN = 'run-1';
const key = (stepId: string) => `${RUN}|${stepId}`;
const at = (n: number) => new Date(Date.UTC(2026, 5, 1, 12, 0, n)).toISOString();

function skeleton(scenarios: string[]): Pick<Document, 'checklistRuns' | 'checklistStepStates'> {
  const run: ChecklistRun = {
    id: RUN,
    scenarios,
    started: at(0),
    catalogue: {
      packs: [{ id: pack.id, version: pack.version }],
      scenarios: pack.scenarios.map((s) => ({ id: s.id, name: s.name })),
      steps: pack.steps.map((s) => ({
        id: s.id,
        packId: pack.id,
        text: s.text,
        phase: s.phase as ChecklistRun['catalogue']['steps'][number]['phase'],
        order: s.order,
        scenarios: [...s.scenarios],
        source: s.source,
      })),
    },
  };
  return {
    checklistRuns: { [RUN]: run },
    checklistStepStates: Object.fromEntries(
      STEP_IDS.map((id) => [key(id), { runId: RUN, stepId: id }]),
    ),
  };
}

const host: SyncHost = { isOnline: () => true, isVisible: () => true, on: () => () => {} };
const opened: Array<{ store: DocumentStore; sync: Sync }> = [];
afterEach(async () => {
  for (const { store, sync } of opened.splice(0)) {
    sync.stop();
    await store.close();
  }
});

let counter = 0;
async function device(cloud: FakeCloud) {
  const name = `real-size-${++counter}-${Math.random().toString(36).slice(2)}`;
  const store = await openStore({ name, env: 'local', deviceId: name, channel: false });
  const port: FakePort = cloud.port();
  let t = Date.UTC(2026, 5, 2);
  const sync = createSync({
    store,
    drive: port,
    persistence: createMemoryPersistence(),
    env: 'local',
    host,
    now: () => (t += 1000),
    debounceMs: 5,
    retryMs: 10_000_000,
  });
  opened.push({ store, sync });
  await sync.start();
  return { store, sync, port };
}
type Device = Awaited<ReturnType<typeof device>>;

type Answer = 'mine' | 'theirs';

/** Everyone pulls and pushes in turn, answering any question their way; returns questions per round. */
async function rounds(devices: Device[], answer: (i: number) => Answer, n: number) {
  const questions: number[] = [];
  for (let r = 0; r < n; r++) {
    let asked = 0;
    for (const [i, d] of devices.entries()) {
      await d.sync.checkDrive();
      const pending = d.sync.state().conflicts;
      asked += pending.length;
      if (pending.length > 0) {
        await d.sync.resolveConflicts(Object.fromEntries(pending.map((c) => [c.key, answer(i)])));
      }
      await d.sync.flush();
    }
    questions.push(asked);
  }
  return questions;
}

const POLICIES: Array<[string, (i: number) => Answer]> = [
  ['everyone keeps their own', () => 'mine'],
  ['everyone takes the other copy', () => 'theirs'],
  ['a mix of answers', (i) => (i % 2 ? 'mine' : 'theirs')],
];

describe('three devices working one full-size checklist run through Drive', () => {
  for (const [name, answer] of POLICIES) {
    it(`loses nothing, stays valid and stops asking (${name})`, async () => {
      const cloud = createFakeCloud();
      const [a, b, c] = [await device(cloud), await device(cloud), await device(cloud)];
      a.store.change('start run', (d) => Object.assign(d, skeleton([SCENARIOS[0]!])));
      await a.sync.connect();
      await b.sync.connect();
      await c.sync.connect();
      expect(Object.keys(b.store.get().checklistStepStates)).toHaveLength(STEP_IDS.length);

      for (const d of [a, b, c]) d.port.offline = true;
      // Overlapping ticks at different times (steps 5-14, 8-17, 10-12), one note written on two
      // devices, a scenario added by each of two, and a finish on the third.
      const tick = (d: Device, from: number, to: number, base: number) =>
        d.store.change('tick', (doc) => {
          for (let i = from; i <= to; i++) {
            doc.checklistStepStates[key(STEP_IDS[i]!)]!.doneAt = at(base + i);
          }
        });
      tick(a, 5, 14, 10);
      tick(b, 8, 17, 100);
      tick(c, 10, 12, 200);
      a.store.change('note', (d) => {
        d.checklistStepStates[key(STEP_IDS[5]!)]!.note = 'from a';
        d.checklistRuns[RUN]!.scenarios.push(SCENARIOS[1]!);
      });
      b.store.change('note', (d) => {
        d.checklistStepStates[key(STEP_IDS[5]!)]!.note = 'from b';
        d.checklistRuns[RUN]!.scenarios.push(SCENARIOS[2]!);
      });
      c.store.change('finish', (d) => {
        d.checklistRuns[RUN]!.finished = at(300);
      });
      for (const d of [a, b, c]) d.port.offline = false;

      const asked = await rounds([a, b, c], answer, 4);

      // The conflicting note is asked about once; answered, nothing comes back.
      expect(asked[0]).toBeGreaterThan(0);
      expect(asked.slice(2)).toEqual([0, 0]);
      expect(a.store.export()).toBe(b.store.export());
      expect(a.store.export()).toBe(c.store.export());
      const doc = a.store.get();
      expect(DocumentSchema.safeParse(doc).success).toBe(true);

      // Nothing lost: every tick, the finish, every state and the whole catalogue.
      for (let i = 5; i <= 17; i++) {
        expect(doc.checklistStepStates[key(STEP_IDS[i]!)]!.doneAt).toBeDefined();
      }
      expect(['from a', 'from b']).toContain(doc.checklistStepStates[key(STEP_IDS[5]!)]!.note);
      expect(doc.checklistRuns[RUN]!.finished).toBe(at(300));
      expect(Object.keys(doc.checklistStepStates)).toHaveLength(STEP_IDS.length);
      expect(doc.checklistRuns[RUN]!.catalogue.steps).toHaveLength(STEP_IDS.length);
      expect(doc.checklistRuns[RUN]!.scenarios).toContain(SCENARIOS[0]);
    });
  }
});
