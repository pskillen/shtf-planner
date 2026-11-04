import { describe, expect, it } from 'vitest';
import { addMonths, ageInMonths } from './dates';

describe('ageInMonths', () => {
  it('counts whole months and is negative before birth', () => {
    expect(ageInMonths('2026-08-01', '2026-11-15')).toBe(3);
    expect(ageInMonths('2026-08-15', '2026-11-15')).toBe(3);
    expect(ageInMonths('2026-08-15', '2026-11-14')).toBe(2);
    expect(ageInMonths('2026-08-01', '2027-08-01')).toBe(12);
    expect(ageInMonths('2026-08-01', '2026-07-31')).toBeLessThan(0);
  });
});

describe('addMonths', () => {
  it('adds calendar months and clamps to the end of a short month', () => {
    expect(addMonths('2023-01-15', 36)).toBe('2026-01-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});
