// Deterministic household document for the spike B measurements.
export type Member = { id: string; name: string; dob: string; tags: string[]; meds: { name: string; perDay: number; onHand: number }[] };
export type Pet = { id: string; name: string; species: string };
export type Location = { id: string; name: string; kind: 'rotating' | 'stored'; conditions: string[]; size: 'S' | 'M' | 'L' };
export type Asset = { id: string; typeId: string; locationId: string; purchased?: string; answers: Record<string, string | boolean | number> };
export type ItemInstance = { id: string; typeId: string; qty: number; locationId: string; bestBefore?: string; added: string };
export type Review = { id: string; started: string; finished?: string; resolved: string[] };
export type Doc = {
  meta: { schemaVersion: number; env: string };
  household: { members: Member[]; pets: Pet[] };
  home: { locations: Location[]; assets: Asset[] };
  items: Record<string, ItemInstance>;
  floors: Record<string, number>;
  plans: Record<string, { doneAt?: string }>;
  reviews: Review[];
};

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];
export const uid = (r: () => number, n = 12) =>
  Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
const day = (r: () => number) =>
  new Date(Date.UTC(2024, 0, 1) + Math.floor(r() * 900) * 86400000).toISOString().slice(0, 10);

export function generateDoc(seed = 42, env = 'dev', schemaVersion = 1): Doc {
  const r = rng(seed);
  const names = ['Alex', 'Sam', 'Jo', 'Robin', 'Kit'];
  const locs: Location[] = ['Kitchen', 'Pantry', 'Garage', 'Loft', 'Utility', 'Bug-out bag'].map((n, i) => ({
    id: uid(r),
    name: n,
    kind: i < 2 ? 'rotating' : 'stored',
    conditions: i === 3 ? ['dry', 'hot'] : ['dry'],
    size: pick(r, ['S', 'M', 'L'] as const),
  }));
  const doc: Doc = {
    meta: { schemaVersion, env },
    household: {
      members: names.map((n) => ({
        id: uid(r),
        name: n,
        dob: day(r),
        tags: ['adult'],
        meds: r() < 0.4 ? [{ name: 'Med ' + n, perDay: 2, onHand: 30 + Math.floor(r() * 60) }] : [],
      })),
      pets: [{ id: uid(r), name: 'Biscuit', species: 'dog' }],
    },
    home: {
      locations: locs,
      assets: Array.from({ length: 20 }, () => ({
        id: uid(r),
        typeId: pick(r, ['stove', 'torch', 'radio', 'filter', 'generator']),
        locationId: pick(r, locs).id,
        purchased: day(r),
        answers: { fuel: pick(r, ['gas', 'electric']), working: r() < 0.9, litres: Math.floor(r() * 20) },
      })),
    },
    items: {},
    floors: {},
    plans: {},
    reviews: [],
  };
  const types = Array.from({ length: 60 }, () => uid(r, 8));
  for (let i = 0; i < 1000; i++) {
    const id = uid(r);
    doc.items[id] = { id, typeId: pick(r, types), qty: 1 + Math.floor(r() * 12), locationId: pick(r, locs).id, bestBefore: day(r), added: day(r) };
  }
  for (let i = 0; i < 40; i++) doc.floors[uid(r, 8)] = Math.floor(r() * 30);
  for (let i = 0; i < 100; i++) doc.plans[uid(r, 8)] = r() < 0.5 ? { doneAt: day(r) } : {};
  for (let i = 0; i < 100; i++)
    doc.reviews.push({ id: uid(r), started: day(r), finished: day(r), resolved: Array.from({ length: 10 }, () => uid(r, 8)) });
  return doc;
}
