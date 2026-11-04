import { describe, expect, it } from 'vitest';
import { coverage, gaps, score } from '../src/engine';
import {
  buildGapsView,
  closesText,
  formatPrice,
  type ShoppingSort,
} from '../src/app/screens/gaps/view';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';

const asOf = '2026-11-15';
const packs = bundledPacks();

function view(
  horizonDays: 3 | 7 | 14 | 28,
  sort: ShoppingSort = 'capability',
  doc = biggarDocument(),
) {
  return buildGapsView({
    gaps: gaps(doc, packs, asOf, horizonDays),
    score: score(doc, packs, asOf, horizonDays),
    coverage: coverage(doc, packs, asOf, horizonDays),
    horizonDays,
    region: 'UK',
    sort,
  });
}

describe('the gaps view on the fixture household', () => {
  it('lists restocking a floor before buying more', () => {
    const rows = view(14).shopping;
    const firstBuy = rows.findIndex((r) => r.kind === 'acquire');
    expect(rows.slice(0, firstBuy).every((r) => r.kind === 'replenish')).toBe(true);
    expect(rows.slice(firstBuy).every((r) => r.kind === 'acquire')).toBe(true);
    expect(rows.some((r) => r.kind === 'replenish' && /UHT milk/.test(r.label))).toBe(true);
  });

  it('says what each row closes, with a price when the pack has one', () => {
    const water = view(14).shopping.find((r) => r.capability === 'water')!;
    expect(water.label).toMatch(/^\d+ × /);
    expect(water.closes).toMatch(/^water: [\d.]+ L short of 14 days$/);
    expect(water.itemTypeId).toBeDefined();
    expect(water.pricePence).toBeGreaterThan(0);
  });

  it('suggests a heater and its fuel for heat, as two lines to tick', () => {
    const heat = view(3).shopping.filter((r) => r.capability === 'heat');
    expect(heat.length).toBe(2);
    expect(heat.every((r) => r.itemTypeId)).toBe(true);
    expect(heat[0]!.closes).toBe('heat: 18 h short of 3 days');
  });

  it('keeps store alternatives as the "or" line of one row', () => {
    const food = view(14).shopping.filter((r) => r.capability === 'food' && r.kind === 'acquire');
    expect(food.length).toBeGreaterThan(0);
    expect(food.some((r) => r.alternatives.length > 0)).toBe(true);
  });

  it('puts the weakest capability first, or the cheapest cover first', () => {
    const byWeakest = view(14, 'capability').shopping.filter((r) => r.kind === 'acquire');
    const sc = score(biggarDocument(), packs, asOf, 14);
    const weakest = sc.capabilities
      .filter((c) => c.targetCount > 0)
      .sort((a, b) => a.percent - b.percent || a.meanPercent - b.meanPercent)[0]!.capability;
    expect(byWeakest[0]!.capability).toBe(weakest);

    const byCost = view(14, 'cost').shopping.filter((r) => r.kind === 'acquire');
    const priced = byCost.map((r) => r.perUnitPence).filter((p): p is number => p !== undefined);
    expect(priced.length).toBeGreaterThan(1);
    expect(priced).toEqual([...priced].sort((a, b) => a - b));
    // what has no price per unit comes after everything that has
    const firstUnpriced = byCost.findIndex((r) => r.perUnitPence === undefined);
    if (firstUnpriced >= 0) {
      expect(byCost.slice(firstUnpriced).every((r) => r.perUnitPence === undefined)).toBe(true);
    }
  });

  it('keeps tasks and plan items in the to-do list, with the plan item to mark done', () => {
    const todo = view(3).todo;
    expect(
      todo.some((r) => r.kind === 'task' && /^Fit an EPS/.test(r.label) && r.assetTypeId),
    ).toBe(true);
    const plan = todo.find((r) => r.kind === 'plan' && r.planItemId);
    expect(plan).toBeDefined();
    expect(todo.every((r) => r.kind === 'task' || r.kind === 'plan')).toBe(true);
    // a plan item already done is not listed
    expect(todo.some((r) => r.planItemId === 'plans-base:meeting-point')).toBe(false);
  });

  it('lists what is enough, neutrally, with any surplus', () => {
    const enough = view(3).enough;
    const names = enough.map((e) => e.text);
    expect(names.some((t) => t.startsWith('Cooking: enough for 3 days'))).toBe(true);
    expect(enough.map((e) => e.capability)).not.toContain('heat');
    const doc = structuredClone(biggarDocument());
    // far more than 3 days of water: the surplus is stated
    doc.items['item-water']!.qty = 20;
    const water = view(3, 'capability', doc).enough.find((e) => e.capability === 'water');
    expect(water?.text).toMatch(/^Water: enough for 3 days; [\d.]+ L more than needed$/);
  });

  it('shortens to nothing to buy once everything is stocked', () => {
    const empty = buildGapsView({
      gaps: [],
      score: score(biggarDocument(), packs, asOf, 3),
      coverage: [],
      horizonDays: 3,
      region: 'UK',
      sort: 'capability',
    });
    expect(empty.shopping).toEqual([]);
    expect(empty.todo).toEqual([]);
  });
});

describe('wording', () => {
  it('formats prices in pounds', () => {
    expect(formatPrice(1200)).toBe('£12');
    expect(formatPrice(1250)).toBe('£12.50');
    expect(formatPrice(5)).toBe('£0.05');
  });

  it('words a one-off need without days and litres in gallons for the US', () => {
    const g = gaps(biggarDocument(), packs, asOf, 3).find((x) => x.target.kind === 'device')!;
    expect(closesText(g, 3, 'UK')).toBe('radio: 1 radio short');
    const w = gaps(biggarDocument(), packs, asOf, 3).find((x) => x.unit === 'L')!;
    expect(closesText(w, 3, 'US')).toMatch(/gal short of 3 days$/);
  });
});
