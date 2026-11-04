import {
  DEFAULT_PACKS,
  SCHEMA_VERSION,
  floorKey,
  type Asset,
  type Document,
  type ItemInstance,
  type Location,
} from '../model';

/**
 * The test household: an invented family in Biggar (ML12), Scotland. Not a real household; it is
 * the owner's situation fuzzed. Ids are fixed (not random) so tests and later phases can name them.
 * `household-biggar.json` is its export; `test/fixtures.test.ts` keeps the two in step.
 *
 * The fixture's "today" is 2026-11-04: best-before dates are in the future of it except the one
 * deliberately expired item named below. Nothing here reads the clock, and neither should a test:
 * tests that depend on dates inject `now` (2026-11-04) into whatever they call.
 */

const ITEMS = 'items-base';
const ASSETS = 'assets-base';
// Items are "added" and the document created on or after this date.
const TODAY = '2026-09-01';
/** The pack versions the fixture was written against (a test checks they are current). */
const PACK_VERSIONS: Record<string, number> = {
  'assets-base': 2,
  'items-base': 3,
  'guidance-grid-free': 2,
  'guidance-uk-prepare': 2,
  'guidance-us-ready': 3,
  regions: 2,
};

const loc = (id: string, name: string, o: Omit<Location, 'id' | 'name'>): Location => ({
  id,
  name,
  ...o,
});
const asset = (
  id: string,
  type: string,
  a: Omit<Asset, 'id' | 'typeId' | 'answers' | 'maintenance'> &
    Partial<Pick<Asset, 'answers' | 'maintenance'>>,
): Asset => ({ id, typeId: `${ASSETS}:${type}`, answers: {}, maintenance: {}, ...a });
const item = (
  id: string,
  type: string,
  qty: number,
  locationId: string,
  bestBefore?: string,
): ItemInstance => ({
  id,
  typeId: `${ITEMS}:${type}`,
  qty,
  locationId,
  ...(bestBefore ? { bestBefore } : {}),
  added: TODAY,
  source: 'manual',
});

export const BIGGAR_IDS = {
  members: {
    alex: 'member-alex',
    sam: 'member-sam',
    robin: 'member-robin',
    jo: 'member-jo',
    pat: 'member-pat',
  },
  pet: 'pet-bramble',
  locations: {
    pantry: 'loc-pantry',
    garage: 'loc-garage',
    attic: 'loc-attic',
    shed: 'loc-shed',
    hall: 'loc-hall',
  },
} as const;

export function biggarDocument(): Document {
  const L = BIGGAR_IDS.locations;
  const locations = [
    loc(L.pantry, 'Pantry', { kind: 'rotating', conditions: ['indoor-stable'], size: 'S' }),
    loc(L.garage, 'Garage', { kind: 'stored', conditions: ['frost', 'damp'], size: 'L' }),
    loc(L.attic, 'Attic', { kind: 'stored', conditions: ['frost', 'heat'], size: 'M' }),
    loc(L.shed, 'Shed', { kind: 'stored', conditions: ['frost', 'damp', 'heat'], size: 'M' }),
    loc(L.hall, 'Hall cupboard', {
      kind: 'stored',
      conditions: ['indoor-stable'],
      size: 'S',
    }),
  ];

  const assets = [
    asset('asset-solar', 'solar-pv', {
      name: 'Roof solar',
      purchased: '2022-05-10',
      answers: { kwp: 4, hasEps: false },
    }),
    asset('asset-battery', 'home-battery', {
      name: 'Home battery',
      purchased: '2023-01-20',
      answers: { kwh: 10, hasEps: false },
    }),
    asset('asset-ev-1', 'ev', { name: 'Family EV', answers: { kwh: 60, v2l: true } }),
    asset('asset-ev-2', 'ev', { name: 'Second EV', answers: { kwh: 77, v2l: true } }),
    asset('asset-bbq', 'gas-bbq', {
      name: 'Gas BBQ',
      locationId: L.shed,
      answers: { bottleKg: 13 },
      maintenance: { 'fuel-rotate': '2025-09-01' },
    }),
    asset('asset-smoke', 'smoke-alarm', {
      name: 'Hall smoke alarm',
      purchased: '2020-03-01',
      maintenance: { test: '2026-01-05' },
    }),
    asset('asset-co', 'co-alarm', {
      name: 'Kitchen CO alarm',
      purchased: '2020-03-01',
      maintenance: { test: '2026-01-05' },
    }),
  ];

  const items = [
    item('item-tinned', 'tinned-food', 3, L.pantry, '2028-06'),
    item('item-pasta', 'dried-pasta', 2, L.pantry, '2027-09'),
    item('item-rice', 'rice-sack', 1, L.pantry, '2027-12'),
    item('item-oats', 'porridge-oats', 1, L.pantry, '2026-12'),
    // The one deliberately expired item: best before 2026-10 is past on the fixture's "today".
    item('item-uht', 'uht-milk', 6, L.pantry, '2026-10'),
    item('item-tea', 'tea-and-sugar', 1, L.pantry, '2027-03'),
    item('item-water', 'water-can', 2, L.garage),
    item('item-first-aid', 'first-aid-kit', 1, L.hall, '2028-01'),
    item('item-torch-1', 'torch-led-200lm', 1, L.hall),
    item('item-torch-2', 'torch-led-200lm', 1, L.pantry),
    item('item-torch-3', 'torch-led-200lm', 1, L.garage),
    item('item-aa', 'aa-cells-8', 1, L.hall, '2031-01'),
    item('item-nappies', 'nappies-size-2', 1, L.hall),
    item('item-lpg', 'lpg-bottle-13kg', 1, L.shed),
  ];

  const M = BIGGAR_IDS.members;
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      env: 'local',
      devices: ['device-fixture'],
      createdAt: '2026-09-01T09:00:00.000Z',
      packVersions: Object.fromEntries(DEFAULT_PACKS.map((id) => [id, PACK_VERSIONS[id] ?? 1])),
    },
    household: {
      members: [
        { id: M.alex, name: 'Alex', dob: '1984-03-12', tags: [], medication: [] },
        { id: M.sam, name: 'Sam', dob: '1986-09-30', tags: [], medication: [] },
        { id: M.robin, name: 'Robin', dob: '2019-05-20', tags: ['child'], medication: [] },
        { id: M.jo, name: 'Jo', dob: '2026-08-01', tags: ['infant'], medication: [] },
        {
          id: M.pat,
          name: 'Pat',
          dob: '1950-11-02',
          tags: ['elderly', 'takes-medication'],
          medication: [
            {
              id: 'med-ramipril',
              name: 'Ramipril',
              dosePerDay: 1,
              unitsOnHand: 21,
              cycleDays: 28,
              critical: true,
            },
          ],
        },
      ],
      pets: [{ id: BIGGAR_IDS.pet, name: 'Bramble', species: 'dog', size: 'M' }],
    },
    home: {
      type: 'detached',
      floors: 2,
      insulation: 'excellent',
      heating: 'heat-pump',
      cooking: 'induction',
      mainsGas: false,
      solar: true,
      homeBattery: true,
      evCharger: true,
      growing: 'small',
      risks: ['storm', 'snow', 'grid'],
      area: 'ML12',
      subregion: 'scotland',
      region: 'UK',
    },
    locations: Object.fromEntries(locations.map((l) => [l.id, l])),
    assets: Object.fromEntries(assets.map((a) => [a.id, a])),
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    floors: {
      [floorKey(L.pantry, `${ITEMS}:tinned-food`)]: 2,
      [floorKey(L.pantry, `${ITEMS}:dried-pasta`)]: 1,
      [floorKey(L.pantry, `${ITEMS}:rice-sack`)]: 1,
      [floorKey(L.pantry, `${ITEMS}:uht-milk`)]: 3,
    },
    plans: {
      'plans-base:meeting-point': { doneAt: '2026-01-20' },
      'plans-base:documents': { note: 'Passports scanned, not printed yet' },
    },
    reviews: {},
    settings: {
      horizonDays: 3,
      region: 'UK',
      packs: [...DEFAULT_PACKS],
      reviewCadenceMonths: 6,
      anonymise: false,
    },
  };
}
