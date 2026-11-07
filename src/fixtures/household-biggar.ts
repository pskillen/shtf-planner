import {
  DEFAULT_PACKS,
  SCHEMA_VERSION,
  minimumKey,
  type Asset,
  type Document,
  type Location,
  type Product,
  type Size,
  type Stock,
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
  'assets-base': 6,
  'items-base': 9,
  'guidance-grid-free': 3,
  'guidance-uk-prepare': 3,
  'guidance-us-ready': 4,
  regions: 3,
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
const product = (
  id: string,
  name: string,
  itemId: string | undefined,
  size: Size,
  labelKcalPer100?: number,
): Product => ({
  id,
  name,
  ...(itemId ? { itemId: `${ITEMS}:${itemId}` } : {}),
  size,
  ...(labelKcalPer100 !== undefined ? { labelKcalPer100 } : {}),
  added: TODAY,
});
const stock = (
  id: string,
  productId: string,
  qty: number,
  locationId: string,
  bestBefore?: string,
): Stock => ({
  id,
  productId,
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
      answers: { bottleKg: 13, chosenLpg: 'items-base:propane-bottle', fuelConfirmed: true },
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

  const g = (amount: number): Size => ({ amount, unit: 'g' });
  const piece = (amount = 1): Size => ({ amount, unit: 'pieces' });
  const products = [
    product('prod-beans', 'Test beans 415 g', 'baked-beans', g(415), 75),
    product('prod-soup', 'Tomato soup 400 g', 'tinned-soup', g(400)),
    product('prod-pasta', 'Fusilli 500 g', 'dried-pasta', g(500)),
    product('prod-rice', 'Rice 10 kg sack', 'rice', { amount: 10, unit: 'kg' }),
    product('prod-oats', 'Porridge oats 1 kg', 'porridge-oats', { amount: 1, unit: 'kg' }),
    product('prod-uht', 'UHT milk 6 × 1 L', 'uht-milk', { count: 6, amount: 1, unit: 'L' }),
    product('prod-spread', 'Test spread 400 g', 'peanut-butter', g(400)),
    product('prod-water', 'Spring water 6 × 2 L', 'bottled-water', {
      count: 6,
      amount: 2,
      unit: 'L',
    }),
    product('prod-can', 'Water can 10 L', 'water-container', { amount: 10, unit: 'L' }),
    product('prod-first-aid', 'First aid kit', 'first-aid-kit', piece()),
    product('prod-torch', 'LED torch', 'torch-aa', piece()),
    product('prod-aa', 'AA cells 8-pack', 'aa-cells', piece(8)),
    product('prod-nappies', 'Nappies size 2, 50', 'nappies-size-2', piece(50)),
    product('prod-propane', 'Propane 13 kg', 'propane-bottle', { amount: 13, unit: 'kg' }),
    // Counts towards nothing: kept and listed, scores nothing.
    product('prod-twine', 'Garden twine', undefined, piece()),
  ];

  const stocks = [
    stock('stock-beans', 'prod-beans', 12, L.pantry, '2028-06'),
    stock('stock-soup', 'prod-soup', 6, L.pantry, '2027-11'),
    stock('stock-pasta', 'prod-pasta', 4, L.pantry, '2027-09'),
    stock('stock-pasta-attic', 'prod-pasta', 6, L.attic, '2028-01'),
    stock('stock-rice', 'prod-rice', 1, L.pantry, '2027-12'),
    stock('stock-oats', 'prod-oats', 1.5, L.pantry, '2026-12'),
    // The one deliberately expired item: best before 2026-10 is past on the fixture's "today".
    stock('stock-uht', 'prod-uht', 1, L.pantry, '2026-10'),
    stock('stock-spread', 'prod-spread', 2, L.pantry, '2027-06'),
    stock('stock-water', 'prod-water', 3, L.garage, '2027-08'),
    stock('stock-can', 'prod-can', 2, L.garage),
    stock('stock-first-aid', 'prod-first-aid', 1, L.hall, '2028-01'),
    stock('stock-torch-1', 'prod-torch', 1, L.hall),
    stock('stock-torch-2', 'prod-torch', 1, L.pantry),
    stock('stock-torch-3', 'prod-torch', 1, L.garage),
    stock('stock-aa', 'prod-aa', 1, L.hall, '2031-01'),
    stock('stock-nappies', 'prod-nappies', 1, L.hall),
    stock('stock-propane', 'prod-propane', 1, L.shed),
    stock('stock-twine', 'prod-twine', 1, L.shed),
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
    products: Object.fromEntries(products.map((p) => [p.id, p])),
    barcodes: {
      // A known barcode for the e2e: a made-up display name on a product of a real pack item.
      '3017620422003': { productId: 'prod-spread', seen: '2026-10-01' },
    },
    stock: Object.fromEntries(stocks.map((x) => [x.id, x])),
    scans: {},
    minimums: {
      [minimumKey(L.pantry, `${ITEMS}:baked-beans`)]: 6,
      [minimumKey(L.pantry, `${ITEMS}:dried-pasta`)]: 2,
      [minimumKey(L.pantry, `${ITEMS}:rice`)]: 1,
      [minimumKey(L.pantry, `${ITEMS}:uht-milk`)]: 1,
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
