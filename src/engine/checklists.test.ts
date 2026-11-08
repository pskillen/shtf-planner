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
import { checklistPacks, checklistScenarios, isStepApplicable } from './checklists';

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
