import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import { addStock } from '../fixtures/stock';
import type { Asset, Document } from '../model';
import { bundledPacks } from '../packs/bundled';
import { CAPABILITY_ORDER } from './context';
import { preview } from './preview';
import { PLANS_EXPONENT, plansPercent, productPercent, score } from './score';

const NOW = '2026-11-15';
const packs = bundledPacks();
const pct = (doc: Document, cap: string, days = 3) =>
  score(doc, packs, NOW, days).capabilities.find((c) => c.capability === cap)!;

const asset = (id: string, type: string, answers: Asset['answers'] = {}): Asset => ({
  id,
  typeId: `assets-base:${type}`,
  answers,
  maintenance: {},
});

describe('score', () => {
  it('scores heat 0 on the plain fixture and names it the weakest', () => {
    const s = score(biggarDocument(), packs, NOW, 3);
    expect(pct(biggarDocument(), 'heat').percent).toBe(0);
    expect(s.weakest).toBe('heat');
    // cooking is the BBQ's, power is the EVs': both enough
    expect(pct(biggarDocument(), 'cooking').percent).toBe(100);
    expect(pct(biggarDocument(), 'power').percent).toBe(100);
  });

  it('breaks a tie of zeros by the lower mean cover, then by capability order', () => {
    const s = score(biggarDocument(), packs, NOW, 3);
    const zeros = s.capabilities.filter((c) => c.targetCount > 0 && c.percent === 0);
    // food, heat, comms and sanitation are all at 0 on the fixture
    expect(zeros.map((c) => c.capability)).toEqual(
      expect.arrayContaining(['food', 'heat', 'comms', 'sanitation']),
    );
    const heat = zeros.find((c) => c.capability === 'heat')!;
    const comms = zeros.find((c) => c.capability === 'comms')!;
    expect(heat.meanPercent).toBe(0);
    for (const z of zeros) expect(z.meanPercent).toBeGreaterThanOrEqual(heat.meanPercent);
    // heat and comms each have one empty target, so they tie on the mean too: heat wins only
    // because it comes first in the capability order
    expect(comms.meanPercent).toBe(heat.meanPercent);
    expect(CAPABILITY_ORDER.indexOf('heat')).toBeLessThan(CAPABILITY_ORDER.indexOf('comms'));
    expect(s.weakest).toBe('heat');
  });

  it('caps at 100 but keeps the raw ratio', () => {
    const power = pct(biggarDocument(), 'power');
    expect(power.percent).toBe(100);
    expect(power.raw).toBeGreaterThan(100);
    expect(power.weakestTarget!.id).toBe('power:batteryWh');
  });

  it('makes overall the mean of the capabilities that have targets', () => {
    const s = score(biggarDocument(), packs, NOW, 3);
    const scored = s.capabilities.filter((c) => c.targetCount > 0);
    expect(scored.length).toBeGreaterThan(5);
    const mean = scored.reduce((n, c) => n + c.percent, 0) / scored.length;
    expect(s.overall).toBeCloseTo(mean, 9);
    expect(s.overall).toBeGreaterThan(0);
    expect(s.overall).toBeLessThan(100);
  });

  it('scores the weakest target, so an empty medication cannot hide behind a full first aid kit', () => {
    const doc = biggarDocument();
    expect(pct(doc, 'medical').percent).toBe(100);
    doc.household.members[4]!.medication[0]!.unitsOnHand = 0;
    const medical = pct(doc, 'medical');
    expect(medical.percent).toBe(0);
    expect(medical.weakestTarget!.kind).toBe('medication');
  });

  it('lifts heat once there is a heater and fuel', () => {
    const doc = biggarDocument();
    doc.assets['asset-heater'] = asset('asset-heater', 'cabinet-heater', { setting: '1.3 kW' });
    addStock(doc, packs, { id: 'gas', item: 'butane-bottle', qty: 2, locationId: 'loc-garage' });
    const heat = pct(doc, 'heat');
    expect(heat.percent).toBe(100);
    expect(score(doc, packs, NOW, 3).weakest).not.toBe('heat');
  });

  it('scores plan items together under plans, whatever capability they are for', () => {
    const s = score(biggarDocument(), packs, NOW, 3);
    const plans = s.capabilities.find((c) => c.capability === 'plans')!;
    expect(plans.targetCount).toBeGreaterThan(5);
    // one of nine done: (1/9)^1.5 = 3.7 %; the EPS plan does not zero power
    expect(plans.percent).toBeCloseTo(100 / 27, 9);
    expect(plans.meanPercent).toBeGreaterThan(0);
  });

  it('gets weaker as the horizon grows, and previews the next one', () => {
    const doc = biggarDocument();
    const at3 = score(doc, packs, NOW, 3);
    const at7 = score(doc, packs, NOW, 7);
    const at14 = score(doc, packs, NOW, 14);
    expect(at7.overall).toBeLessThanOrEqual(at3.overall);
    expect(at14.overall).toBeLessThanOrEqual(at7.overall);
    expect(at3.nextHorizonDays).toBe(7);
    expect(at3.nextHorizonPreview).toBeCloseTo(at7.overall, 9);
    expect(at14.nextHorizonDays).toBe(28);
    expect(score(doc, packs, NOW, 28).nextHorizonDays).toBeUndefined();
  });

  it('has no targets to meet for an empty household but a radio and plans', () => {
    const doc = biggarDocument();
    doc.household.members = [];
    doc.household.pets = [];
    const s = score(doc, packs, NOW, 3);
    expect(s.capabilities.find((c) => c.capability === 'water')!.targetCount).toBe(0);
    expect(Number.isFinite(s.overall)).toBe(true);
  });
});

describe('the capability rule: the product of the cover ratios', () => {
  it.each([
    // [ratios, percent]: the owner's worked examples first
    [[0.5, 0.9], 45],
    [[0.8, 0.9], 72],
    [[0, 1], 0],
    [[1, 0], 0],
    [[0.7], 70],
    [[1, 1, 1], 100],
    [[0.5, 0.5, 0.5], 12.5],
    [[2.5, 0.9], 90],
    [[3, 4], 100],
  ])('%j scores %d', (ratios, percent) => {
    expect(productPercent(ratios as number[])).toBeCloseTo(percent as number, 9);
  });
});

describe('the plans rule: (done / total) to the power 1.5', () => {
  it('uses 1.5 as one named constant', () => {
    expect(PLANS_EXPONENT).toBe(1.5);
  });

  it('gives 4, 10, 19, 30, 41, 54, 69, 84 % for 1 to 8 of 9, and 100 only when all are done', () => {
    const rounded = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => Math.round(plansPercent(d, 9)));
    expect(rounded).toEqual([4, 10, 19, 30, 41, 54, 69, 84]);
    expect(plansPercent(0, 9)).toBe(0);
    expect(plansPercent(9, 9)).toBe(100);
  });

  it('rises as plan items are marked done', () => {
    const doc = biggarDocument();
    const before = pct(doc, 'plans').percent;
    const target = score(doc, packs, NOW, 3).capabilities.find(
      (c) => c.capability === 'plans',
    )!.weakestTarget!;
    const open = target.id.replace(/^plan:/, '');
    doc.plans[open] = { doneAt: NOW };
    const after = pct(doc, 'plans').percent;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(100 * (2 / 9) ** 1.5, 9);
  });
});

describe('preview', () => {
  const doc = biggarDocument();
  const rows = preview(doc, packs, NOW);

  it('has rows for all four horizons', () => {
    expect(rows.map((r) => r.horizonDays)).toEqual([3, 7, 14, 28]);
    for (const r of rows) expect(r.rows.length).toBeGreaterThan(8);
  });

  it('gives every row an example and a growing amount', () => {
    for (const h of rows)
      for (const row of h.rows) expect(row.example.length, row.label).toBeGreaterThan(0);
    const water = (days: number) =>
      rows.find((r) => r.horizonDays === days)!.rows.find((r) => r.capability === 'water')!;
    expect(water(3).amount).toBeCloseTo(47.25);
    expect(water(28).amount).toBeCloseTo(441);
    expect(water(28).example).toMatch(/×/);
  });

  it('does not offer a bath bladder or loose cells as the example at 7, 14 or 28 days', () => {
    for (const days of [7, 14, 28]) {
      const h = rows.find((r) => r.horizonDays === days)!;
      const water = h.rows.find((r) => r.capability === 'water')!;
      expect(water.example, `water at ${days}`).not.toMatch(/bladder/i);
      const power = h.rows.find((r) => r.capability === 'power')!;
      expect(power.example, `power at ${days}`).not.toMatch(/cells|batteries/i);
    }
  });

  it('names the heater and its fuel for heat, and leaves plan items out', () => {
    const heat = rows[1]!.rows.find((r) => r.capability === 'heat')!;
    expect(heat.unit).toBe('h');
    expect(heat.example).toMatch(/ and .* to run it$/);
    expect(rows[0]!.rows.every((r) => r.capability !== 'plans')).toBe(true);
  });

  it('gives every row a sentence-case title for screens', () => {
    const titles = rows[0]!.rows.map((r) => r.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Drinking water',
        'Food',
        'Heat',
        'Cooking',
        'Light',
        'Power for phones',
        'Radio',
        'Toilet',
        'First aid',
        'Driving range',
        'Ramipril',
      ]),
    );
    for (const h of rows) for (const r of h.rows) expect(r.title, r.label).toMatch(/^[A-Z]/);
  });

  it('types horizonDays as one of the offered horizons', () => {
    const first: 3 | 7 | 14 | 28 = rows[0]!.horizonDays;
    expect(first).toBe(3);
  });

  it('does not change the document', () => {
    const before = structuredClone(doc);
    preview(doc, packs, NOW);
    expect(doc).toEqual(before);
  });
});
