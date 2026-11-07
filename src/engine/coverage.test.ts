import { describe, expect, it } from 'vitest';
import { biggarDocument, BIGGAR_IDS } from '../fixtures/household-biggar';
import { addStock } from '../fixtures/stock';
import type { Asset, Document } from '../model';
import { bundledPacks } from '../packs/bundled';
import { analyse, coverage, type Coverage } from './coverage';

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
/** Packs of an item in a place, in the item's usual size. */
const item = (
  doc: Document,
  id: string,
  local: string,
  qty: number,
  locationId: string,
  bestBefore?: string,
): void => void addStock(doc, packs, { id, item: local, qty, locationId, bestBefore });
const L = BIGGAR_IDS.locations;

/** The fixture without the BBQ and its bottle, so fuel and cooking can be set up by the test. */
function bare(): Document {
  const doc = biggarDocument();
  delete doc.assets['asset-bbq'];
  delete doc.stock['stock-propane'];
  return doc;
}

describe('coverage: resources from stock, through products and items', () => {
  it('counts a rotating place at its minimum, not at what is there', () => {
    const food = cov(biggarDocument(), 'food:foodKcal');
    // 12 tins held, a minimum of 6: counted at 6 x 415 g x the label's 75 kcal per 100 g
    const beans = food.from.find((s) => s.id === `${L.pantry}|items-base:baked-beans`)!;
    expect(beans).toMatchObject({ kind: 'minimum' });
    expect(beans.amount).toBeCloseTo(6 * 311.25);
    expect(beans.note).toMatch(/minimum of 6, 12 held/);
  });

  it('uses the label kcal when the product has one, else the item typical', () => {
    const doc = biggarDocument();
    const withLabel = cov(doc, 'food:foodKcal').from.find((s) => s.id.endsWith('baked-beans'))!;
    expect(withLabel.amount).toBeCloseTo(6 * 415 * 0.75);
    delete doc.products['prod-beans']!.labelKcalPer100;
    const typical = cov(doc, 'food:foodKcal').from.find((s) => s.id.endsWith('baked-beans'))!;
    expect(typical.amount).toBeCloseTo(6 * 415 * 0.84);
  });

  it('does not rely on a rotating place with no minimum for the item', () => {
    const food = cov(biggarDocument(), 'food:foodKcal');
    const oats = food.from.find((s) => s.id === `${L.pantry}|items-base:porridge-oats`)!;
    expect(oats.amount).toBe(0);
    expect(oats.note).toMatch(/no minimum/);
    // the torch in the pantry has no minimum either: only the hall and garage torches count
    const light = cov(biggarDocument(), 'light:lumenHours');
    expect(light.amount).toBe(4000);
  });

  it('counts a stored place at what is there', () => {
    // 3 packs of 6 x 2 L of bottled water, and 2 water cans of 10 L
    expect(cov(biggarDocument(), 'water:waterL').amount).toBe(3 * 12 + 2 * 10);
  });

  it('counts a multipack by its total', () => {
    const doc = biggarDocument();
    expect(doc.products['prod-water']!.size).toEqual({ count: 6, amount: 2, unit: 'L' });
    const water = cov(doc, 'water:waterL').from.find((s) => s.id === 'stock-water')!;
    expect(water.amount).toBe(36);
  });

  it('counts half packs', () => {
    const doc = biggarDocument();
    const before = cov(doc, 'water:waterL').amount;
    doc.stock['stock-can']!.qty = 0.5;
    expect(cov(doc, 'water:waterL').amount).toBe(before - 15);
  });

  it('counts nothing for stock that counts towards nothing, or whose product is gone', () => {
    const doc = biggarDocument();
    const before = structuredClone(coverage(doc, packs, NOW, 3).map((c) => [c.targetId, c.amount]));
    expect(doc.products['prod-twine']!.itemId).toBeUndefined();
    delete doc.products['prod-can'];
    const after = coverage(doc, packs, NOW, 3);
    expect(after.find((c) => c.targetId === 'water:waterL')!.amount).toBe(36);
    expect(after.flatMap((c) => c.from.map((s) => s.id))).not.toContain('stock-twine');
    expect(before.length).toBe(after.length);
  });

  it('counts two products of one item in a rotating place at their average', () => {
    const doc = bare();
    // minimum 6 beans in the Pantry; 4 packs of 415 g (label 75) and 8 packs of 220 g (typical 84)
    item(doc, 'extra-small', 'baked-beans', 8, L.pantry, '2028-01');
    doc.products['prod-extra-small']!.size = { amount: 220, unit: 'g' };
    const live = 12 + 8; // the fixture's 12 plus the new 8
    const big = 12 * 415 * 0.75;
    const small = 8 * 220 * 0.84;
    const beans = cov(doc, 'food:foodKcal').from.find((s) => s.id.endsWith('baked-beans'))!;
    expect(beans.amount).toBeCloseTo(((big + small) * 6) / live);
    expect(beans.note).toMatch(/minimum of 6, 20 held/);
  });

  it('lists a rotating place below its minimum', () => {
    const doc = biggarDocument();
    doc.stock['stock-beans']!.qty = 4;
    const a = analyse(doc, packs, NOW, 3);
    expect(a.belowMinimum).toContainEqual({
      locationId: L.pantry,
      itemId: 'items-base:baked-beans',
      minimum: 6,
      actual: 4,
    });
    delete doc.stock['stock-beans'];
    expect(analyse(doc, packs, NOW, 3).belowMinimum).toContainEqual({
      locationId: L.pantry,
      itemId: 'items-base:baked-beans',
      minimum: 6,
      actual: 0,
    });
  });

  it('counts an expired batch as zero and lists it as expired', () => {
    const doc = biggarDocument();
    const food = cov(doc, 'food:foodKcal');
    expect(food.from.find((s) => s.id === 'stock-uht')).toMatchObject({ amount: 0, expired: true });
    // the same milk, in date, would count: 1 held at a minimum of 1 x 6 L x 46 kcal per 100 ml
    doc.stock['stock-uht']!.bestBefore = '2026-12';
    expect(cov(doc, 'food:foodKcal').amount - food.amount).toBeCloseTo(6000 * 0.46);
    // best before this month is still in date
    doc.stock['stock-uht']!.bestBefore = '2026-11';
    expect(cov(doc, 'food:foodKcal').amount - food.amount).toBeCloseTo(6000 * 0.46);
  });

  it('a soft drink counts as water plus its label kcal; a diet one counts 0 kcal', () => {
    const doc = bare();
    addStock(doc, packs, {
      id: 'cola',
      item: 'soft-drinks',
      qty: 1,
      locationId: L.garage,
      size: { count: 24, amount: 330, unit: 'ml' },
      labelKcalPer100: 42,
    });
    const water = cov(doc, 'water:waterL').amount;
    const food = cov(doc, 'food:foodKcal').amount;
    expect(water - 56).toBeCloseTo(7.92);
    const diet = structuredClone(doc);
    diet.products['prod-cola']!.labelKcalPer100 = 0;
    expect(cov(diet, 'food:foodKcal').amount).toBeCloseTo(food - 7920 * 0.42);
    expect(cov(diet, 'water:waterL').amount).toBeCloseTo(water);
  });

  it('counts a nappy size only while it fits someone in the household', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'sanitation:nappies').amount).toBe(50); // size 2 fits 3 months
    const later = cov(doc, 'sanitation:nappies', '2027-05-15');
    expect(later.amount).toBe(0); // 9 months: size 2 is 3-6
    expect(later.from[0]!.note).toMatch(/does not fit/);
    item(doc, 'n3', 'nappies-size-3', 2, L.hall);
    expect(cov(doc, 'sanitation:nappies', '2027-05-15').amount).toBe(100);
  });

  it('counts a radio by its asset, and a stock row of the same radio item counts nothing', () => {
    const doc = biggarDocument();
    expect(cov(doc, 'comms:radio').amount).toBe(0);
    // A radio with no equipment type of its own is still a stock item.
    item(doc, 'sw', 'shortwave-receiver', 1, L.hall);
    expect(cov(doc, 'comms:radio').amount).toBe(1);
    delete doc.stock['sw'];
    // The wind-up radio is equipment: a stock row of it is not counted (and says why).
    item(doc, 'radio', 'wind-up-radio', 1, L.hall);
    expect(cov(doc, 'comms:radio').amount).toBe(0);
    expect(
      cov(doc, 'comms:radio')
        .from.map((s) => s.note)
        .join(' '),
    ).toMatch(/equipment/);
    delete doc.stock['radio'];
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
      item(doc, 'r', type, 1, L.hall);
      expect(cov(doc, 'comms:radio').amount, `${type} as stock`).toBe(0);
      doc.assets['asset-r'] = asset('asset-r', assetType);
      expect(cov(doc, 'comms:radio').amount, `${type} with its asset`).toBe(1);
    }
  });

  it('does not let a PMR446 pair meet the need for a receiver that works without mains', () => {
    const doc = biggarDocument();
    doc.assets['asset-pmr'] = asset('asset-pmr', 'pmr446-radio');
    expect(cov(doc, 'comms:radio').amount).toBe(0);
    doc.assets['asset-hh'] = asset('asset-hh', 'handheld-radio');
    expect(cov(doc, 'comms:radio').amount).toBe(1);
  });

  it('does not count a leisure battery twice, as stock and as equipment', () => {
    const doc = biggarDocument();
    const before = cov(doc, 'power:batteryWh').amount;
    doc.assets['asset-lb'] = asset('asset-lb', 'leisure-battery', { ah: 110 });
    const once = cov(doc, 'power:batteryWh').amount;
    expect(once).toBeGreaterThan(before);
    // The same battery also entered as a stock row adds nothing.
    item(doc, 'lb', 'leisure-battery', 1, L.garage);
    expect(cov(doc, 'power:batteryWh').amount).toBe(once);
  });

  it('leaves a batch out of the coverage when none of it is left', () => {
    const doc = biggarDocument();
    delete doc.stock['stock-uht'];
    expect(cov(doc, 'food:foodKcal').from.find((s) => s.id.includes('uht'))).toBeUndefined();
  });

  it('a water filter in stock counts as a way to treat raw water', () => {
    const doc = bare();
    doc.assets['asset-butt'] = asset('asset-butt', 'water-butt', { litres: 200 });
    expect(cov(doc, 'water:waterL').amount).toBe(56);
    item(doc, 'filter', 'water-filter', 1, L.hall);
    expect(cov(doc, 'water:waterL').amount).toBe(256);
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
    expect(power.amount).toBeCloseTo(30000 + 38500 + 26.4);
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
    expect(cooking.amount).toBeCloseTo(7.5); // target-limited claim
    expect(cooking.from[0]).toMatchObject({ kind: 'asset', id: 'asset-bbq' });
    expect(cooking.days).toBeCloseTo(3);
    expect(cov(doc, 'heat:hours').amount).toBe(0);
  });

  it('gives heat from a cabinet heater and 30 kg of gas: days = kg / burn rate / hours a day', () => {
    const doc = bare();
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', {
      setting: '1.3 kW',
      chosenLpg: 'items-base:butane-bottle',
      fuelConfirmed: true,
      indoorUse: 'permitted',
      highRise: 'no',
    });
    item(doc, 'gas-1', 'butane-bottle', 2, L.garage);
    const heat = cov(doc, 'heat:hours');
    expect(heat.amount).toBeCloseTo(18, 6);
    // the excellent-insulation, snow-risk home needs 6 hours a day
    expect(heat.days).toBeCloseTo(3, 6);
    expect(heat.from).toMatchObject([{ kind: 'asset', id: 'asset-heater' }]);
  });

  it('uses the answered heater setting, and reports an unanswered one as blocked', () => {
    const doc = bare();
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', {
      setting: '4.2 kW',
      chosenLpg: 'items-base:butane-bottle',
      fuelConfirmed: true,
      indoorUse: 'permitted',
      highRise: 'no',
    });
    item(doc, 'gas-1', 'butane-bottle', 1, L.garage);
    expect(cov(doc, 'heat:hours').amount).toBeCloseTo(18);
    doc.assets['asset-heater']!.answers = {};
    const heat = cov(doc, 'heat:hours');
    expect(heat.amount).toBe(0);
    expect(heat.blocked).toMatch(/until you answer/);
  });

  it('shares a fuel: cooking takes what it needs, heat gets the rest', () => {
    const doc = biggarDocument(); // BBQ and one 13 kg bottle
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', {
      setting: '1.3 kW',
      chosenLpg: 'items-base:propane-bottle',
      fuelConfirmed: true,
      indoorUse: 'permitted',
      highRise: 'no',
    });
    const cooking = cov(doc, 'cooking:hours');
    const heat = cov(doc, 'heat:hours');
    expect(cooking.amount).toBeCloseTo(7.5);
    const cookingKg = 7.5 * 0.3; // the 7.5 hours cooking needs for 3 days
    expect(
      analyse(doc, packs, NOW, 3).equipmentRuntime.find((r) => r.assetId === 'asset-heater')!
        .availableHours,
    ).toBeCloseTo((13 - cookingKg) / 0.095);
    expect(heat.amount).toBeCloseTo(18);
  });

  it('burns a generator fuel into Wh', () => {
    const doc = bare();
    delete doc.assets['asset-ev-1'];
    delete doc.assets['asset-ev-2'];
    doc.assets['asset-gen'] = asset('asset-gen', 'generator', {
      fuel: 'petrol',
      fuelConfirmed: true,
      watts: 800,
      fuelPerHour: 0.5,
    });
    item(doc, 'petrol', 'petrol', 1, L.shed);
    const gen = cov(doc, 'power:batteryWh').from.find((s) => s.id === 'asset-gen')!;
    expect(gen.amount).toBeCloseTo(
      analyse(doc, packs, NOW, 3).targets.find((t) => t.id === 'power:batteryWh')!.amount,
    );
    expect(
      analyse(doc, packs, NOW, 3).equipmentRuntime.find((r) => r.assetId === 'asset-gen')!
        .availableHours,
    ).toBeCloseTo(20 / 0.5);
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
    // beans at the minimum of 6, pasta at 2 in the pantry and 6 in the attic, the rice sack
    expect(withCooking.amount).toBeCloseTo(6 * 311.25 + 2 * 1710 + 6 * 1710 + 36000);
    const none = bare();
    const without = cov(none, 'food:foodKcal');
    expect(without.amount).toBeCloseTo(6 * 311.25); // only the tins
    const pasta = without.from.find((s) => s.id.endsWith('dried-pasta'))!;
    expect(pasta).toMatchObject({ amount: 0 });
    expect(pasta.note).toMatch(/needs cooking/);
  });

  it('counts raw water from a butt only with a way to treat it', () => {
    const doc = bare();
    doc.assets['asset-butt'] = asset('asset-butt', 'water-butt', { litres: 200 });
    const untreated = cov(doc, 'water:waterL');
    expect(untreated.amount).toBe(56);
    expect(untreated.from.find((s) => s.id === 'asset-butt')!.note).toMatch(/untreated/);
    item(doc, 'tabs', 'purification-tablets', 1, L.hall);
    expect(cov(doc, 'water:waterL').amount).toBe(256);
    // or by boiling, if cooking is covered
    const withBbq = biggarDocument();
    withBbq.assets['asset-butt'] = asset('asset-butt', 'water-butt', { litres: 200 });
    expect(cov(withBbq, 'water:waterL').amount).toBe(256);
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
    item(doc, 'petrol', 'petrol', 1, L.shed);
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
