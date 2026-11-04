import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../model';
import { PackError, loadPacks, packVersionReport, parsePack, recordPackVersions } from './loader';

const base = { format: 1, version: 1, name: 'x' };
const file = (raw: unknown, label = 'x.json') => ({ label, raw });

const items = {
  ...base,
  id: 'items-t',
  kind: 'items',
  items: [
    {
      id: 'items-t:water',
      name: 'Water',
      category: 'water',
      unit: 'L',
      gives: [{ store: 'waterL', amount: 1 }],
      suitability: ['frost'],
      shelfLife: 'years',
      tags: [],
    },
  ],
};
const assets = {
  ...base,
  id: 'assets-t',
  kind: 'assets',
  assets: [
    {
      id: 'assets-t:pv',
      name: 'PV',
      category: 'power',
      questions: [
        { id: 'kwp', text: 'kWp?', kind: 'number' },
        { id: 'hasEps', text: 'EPS?', kind: 'bool' },
      ],
      contributes: [
        {
          capability: 'power',
          when: { question: 'hasEps', equals: true },
          providesPerDayFrom: { question: 'kwp', factor: 800 },
        },
      ],
      maintenance: [],
    },
  ],
};
const guidance = {
  ...base,
  id: 'guidance-t',
  kind: 'guidance',
  region: 'UK',
  sources: [{ url: 'https://example.org/x', title: 'X', checked: '2026-01-01' }],
  horizonBands: [3],
  rules: [
    {
      id: 'guidance-t:water',
      capability: 'water',
      text: 'water',
      perPersonDay: { store: 'waterL', amount: 3 },
      source: 'https://example.org/x',
    },
  ],
};
const plans = {
  ...base,
  id: 'plans-t',
  kind: 'plans',
  items: [
    {
      id: 'plans-t:eps',
      text: 'EPS',
      capability: 'power',
      requires: { asset: ['assets-t:pv'] },
    },
  ],
};
const regions = {
  ...base,
  id: 'regions-t',
  kind: 'regions',
  regions: [
    {
      id: 'UK',
      units: { volume: 'L', temperature: 'C' },
      currency: 'GBP',
      riskLinks: [{ risk: 'flood', label: 'Flood', url: 'https://example.org/flood' }],
      suggestedPacks: ['items-t'],
    },
  ],
};
const good = () =>
  [items, assets, guidance, plans, regions].map((p) => file(structuredClone(p), `${p.id}.json`));

describe('loadPacks', () => {
  it('loads valid packs and indexes their contents', () => {
    const packs = loadPacks(good());
    expect(Object.keys(packs.byId)).toHaveLength(5);
    expect(packs.items['items-t:water']!.name).toBe('Water');
    expect(packs.assets['assets-t:pv']).toBeDefined();
    expect(packs.rules['guidance-t:water']).toBeDefined();
    expect(packs.plans['plans-t:eps']).toBeDefined();
    expect(packs.regions.UK!.currency).toBe('GBP');
  });

  it('rejects a broken pack with a readable error naming the field', () => {
    const broken = structuredClone(items) as typeof items;
    (broken.items[0]!.gives[0] as { store: string }).store = 'waterLitres';
    expect(() => loadPacks([file(broken)])).toThrow(PackError);
    try {
      loadPacks([file(broken)]);
    } catch (e) {
      const msg = (e as PackError).message;
      expect(msg).toContain('Pack items-t is invalid');
      expect(msg).toContain('items[0].gives[0].store');
    }
  });

  it('rejects unknown keys (a typo is an error)', () => {
    const typo = { ...structuredClone(items), itemz: [] };
    expect(() => parsePack(typo)).toThrow(/itemz/);
  });

  it('rejects an unknown kind and a wrong format', () => {
    expect(() => parsePack({ ...items, kind: 'widgets' })).toThrow(PackError);
    expect(() => parsePack({ ...items, format: 2 })).toThrow(PackError);
  });

  it('rejects an id outside the pack namespace and duplicates', () => {
    const wrongPrefix = structuredClone(items) as typeof items;
    wrongPrefix.items[0]!.id = 'other:water';
    expect(() => loadPacks([file(wrongPrefix)])).toThrow(/must start with "items-t:"/);

    const dupe = structuredClone(items) as typeof items;
    dupe.items.push(structuredClone(dupe.items[0]!));
    expect(() => loadPacks([file(dupe)])).toThrow(/duplicate id/);

    expect(() => loadPacks([file(items), file(items)])).toThrow(/duplicate pack id/);
  });

  it('rejects an item that gives medicationDays', () => {
    const bad = structuredClone(items) as typeof items;
    (bad.items[0]!.gives[0] as { store: string }).store = 'medicationDays';
    expect(() => loadPacks([file(bad)])).toThrow(/medicationDays is computed/);
  });

  it('checks a contribution names a real question', () => {
    const bad = structuredClone(assets) as typeof assets;
    (bad.assets[0]!.contributes[0]!.when as { question: string }).question = 'nope';
    expect(() => loadPacks([file(bad)])).toThrow(/question "nope" does not exist/);
  });

  it('checks a rule source is listed with the date checked, or is an assumption', () => {
    const unlisted = structuredClone(guidance) as typeof guidance;
    unlisted.rules[0]!.source = 'https://example.org/other';
    expect(() => loadPacks([file(unlisted)])).toThrow(/not listed in the pack's sources/);

    const assumption = structuredClone(guidance) as typeof guidance;
    assumption.rules[0]!.source = 'assumption';
    expect(() => loadPacks([file(assumption)])).not.toThrow();

    const noSource = structuredClone(guidance) as typeof guidance;
    (noSource.rules[0] as { source?: string }).source = 'trust me';
    expect(() => loadPacks([file(noSource)])).toThrow(PackError);
  });

  it('checks plan items name real asset types and regions name real packs', () => {
    const badPlan = structuredClone(plans) as typeof plans;
    badPlan.items[0]!.requires.asset = ['assets-t:nope'];
    expect(() => loadPacks([file(assets), file(badPlan)])).toThrow(/asset type "assets-t:nope"/);

    expect(() => loadPacks([file(regions)])).toThrow(/pack "items-t" does not exist/);
  });

  it('requires a rule to carry a quantity and a multiplier to name one thing', () => {
    const empty = structuredClone(guidance) as typeof guidance;
    delete (empty.rules[0] as { perPersonDay?: unknown }).perPersonDay;
    expect(() => loadPacks([file(empty)])).toThrow(/needs a quantity/);

    const multi = structuredClone(guidance) as typeof guidance;
    (multi.rules[0] as Record<string, unknown>).multipliers = [
      { tag: 'infant', risk: 'flood', factor: 2 },
    ];
    expect(() => loadPacks([file(multi)])).toThrow(/exactly one of tag, risk, insulation/);
  });
});

describe('enabledPacks', () => {
  const packs = loadPacks(good());
  const settings = (list: string[], region: 'UK' | 'US') => ({ packs: list, region });

  it('returns the listed packs in the listed order', () => {
    const ids = packs.enabledPacks(settings(['plans-t', 'items-t'], 'UK')).map((p) => p.id);
    expect(ids).toEqual(['plans-t', 'items-t']);
  });

  it('skips unknown ids and packs for another region', () => {
    const ids = packs
      .enabledPacks(settings(['items-t', 'guidance-t', 'nope'], 'US'))
      .map((p) => p.id);
    expect(ids).toEqual(['items-t']);
    expect(packs.enabledPacks(settings(['guidance-t'], 'UK')).map((p) => p.id)).toEqual([
      'guidance-t',
    ]);
  });
});

describe('pack versions in the document', () => {
  const packs = loadPacks(good());
  const doc = () => ({
    ...emptyDocument('local'),
    settings: { ...emptyDocument('local').settings, packs: ['items-t', 'plans-t'] },
  });

  it('records the version of a pack on first use and leaves it after', () => {
    const d = doc();
    expect(packVersionReport(d.meta, packs, d.settings).unrecorded).toEqual(['items-t', 'plans-t']);
    recordPackVersions(d, packs);
    expect(d.meta.packVersions).toEqual({ 'items-t': 1, 'plans-t': 1 });
    expect(packVersionReport(d.meta, packs, d.settings)).toEqual({
      unrecorded: [],
      mismatched: [],
    });
  });

  it('reports a mismatch without failing or overwriting', () => {
    const d = doc();
    d.meta.packVersions['items-t'] = 0;
    recordPackVersions(d, packs);
    expect(d.meta.packVersions['items-t']).toBe(0);
    expect(packVersionReport(d.meta, packs, d.settings).mismatched).toEqual([
      { id: 'items-t', recorded: 0, loaded: 1 },
    ]);
  });
});
