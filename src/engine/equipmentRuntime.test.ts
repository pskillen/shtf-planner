import { describe, expect, it } from 'vitest';
import { biggarDocument, BIGGAR_IDS } from '../fixtures/household-biggar';
import { addStock } from '../fixtures/stock';
import { bundledPacks } from '../packs/bundled';
import { analyse, equipmentRuntime } from './coverage';

const packs = bundledPacks();
const now = '2026-11-15';
const heater = (item = 'items-base:butane-bottle') => ({
  id: 'heater',
  typeId: 'assets-base:cabinet-heater',
  maintenance: {},
  answers: {
    setting: '1.3 kW',
    chosenLpg: item,
    fuelConfirmed: true,
    indoorUse: 'permitted',
    highRise: 'no',
  },
});

describe('exact fuel runtime', () => {
  it('does not credit a different LPG item, an unconfirmed fuel or a stale choice', () => {
    const doc = biggarDocument();
    doc.assets.heater = heater();
    let r = equipmentRuntime(doc, packs, now, 3).find((x) => x.assetId === 'heater')!;
    expect(r.status).toBe('no-fuel');
    expect(r.availableHours).toBe(0);
    doc.assets.heater.answers.chosenLpg = 'stale';
    r = equipmentRuntime(doc, packs, now, 3).find((x) => x.assetId === 'heater')!;
    expect(r.reasons).toContain('fuel-selection');
    expect(r.availableHours).toBeUndefined();
    doc.assets.heater.answers.chosenLpg = 'items-base:propane-bottle';
    doc.assets.heater.answers.fuelConfirmed = false;
    expect(
      equipmentRuntime(doc, packs, now, 3).find((x) => x.assetId === 'heater')!.reasons,
    ).toContain('fuel-confirmation');
  });
  it('shares exact fuel in priority order and attributes only the claimed amount', () => {
    const doc = biggarDocument();
    doc.assets.heater = heater('items-base:propane-bottle');
    const before = structuredClone(doc);
    const a = analyse(doc, packs, now, 3);
    const cooking = a.equipmentRuntime.find((x) => x.assetId === 'asset-bbq')!;
    const heat = a.equipmentRuntime.find((x) => x.assetId === 'heater')!;
    expect(cooking.allocatedHours).toBeCloseTo(7.5);
    expect(heat.availableHours).toBeCloseTo((13 - 7.5 * 0.3) / 0.095);
    expect(heat.allocatedHours).toBeCloseTo(18);
    expect(
      cooking.inputLots[0]!.allocatedResource + heat.inputLots[0]!.allocatedResource,
    ).toBeCloseTo(7.5 * 0.3 + 18 * 0.095);
    expect(doc).toEqual(before);
  });
  it('uses distinct pools additively and picks the efficient same-fuel alternative deterministically', () => {
    const doc = biggarDocument();
    doc.assets.z = { ...heater(), id: 'z' };
    doc.assets.a = { ...heater(), id: 'a' };
    addStock(doc, packs, {
      id: 'butane',
      item: 'butane-bottle',
      qty: 1,
      locationId: BIGGAR_IDS.locations.garage,
    });
    const runtime = equipmentRuntime(doc, packs, now, 3);
    expect(runtime.find((r) => r.assetId === 'a')!.status).toBe('counted');
    expect(runtime.find((r) => r.assetId === 'z')!.status).toBe('alternative');
    expect(runtime.find((r) => r.assetId === 'z')!.allocatedHours).toBe(0);
    doc.assets = Object.fromEntries(Object.entries(doc.assets).reverse());
    expect(equipmentRuntime(doc, packs, now, 3)).toEqual(runtime);
  });
});

describe('runtime provenance and unknowns', () => {
  it('applies a rotating minimum proportionally across differently sized products', () => {
    const doc = biggarDocument();
    doc.assets.heater = heater();
    addStock(doc, packs, {
      id: 'small',
      item: 'butane-bottle',
      qty: 1,
      locationId: BIGGAR_IDS.locations.pantry,
      size: { amount: 5, unit: 'kg' },
    });
    addStock(doc, packs, {
      id: 'large',
      item: 'butane-bottle',
      qty: 1,
      locationId: BIGGAR_IDS.locations.pantry,
      size: { amount: 15, unit: 'kg' },
    });
    doc.minimums[`${BIGGAR_IDS.locations.pantry}|items-base:butane-bottle`] = 1;
    const r = equipmentRuntime(doc, packs, now, 3).find((x) => x.assetId === 'heater')!;
    expect(r.inputLots.map((l) => l.countedPacks)).toEqual([0.5, 0.5]);
    expect(r.inputLots.reduce((n, l) => n + l.resourceAmount, 0)).toBeCloseTo(10);
    expect(r.inputLots.reduce((n, l) => n + l.allocatedResource, 0)).toBeCloseTo(18 * 0.095);
  });
  it('requires indoor permission and a positive manual rate if one is entered', () => {
    const doc = biggarDocument();
    doc.assets.heater = heater();
    doc.assets.heater.answers.indoorUse = 'not permitted';
    expect(equipmentRuntime(doc, packs, now, 3).find((x) => x.assetId === 'heater')!.status).toBe(
      'blocked',
    );
    doc.assets.heater.answers.indoorUse = 'permitted';
    doc.assets.heater.answers.manualRate = 0;
    const r = equipmentRuntime(doc, packs, now, 3).find((x) => x.assetId === 'heater')!;
    expect(r.reasons).toContain('rate');
    expect(r.availableHours).toBeUndefined();
  });
});

it('preserves the generator operating mode without inferring a fuel confirmation', () => {
  const doc = biggarDocument();
  doc.assets.gen = {
    id: 'gen',
    typeId: 'assets-base:generator',
    maintenance: {},
    answers: { fuel: 'lpg', watts: 800, fuelPerHour: 0.5, chosenLpg: 'items-base:propane-bottle' },
  };
  let results = equipmentRuntime(doc, packs, now, 3).filter((r) => r.assetId === 'gen');
  expect(
    results.find((r) => r.selectedItemIds.includes('items-base:propane-bottle'))!.reasons,
  ).toContain('fuel-confirmation');
  doc.assets.gen.answers.fuelConfirmed = true;
  results = equipmentRuntime(doc, packs, now, 3).filter((r) => r.assetId === 'gen');
  expect(
    results.find((r) => r.selectedItemIds.includes('items-base:propane-bottle'))!.reasons,
  ).toEqual([]);
  expect(results.find((r) => r.selectedItemIds.includes('items-base:petrol'))!.status).toBe(
    'blocked',
  );
});

it('reports available runtime without days when no capability target applies', () => {
  const doc = biggarDocument();
  doc.assets.heater = heater();
  addStock(doc, packs, {
    id: 'butane',
    item: 'butane-bottle',
    qty: 1,
    locationId: BIGGAR_IDS.locations.garage,
  });
  const disabled = {
    ...packs,
    rules: Object.fromEntries(
      Object.entries(packs.rules).filter(([, rule]) => rule.capability !== 'heat'),
    ),
  };
  // Target computation reads enabled packs; remove the heat rules there too.
  disabled.enabledPacks = (settings) =>
    packs
      .enabledPacks(settings)
      .map((p) =>
        p.kind === 'guidance' ? { ...p, rules: p.rules.filter((r) => r.capability !== 'heat') } : p,
      );
  const runtime = equipmentRuntime(doc, disabled, now, 3).find((r) => r.assetId === 'heater')!;
  expect(runtime.availableHours).toBeGreaterThan(0);
  expect(runtime.allocatedHours).toBe(0);
  expect(runtime.days).toBeUndefined();
});
