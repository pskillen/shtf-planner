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
  'guidance-grid-free': 4,
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
    checklistRuns: {
      // Invented incident. The frozen catalogue is trimmed to 8 steps (real ones would be about 100).
      'run-flood-oct-2026': {
        id: 'run-flood-oct-2026',
        scenarios: ['checklists-uk:flood'],
        started: '2026-10-19T17:40:00.000Z',
        finished: '2026-10-20T08:30:00.000Z',
        catalogue: {
          packs: [{ id: 'checklists-uk', version: 5 }],
          scenarios: [
            { id: 'checklists-uk:power-cut', name: 'Power cut' },
            { id: 'checklists-uk:storm', name: 'Storm' },
            { id: 'checklists-uk:flood', name: 'Flood' },
            { id: 'checklists-uk:heatwave', name: 'Heatwave' },
            { id: 'checklists-uk:evacuation', name: 'Evacuation' },
          ],
          steps: [
            {
              id: 'checklists-uk:flood-risk',
              packId: 'checklists-uk',
              text: 'Check your long-term flood risk: England (GOV.UK), Wales (Natural Resources Wales), Scotland (SEPA) or Northern Ireland (nidirect).',
              phase: 'coming',
              order: 10,
              scenarios: ['checklists-uk:flood'],
              source: 'https://beready.campaign.gov.uk/be-informed-about-hazards/flooding/',
              sourceTitle: 'Be Ready (UK Government): flooding',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-warnings-signup',
              packId: 'checklists-uk',
              text: 'Sign up for free flood warnings by phone, text or email (England, Scotland, Wales): call Floodline on 0345 988 1188 (24 hours), or sign up online with the Environment Agency (England), SEPA (Scotland) or Natural Resources Wales. In England, you cannot get warnings for surface water (flash) flooding.',
              phase: 'coming',
              order: 20,
              scenarios: ['checklists-uk:flood'],
              source: 'https://www.gov.uk/get-flood-warnings',
              sourceTitle: 'GOV.UK: get flood warnings (England; points to Scotland and Wales)',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-shutoffs',
              packId: 'checklists-uk',
              text: 'Find out how to turn off your gas, electricity and water. They are in different places in different homes: usually the water stop tap where the supply comes in, the gas valve by the gas meter, and the electricity cut-off on the fuse board.',
              phase: 'coming',
              order: 100,
              scenarios: ['checklists-uk:flood', 'checklists-uk:evacuation'],
              source: 'https://beready.campaign.gov.uk/be-informed-about-hazards/flooding/',
              sourceTitle: 'Be Ready (UK Government): flooding',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-valuables',
              packId: 'checklists-uk',
              text: 'Move sentimental or valuable items upstairs or to a high place. Keep important documents, such as birth certificates, in resealable waterproof plastic bags.',
              phase: 'coming',
              order: 90,
              scenarios: ['checklists-uk:flood'],
              source: 'https://beready.campaign.gov.uk/be-informed-about-hazards/flooding/',
              sourceTitle: 'Be Ready (UK Government): flooding',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-warning-turn-off',
              packId: 'checklists-uk',
              text: 'If a flood warning is issued or flooding is about to reach your home, turn off your gas, electricity and water if it is safe to do so. Do not touch plugs or other sources of electricity when standing in flood water.',
              phase: 'immediate',
              order: 20,
              scenarios: ['checklists-uk:flood'],
              source: 'https://naturalresources.wales/flooding/what-to-do-in-a-flood/?lang=en',
              sourceTitle: 'Natural Resources Wales: what to do in a flood',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-no-walk',
              packId: 'checklists-uk',
              text: 'Never walk through flood water. It can be much deeper than it looks and may contain sewage and hide rubbish, wreckage, uneven roads and pavements, sharp objects, or uncovered and broken drain and manhole covers. Levels can rise and fall for several weeks. If you absolutely must enter it, move slowly and carefully and avoid fast-moving water.',
              phase: 'immediate',
              order: 55,
              scenarios: ['checklists-uk:flood'],
              source: 'https://beready.campaign.gov.uk/be-informed-about-hazards/flooding/',
              sourceTitle: 'Be Ready (UK Government): flooding',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-return-home',
              packId: 'checklists-uk',
              text: 'Only return home when the emergency services say it is safe.',
              phase: 'first-days',
              order: 40,
              scenarios: ['checklists-uk:flood', 'checklists-uk:evacuation'],
              source: 'https://ready.campaign.gov.scot/flooding',
              sourceTitle: 'Ready Scotland: flooding',
              sourceChecked: '2026-11-08',
            },
            {
              id: 'checklists-uk:flood-electric-after',
              packId: 'checklists-uk',
              text: 'Do not switch your electricity back on until a qualified person has checked it.',
              phase: 'first-days',
              order: 50,
              scenarios: ['checklists-uk:flood'],
              source: 'https://ready.campaign.gov.scot/flooding',
              sourceTitle: 'Ready Scotland: flooding',
              sourceChecked: '2026-11-08',
            },
          ],
        },
      },
    },
    checklistStepStates: {
      'run-flood-oct-2026|checklists-uk:flood-risk': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-risk',
        doneAt: '2026-10-19T17:52:00.000Z',
      },
      'run-flood-oct-2026|checklists-uk:flood-warnings-signup': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-warnings-signup',
        doneAt: '2026-10-19T17:55:00.000Z',
        note: 'Signed up both our mobiles; Sam is on the landline list too',
      },
      'run-flood-oct-2026|checklists-uk:flood-shutoffs': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-shutoffs',
        doneAt: '2026-10-19T18:20:00.000Z',
        note: 'Stopcock is under the kitchen sink',
      },
      'run-flood-oct-2026|checklists-uk:flood-valuables': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-valuables',
        doneAt: '2026-10-19T18:45:00.000Z',
      },
      'run-flood-oct-2026|checklists-uk:flood-warning-turn-off': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-warning-turn-off',
        doneAt: '2026-10-19T19:10:00.000Z',
      },
      'run-flood-oct-2026|checklists-uk:flood-no-walk': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-no-walk',
        note: 'Burn stayed in its banks; we did not need to go out',
      },
      'run-flood-oct-2026|checklists-uk:flood-return-home': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-return-home',
      },
      'run-flood-oct-2026|checklists-uk:flood-electric-after': {
        runId: 'run-flood-oct-2026',
        stepId: 'checklists-uk:flood-electric-after',
      },
    },
    settings: {
      horizonDays: 3,
      region: 'UK',
      packs: [...DEFAULT_PACKS],
      reviewCadenceMonths: 6,
      anonymise: false,
    },
  };
}

/** Invented equipment scenario: a confirmed butane heater alongside the propane BBQ. */
export function biggarFuelDocument(): Document {
  const doc = biggarDocument();
  doc.assets['asset-butane-heater'] = asset('asset-butane-heater', 'cabinet-heater', {
    name: 'Butane heater',
    locationId: BIGGAR_IDS.locations.garage,
    answers: {
      setting: '1.3 kW',
      chosenLpg: 'items-base:butane-bottle',
      fuelConfirmed: true,
      indoorUse: 'permitted',
      highRise: 'no',
    },
  });
  doc.products['prod-butane'] = product('prod-butane', 'Butane 15 kg', 'butane-bottle', {
    amount: 15,
    unit: 'kg',
  });
  doc.stock['stock-butane'] = stock('stock-butane', 'prod-butane', 1, BIGGAR_IDS.locations.garage);
  return doc;
}
