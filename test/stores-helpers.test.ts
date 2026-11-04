import { describe, expect, it } from 'vitest';
import {
  addMonthsYM,
  addStock,
  formatMonth,
  matchTypes,
  monthChips,
  monthTone,
  parseMonth,
  suitabilityWarning,
} from '../src/app/screens/stores/stock';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';

const water = { name: 'Water can (10 L)', suitability: ['frost' as const] };
const shed = { name: 'Shed', conditions: ['frost' as const, 'damp' as const, 'heat' as const] };

describe('suitabilityWarning', () => {
  it('names what the place does to the item', () => {
    expect(suitabilityWarning({ name: 'Tinned soup', suitability: [] }, { ...shed })).toBe(
      'Tinned soup may freeze, get damp or get too hot in the Shed',
    );
    expect(
      suitabilityWarning(
        { name: 'Water can (10 L)', suitability: ['damp', 'heat'] },
        { name: 'Garage', conditions: ['frost', 'damp'] },
      ),
    ).toBe('Water can (10 L) may freeze in the Garage');
  });

  it('says nothing when the type tolerates every condition, whatever it lists besides', () => {
    expect(suitabilityWarning({ name: 'x', suitability: ['frost', 'heat', 'damp'] }, shed)).toBe(
      undefined,
    );
    expect(suitabilityWarning(water, { name: 'Loft', conditions: ['frost'] })).toBeUndefined();
  });

  it('ignores indoor-stable and a place with no conditions', () => {
    expect(
      suitabilityWarning(
        { name: 'x', suitability: [] },
        { name: 'Pantry', conditions: ['indoor-stable'] },
      ),
    ).toBeUndefined();
    expect(
      suitabilityWarning({ name: 'x', suitability: [] }, { name: 'Hall', conditions: [] }),
    ).toBeUndefined();
  });

  it('on the fixture, flags nothing that the packs say is fine and something that is not', () => {
    const doc = biggarDocument();
    const packs = bundledPacks();
    const uht = packs.items['items-base:uht-milk']!;
    expect(suitabilityWarning(uht, doc.locations['loc-pantry']!)).toBeUndefined();
    expect(suitabilityWarning(uht, doc.locations['loc-shed']!)).toMatch(/in the Shed$/);
  });
});

describe('best-before months', () => {
  it('formats and colours by nearness', () => {
    expect(formatMonth('2027-03')).toBe('Mar 2027');
    expect(formatMonth('nonsense')).toBe('nonsense');
    const today = '2026-11-04';
    expect(monthTone('2026-10', today)).toBe('past');
    // this month is not past yet, but it is soon
    expect(monthTone('2026-11', today)).toBe('soon');
    expect(monthTone('2027-02', today)).toBe('soon');
    expect(monthTone('2027-03', today)).toBe('ok');
  });

  it('moves a month across year ends in both directions', () => {
    expect(addMonthsYM('2026-11', 3)).toBe('2027-02');
    expect(addMonthsYM('2026-01', -1)).toBe('2025-12');
    expect(addMonthsYM('2026-12', 12)).toBe('2027-12');
    expect(addMonthsYM('2026-06', 60)).toBe('2031-06');
  });

  it('reads typed months in the usual ways and refuses the rest', () => {
    expect(parseMonth('2027-03')).toBe('2027-03');
    expect(parseMonth(' 3/2027 ')).toBe('2027-03');
    expect(parseMonth('03/27')).toBe('2027-03');
    expect(parseMonth('Mar 2027')).toBe('2027-03');
    expect(parseMonth('september 2028')).toBe('2028-09');
    expect(parseMonth('2027-13')).toBeUndefined();
    expect(parseMonth('2027-00')).toBeUndefined();
    expect(parseMonth('soon')).toBeUndefined();
    expect(parseMonth('')).toBeUndefined();
  });

  it('offers chips from how long the item keeps', () => {
    const today = '2026-11-04';
    expect(monthChips('years', today)).toEqual([
      { label: '+1 y', value: '2027-11' },
      { label: '+2 y', value: '2028-11' },
      { label: '+5 y', value: '2031-11' },
    ]);
    expect(monthChips('none', today)).toEqual([]);
    expect(monthChips('months', today).map((c) => c.label)).toEqual(['+3 m', '+6 m', '+1 y']);
    expect(monthChips('weeks', today)[0]).toEqual({ label: '+1 m', value: '2026-12' });
  });
});

describe('matchTypes', () => {
  const types = Object.values(bundledPacks().items);

  it('puts recent types first and the rest by name', () => {
    const recent = ['items-base:tinned-food', 'items-base:water-can'];
    const out = matchTypes(types, '', recent);
    expect(out.slice(0, 2).map((t) => t.id)).toEqual(recent);
    expect(out).toHaveLength(types.length);
    const rest = out.slice(2).map((t) => t.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('matches name, unit size, category and tags, ignoring case', () => {
    expect(matchTypes(types, 'WATER CAN').some((t) => t.id === 'items-base:water-can')).toBe(true);
    expect(matchTypes(types, '10 l').some((t) => t.id === 'items-base:water-can')).toBe(true);
    expect(matchTypes(types, 'zzzzzz')).toEqual([]);
  });
});

describe('addStock', () => {
  const stock = { typeId: 'items-base:water-can', qty: 2, locationId: 'loc-garage' };

  it('adds a new instance, dated today and entered by hand', () => {
    const doc = structuredClone(biggarDocument());
    const id = addStock(doc, { ...stock, bestBefore: '2027-05' }, '2026-11-04', () => 'new-1');
    expect(id).toBe('new-1');
    expect(doc.items['new-1']).toEqual({
      id: 'new-1',
      typeId: 'items-base:water-can',
      qty: 2,
      locationId: 'loc-garage',
      bestBefore: '2027-05',
      added: '2026-11-04',
      source: 'manual',
    });
  });

  it('adds to stock that is the same type, place and best-before instead of listing it twice', () => {
    const doc = structuredClone(biggarDocument());
    // the fixture holds two water cans in the garage with no best-before
    const before = Object.keys(doc.items).length;
    const id = addStock(doc, stock, '2026-11-04');
    expect(id).toBe('item-water');
    expect(doc.items['item-water']!.qty).toBe(4);
    expect(Object.keys(doc.items)).toHaveLength(before);
    // a different best-before is a separate row
    addStock(doc, { ...stock, bestBefore: '2028-01' }, '2026-11-04', () => 'other');
    expect(doc.items['other']).toBeDefined();
  });
});
