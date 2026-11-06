import { describe, expect, it } from 'vitest';
import { countsAsLine } from '../src/app/screens/stores/countsAs';

describe('countsAsLine', () => {
  it('says what is true instead of "counts towards nothing"', () => {
    expect(countsAsLine('Counts towards nothing')).toBe(
      'Not scored yet: no target in the plan uses it',
    );
    expect(countsAsLine('Counts towards nothing yet (warmth)')).toBe('Not scored yet (warmth)');
    expect(countsAsLine('Counts towards nothing (morale)')).toBe('Not scored yet (morale)');
  });

  it('leaves every other line alone', () => {
    expect(countsAsLine('Water: 1 L = 1 L')).toBe('Water: 1 L = 1 L');
  });
});
