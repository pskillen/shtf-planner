import { describe, expect, it } from 'vitest';
import {
  emptyDocument,
  type ChecklistStep,
  type ChecklistsPack,
  type Document,
  type Pack,
  type Packs,
  type Region,
} from '../model';
import { checklist, checklistPacks, checklistScenarios, isStepApplicable } from './checklists';

const NOW = '2026-11-15';

function step(id: string, over: Partial<ChecklistStep> = {}): ChecklistStep {
  return {
    id,
    text: id,
    scenarios: ['a:power'],
    phase: 'immediate',
    order: 1,
    source: 'assumption',
    ...over,
  };
}

function pack(id: string, over: Partial<ChecklistsPack> = {}): ChecklistsPack {
  return {
    format: 1,
    id,
    version: 1,
    name: id,
    kind: 'checklists',
    scenarios: [],
    steps: [],
    ...over,
  };
}

/** A synthetic `Packs`: only `all` matters to the checklist engine. */
function packsOf(...all: Pack[]): Packs {
  return { all } as unknown as Packs;
}

function doc(region: Region = 'UK'): Document {
  const d = emptyDocument('local', '2026-01-01T00:00:00Z');
  d.settings.region = region;
  return d;
}

describe('checklistPacks', () => {
  const uk = pack('a', { region: 'UK' });
  const us = pack('b', { region: 'US' });
  const any = pack('c');
  const other = { ...pack('d'), kind: 'plans', items: [] } as unknown as Pack;

  it('keeps region-matching checklist packs in packs.all order', () => {
    const packs = packsOf(any, us, uk, other);
    expect(checklistPacks(packs, 'UK').map((p) => p.id)).toEqual(['c', 'a']);
    expect(checklistPacks(packs, 'US').map((p) => p.id)).toEqual(['c', 'b']);
  });

  it('gives no packs for the wrong region, and ignores settings.packs', () => {
    expect(checklistPacks(packsOf(us), 'UK')).toEqual([]);
    const d = doc();
    d.settings.packs = [];
    const packs = packsOf(pack('a', { region: 'UK', scenarios: [{ id: 'a:s', name: 'S' }] }));
    expect(checklistScenarios(d, packs).map((s) => s.id)).toEqual(['a:s']);
  });
});

describe('checklistScenarios', () => {
  const packs = packsOf(
    pack('a', {
      scenarios: [
        { id: 'a:power', name: 'Power cut', risks: ['grid'] },
        { id: 'a:flood', name: 'Flood warning', risks: ['flood', 'coastal'] },
        { id: 'a:alpha', name: 'Alpha' },
      ],
    }),
    pack('b', { scenarios: [{ id: 'b:snow', name: 'Snow', risks: ['snow'] }] }),
  );

  it('puts declared-risk scenarios first, then pack order, then name, and selects nothing', () => {
    const none = checklistScenarios(doc(), packs);
    expect(none.map((s) => s.id)).toEqual(['a:alpha', 'a:flood', 'a:power', 'b:snow']);
    expect(none.every((s) => !s.riskMatch)).toBe(true);

    const d = doc();
    d.home.risks = ['snow', 'coastal'];
    const sorted = checklistScenarios(d, packs);
    expect(sorted.map((s) => [s.id, s.riskMatch])).toEqual([
      ['a:flood', true],
      ['b:snow', true],
      ['a:alpha', false],
      ['a:power', false],
    ]);
    expect(sorted[0]).toMatchObject({ name: 'Flood warning', packId: 'a' });
  });
});

describe('isStepApplicable', () => {
  it('has no gate without requires', () => {
    expect(isStepApplicable(step('a:x'), doc(), NOW)).toBe(true);
  });

  it('gates on a declared risk, and an undeclared risk hides only steps that require it', () => {
    const d = doc();
    const needs = step('a:flood', { requires: { risk: 'flood' } });
    expect(isStepApplicable(needs, d, NOW)).toBe(false);
    expect(isStepApplicable(step('a:plain'), d, NOW)).toBe(true);
    d.home.risks = ['flood'];
    expect(isStepApplicable(needs, d, NOW)).toBe(true);
  });

  it('gates on any owned asset of a listed type', () => {
    const d = doc();
    const s = step('a:gen', { requires: { asset: ['assets:generator', 'assets:stove'] } });
    expect(isStepApplicable(s, d, NOW)).toBe(false);
    d.assets = {
      one: {
        id: 'one',
        typeId: 'assets:stove',
        purchased: '2026-01-01',
        answers: {},
        maintenance: {},
      },
    } as unknown as Document['assets'];
    expect(isStepApplicable(s, d, NOW)).toBe(true);
  });

  it('gates on at least one pet', () => {
    const d = doc();
    const s = step('a:pet', { requires: { pets: true } });
    expect(isStepApplicable(s, d, NOW)).toBe(false);
    d.household.pets = [{ id: 'p', name: 'Bran', species: 'dog', size: 'M' }];
    expect(isStepApplicable(s, d, NOW)).toBe(true);
  });

  it('gates on a member tag, but not for a member not yet born on asOf', () => {
    const d = doc();
    const s = step('a:baby', { requires: { memberTag: 'infant' } });
    d.household.members = [
      { id: 'm', name: 'Jo', dob: '2027-01-01', tags: ['infant'], medication: [] },
    ];
    expect(isStepApplicable(s, d, NOW)).toBe(false);
    expect(isStepApplicable(s, d, '2027-02-01')).toBe(true);
  });

  it('combines the fields with AND', () => {
    const d = doc();
    d.home.risks = ['flood'];
    d.household.pets = [{ id: 'p', name: 'Bran', species: 'dog', size: 'M' }];
    const s = step('a:both', { requires: { risk: 'flood', pets: true } });
    expect(isStepApplicable(s, d, NOW)).toBe(true);
    d.household.pets = [];
    expect(isStepApplicable(s, d, NOW)).toBe(false);
    d.home.risks = [];
    d.household.pets = [{ id: 'p', name: 'Bran', species: 'dog', size: 'M' }];
    expect(isStepApplicable(s, d, NOW)).toBe(false);
  });
});

describe('checklist', () => {
  const sources = [{ url: 'https://example.org/a', title: 'Guide A', checked: '2026-10-01' }];
  const a = pack('a', {
    sources,
    scenarios: [
      { id: 'a:power', name: 'Power cut' },
      { id: 'a:flood', name: 'Flood warning' },
      { id: 'a:snow', name: 'Snow' },
    ],
    steps: [
      step('a:torch', { scenarios: ['a:power', 'a:flood'], phase: 'immediate', order: 2 }),
      step('a:fridge', {
        scenarios: ['a:power'],
        phase: 'first-days',
        order: 1,
        source: 'https://example.org/a',
      }),
      step('a:warn', { scenarios: ['a:flood'], phase: 'coming', order: 5 }),
      step('a:tie-b', { scenarios: ['a:power'], phase: 'immediate', order: 1 }),
      step('a:tie-a', { scenarios: ['a:power'], phase: 'immediate', order: 1 }),
      step('a:sandbags', {
        scenarios: ['a:flood'],
        phase: 'coming',
        order: 1,
        requires: { risk: 'flood' },
      }),
    ],
  });
  const b = pack('b', {
    scenarios: [{ id: 'b:power', name: 'Power cut (b)' }],
    steps: [step('b:radio', { scenarios: ['b:power'], phase: 'immediate', order: 1 })],
  });
  const packs = packsOf(a, b);
  const ids = (v: ReturnType<typeof checklist>) =>
    v.groups.map((g) => [g.phase, g.steps.map((s) => s.id)]);
  const flat = (v: ReturnType<typeof checklist>) => v.groups.flatMap((g) => g.steps);

  it('orders by phase, pack, order, then step id (duplicate orders tie-break on id)', () => {
    const v = checklist(doc(), packs, ['a:power', 'a:flood', 'b:power'], NOW);
    expect(ids(v)).toEqual([
      ['coming', ['a:warn']],
      ['immediate', ['a:tie-a', 'a:tie-b', 'a:torch', 'b:radio']],
      ['first-days', ['a:fridge']],
    ]);
  });

  it('is stable under reversed scenarioIds', () => {
    const forward = checklist(doc(), packs, ['a:power', 'a:flood', 'b:power'], NOW);
    const reversed = checklist(doc(), packs, ['b:power', 'a:flood', 'a:power'], NOW);
    expect(reversed).toEqual(forward);
    expect(forward.scenarios.map((s) => s.id)).toEqual(['a:power', 'a:flood', 'b:power']);
  });

  it('lists a shared step once, with only the selected scenarios that supplied it', () => {
    const both = flat(checklist(doc(), packs, ['a:flood', 'a:power'], NOW)).filter(
      (s) => s.id === 'a:torch',
    );
    expect(both).toHaveLength(1);
    expect(both[0]!.scenarioIds).toEqual(['a:power', 'a:flood']);
    const one = flat(checklist(doc(), packs, ['a:flood'], NOW)).find((s) => s.id === 'a:torch');
    expect(one!.scenarioIds).toEqual(['a:flood']);
  });

  it('hides only steps that explicitly require an undeclared risk', () => {
    const d = doc();
    const names = (v: ReturnType<typeof checklist>) => flat(v).map((s) => s.id);
    expect(names(checklist(d, packs, ['a:flood'], NOW))).toEqual(['a:warn', 'a:torch']);
    d.home.risks = ['flood'];
    expect(names(checklist(d, packs, ['a:flood'], NOW))).toEqual([
      'a:sandbags',
      'a:warn',
      'a:torch',
    ]);
  });

  it('carries the source title and checked date when the pack lists the source', () => {
    const steps = flat(checklist(doc(), packs, ['a:power'], NOW));
    expect(steps.find((s) => s.id === 'a:fridge')).toMatchObject({
      packId: 'a',
      source: 'https://example.org/a',
      sourceTitle: 'Guide A',
      sourceChecked: '2026-10-01',
    });
    expect(steps.find((s) => s.id === 'a:torch')!.sourceTitle).toBeUndefined();
  });

  it('gives an empty result for unknown ids or none, and omits empty phases', () => {
    expect(checklist(doc(), packs, ['nope:x'], NOW)).toEqual({ scenarios: [], groups: [] });
    expect(checklist(doc(), packs, [], NOW)).toEqual({ scenarios: [], groups: [] });
    const snow = checklist(doc(), packs, ['a:snow'], NOW);
    expect(snow.groups).toEqual([]);
    expect(snow.scenarios).toEqual([{ id: 'a:snow', name: 'Snow' }]);
    const power = checklist(doc(), packs, ['a:power'], NOW);
    expect(power.groups.map((g) => g.phase)).toEqual(['immediate', 'first-days']);
  });

  it('returns nothing for the wrong region and ignores settings.packs', () => {
    const us = packsOf(pack('u', { region: 'US', scenarios: [{ id: 'u:s', name: 'S' }] }));
    expect(checklist(doc('UK'), us, ['u:s'], NOW)).toEqual({ scenarios: [], groups: [] });
    const d = doc();
    d.settings.packs = [];
    expect(checklist(d, packs, ['a:power'], NOW).groups).not.toEqual([]);
  });
});
