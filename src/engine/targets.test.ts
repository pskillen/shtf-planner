import { describe, expect, it } from 'vitest';
import { biggarDocument } from '../fixtures/household-biggar';
import { BUNDLED_PACK_FILES, bundledPacks } from '../packs/bundled';
import { loadPacks } from '../packs/loader';
import { targets, type Target } from './targets';

const NOW = '2026-11-15';
const packs = bundledPacks();
const byId = (list: Target[], id: string) => list.find((t) => t.id === id);

describe('targets', () => {
  it('sums people, pets and days into water, with each rule named and sourced', () => {
    const t = byId(targets(biggarDocument(), packs, NOW, 3), 'water:waterL')!;
    // 5 people x 3 L x 3 days + a medium dog x 0.75 L x 3 days
    expect(t.amount).toBeCloseTo(45 + 2.25);
    expect(t.unit).toBe('L');
    expect(t.rules.map((r) => r.ruleId).sort()).toEqual([
      'guidance-grid-free:pet-water',
      'guidance-uk-prepare:water',
    ]);
    for (const r of t.rules) expect(r.source).not.toBe('');
    expect(t.rules.reduce((n, r) => n + r.contribution, 0)).toBeCloseTo(t.amount);
  });

  it("uses the infant's age band for formula and nappies, and moves bands with the date", () => {
    const doc = biggarDocument();
    // Jo, born 2026-08-01, is 3 months on 2026-11-15: band 0-6 months.
    const now = targets(doc, packs, NOW, 3);
    expect(byId(now, 'food:formulaG')!.amount).toBe(100 * 3);
    expect(byId(now, 'sanitation:nappies')!.amount).toBe(10 * 3);
    // 9 months on 2027-05-15: nappies drop to the 6-12 band, formula stays in 0-12.
    const later = targets(doc, packs, '2027-05-15', 3);
    expect(byId(later, 'sanitation:nappies')!.amount).toBe(8 * 3);
    expect(byId(later, 'food:formulaG')!.amount).toBe(100 * 3);
    // 12 months on 2027-08-01: exactly the end of the formula band, so no formula; nappies 12-36.
    const toddler = targets(doc, packs, '2027-08-01', 3);
    expect(byId(toddler, 'food:formulaG')).toBeUndefined();
    expect(byId(toddler, 'sanitation:nappies')!.amount).toBe(6 * 3);
  });

  it('does not count kcal for an infant on formula, so the two do not double count', () => {
    const doc = biggarDocument(); // five people, Jo is 3 months old
    expect(byId(targets(doc, packs, NOW, 3), 'food:foodKcal')!.amount).toBe(4 * 2000 * 3);
    expect(byId(targets(doc, packs, NOW, 14), 'food:foodKcal')!.amount).toBe(4 * 2000 * 14);
    // at 12 months the formula band has ended and Jo eats like everyone else
    expect(byId(targets(doc, packs, '2027-08-01', 3), 'food:foodKcal')!.amount).toBe(5 * 2000 * 3);
  });

  it('leaves out a baby who is not born yet', () => {
    const t = targets(biggarDocument(), packs, '2026-06-01', 3);
    expect(byId(t, 'sanitation:nappies')).toBeUndefined();
    expect(byId(t, 'water:waterL')!.amount).toBeCloseTo(36 + 2.25);
  });

  it('multiplies heat hours by the matching multipliers', () => {
    const doc = biggarDocument();
    // excellent insulation x0.5 and a snow risk x1.5 on 8 hours a day
    expect(byId(targets(doc, packs, NOW, 3), 'heat:hours')!.amount).toBeCloseTo(8 * 0.5 * 1.5 * 3);
    doc.home.insulation = 'poor';
    doc.home.risks = [];
    expect(byId(targets(doc, packs, NOW, 3), 'heat:hours')!.amount).toBeCloseTo(8 * 1.5 * 3);
    doc.home.insulation = 'average';
    doc.home.risks = ['snow'];
    expect(byId(targets(doc, packs, NOW, 14), 'heat:hours')!.amount).toBeCloseTo(8 * 1.5 * 14);
  });

  it('turns cooking meals into burner hours', () => {
    const t = byId(targets(biggarDocument(), packs, NOW, 3), 'cooking:hours')!;
    expect(t.amount).toBeCloseTo(5 * 2 * 3 * 0.25);
    expect(t.unit).toBe('h');
  });

  it('applies the powered-equipment tag only to the person who has it', () => {
    const doc = biggarDocument();
    expect(byId(targets(doc, packs, NOW, 1), 'power:batteryWh')!.amount).toBe(5 * 15);
    doc.household.members[0]!.tags.push('powered-equipment');
    expect(byId(targets(doc, packs, NOW, 1), 'power:batteryWh')!.amount).toBe(4 * 15 + 15 * 8);
  });

  it('asks for one target per medication: dose per day x days, critical ones marked', () => {
    const doc = biggarDocument();
    const at14 = byId(targets(doc, packs, NOW, 14), 'medical:medication:med-ramipril')!;
    expect(at14.amount).toBe(14);
    expect(at14.unit).toBe('doses');
    expect(at14.critical).toBe(true);
    expect(at14.resource).toBe('medication:med-ramipril');
    expect(byId(targets(doc, packs, NOW, 28), 'medical:medication:med-ramipril')!.amount).toBe(28);
  });

  it('asks for one first aid kit at every horizon, not one per day', () => {
    const doc = biggarDocument();
    for (const days of [3, 14, 28]) {
      const t = byId(targets(doc, packs, NOW, days), 'medical:firstAid')!;
      expect(t.amount, `${days} days`).toBe(3);
      expect(t.fixed).toBe(true);
    }
  });

  it('asks for a driving range and a radio', () => {
    const t = targets(biggarDocument(), packs, NOW, 3);
    expect(byId(t, 'mobility:range')).toMatchObject({ amount: 100, unit: 'km' });
    expect(byId(t, 'comms:radio')).toMatchObject({ amount: 1, kind: 'device' });
  });

  it('lists only the plan items that apply, and drops zero-amount targets', () => {
    const t = targets(biggarDocument(), packs, NOW, 3);
    const plans = t.filter((x) => x.kind === 'plan').map((x) => x.planItemId);
    expect(plans).toContain('plans-base:eps'); // solar and a home battery
    expect(plans).toContain('plans-base:pets'); // a dog
    expect(plans).not.toContain('plans-base:water-butt'); // no water butt
    expect(t.every((x) => x.amount > 0)).toBe(true);

    const doc = biggarDocument();
    doc.household.pets = [];
    expect(targets(doc, packs, NOW, 3).some((x) => x.planItemId === 'plans-base:pets')).toBe(false);
  });

  it('drops the EPS plan item once every asset it is about has an EPS', () => {
    const doc = biggarDocument();
    const eps = (d: typeof doc) =>
      targets(d, packs, NOW, 3).some((x) => x.planItemId === 'plans-base:eps');
    expect(eps(doc)).toBe(true);
    doc.assets['asset-solar']!.answers.hasEps = true;
    expect(eps(doc)).toBe(true); // the battery still lacks one
    doc.assets['asset-battery']!.answers.hasEps = true;
    expect(eps(doc)).toBe(false);
  });

  it('skips a rule below its minimum horizon', () => {
    const files = structuredClone(BUNDLED_PACK_FILES) as { label: string; raw: unknown }[];
    const grid = files.find((f) => f.label === 'guidance-grid-free.json')!.raw as {
      rules: { id: string; minHorizonDays?: number }[];
    };
    grid.rules.find((r) => r.id === 'guidance-grid-free:pet-water')!.minHorizonDays = 7;
    const custom = loadPacks(files);
    const doc = biggarDocument();
    expect(byId(targets(doc, custom, NOW, 3), 'water:waterL')!.amount).toBeCloseTo(45);
    expect(byId(targets(doc, custom, NOW, 7), 'water:waterL')!.amount).toBeCloseTo(105 + 5.25);
  });

  it('applies a 3-day pack at 14 days, and a banded pack even below its band', () => {
    const doc = biggarDocument();
    expect(byId(targets(doc, packs, NOW, 14), 'water:waterL')!.amount).toBeCloseTo(
      15 * 14 + 0.75 * 14,
    );
    // The US pack speaks to 14 days; a 3-day horizon still gets its water rule.
    doc.home.region = 'US';
    doc.settings.region = 'US';
    expect(byId(targets(doc, packs, NOW, 3), 'water:waterL')!.amount).toBeCloseTo(
      5 * 3.785 * 3 + 0.75 * 3,
    );
  });

  it('does not change the document', () => {
    const doc = biggarDocument();
    const before = structuredClone(doc);
    targets(doc, packs, NOW, 14);
    expect(doc).toEqual(before);
  });
});
