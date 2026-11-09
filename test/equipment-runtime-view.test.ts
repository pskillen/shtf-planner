import { describe, expect, it } from 'vitest';
import { equipmentRuntime } from '../src/engine';
import { biggarDocument, biggarFuelDocument, BIGGAR_IDS } from '../src/fixtures/household-biggar';
import { addStock } from '../src/fixtures/stock';
import type { Document } from '../src/model';
import { bundledPacks } from '../src/packs/bundled';
import { roundDown, runtimeLines } from '../src/app/screens/assets/runtimeView';

const packs = bundledPacks();
const now = '2026-11-15';

const heater = (item = 'items-base:butane-bottle', name?: string) => ({
  id: 'heater',
  typeId: 'assets-base:cabinet-heater',
  ...(name ? { name } : {}),
  maintenance: {},
  answers: {
    setting: '1.3 kW',
    chosenLpg: item,
    fuelConfirmed: true,
    indoorUse: 'permitted',
    highRise: 'no',
  },
});

const lines = (doc: Document, assetId: string, p = packs) =>
  (runtimeLines(equipmentRuntime(doc, p, now, 3), doc, p).get(assetId) ?? []).map((l) => l.text);

describe('runtimeLines', () => {
  it('says what the propane gives the Gas BBQ', () => {
    expect(lines(biggarDocument(), 'asset-bbq')).toEqual([
      "Cooking: 3 days at your plan's use · 7.5 of 43 hours available · on 1 × Propane 13 kg",
    ]);
  });

  it('offers Quick add for a heater with no fuel in stock', () => {
    const doc = biggarDocument();
    doc.assets.heater = heater();
    const [line] = runtimeLines(equipmentRuntime(doc, packs, now, 3), doc, packs).get('heater')!;
    expect(line!.text).toBe('Heat: no Butane bottle in stock');
    expect(line!.quickAdd).toMatchObject({
      itemId: 'items-base:butane-bottle',
      label: 'Quick add Butane bottle',
    });
  });

  it('names the fuel the heater has and no Quick add', () => {
    const doc = biggarFuelDocument();
    const [line] = runtimeLines(equipmentRuntime(doc, packs, now, 3), doc, packs).get(
      'asset-butane-heater',
    )!;
    expect(line!.text).toContain('on 1 × Butane 15 kg');
    expect(line!.quickAdd).toBeUndefined();
  });

  it('says heat comes after cooking when it shares the bottle with the BBQ', () => {
    const doc = biggarDocument();
    doc.assets.heater = heater('items-base:propane-bottle');
    const [line] = lines(doc, 'heater');
    expect(line).toContain(', after cooking');
    expect(line).toContain('shares the Propane bottle with Gas BBQ');
    expect(lines(doc, 'asset-bbq')[0]).not.toContain('after');
    expect(lines(doc, 'asset-bbq')[0]).toMatch(/shares the Propane bottle with Cabinet/);
  });

  it('says power comes after heat when a generator shares the bottle with the heater', () => {
    const doc = biggarFuelDocument();
    doc.assets.gen = {
      id: 'gen',
      typeId: 'assets-base:generator',
      maintenance: {},
      answers: {
        fuel: 'lpg',
        chosenLpg: 'items-base:butane-bottle',
        fuelConfirmed: true,
        watts: 800,
        fuelPerHour: 0.5,
      },
    };
    const [line] = lines(doc, 'gen');
    expect(line).toContain(', after heat');
    expect(lines(doc, 'asset-butane-heater')[0]).not.toContain('after');
  });

  it('counts one of two same-fuel heaters and calls the other an alternative', () => {
    const doc = biggarFuelDocument();
    doc.assets.second = {
      ...heater('items-base:butane-bottle', 'Spare heater'),
      id: 'second',
    };
    const all = [...lines(doc, 'asset-butane-heater'), ...lines(doc, 'second')];
    expect(all.filter((t) => t.includes('days at your plan')).length).toBe(1);
    const alt = all.find((t) => t.includes('could use'))!;
    expect(alt).toMatch(/^Heat: could use the Butane bottle instead of .+; not counted on top$/);
  });

  it('gives hours only when no capability target applies', () => {
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
    disabled.enabledPacks = (settings) =>
      packs
        .enabledPacks(settings)
        .map((p) =>
          p.kind === 'guidance'
            ? { ...p, rules: p.rules.filter((r) => r.capability !== 'heat') }
            : p,
        );
    const [text] = lines(doc, 'heater', disabled);
    expect(text).toMatch(/^Heat: \d+ hours available · on /);
    expect(text).not.toContain('days');
  });

  it('shows one heat line for a cabinet heater, not one per power setting', () => {
    const doc = biggarFuelDocument();
    const entries = equipmentRuntime(doc, packs, now, 3).filter(
      (r) => r.assetId === 'asset-butane-heater',
    );
    expect(entries.length).toBeGreaterThan(1);
    const out = lines(doc, 'asset-butane-heater');
    expect(out.length).toBe(1);
    expect(out[0]).toMatch(/^Heat: /);
  });

  it('does not count a fuel that is not confirmed yet', () => {
    const doc = biggarFuelDocument();
    doc.assets['asset-butane-heater']!.answers.fuelConfirmed = false;
    expect(lines(doc, 'asset-butane-heater')).toEqual([
      'Heat: not counted until its checks are done',
    ]);
  });

  it('names the part that counts at a rotating place minimum', () => {
    const doc = biggarFuelDocument();
    // Two sizes of butane in one place; the engine counts only the minimum in a rotating place.
    const runtime = equipmentRuntime(doc, packs, now, 3).map((r) =>
      r.assetId === 'asset-butane-heater' && r.status === 'counted'
        ? { ...r, inputLots: r.inputLots.map((l) => ({ ...l, heldPacks: 2, countedPacks: 0.5 })) }
        : r,
    );
    const text = runtimeLines(runtime, doc, packs).get('asset-butane-heater')![0]!.text;
    expect(text).toContain('2 × Butane 15 kg (0.5 counted at the minimum)');
  });

  it('says how many are out of date and not counted', () => {
    const doc = biggarFuelDocument();
    doc.stock['stock-butane']!.bestBefore = '2026-01-01';
    expect(lines(doc, 'asset-butane-heater')[0]).toBe(
      'Heat: no Butane bottle in stock · 1 out of date, not counted',
    );
    addStock(doc, packs, {
      id: 'fresh',
      item: 'butane-bottle',
      qty: 1,
      locationId: BIGGAR_IDS.locations.garage,
    });
    expect(lines(doc, 'asset-butane-heater')[0]).toMatch(/on 1 × .+ · 1 out of date, not counted/);
  });

  it('marks a manual fuel use', () => {
    const doc = biggarFuelDocument();
    doc.assets['asset-butane-heater']!.answers.manualRate = 0.2;
    expect(lines(doc, 'asset-butane-heater')[0]).toContain('fuel use from your manual');
  });
});

describe('roundDown', () => {
  it('never rounds up', () => {
    expect(roundDown(7.5)).toBe('7.5');
    expect(roundDown(2.99)).toBe('2.9');
    expect(roundDown(3)).toBe('3');
    expect(roundDown(9.99)).toBe('9.9');
    expect(roundDown(43.3)).toBe('43');
    expect(roundDown(10.9)).toBe('10');
    expect(roundDown(0)).toBe('0');
  });
});
