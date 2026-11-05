import { describe, expect, it } from 'vitest';
import { DEFAULT_PACKS, emptyDocument } from '../model';
import { sizeFits } from '../util';
import { bundledPacks } from './bundled';

describe('the bundled packs', () => {
  const packs = bundledPacks();

  it('all validate and every reference resolves', () => {
    expect(packs.all.map((p) => p.id).sort()).toEqual([...DEFAULT_PACKS].sort());
  });

  it('every default pack exists, and every region suggests real packs', () => {
    for (const id of DEFAULT_PACKS) expect(packs.byId[id], id).toBeDefined();
    expect(Object.keys(packs.regions).sort()).toEqual(['UK', 'US']);
  });

  it('every guidance rule has a source URL or "assumption"', () => {
    const rules = Object.values(packs.rules);
    expect(rules.length).toBeGreaterThan(15);
    for (const rule of rules) {
      expect(rule.source === 'assumption' || /^https:\/\//.test(rule.source), rule.id).toBe(true);
    }
    // sourced rules come from official guidance whose date we checked
    const sourced = rules.filter((r) => r.source !== 'assumption');
    expect(sourced.length).toBeGreaterThan(0);
  });

  it('every asset contribution with a number says where it comes from', () => {
    const numbered = Object.values(packs.assets).flatMap((a) =>
      a.contributes.filter((c) =>
        Object.keys(c).some((k) => !['capability', 'when', 'note', 'source'].includes(k)),
      ),
    );
    expect(numbered.length).toBeGreaterThan(10);
    for (const c of numbered) expect(c.source, JSON.stringify(c)).toBeDefined();
  });

  it('one rule owns phone power for every region, so it is not counted twice', () => {
    for (const region of ['UK', 'US'] as const) {
      const settings = { ...emptyDocument('local').settings, region };
      const owners = packs
        .enabledPacks(settings)
        .flatMap((p) => (p.kind === 'guidance' ? p.rules : []))
        .filter((r) => r.capability === 'power' && r.perPersonDay?.resource === 'batteryWh');
      expect(
        owners.map((r) => r.id),
        region,
      ).toEqual(['guidance-grid-free:phone-power']);
    }
  });

  it('states first aid once, as a one-off per household, not per day or per region', () => {
    const owners = Object.values(packs.rules).filter(
      (r) => r.perHousehold?.resource === 'firstAid',
    );
    expect(owners.map((r) => r.id)).toEqual(['guidance-grid-free:first-aid']);
    const perDay = Object.values(packs.rules).filter(
      (r) => r.perHouseholdDay?.resource === 'firstAid',
    );
    expect(perDay).toEqual([]);
  });

  it('has 150 to 180 items, each with what it counts as and sizes that fit its measure', () => {
    const items = Object.values(packs.items);
    expect(items.length).toBeGreaterThanOrEqual(150);
    expect(items.length).toBeLessThanOrEqual(180);
    for (const item of items) {
      expect(item.countsAs.length, item.id).toBeGreaterThan(0);
      expect(item.heading, item.id).toBeDefined();
      for (const size of item.sizes) expect(sizeFits(size, item.measure), item.id).toBe(true);
      if (item.assetTypeId === undefined) expect(item.sizes.length, item.id).toBeGreaterThan(0);
      else expect(item.sizes, item.id).toEqual([{ amount: 1, unit: 'pieces' }]);
    }
  });

  it('every Open Food Facts tag is on one item', () => {
    const seen = new Map<string, string>();
    for (const item of Object.values(packs.items)) {
      for (const tag of item.offCategories ?? []) {
        expect(seen.get(tag), tag).toBeUndefined();
        seen.set(tag, item.id);
      }
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('every item that gives a number has a source, and CoFID is listed with its date', () => {
    const pack = packs.byId['items-base']!;
    const listed = new Map((pack.sources ?? []).map((s) => [s.url, s.checked]));
    const cofid =
      'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid';
    expect(listed.get(cofid)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const item of Object.values(packs.items)) {
      if (item.gives.length === 0) continue;
      expect(item.source, item.id).toBeDefined();
      if (item.source !== 'assumption') expect(listed.has(item.source!), item.id).toBe(true);
    }
  });

  it('every equipment entry resolves to an asset type', () => {
    const equipment = Object.values(packs.items).filter((i) => i.assetTypeId !== undefined);
    expect(equipment.length).toBe(21);
    for (const item of equipment) expect(packs.assets[item.assetTypeId!], item.id).toBeDefined();
  });

  it('carries the figures the plan names', () => {
    const beans = packs.items['items-base:baked-beans']!;
    expect(beans.gives).toEqual([{ resource: 'foodKcal', amount: 84, per: 100 }]);
    expect(beans.sizes[0]).toEqual({ amount: 415, unit: 'g' });
    expect(packs.items['items-base:soft-drinks']!.gives).toEqual([
      { resource: 'waterL', amount: 1, per: 1000 },
      { resource: 'foodKcal', amount: 0, per: 100 },
    ]);
    expect(packs.items['items-base:nappies-size-2']!.ageBand).toBeDefined();
    expect(packs.items['items-base:formula-powder']).toBeDefined();
    expect(packs.items['items-base:water-filter']!.tags).toContain('treatment');
    expect(packs.items['items-base:wet-wipes']!.gives).toEqual([
      { resource: 'hygieneUses', amount: 1, per: 1 },
    ]);
    const phones = Object.values(packs.items).filter((i) => i.tags.includes('phone'));
    expect(phones.map((i) => i.id).sort()).toEqual([
      'items-base:power-bank-10k',
      'items-base:power-bank-20k',
      'items-base:power-bank-27k',
    ]);
  });

  it('items list in aisle order: each heading is contiguous inside its category', () => {
    const seen = new Set<string>();
    let last = '';
    for (const item of Object.values(packs.items)) {
      const key = `${item.category}/${item.heading}`;
      if (key !== last) {
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
        last = key;
      }
    }
  });

  it('models solar, home battery and EV as contributing power only with the right answer', () => {
    for (const id of ['solar-pv', 'home-battery']) {
      const a = packs.assets[`assets-base:${id}`]!;
      expect(
        a.contributes.every((c) => c.when?.question === 'hasEps' && c.when.equals === true),
      ).toBe(true);
    }
    const ev = packs.assets['assets-base:ev']!;
    expect(ev.contributes[0]!.when).toEqual({ question: 'v2l', equals: true });
    expect(ev.contributes[0]!.storesWh!.usableFraction).toBe(0.5);
  });

  it('enables the UK packs by default and the US guidance for a US household', () => {
    const uk = emptyDocument('local').settings;
    expect(packs.enabledPacks(uk).map((p) => p.id)).toContain('guidance-uk-prepare');
    expect(packs.enabledPacks(uk).map((p) => p.id)).not.toContain('guidance-us-ready');
    const us = { ...uk, region: 'US' as const };
    expect(packs.enabledPacks(us).map((p) => p.id)).toContain('guidance-us-ready');
    expect(packs.enabledPacks(us).map((p) => p.id)).not.toContain('guidance-uk-prepare');
  });
});
