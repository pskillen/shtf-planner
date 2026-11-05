import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import type { Asset, Document } from '../model';
import { bundledPacks } from '../packs/bundled';
import { addStock } from '../fixtures/stock';
import { gaps, type Gap } from './gaps';

const NOW = '2026-11-15';
const packs = bundledPacks();
const find = (list: Gap[], id: string, kind?: Gap['kind']) =>
  list.find((g) => g.target.id === id && (kind === undefined || g.kind === kind));

const asset = (id: string, type: string, answers: Asset['answers'] = {}): Asset => ({
  id,
  typeId: `assets-base:${type}`,
  answers,
  maintenance: {},
});
/** One adult, no pets, nothing in the house: a clean slate for suggestions. */
function empty(): Document {
  const doc = biggarDocument();
  doc.household.members = [doc.household.members[0]!];
  doc.household.pets = [];
  doc.products = {};
  doc.stock = {};
  doc.barcodes = {};
  doc.minimums = {};
  doc.assets = {};
  doc.plans = {};
  return doc;
}

describe('gaps', () => {
  it("shows the elderly member's medication 7 doses short at 28 days, and critical", () => {
    const doc = biggarDocument();
    const med = find(gaps(doc, packs, NOW, 28), 'medical:medication:med-ramipril')!;
    expect(med.shortfall).toBe(7);
    expect(med.unit).toBe('doses');
    expect(med.critical).toBe(true);
    expect(med.kind).toBe('acquire');
    expect(find(gaps(doc, packs, NOW, 14), 'medical:medication:med-ramipril')).toBeUndefined();
  });

  it('suggests whole units of the cheapest item per litre that does not overshoot wildly', () => {
    const doc = empty(); // 3 L x 3 days = 9 L short
    const water = find(gaps(doc, packs, NOW, 3), 'water:waterL')!;
    expect(water.shortfall).toBe(9);
    const [first] = water.suggestions;
    expect(first).toMatchObject({ itemId: 'items-base:bottled-water', qty: 1 });
    expect(first!.label).toBe('Bottled water: about 9 L more');
    expect(first!.detail).toBe('1 pack of 6 × 2 L');
    expect(first!.pricePence).toBe(300);
    for (const s of water.suggestions) {
      // every suggestion on its own closes the shortfall, in whole units
      expect(Number.isInteger(s.qty)).toBe(true);
      expect(s.qty! * s.perUnitCoverage!).toBeGreaterThanOrEqual(water.shortfall);
    }
  });

  it('does not make a bath bladder or loose cells the first suggestion at 14 days', () => {
    const doc = empty();
    const list = gaps(doc, packs, NOW, 14);
    const water = find(list, 'water:waterL')!;
    expect(water.suggestions[0]!.itemId).not.toBe('items-base:bath-bladder');
    for (const s of water.suggestions) expect(s.itemId).not.toBe('items-base:bath-bladder');
    const power = find(list, 'power:batteryWh')!;
    expect(power.shortfall).toBeGreaterThan(0);
    for (const s of power.suggestions) {
      expect(packs.items[s.itemId!]!.tags, s.label).not.toContain('cells');
      expect(packs.items[s.itemId!]!.tags, s.label).not.toContain('no-suggest');
    }
  });

  it('falls back to a no-suggest type when nothing else gives the store', () => {
    const only = {
      ...packs,
      items: Object.fromEntries(
        Object.entries(packs.items).filter(
          ([id, t]) =>
            !t.gives.some((g) => g.resource === 'waterL') || id === 'items-base:bath-bladder',
        ),
      ),
    };
    const water = find(gaps(empty(), only, NOW, 14), 'water:waterL')!;
    expect(water.suggestions[0]!.itemId).toBe('items-base:bath-bladder');
  });

  it('sizes the quantity to the shortfall, in packs of the usual product', () => {
    const doc = biggarDocument(); // 110.25 L wanted over 7 days, 56 L held: 54.25 L short
    const water = find(gaps(doc, packs, NOW, 7), 'water:waterL')!;
    expect(water.shortfall).toBeCloseTo(54.25);
    expect(water.suggestions[0]).toMatchObject({
      itemId: 'items-base:bottled-water',
      productId: 'prod-water',
      qty: 5, // 5 x (6 x 2 L)
    });
    expect(water.suggestions[0]!.detail).toBe('5 × Spring water 6 × 2 L');
  });

  it('leads food with an item and an amount, at every horizon, one row per item', () => {
    for (const days of [3, 7, 14, 28]) {
      const food = find(gaps(biggarDocument(), packs, NOW, days), 'food:foodKcal', 'acquire');
      if (!food) continue; // the fixture covers the shortest horizons
      const first = food.suggestions[0]!;
      expect(first.label, `${days} days`).toMatch(/: about [\d.]+ (g|kg) more$/);
      expect(first.qty).toBeGreaterThan(0);
      const ids = food.suggestions.map((x) => x.itemId);
      expect(new Set(ids).size, `${days} days: ${food.suggestions.map((x) => x.label)}`).toBe(
        ids.length,
      );
    }
  });

  it('says an empty container is to fill from the tap', () => {
    const only = {
      ...packs,
      items: Object.fromEntries(
        Object.entries(packs.items).filter(
          ([, t]) => !t.gives.some((g) => g.resource === 'waterL') || t.tags.includes('refillable'),
        ),
      ),
    };
    const water = find(gaps(empty(), only, NOW, 3), 'water:waterL')!;
    expect(water.suggestions.length).toBeGreaterThan(0);
    for (const s of water.suggestions) expect(s.detail).toMatch(/, to fill from the tap$/);
    // and bottled water is not worded that way
    const bottled = find(gaps(empty(), packs, NOW, 3), 'water:waterL')!;
    expect(bottled.suggestions[0]!.detail).not.toMatch(/tap/);
  });

  it('does not lead a small shortfall with an oversized, dearer trade pack', () => {
    const doc = empty(); // one adult
    const food = find(gaps(doc, packs, NOW, 7), 'food:foodKcal')!;
    const first = food.suggestions[0]!;
    expect(first.itemId).not.toBe('items-base:porridge-oats-10kg');
    // 14,000 kcal: two 3 kg packs (900 p), not one 10 kg sack (1300 p, nearly three times the need)
    expect(first.itemId).toBe('items-base:porridge-oats');
    expect(first.pricePence!).toBeLessThanOrEqual(900);
  });

  it('ranks the same however the packs are listed', () => {
    const shuffled = {
      ...packs,
      items: Object.fromEntries(Object.entries(packs.items).reverse()),
    };
    for (const days of [3, 7, 28]) {
      const a = find(gaps(biggarDocument(), packs, NOW, days), 'food:foodKcal')!;
      const b = find(gaps(biggarDocument(), shuffled, NOW, days), 'food:foodKcal')!;
      expect(b.suggestions.map((s) => s.label)).toEqual(a.suggestions.map((s) => s.label));
    }
  });

  it('does not suggest food that needs cooking when cooking is not covered', () => {
    const doc = empty();
    const food = find(gaps(doc, packs, NOW, 3), 'food:foodKcal')!;
    for (const s of food.suggestions) {
      expect(packs.items[s.itemId!]!.tags).not.toContain('needs-cooking');
    }
  });

  it('does not suggest nappies that fit nobody', () => {
    const doc = biggarDocument();
    const later = find(gaps(doc, packs, '2027-05-15', 3), 'sanitation:nappies')!;
    expect(later.suggestions[0]!.itemId).toBe('items-base:nappies-size-3');
  });

  it('suggests a heater and its fuel when there is no heater', () => {
    const doc = biggarDocument();
    const heat = find(gaps(doc, packs, NOW, 3), 'heat:hours')!;
    expect(heat.shortfall).toBe(18);
    expect(heat.suggestions).toHaveLength(2);
    const [heater, fuel] = heat.suggestions;
    expect(heater!.assetTypeId).toMatch(/^assets-base:/);
    expect(heater!.pricePence).toBeGreaterThan(0);
    expect(fuel!.itemId).toBeDefined();
    expect(fuel!.label).toMatch(/to run it$/);
  });

  it('suggests only the fuel when a heater is owned', () => {
    const doc = biggarDocument();
    doc.assets['asset-heater'] = asset('asset-heater', 'catalytic-heater');
    delete doc.stock['stock-propane'];
    delete doc.assets['asset-bbq'];
    const heat = find(gaps(doc, packs, NOW, 3), 'heat:hours')!;
    expect(heat.suggestions).toHaveLength(1);
    expect(heat.suggestions[0]).toMatchObject({ itemId: 'items-base:propane-bottle' });
    expect(heat.suggestions[0]!.label).toMatch(/for the Catalytic gas heater/);
  });

  it('turns solar and a battery without an EPS into "fit an EPS" tasks', () => {
    const tasks = gaps(biggarDocument(), packs, NOW, 3).filter((g) => g.kind === 'task');
    const labels = tasks.map((g) => g.suggestions[0]!.label);
    expect(labels).toContain('Fit an EPS so Roof solar keeps working in a power cut');
    expect(labels).toContain('Fit an EPS so Home battery keeps working in a power cut');
    expect(
      tasks.find((g) => g.suggestions[0]!.assetTypeId === 'assets-base:solar-pv')!.capability,
    ).toBe('power');
  });

  it('asks to restock a rotating place below its minimum (the expired milk is not stock)', () => {
    const rep = find(gaps(biggarDocument(), packs, NOW, 3), 'food:foodKcal', 'replenish')!;
    expect(rep.suggestions[0]).toMatchObject({
      itemId: 'items-base:uht-milk',
      productId: 'prod-uht',
      qty: 1,
    });
    expect(rep.suggestions[0]!.label).toBe('1 × UHT milk 6 × 1 L back into the Pantry');
    expect(rep.shortfall).toBeCloseTo(6000 * 0.46);
  });

  it('lists plan items not done as plan gaps, with the pack text', () => {
    const doc = biggarDocument();
    const gs = gaps(doc, packs, NOW, 3);
    const eps = find(gs, 'plan:plans-base:eps')!;
    expect(eps.kind).toBe('plan');
    expect(eps.capability).toBe('power');
    expect(eps.suggestions[0]!.planItemId).toBe('plans-base:eps');
    expect(find(gs, 'plan:plans-base:meeting-point')).toBeUndefined(); // done
    doc.plans['plans-base:meeting-point'] = { doneAt: '2026-01-20', expires: '2026-11-01' };
    const redo = find(gaps(doc, packs, NOW, 3), 'plan:plans-base:meeting-point')!;
    expect(redo.suggestions[0]!.label).toMatch(/^Redo: /);
  });

  it('suggests a radio when there is none', () => {
    const radio = find(gaps(biggarDocument(), packs, NOW, 3), 'comms:radio')!;
    expect(radio.suggestions[0]!.itemId).toBe('items-base:wind-up-radio');
    // only things that receive broadcasts: a walkie-talkie pair does not
    for (const s of radio.suggestions) expect(packs.items[s.itemId!]!.tags).toContain('radio-rx');
    const all = Object.values(packs.items).filter((i) => i.tags.includes('radio-rx'));
    expect(all.map((i) => i.id)).not.toContain('items-base:pmr446-pair');
  });

  it('leaves no acquire gap for what is covered', () => {
    const gs = gaps(biggarDocument(), packs, NOW, 3);
    for (const id of ['cooking:hours', 'light:lumenHours', 'power:batteryWh', 'medical:firstAid']) {
      expect(find(gs, id, 'acquire'), id).toBeUndefined();
    }
  });

  it('sorts by capability then kind', () => {
    const gs = gaps(biggarDocument(), packs, NOW, 14);
    const caps = gs.map((g) => g.capability);
    const order = ['water', 'food', 'heat', 'cooking', 'light', 'power', 'comms', 'sanitation'];
    const seen = caps.filter((c) => order.includes(c));
    expect(seen).toEqual([...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('does not change the document', () => {
    const doc = biggarDocument();
    const before = structuredClone(doc);
    gaps(doc, packs, NOW, 14);
    expect(doc).toEqual(before);
  });
});

describe('suggestions by item, with an amount and the usual product', () => {
  const L = { pantry: 'loc-pantry', hall: 'loc-hall' };

  const oatsOnly = {
    ...packs,
    items: Object.fromEntries(
      Object.entries(packs.items).filter(([id]) => id === 'items-base:porridge-oats'),
    ),
  };

  it('names the item with an amount, and the usual product under it', () => {
    const doc = empty();
    addStock(doc, packs, {
      id: 'quaker',
      item: 'porridge-oats',
      qty: 1,
      locationId: L.pantry,
      size: { amount: 750, unit: 'g' },
      name: 'Quaker oats 750 g',
    });
    const [first] = find(gaps(doc, oatsOnly, NOW, 28), 'food:foodKcal')!.suggestions;
    expect(first!.itemId).toBe('items-base:porridge-oats');
    expect(first!.productId).toBe('prod-quaker');
    expect(first!.label).toMatch(/^Porridge oats: about \d+(\.\d)? kg more$/);
    expect(first!.detail).toBe(`${first!.qty} × Quaker oats 750 g`);
    expect(first!.size).toEqual({ amount: 750, unit: 'g' });
  });

  it('with no product of the item, uses the item’s usual size', () => {
    const doc = empty();
    const [first] = find(gaps(doc, oatsOnly, NOW, 28), 'food:foodKcal')!.suggestions;
    expect(first!.productId).toBeUndefined();
    expect(first!.size).toEqual({ amount: 1, unit: 'kg' });
    expect(first!.detail).toBe(`${first!.qty} × 1 kg bags`);
  });

  it('counts items in pieces: "AA cells: 16 more"', () => {
    const only = {
      ...packs,
      items: Object.fromEntries(
        Object.entries(packs.items).filter(([id]) => id === 'items-base:aa-cells'),
      ),
    };
    const doc = empty();
    const power = find(gaps(doc, only, NOW, 14), 'power:batteryWh')!;
    const [first] = power.suggestions;
    expect(first!.label).toMatch(/^AA cells: \d+ more$/);
    expect(first!.amount).toBe(Number(/\d+/.exec(first!.label)![0]));
  });

  it('never suggests another size as a second answer: one row per item', () => {
    const food = find(gaps(empty(), packs, NOW, 28), 'food:foodKcal')!;
    const ids = food.suggestions.map((s) => s.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the restock row names the usual product', () => {
    const doc = biggarDocument();
    doc.stock['stock-beans']!.qty = 2;
    const rows = gaps(doc, packs, NOW, 3).filter((g) => g.kind === 'replenish');
    const beans = rows.find((g) => g.restock?.itemName === 'Baked beans')!;
    expect(beans.suggestions[0]).toMatchObject({
      itemId: 'items-base:baked-beans',
      productId: 'prod-beans',
      qty: 4,
    });
    expect(beans.suggestions[0]!.label).toBe('4 × Test beans 415 g back into the Pantry');
    expect(beans.restock).toEqual({
      place: 'Pantry',
      itemName: 'Baked beans',
      minimum: 6,
      actual: 2,
    });
    expect(beans.shortfall).toBeCloseTo(4 * 311.25);
  });

  it('with no product of the item, the restock names the item and its usual size', () => {
    const doc = biggarDocument();
    doc.minimums['loc-pantry|items-base:tinned-fish'] = 3;
    const rows = gaps(doc, packs, NOW, 3).filter((g) => g.kind === 'replenish');
    const fish = rows.find((g) => g.restock?.itemName === 'Tinned fish')!;
    expect(fish.suggestions[0]!.label).toBe('3 × Tinned fish 145 g back into the Pantry');
  });

  it('has no custom: skip any more: every item in the pack may be suggested', () => {
    const doc = empty();
    const water = find(gaps(doc, packs, NOW, 3), 'water:waterL', 'acquire')!;
    expect(water.suggestions.length).toBeGreaterThan(0);
    for (const s of water.suggestions) expect(packs.items[s.itemId!]).toBeDefined();
  });
});
