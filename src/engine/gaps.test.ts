import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import type { Asset, Document } from '../model';
import { bundledPacks } from '../packs/bundled';
import { withCustomTypes } from '../packs/custom';
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
  doc.items = {};
  doc.floors = {};
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
    expect(first).toMatchObject({ itemTypeId: 'items-base:bottled-water', qty: 1 });
    expect(first!.label).toBe('1 × Bottled water (24 × 500 ml)');
    expect(first!.pricePence).toBe(400);
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
    expect(water.suggestions[0]!.itemTypeId).not.toBe('items-base:bath-bladder');
    for (const s of water.suggestions) expect(s.itemTypeId).not.toBe('items-base:bath-bladder');
    const power = find(list, 'power:batteryWh')!;
    expect(power.shortfall).toBeGreaterThan(0);
    for (const s of power.suggestions) {
      expect(packs.items[s.itemTypeId!]!.tags, s.label).not.toContain('cells');
      expect(packs.items[s.itemTypeId!]!.tags, s.label).not.toContain('no-suggest');
    }
  });

  it('falls back to a no-suggest type when nothing else gives the store', () => {
    const only = {
      ...packs,
      items: Object.fromEntries(
        Object.entries(packs.items).filter(
          ([id, t]) =>
            !t.gives.some((g) => g.store === 'waterL') || id === 'items-base:bath-bladder',
        ),
      ),
    };
    const water = find(gaps(empty(), only, NOW, 14), 'water:waterL')!;
    expect(water.suggestions[0]!.itemTypeId).toBe('items-base:bath-bladder');
  });

  it('sizes the quantity to the shortfall', () => {
    const doc = biggarDocument(); // 47.25 L wanted, 20 L held: 27.25 L short
    const water = find(gaps(doc, packs, NOW, 3), 'water:waterL')!;
    expect(water.shortfall).toBeCloseTo(27.25);
    expect(water.suggestions[0]).toMatchObject({ itemTypeId: 'items-base:bottled-water', qty: 3 });
  });

  it('does not suggest food that needs cooking when cooking is not covered', () => {
    const doc = empty();
    const food = find(gaps(doc, packs, NOW, 3), 'food:foodKcal')!;
    for (const s of food.suggestions) {
      expect(packs.items[s.itemTypeId!]!.tags).not.toContain('needs-cooking');
    }
  });

  it('does not suggest nappies that fit nobody', () => {
    const doc = biggarDocument();
    const later = find(gaps(doc, packs, '2027-05-15', 3), 'sanitation:nappies')!;
    expect(later.suggestions[0]!.itemTypeId).toBe('items-base:nappies-size-3');
  });

  it('suggests a heater and its fuel when there is no heater', () => {
    const doc = biggarDocument();
    const heat = find(gaps(doc, packs, NOW, 3), 'heat:hours')!;
    expect(heat.shortfall).toBe(18);
    expect(heat.suggestions).toHaveLength(2);
    const [heater, fuel] = heat.suggestions;
    expect(heater!.assetTypeId).toMatch(/^assets-base:/);
    expect(heater!.pricePence).toBeGreaterThan(0);
    expect(fuel!.itemTypeId).toBeDefined();
    expect(fuel!.label).toMatch(/to run it$/);
  });

  it('suggests only the fuel when a heater is owned', () => {
    const doc = biggarDocument();
    doc.assets['asset-heater'] = asset('asset-heater', 'catalytic-heater');
    delete doc.items['item-lpg'];
    delete doc.assets['asset-bbq'];
    const heat = find(gaps(doc, packs, NOW, 3), 'heat:hours')!;
    expect(heat.suggestions).toHaveLength(1);
    expect(heat.suggestions[0]).toMatchObject({ itemTypeId: 'items-base:lpg-bottle-13kg' });
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

  it('asks to restock a rotating location below its floor', () => {
    const rep = find(gaps(biggarDocument(), packs, NOW, 3), 'food:foodKcal', 'replenish')!;
    expect(rep.suggestions[0]).toMatchObject({ itemTypeId: 'items-base:uht-milk', qty: 3 });
    expect(rep.suggestions[0]!.label).toBe('3 × UHT milk (1 L) back into Pantry');
    expect(rep.shortfall).toBe(3 * 640);
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
    expect(radio.suggestions[0]!.itemTypeId).toBe('items-base:wind-up-radio');
    // only things that receive broadcasts: a walkie-talkie pair does not
    for (const s of radio.suggestions)
      expect(packs.items[s.itemTypeId!]!.tags).toContain('radio-rx');
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

describe('suggestions and a household’s own item types', () => {
  it('never suggests buying a custom type, however cheap it is', () => {
    const doc = empty();
    doc.customTypes['custom:cheap-water'] = {
      id: 'custom:cheap-water',
      name: 'Cheap water',
      category: 'water',
      unit: 'bottle',
      gives: [{ store: 'waterL', amount: 20 }],
      suitability: ['frost', 'heat', 'damp'],
      shelfLife: 'none',
      typicalPricePence: 1,
      tags: ['custom'],
    };
    const merged = withCustomTypes(packs, doc.customTypes);
    const water = find(gaps(doc, merged, NOW, 3), 'water:waterL', 'acquire')!;
    expect(water.suggestions.length).toBeGreaterThan(0);
    expect(water.suggestions.some((s) => s.itemTypeId?.startsWith('custom:'))).toBe(false);
  });
});
