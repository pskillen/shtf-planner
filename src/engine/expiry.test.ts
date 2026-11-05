import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPIRY, expiryLevel, expiryWindows } from './expiry';

const today = '2026-11-04';

describe('expiryLevel', () => {
  it('uses one month and three months by default', () => {
    expect(expiryLevel('2026-10', today, DEFAULT_EXPIRY)).toBe('expired');
    expect(expiryLevel('2026-11', today, DEFAULT_EXPIRY)).toBe('soon'); // good to the end of Nov
    expect(expiryLevel('2026-12', today, DEFAULT_EXPIRY)).toBe('soon');
    expect(expiryLevel('2027-01', today, DEFAULT_EXPIRY)).toBe('check');
    expect(expiryLevel('2027-02', today, DEFAULT_EXPIRY)).toBe('check');
    expect(expiryLevel('2027-03', today, DEFAULT_EXPIRY)).toBe('ok');
  });

  it('with no soon window only this month is soon', () => {
    const w = { soonMonths: 0, checkMonths: 3 };
    expect(expiryLevel('2026-11', today, w)).toBe('soon');
    expect(expiryLevel('2026-12', today, w)).toBe('check');
    expect(expiryLevel('2026-10', today, w)).toBe('expired');
  });

  it('a 12 month check window reaches a year ahead', () => {
    const w = { soonMonths: 3, checkMonths: 12 };
    expect(expiryLevel('2027-02', today, w)).toBe('soon');
    expect(expiryLevel('2027-03', today, w)).toBe('check');
    expect(expiryLevel('2027-11', today, w)).toBe('check');
    expect(expiryLevel('2027-12', today, w)).toBe('ok');
  });

  it('crosses year ends', () => {
    expect(expiryLevel('2026-12', '2026-12-31')).toBe('soon');
    expect(expiryLevel('2026-12', '2027-01-01')).toBe('expired');
  });

  it('reads an unreadable best-before as fine', () => {
    expect(expiryLevel('soon-ish', today)).toBe('ok');
  });
});

describe('expiryWindows', () => {
  it('falls back to the defaults when the settings are absent', () => {
    expect(expiryWindows({})).toEqual({ soonMonths: 1, checkMonths: 3 });
    expect(expiryWindows({ expirySoonMonths: 0, expiryCheckMonths: 12 })).toEqual({
      soonMonths: 0,
      checkMonths: 12,
    });
  });

  it('never makes the check window shorter than the soon window', () => {
    expect(expiryWindows({ expirySoonMonths: 3, expiryCheckMonths: 1 })).toEqual({
      soonMonths: 3,
      checkMonths: 3,
    });
    expect(expiryWindows({ expirySoonMonths: 3 })).toEqual({ soonMonths: 3, checkMonths: 3 });
  });
});
