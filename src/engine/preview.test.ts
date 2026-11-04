import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import { bundledPacks } from '../packs/bundled';
import { EXAMPLE_MAX_UNITS, FOOD_MIX, massKg, pickSize } from './examples';
import { preview } from './preview';

const NOW = '2026-11-04';
const packs = bundledPacks();
const rows = preview(biggarDocument(), packs, NOW);
const at = (days: number, capability: string) =>
  rows.find((h) => h.horizonDays === days)!.rows.find((r) => r.capability === capability)!;
const HORIZONS = [3, 7, 14, 28];

describe('preview examples on the Biggar household', () => {
  it('words every example as an example, keeping the headline amount', () => {
    for (const h of rows)
      for (const r of h.rows) {
        if (r.capability === 'medical' && r.unit === 'doses') continue; // an exact dose count
        expect(r.example, `${h.horizonDays} days ${r.title}`).toMatch(
          /^(e\.g\. |about the same as )/,
        );
        expect(r.amount).toBeGreaterThan(0);
      }
  });

  it('shows food as a mix of staples at every horizon, never one item for all the calories', () => {
    for (const days of HORIZONS) {
      const food = at(days, 'food').example;
      expect(food, `${days} days`).toMatch(/pasta and rice/);
      expect(food).toMatch(/porridge oats/);
      expect(food).toMatch(/peanut butter/);
      expect(food).toMatch(/tin/i);
      // four to five kinds in a list, not "about 13 × Dried pasta (5 kg)"
      expect(food.split(/, | and /).length).toBeGreaterThanOrEqual(4);
      expect(food).not.toMatch(/Dried pasta \(5 kg\)/);
    }
    expect(at(3, 'food').example).toBe(
      'e.g. 15 tins, 4 kg of pasta and rice, 1 kg of porridge oats and 3 jars of peanut butter',
    );
  });

  it('gives phone power as power banks, never a leisure battery, at every horizon', () => {
    for (const days of HORIZONS) {
      const power = at(days, 'power').example;
      expect(power, `${days} days`).toMatch(/power (bank|station)/i);
      expect(power).not.toMatch(/leisure|lead|12 ?v|\d Ah\)/i);
    }
    expect(at(3, 'power').example).toMatch(/power bank/i);
    expect(at(7, 'power').example).toMatch(/power bank/i);
  });

  it('uses everyday pack sizes with a count a household can picture', () => {
    const counted = rows.flatMap((h) =>
      h.rows
        .filter((r) => ['water', 'light', 'power', 'sanitation', 'medical'].includes(r.capability))
        .map((r) => ({ h: h.horizonDays, r, n: Number(/^e\.g\. (\d+) ×/.exec(r.example)?.[1]) })),
    );
    for (const { h, r, n } of counted) {
      if (Number.isNaN(n)) continue;
      // toilet bags at 28 days are the one need with no bigger everyday pack in the packs yet
      if (r.title === 'Toilet' && h === 28) continue;
      expect(n, `${h} days ${r.title}: ${r.example}`).toBeLessThanOrEqual(EXAMPLE_MAX_UNITS);
    }
    expect(at(3, 'water').example).toBe('e.g. 4 × Bottled water (6 × 2 L)');
    expect(at(28, 'water').example).not.toMatch(/\b(2|3)\d ×/);
  });

  it('never names equipment, an odd first answer or a bath bladder as a stock example', () => {
    for (const h of rows)
      for (const r of h.rows) {
        if (r.capability === 'heat' || r.capability === 'cooking') continue; // a heater and its fuel
        expect(r.example, r.title).not.toMatch(/bladder|cells|AA|Leisure battery/);
      }
  });

  it('keeps the heater-and-fuel wording for heat and cooking', () => {
    expect(at(7, 'heat').example).toMatch(/^e\.g\. .* and .* to run it$/);
    expect(at(7, 'cooking').example).toMatch(/^e\.g\. .* for the Gas BBQ$/);
  });
});

describe('example helpers', () => {
  it('splits the food kcal across the mix in shares that add to one', () => {
    expect(FOOD_MIX.reduce((n, p) => n + p.share, 0)).toBeCloseTo(1);
    for (const part of FOOD_MIX)
      for (const id of part.sizes) expect(packs.items[`items-base:${id}`], id).toBeDefined();
  });

  it('reads a mass from a pack size', () => {
    expect(massKg('5 kg')).toBe(5);
    expect(massKg('340 g')).toBeCloseTo(0.34);
    expect(massKg('6 x 2 L')).toBeUndefined();
    expect(massKg(undefined)).toBeUndefined();
  });

  it('prefers the cheapest size with a sane count, else the fewest packs', () => {
    const types = ['bottled-water-2l', 'bottled-water-6x2l', 'water-can', 'water-carriers'].map(
      (id) => packs.items[`items-base:${id}`]!,
    );
    expect(pickSize(types, 'waterL', 40)!.type.id).toBe('items-base:bottled-water-6x2l');
    // 30 bottles-worth of a month: only the biggest size is under a dozen packs
    expect(pickSize(types, 'waterL', 400)!.type.id).toBe('items-base:water-carriers');
    expect(pickSize([], 'waterL', 10)).toBeUndefined();
  });
});
