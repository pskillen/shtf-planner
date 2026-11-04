import { describe, expect, it } from 'vitest';
import { buildCustomType, givesPrompt } from '../src/app/screens/stores/customType';

describe('buildCustomType', () => {
  const uuid = '0b6e4c9a-1111-4222-8333-444455556666';

  it('makes a valid item type for food from a name and the calories in one piece', () => {
    const r = buildCustomType(
      { name: ' Gran’s soup ', category: 'food', unit: 'jar', store: 'foodKcal', amount: 600 },
      uuid,
    );
    expect(r.ok && r.type).toMatchObject({
      id: `custom:${uuid}`,
      name: 'Gran’s soup',
      category: 'food',
      unit: 'jar',
      gives: [{ store: 'foodKcal', amount: 600 }],
    });
  });

  it('asks for kcal for food and litres for water when they are missing', () => {
    expect(buildCustomType({ name: 'Soup', category: 'food', unit: 'jar' }, uuid)).toEqual({
      ok: false,
      problem: 'How many kcal of food in one jar?',
    });
    expect(buildCustomType({ name: 'Cordial', category: 'water', unit: 'bottle' }, uuid)).toEqual({
      ok: false,
      problem: 'How many L of water in one bottle?',
    });
    expect(
      buildCustomType(
        { name: 'Cordial', category: 'water', unit: 'bottle', store: 'waterL', amount: 0 },
        uuid,
      ).ok,
    ).toBe(false);
  });

  it('wants a name, and lets other categories give nothing', () => {
    expect(buildCustomType({ name: '  ', category: 'tools', unit: 'each' }, uuid)).toEqual({
      ok: false,
      problem: 'Give it a name.',
    });
    const r = buildCustomType({ name: 'Crowbar', category: 'tools', unit: '' }, uuid);
    expect(r.ok && r.type).toMatchObject({ unit: 'each', gives: [] });
  });

  it('words the prompt from the store', () => {
    expect(givesPrompt('batteryWh', 'pack')).toBe('How many Wh of battery charge in one pack?');
  });
});
