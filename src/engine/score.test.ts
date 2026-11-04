import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import type { Asset, Document } from '../model';
import { bundledPacks } from '../packs/bundled';
import { preview } from './preview';
import { score } from './score';

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
    // food, heat, comms, sanitation and plans are all at 0 on the fixture
    expect(zeros.map((c) => c.capability)).toEqual(
      expect.arrayContaining(['food', 'heat', 'comms', 'sanitation']),
    );
    const heat = zeros.find((c) => c.capability === 'heat')!;
    expect(heat.meanPercent).toBe(0);
    for (const z of zeros) expect(z.meanPercent).toBeGreaterThanOrEqual(heat.meanPercent);
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
    doc.items['item-gas'] = {
      id: 'item-gas',
      typeId: 'items-base:gas-bottle',
      qty: 2,
      locationId: 'loc-garage',
      added: '2026-09-01',
      source: 'manual',
    };
    const heat = pct(doc, 'heat');
    expect(heat.percent).toBe(100);
    expect(score(doc, packs, NOW, 3).weakest).not.toBe('heat');
  });

  it('scores plan items together under plans, whatever capability they are for', () => {
    const s = score(biggarDocument(), packs, NOW, 3);
    const plans = s.capabilities.find((c) => c.capability === 'plans')!;
    expect(plans.targetCount).toBeGreaterThan(5);
    // one of nine done: the plans score is the weakest target, 0; the EPS plan does not zero power
    expect(plans.percent).toBe(0);
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

  it('names the heater and its fuel for heat, and leaves plan items out', () => {
    const heat = rows[1]!.rows.find((r) => r.capability === 'heat')!;
    expect(heat.unit).toBe('h');
    expect(heat.example).toMatch(/ and .* to run it$/);
    expect(rows[0]!.rows.every((r) => r.capability !== 'plans')).toBe(true);
  });

  it('does not change the document', () => {
    const before = structuredClone(doc);
    preview(doc, packs, NOW);
    expect(doc).toEqual(before);
  });
});
