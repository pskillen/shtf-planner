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

  it('words a restock from its floor, with no days, and marks a buy row as beyond restocking', () => {
    const rows = view(14).shopping;
    const milk = rows.find((r) => r.kind === 'replenish' && /UHT milk/.test(r.label))!;
    expect(milk.closes).toMatch(
      /^Pantry: UHT milk[^:]* (is \d+ below its floor of \d+|has none in date \(floor \d+\))$/,
    );
    expect(milk.closes).not.toMatch(/short of/);
    const buys = rows.filter((r) => r.kind === 'acquire' && r.targetId === milk.targetId);
    expect(buys.length).toBeGreaterThan(0);
    for (const b of buys) expect(b.closes).toMatch(/short of 14 days, beyond restocking$/);
    // a need with nothing to restock says nothing of the kind
    const water = rows.find((r) => r.capability === 'water')!;
    expect(water.closes).not.toMatch(/restocking/);
  });

  it('makes a restock plus the buy row equal the target’s shortfall, with nothing counted twice', () => {
    const doc = biggarDocument();
    // stock below the floors: milk at 1 of 3, pasta gone
    doc.items['item-uht']!.qty = 1;
    delete doc.items['item-pasta'];
    const all = gaps(doc, packs, asOf, 14);
    const cover = new Map(coverage(doc, packs, asOf, 14).map((c) => [c.targetId, c.amount]));
    const restocks = all.filter((g) => g.kind === 'replenish');
    expect(restocks.length).toBeGreaterThanOrEqual(2);
    const targetId = restocks[0]!.target.id;
    const mine = restocks.filter((g) => g.target.id === targetId);
    const buy = all.find((g) => g.kind === 'acquire' && g.target.id === targetId)!;
    expect(buy).toBeDefined();
    const need = buy.target.amount - (cover.get(targetId) ?? 0);
    const restocked = mine.reduce((n, g) => n + g.shortfall, 0);
    expect(restocked).toBeGreaterThan(0);
    expect(restocked + buy.shortfall).toBeCloseTo(need, 6);
    // and the view words the buy row with the reduced amount
    const row = view(14, 'capability', doc).shopping.find(
      (r) => r.kind === 'acquire' && r.capability === buy.capability,
    )!;
    expect(row.closes).toContain(`${Math.round(buy.shortfall * 10) / 10} kcal short`);
    expect(row.closes).toMatch(/, beyond restocking$/);
  });

  it('marks only the buy row of the restocked target as beyond restocking', () => {
    const rows = view(14).shopping;
    const kcal = rows.find((r) => r.kind === 'acquire' && r.targetId === 'food:foodKcal')!;
    expect(kcal.closes).toMatch(/, beyond restocking$/);
    const formula = rows.find((r) => r.kind === 'acquire' && r.targetId === 'food:formulaG')!;
    expect(formula.capability).toBe(kcal.capability);
    expect(formula.closes).not.toMatch(/restocking/);
    const pets = rows.filter((r) => r.kind === 'acquire' && r.targetId === 'food:petFoodKcal');
    for (const r of pets) expect(r.closes).not.toMatch(/restocking/);
  });

  it('words a restock with nothing in date as having none, not as 3 below 3', () => {
    const doc = biggarDocument();
    delete doc.items['item-pasta'];
    delete doc.items['item-uht'];
    const rows = view(14, 'capability', doc).shopping.filter((r) => r.kind === 'replenish');
    const milk = rows.find((r) => /UHT milk/.test(r.label))!;
    expect(milk.closes).toMatch(/^Pantry: UHT milk[^:]* has none in date \(floor 3\)$/);
    expect(milk.closes).not.toMatch(/below/);
    // some in date: the amount below the floor
    const fresh = biggarDocument();
    delete fresh.items['item-uht']!.bestBefore;
    fresh.items['item-uht']!.qty = 1;
    const partly = view(14, 'capability', fresh).shopping.find((r) => /UHT milk/.test(r.label));
    expect(partly?.closes).toMatch(/ is 2 below its floor of 3$/);
  });

  it('shows no buy row when restocking alone closes the gap', () => {
    const doc = biggarDocument();
    const kcal = packs.items['items-base:uht-milk']!.gives[0]!.amount;
    doc.floors['loc-pantry|items-base:uht-milk'] = 1;
    doc.items['item-uht']!.qty = 1;
    const food = (d: typeof doc) =>
      gaps(d, packs, asOf, 14).filter((g) => g.target.id === 'food:foodKcal');
    const open = food(doc).find((g) => g.kind === 'acquire')!;
    // raise the floor so that putting the milk back covers the whole food shortfall
    doc.floors['loc-pantry|items-base:uht-milk'] = 1 + Math.ceil(open.shortfall / kcal);
    const after = food(doc);
    expect(after.some((g) => g.kind === 'replenish')).toBe(true);
    expect(after.some((g) => g.kind === 'acquire')).toBe(false);
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
    // rows are in different units (litres, kcal, hours, radios): compare their own prices
    expect(new Set(byCost.map((r) => r.capability)).size).toBeGreaterThan(3);
    const prices = byCost.map((r) => r.pricePence ?? Infinity);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices.filter(Number.isFinite).length).toBeGreaterThan(1);
    // the same price keeps the weakest first
    const rank = byWeakest.map((r) => r.key);
    for (let i = 1; i < byCost.length; i++) {
      if (prices[i] === prices[i - 1]) {
        expect(rank.indexOf(byCost[i - 1]!.key)).toBeLessThan(rank.indexOf(byCost[i]!.key));
      }
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

  it('words a task without a shortfall and hides the EPS plan item while EPS tasks show', () => {
    const todo = view(3).todo;
    const solar = todo.find((r) => r.kind === 'task' && /Roof solar/.test(r.label))!;
    expect(solar.closes).toBe('Roof solar gives nothing in a power cut until an EPS is fitted');
    expect(todo.filter((r) => r.kind === 'task').every((r) => !/short/.test(r.closes))).toBe(true);
    expect(todo.filter((r) => /EPS/i.test(r.label))).toHaveLength(2);
    expect(todo.some((r) => r.planItemId === 'plans-base:eps')).toBe(false);
    // with the EPS fitted there are no tasks and the plan item is not offered either (engine rule)
    const doc = structuredClone(biggarDocument());
    for (const a of Object.values(doc.assets)) if ('hasEps' in a.answers) a.answers.hasEps = true;
    expect(view(3, 'capability', doc).todo.some((r) => /EPS/.test(r.label))).toBe(false);
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
