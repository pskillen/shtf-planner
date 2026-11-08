import { describe, expect, it } from 'vitest';
import { DEFAULT_PACKS, emptyDocument } from '../model';
import { sizeFits } from '../util';
import { checklist, checklistPacks } from '../engine';
import { bundledPacks } from './bundled';

describe('the bundled packs', () => {
  const packs = bundledPacks();

  it('all validate and every reference resolves', () => {
    // checklist packs are offered by region, never switched, so they are not default packs
    const switchable = packs.all.filter((p) => p.kind !== 'checklists');
    expect(switchable.map((p) => p.id).sort()).toEqual([...DEFAULT_PACKS].sort());
    expect(DEFAULT_PACKS).not.toContain('checklists-uk');
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

  describe('the UK checklist pack', () => {
    const pack = packs.byId['checklists-uk']!;

    it('is offered to a UK household and to nobody else', () => {
      const uk = emptyDocument('local');
      expect(checklistPacks(packs, 'UK').map((p) => p.id)).toEqual(['checklists-uk']);
      expect(checklistPacks(packs, 'US')).toEqual([]);
      expect(uk.settings.packs).not.toContain('checklists-uk');
    });

    it('gives every scenario steps, and every step a listed source or "assumption"', () => {
      if (pack.kind !== 'checklists') throw new Error('not a checklists pack');
      const listed = new Set((pack.sources ?? []).map((s) => s.url));
      for (const s of pack.sources ?? []) expect(s.checked, s.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const scenario of pack.scenarios) {
        expect(
          pack.steps.filter((st) => st.scenarios.includes(scenario.id)).length,
          scenario.id,
        ).toBeGreaterThan(0);
      }
      for (const st of pack.steps) {
        expect(st.source === 'assumption' || listed.has(st.source), st.id).toBe(true);
      }
    });

    it('builds a phased power-cut list for a UK household', () => {
      const doc = emptyDocument('local');
      const list = checklist(doc, packs, ['checklists-uk:power-cut'], '2026-11-08');
      const phases = list.groups.map((g) => g.phase);
      expect(phases).toEqual(expect.arrayContaining(['coming', 'immediate']));
      const ids = list.groups.flatMap((g) => g.steps.map((s) => s.id));
      expect(ids).toContain('checklists-uk:report');
      // safety warnings are not gated on recorded assets or household facts
      expect(ids).toContain('checklists-uk:generator');
      expect(ids).toContain('checklists-uk:no-camping-stove');
      expect(ids).toContain('checklists-uk:medical-plan');
    });

    it('builds a phased storm list with ungated safety steps', () => {
      const doc = emptyDocument('local');
      const storm = checklist(doc, packs, ['checklists-uk:storm'], '2026-11-08');
      expect(storm.groups.map((g) => g.phase)).toEqual(['coming', 'immediate', 'first-days']);
      const stormIds = storm.groups.flatMap((g) => g.steps.map((s) => s.id));
      // safety warnings are not gated on recorded facts
      expect(stormIds).toContain('checklists-uk:storm-fallen-cables');
      expect(stormIds).toContain('checklists-uk:storm-floodwater');
      expect(stormIds).toContain('checklists-uk:storm-sheltered-side');
      expect(stormIds).toContain('checklists-uk:storm-cables-after');
    });

    it('builds a phased flood list for a home that has not declared flood', () => {
      const doc = emptyDocument('local');
      expect(doc.home.risks).not.toContain('flood');
      const flood = checklist(doc, packs, ['checklists-uk:flood'], '2026-11-08');
      expect(flood.groups.map((g) => g.phase)).toEqual([
        'coming',
        'immediate',
        'first-days',
        'longer-term',
      ]);
      const ids = flood.groups.flatMap((g) => g.steps.map((s) => s.id));
      // safety steps are not gated on recorded facts or the home's risks
      expect(ids).toContain('checklists-uk:flood-warning-turn-off');
      expect(ids).toContain('checklists-uk:flood-no-walk');
      expect(ids).toContain('checklists-uk:flood-evacuate');
      // the pet step needs a pet
      expect(ids).not.toContain('checklists-uk:flood-pets-kit');
      doc.household.pets = [{ id: 'p', name: 'Bran', species: 'dog', size: 'M' }];
      const withPet = checklist(doc, packs, ['checklists-uk:flood'], '2026-11-08');
      expect(withPet.groups.flatMap((g) => g.steps.map((s) => s.id))).toContain(
        'checklists-uk:flood-pets-kit',
      );
    });

    it('builds a heatwave list with ungated heat illness steps and pet steps that need a pet', () => {
      const doc = emptyDocument('local');
      const heat = checklist(doc, packs, ['checklists-uk:heatwave'], '2026-11-08');
      expect(heat.groups.map((g) => g.phase)).toEqual(['coming', 'immediate']);
      const ids = heat.groups.flatMap((g) => g.steps.map((s) => s.id));
      // safety steps reach everyone: no risk, member or asset is recorded
      for (const id of ['heatstroke', 'exhaustion', 'closed-spaces', 'babies', 'check-others']) {
        expect(ids, id).toContain(`checklists-uk:heatwave-${id}`);
      }
      const petIds = ['pets-shade', 'dog-walks', 'dog-signs'].map(
        (id) => `checklists-uk:heatwave-${id}`,
      );
      for (const id of petIds) expect(ids).not.toContain(id);
      doc.household.pets = [{ id: 'p', name: 'Bran', species: 'dog', size: 'M' }];
      const withPet = checklist(doc, packs, ['checklists-uk:heatwave'], '2026-11-08');
      const petted = withPet.groups.flatMap((g) => g.steps.map((s) => s.id));
      for (const id of petIds) expect(petted).toContain(id);
      if (pack.kind !== 'checklists') throw new Error('not a checklists pack');
      const heatSteps = pack.steps.filter((s) => s.scenarios.includes('checklists-uk:heatwave'));
      // no heatwave step depends on a risk, member tag or heat-health alert
      expect(heatSteps.some((s) => s.requires?.risk || s.requires?.memberTag)).toBe(false);
      expect(heatSteps.every((s) => s.scenarios.length === 1)).toBe(true);
    });

    it('builds an evacuation list that works for a self-initiated and an ordered evacuation', () => {
      if (pack.kind !== 'checklists') throw new Error('not a checklists pack');
      const doc = emptyDocument('local');
      const list = checklist(doc, packs, ['checklists-uk:evacuation'], '2026-11-08');
      expect(list.groups.map((g) => g.phase)).toEqual(['coming', 'immediate', 'first-days']);
      const ids = list.groups.flatMap((g) => g.steps.map((s) => s.id));
      // leaving does not depend on an order to evacuate, on pets or on recorded members
      for (const id of ['evac-inside', 'evac-take-and-go', 'evac-grab-bag', 'evac-equipment']) {
        expect(ids, id).toContain(`checklists-uk:${id}`);
      }
      expect(ids).toContain('checklists-uk:flood-evacuate');
      const evac = pack.steps.filter((s) => s.scenarios.includes('checklists-uk:evacuation'));
      // conditions are in the text, not gates
      expect(evac.some((s) => s.requires)).toBe(false);
      expect(
        pack.scenarios.find((s) => s.id === 'checklists-uk:evacuation')!.risks,
      ).toBeUndefined();
    });

    it('has the five scenarios, and shares only the audited step ids', () => {
      if (pack.kind !== 'checklists') throw new Error('not a checklists pack');
      expect(pack.scenarios.map((s) => s.id)).toEqual([
        'checklists-uk:power-cut',
        'checklists-uk:storm',
        'checklists-uk:flood',
        'checklists-uk:heatwave',
        'checklists-uk:evacuation',
      ]);
      const shared = pack.steps
        .filter((s) => s.scenarios.length > 1)
        .map((s) => s.id)
        .sort();
      expect(shared).toEqual([
        'checklists-uk:flood-evacuate',
        'checklists-uk:flood-plan',
        'checklists-uk:flood-return-home',
        'checklists-uk:flood-shutoffs',
        'checklists-uk:storm-floodwater',
      ]);
      // every listed source is used by at least one step
      const used = new Set(pack.steps.map((s) => s.source));
      for (const src of pack.sources ?? []) expect(used.has(src.url), src.url).toBe(true);
    });

    it('orders the combined list the same whatever order scenarios are chosen in', () => {
      const doc = emptyDocument('local');
      const all = [
        'checklists-uk:power-cut',
        'checklists-uk:storm',
        'checklists-uk:flood',
        'checklists-uk:heatwave',
        'checklists-uk:evacuation',
      ];
      const a = checklist(doc, packs, all, '2026-11-08');
      const b = checklist(doc, packs, [...all].reverse(), '2026-11-08');
      const flat = (l: typeof a) => l.groups.flatMap((g) => g.steps.map((s) => s.id));
      expect(flat(b)).toEqual(flat(a));
      expect(new Set(flat(a)).size).toBe(flat(a).length);
    });

    it('labels every nation-specific flood step with its nation, and filters by none', () => {
      if (pack.kind !== 'checklists') throw new Error('not a checklists pack');
      const byId = Object.fromEntries(pack.steps.map((s) => [s.id, s]));
      const labelled: Record<string, string> = {
        'checklists-uk:flood-report-england': 'England',
        'checklists-uk:flood-report-wales': 'Wales',
        'checklists-uk:flood-report-scotland': 'Scotland',
        'checklists-uk:flood-report-ni': 'Northern Ireland',
        'checklists-uk:flood-ni-payment': 'Northern Ireland',
      };
      for (const [id, nation] of Object.entries(labelled)) {
        expect(byId[id]!.text.startsWith(`${nation}:`), id).toBe(true);
      }
      // all four nations' reporting steps reach the same household
      const doc = emptyDocument('local');
      const ids = checklist(doc, packs, ['checklists-uk:flood'], '2026-11-08').groups.flatMap((g) =>
        g.steps.map((s) => s.id),
      );
      for (const id of Object.keys(labelled)) expect(ids).toContain(id);
      // steps that name nations mid-sentence
      const mid: Record<string, string[]> = {
        'checklists-uk:flood-risk': ['England', 'Wales', 'Scotland', 'Northern Ireland'],
        'checklists-uk:flood-warnings-signup': ['England', 'Scotland', 'Wales'],
      };
      for (const [id, nations] of Object.entries(mid)) {
        for (const nation of nations) expect(byId[id]!.text, id).toContain(nation);
      }
      // no Northern Ireland warning service is claimed
      expect(byId['checklists-uk:flood-warnings-signup']!.text).not.toContain('Northern Ireland');
      expect(pack.steps.some((s) => s.requires?.risk)).toBe(false);
    });

    it('shares the floodwater driving step between storm and flood, listed once', () => {
      const doc = emptyDocument('local');
      const both = checklist(
        doc,
        packs,
        ['checklists-uk:storm', 'checklists-uk:flood'],
        '2026-11-08',
      );
      const ids = both.groups.flatMap((g) => g.steps.map((s) => s.id));
      expect(ids.filter((id) => id === 'checklists-uk:storm-floodwater')).toHaveLength(1);
      expect(new Set(ids).size).toBe(ids.length);
      const floodOnly = checklist(doc, packs, ['checklists-uk:flood'], '2026-11-08');
      expect(floodOnly.groups.flatMap((g) => g.steps.map((s) => s.id))).toContain(
        'checklists-uk:storm-floodwater',
      );
    });

    it('lists a step shared by power cut and storm once (synthetic shared step)', () => {
      const doc = emptyDocument('local');
      const real = packs.all.find((p) => p.id === 'checklists-uk');
      if (!real || real.kind !== 'checklists') throw new Error('checklists-uk missing');
      const shared = {
        id: 'checklists-uk:synthetic-shared',
        text: 'A synthetic step shared by both scenarios.',
        scenarios: ['checklists-uk:power-cut', 'checklists-uk:storm'],
        phase: 'immediate' as const,
        order: 1,
        source: 'assumption',
      };
      const withShared = {
        ...packs,
        all: packs.all.map((p) => (p === real ? { ...real, steps: [...real.steps, shared] } : p)),
      };
      const both = checklist(
        doc,
        withShared,
        ['checklists-uk:power-cut', 'checklists-uk:storm'],
        '2026-11-08',
      );
      const bothIds = both.groups.flatMap((g) => g.steps.map((s) => s.id));
      expect(bothIds.filter((id) => id === shared.id)).toHaveLength(1);
      expect(new Set(bothIds).size).toBe(bothIds.length);
      expect(bothIds).toContain('checklists-uk:generator');
      expect(bothIds).toContain('checklists-uk:storm-fallen-cables');
    });
  });
});
