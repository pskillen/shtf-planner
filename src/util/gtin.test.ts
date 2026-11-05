import { describe, expect, it } from 'vitest';
import { isValidGtin, normaliseGtin } from './gtin';

describe('isValidGtin', () => {
  it('accepts real codes', () => {
    expect(isValidGtin('3017620422003')).toBe(true); // EAN-13
    expect(isValidGtin('5000169005743')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('036000291452')).toBe(true); // UPC-A
    expect(isValidGtin('10012345678902')).toBe(true); // GTIN-14
  });

  it('rejects a wrong check digit, wrong lengths and non-digits', () => {
    expect(isValidGtin('3017620422004')).toBe(false);
    expect(isValidGtin('96385075')).toBe(false);
    expect(isValidGtin('036000291453')).toBe(false);
    expect(isValidGtin('30176204220')).toBe(false); // 11 digits
    expect(isValidGtin('')).toBe(false);
    expect(isValidGtin('30176204220a3')).toBe(false);
  });
});

describe('normaliseGtin', () => {
  it('turns a UPC-A into its EAN-13 form', () => {
    expect(normaliseGtin('036000291452')).toBe('0036000291452');
    expect(isValidGtin(normaliseGtin('036000291452'))).toBe(true);
  });

  it('leaves the other lengths alone', () => {
    expect(normaliseGtin('3017620422003')).toBe('3017620422003');
    expect(normaliseGtin('96385074')).toBe('96385074');
    expect(normaliseGtin(' 3017620422003 ')).toBe('3017620422003');
  });
});
