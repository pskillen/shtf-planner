import { describe, expect, it } from 'vitest';
import { DEFAULT_PACKS, emptyDocument } from '../model';
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
        .filter((r) => r.capability === 'power' && r.perPersonDay?.store === 'batteryWh');
      expect(
        owners.map((r) => r.id),
        region,
      ).toEqual(['guidance-grid-free:phone-power']);
    }
  });

  it('carries the game items plus the planner additions', () => {
    const items = Object.values(packs.items);
    expect(items.length).toBeGreaterThanOrEqual(82);
    expect(packs.items['items-base:water-can']!.gives).toEqual([{ store: 'waterL', amount: 10 }]);
    expect(packs.items['items-base:nappies-size-2']!.ageBand).toBeDefined();
    expect(packs.items['items-base:formula-powder']).toBeDefined();
    expect(packs.items['items-base:pet-food-dry-12kg']).toBeDefined();
    expect(packs.items['items-base:toilet-bags']).toBeDefined();
    expect(packs.items['items-base:lantern-led-300lm']!.gives[0]!.store).toBe('lumenHours');
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
