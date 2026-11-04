import { describe, expect, it } from 'vitest';
import { biggarDocument, BIGGAR_IDS } from '../fixtures/household-biggar';
import type { Asset, Document, ItemInstance } from '../model';
import { bundledPacks } from '../packs/bundled';
import { coverage, type Coverage } from './coverage';

const NOW = '2026-11-15';
const packs = bundledPacks();
const cov = (doc: Document, id: string, asOf = NOW, days = 3): Coverage => {
  const c = coverage(doc, packs, asOf, days).find((x) => x.targetId === id);
  if (!c) throw new Error(`no coverage row ${id}`);
  return c;
};

const asset = (id: string, type: string, answers: Asset['answers'] = {}, name?: string): Asset => ({
  id,
  typeId: `assets-base:${type}`,
  answers,
  maintenance: {},
  ...(name ? { name } : {}),
});
const item = (
  id: string,
  type: string,
  qty: number,
  locationId: string,
  bestBefore?: string,
): ItemInstance => ({
  id,
  typeId: `items-base:${type}`,
  qty,
  locationId,
  ...(bestBefore ? { bestBefore } : {}),
  added: '2026-09-01',
  source: 'manual',
});
const L = BIGGAR_IDS.locations;

/** The fixture without the BBQ and its bottle, so fuel and cooking can be set up by the test. */
function bare(): Document {
  const doc = biggarDocument();
  delete doc.assets['asset-bbq'];
  delete doc.items['item-lpg'];
  return doc;
}

describe('coverage: stores from items', () => {
  it('counts a rotating location at its floor, not at what is there', () => {
    const food = cov(biggarDocument(), 'food:foodKcal');
    // 3 tins held, a floor of 2: counted at 2 x 14,000 kcal
    const tins = food.from.find((s) => s.id === `${L.pantry}|items-base:tinned-food`)!;
    expect(tins).toMatchObject({ kind: 'floor', amount: 28000 });
    expect(tins.note).toMatch(/floor of 2, 3 held/);
  });

  it('does not rely on a rotating location with no floor for the type', () => {
    const food = cov(biggarDocument(), 'food:foodKcal');
    const oats = food.from.find((s) => s.id === `${L.pantry}|items-base:porridge-oats`)!;
    expect(oats.amount).toBe(0);
    expect(oats.note).toMatch(/no floor/);
    // the torch in the pantry has no floor either: only the hall and garage torches count
    const light = cov(biggarDocument(), 'light:lumenHours');
    expect(light.amount).toBe(4000);
  });

  it('counts a stored location at what is there', () => {
    expect(cov(biggarDocument(), 'water:waterL').amount).toBe(20);
  });

  it('counts an expired instance as zero and lists it as expired', () => {
    const doc = biggarDocument();
    const food = cov(doc, 'food:foodKcal');
    expect(food.from.find((s) => s.id === 'item-uht')).toMatchObject({ amount: 0, expired: true });
    // the same milk, in date, would count: 6 held at a floor of 3 x 640 kcal
    doc.items['item-uht']!.bestBefore = '2026-12';
    expect(cov(doc, 'food:foodKcal').amount - food.amount).toBe(3 * 640);
    // best before this month is still in date
    doc.items['item-uht']!.bestBefore = '2026-11';
    expect(cov(doc, 'food:foodKcal').amount - food.amount).toBe(3 * 640);
  });

  it('counts a nappy size only while it fits someone in the household', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'sanitation:nappies').amount).toBe(50); // size 2 fits 3 months
    const later = cov(doc, 'sanitation:nappies', '2027-05-15');
    expect(later.amount).toBe(0); // 9 months: size 2 is 3-6
    expect(later.from[0]!.note).toMatch(/does not fit/);
    doc.items['item-n3'] = item('item-n3', 'nappies-size-3', 2, L.hall);
    expect(cov(doc, 'sanitation:nappies', '2027-05-15').amount).toBe(100);
  });

  it('counts a radio by its asset, and a stock row of the same radio type counts nothing', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'comms:radio').amount).toBe(0);
    // A radio with no equipment type of its own is still a stock item.
    doc.items['item-sw'] = item('item-sw', 'shortwave-receiver', 1, L.hall);
    expect(cov(doc, 'comms:radio').amount).toBe(1);
    delete doc.items['item-sw'];
    // The wind-up radio is equipment: a stock row of it is not counted (and says why).
    doc.items['item-radio'] = item('item-radio', 'wind-up-radio', 1, L.hall);
    expect(cov(doc, 'comms:radio').amount).toBe(0);
    expect(
      cov(doc, 'comms:radio')
        .from.map((s) => s.note)
        .join(' '),
    ).toMatch(/equipment/);
    delete doc.items['item-radio'];
    doc.assets['asset-radio'] = asset('asset-radio', 'wind-up-radio');
    expect(cov(doc, 'comms:radio')).toMatchObject({ amount: 1, from: [{ kind: 'asset' }] });
  });

  it('counts a handheld or mobile radio once: an asset plus a stock row is one radio', () => {
    for (const [type, assetType] of [
      ['dual-band-handheld', 'handheld-radio'],
      ['cb-rig', 'handheld-radio'],
      ['mobile-rig', 'radio-station'],
      ['hf-station', 'radio-station'],
    ] as const) {
      const doc = biggarDocument();
      doc.items['item-r'] = item('item-r', type, 1, L.hall);
      expect(cov(doc, 'comms:radio').amount, `${type} as stock`).toBe(0);
      doc.assets['asset-r'] = asset('asset-r', assetType);
      expect(cov(doc, 'comms:radio').amount, `${type} with its asset`).toBe(1);
    }
  });

  it('does not count a leisure battery twice, as stock and as equipment', () => {
    const doc = biggarDocument();
    const before = cov(doc, 'power:batteryWh').amount;
    doc.assets['asset-lb'] = asset('asset-lb', 'leisure-battery', { ah: 110 });
    const once = cov(doc, 'power:batteryWh').amount;
    expect(once).toBeGreaterThan(before);
    // The same battery also entered as a stock row adds nothing.
    doc.items['item-lb'] = item('item-lb', 'leisure-battery', 1, L.garage);
    expect(cov(doc, 'power:batteryWh').amount).toBe(once);
  });

  it('leaves a type out of the coverage when none of it is left', () => {
    const doc = biggarDocument();
    delete doc.items['item-uht'];
    expect(cov(doc, 'food:foodKcal').from.find((s) => s.id.includes('uht'))).toBeUndefined();
  });
});

describe('coverage: assets as converters', () => {
  it('gives nothing for solar and a home battery without an EPS, and says so', () => {
    const power = cov(biggarDocument(), 'power:batteryWh');
    expect(power.blocked).toMatch(/Roof solar gives nothing in an outage/);
    expect(power.blocked).toMatch(/Home battery gives nothing in an outage/);
    expect(power.blockedAssets!.map((b) => b.assetId)).toEqual(['asset-solar', 'asset-battery']);
    expect(power.from.map((s) => s.id)).not.toContain('asset-solar');
    expect(power.from.map((s) => s.id)).not.toContain('asset-battery');
  });

  it('counts the EVs with vehicle-to-load as power, and names them', () => {
    const power = cov(biggarDocument(), 'power:batteryWh');
    const evs = power.from.filter((s) => s.kind === 'asset');
    expect(evs.map((s) => s.id)).toEqual(['asset-ev-1', 'asset-ev-2']);
    expect(evs.map((s) => s.amount)).toEqual([60 * 1000 * 0.5, 77 * 1000 * 0.5]);
    // plus the AA cells in the hall
    expect(power.amount).toBe(30000 + 38500 + 26);
  });

  it('counts solar and the battery once an EPS is fitted', () => {
    const doc = biggarDocument();
    doc.assets['asset-solar']!.answers.hasEps = true;
    doc.assets['asset-battery']!.answers.hasEps = true;
    const power = cov(doc, 'power:batteryWh');
    expect(power.blocked).toBeUndefined();
    const solar = power.from.find((s) => s.id === 'asset-solar')!;
    const battery = power.from.find((s) => s.id === 'asset-battery')!;
    expect(solar.amount).toBe(4 * 800 * 3); // 4 kWp x 800 Wh x 3 days
    expect(battery.amount).toBe(10 * 1000 * 0.9);
  });

  it('does not count an EV without vehicle-to-load as power', () => {
    const doc = biggarDocument();
    doc.assets['asset-ev-1']!.answers.v2l = false;
    expect(cov(doc, 'power:batteryWh').from.map((s) => s.id)).not.toContain('asset-ev-1');
    expect(cov(doc, 'power:batteryWh').blockedAssets!.map((b) => b.assetId)).toContain(
      'asset-ev-1',
    );
  });

  it('turns the BBQ bottle into cooking hours and nothing for heat', () => {
    const doc = biggarDocument();
    const cooking = cov(doc, 'cooking:hours');
    expect(cooking.amount).toBeCloseTo(13 / 0.3); // 13 kg at 0.3 kg an hour
    expect(cooking.from[0]).toMatchObject({ kind: 'asset', id: 'asset-bbq' });
    expect(cooking.days).toBeCloseTo(13 / 0.3 / (7.5 / 3));
    expect(cov(doc, 'heat:hours').amount).toBe(0);
  });

  it('gives heat from a cabinet heater and 30 kg of gas: days = kg / burn rate / hours a day', () => {
    const doc = bare();
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', { setting: '1.3 kW' });
    doc.items['item-gas-1'] = item('item-gas-1', 'gas-bottle', 2, L.garage);
    const heat = cov(doc, 'heat:hours');
    expect(heat.amount).toBeCloseTo(30 / 0.095, 6);
    // the excellent-insulation, snow-risk home needs 6 hours a day
    expect(heat.days).toBeCloseTo(30 / 0.095 / 6, 6);
    expect(heat.from).toMatchObject([{ kind: 'asset', id: 'asset-heater' }]);
  });

  it('uses the answered heater setting, and reports an unanswered one as blocked', () => {
    const doc = bare();
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', { setting: '4.2 kW' });
    doc.items['item-gas-1'] = item('item-gas-1', 'gas-bottle', 1, L.garage);
    expect(cov(doc, 'heat:hours').amount).toBeCloseTo(15 / 0.3);
    doc.assets['asset-heater']!.answers = {};
    const heat = cov(doc, 'heat:hours');
    expect(heat.amount).toBe(0);
    expect(heat.blocked).toMatch(/until you answer/);
  });

  it('shares a fuel: cooking takes what it needs, heat gets the rest', () => {
    const doc = biggarDocument(); // BBQ and one 13 kg bottle
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', { setting: '1.3 kW' });
    const cooking = cov(doc, 'cooking:hours');
    const heat = cov(doc, 'heat:hours');
    expect(cooking.amount).toBeCloseTo(13 / 0.3);
    const cookingKg = 7.5 * 0.3; // the 7.5 hours cooking needs for 3 days
    expect(heat.amount).toBeCloseTo((13 - cookingKg) / 0.095);
  });

  it('burns a generator fuel into Wh', () => {
    const doc = bare();
    doc.assets['asset-gen'] = asset('asset-gen', 'generator', {
      fuel: 'petrol',
      watts: 800,
      fuelPerHour: 0.5,
    });
    doc.items['item-petrol'] = item('item-petrol', 'petrol-can', 1, L.shed);
    const gen = cov(doc, 'power:batteryWh').from.find((s) => s.id === 'asset-gen')!;
    expect(gen.amount).toBeCloseTo((20 / 0.5) * 800);
  });

  it('adds a battery bought as an asset (a power station answers in Wh)', () => {
    const doc = biggarDocument();
    doc.assets['asset-ps'] = asset('asset-ps', 'power-station', { wh: 500 });
    const ps = cov(doc, 'power:batteryWh').from.find((s) => s.id === 'asset-ps')!;
    expect(ps.amount).toBeCloseTo(425);
  });
});

describe('coverage: dependent capabilities', () => {
  it('counts food that needs cooking only while cooking is covered', () => {
    const doc = biggarDocument();
    const withCooking = cov(doc, 'food:foodKcal');
    expect(withCooking.amount).toBe(28000 + 17500 + 36000);
    const none = bare();
    const without = cov(none, 'food:foodKcal');
    expect(without.amount).toBe(28000); // only the tins
    const pasta = without.from.find((s) => s.id.endsWith('dried-pasta'))!;
    expect(pasta).toMatchObject({ amount: 0 });
    expect(pasta.note).toMatch(/needs cooking/);
  });

  it('counts raw water from a butt only with a way to treat it', () => {
    const doc = bare();
    doc.assets['asset-butt'] = asset('asset-butt', 'water-butt', { litres: 200 });
    const untreated = cov(doc, 'water:waterL');
    expect(untreated.amount).toBe(20);
    expect(untreated.from.find((s) => s.id === 'asset-butt')!.note).toMatch(/untreated/);
    doc.items['item-tabs'] = item('item-tabs', 'purification-tablets', 1, L.hall);
    expect(cov(doc, 'water:waterL').amount).toBe(220);
    // or by boiling, if cooking is covered
    const withBbq = biggarDocument();
    withBbq.assets['asset-butt'] = asset('asset-butt', 'water-butt', { litres: 200 });
    expect(cov(withBbq, 'water:waterL').amount).toBe(220);
  });
});

describe('coverage: medical, mobility, plans', () => {
  it('counts medication units on hand as doses and first aid uses', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'medical:medication:med-ramipril')).toMatchObject({
      amount: 21,
      unit: 'doses',
    });
    expect(cov(doc, 'medical:firstAid').amount).toBe(3);
  });

  it('counts the best single vehicle for driving range', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'mobility:range').amount).toBeCloseTo(77 * 4 * 0.5);
    for (const id of ['asset-ev-1', 'asset-ev-2']) delete doc.assets[id];
    expect(cov(doc, 'mobility:range').amount).toBe(0);
    doc.items['item-petrol'] = item('item-petrol', 'petrol-can', 1, L.shed);
    expect(cov(doc, 'mobility:range').amount).toBeCloseTo(20 * 12);
  });

  it('counts a plan item as done until it expires', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'plan:plans-base:meeting-point').amount).toBe(1);
    expect(cov(doc, 'plan:plans-base:documents').amount).toBe(0); // noted but not done
    doc.plans['plans-base:first-aid-course'] = { doneAt: '2023-12-01' }; // good for 36 months
    expect(cov(doc, 'plan:plans-base:first-aid-course', '2026-11-15').amount).toBe(1);
    expect(cov(doc, 'plan:plans-base:first-aid-course', '2026-12-01').amount).toBe(0);
    doc.plans['plans-base:meeting-point'] = { doneAt: '2026-01-20', expires: '2026-11-01' };
    expect(cov(doc, 'plan:plans-base:meeting-point').amount).toBe(0);
  });

  it('returns one row per target and does not change the document', () => {
    const doc = biggarDocument();
    const before = structuredClone(doc);
    const rows = coverage(doc, packs, NOW, 14);
    expect(new Set(rows.map((r) => r.targetId)).size).toBe(rows.length);
    expect(doc).toEqual(before);
  });
});
