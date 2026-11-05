import { describe, expect, it } from 'vitest';
import type { Size } from '../model';
import { baseAmount, formatSize, measureOfUnit, parseSize, sameSize, sizeFits } from './size';

describe('parseSize', () => {
  it.each<[string, Size]>([
    ['415 g', { amount: 415, unit: 'g' }],
    ['415g', { amount: 415, unit: 'g' }],
    ['1kg', { amount: 1, unit: 'kg' }],
    ['1,5 l', { amount: 1.5, unit: 'L' }],
    ['70 cl', { amount: 700, unit: 'ml' }],
    ['330ml', { amount: 330, unit: 'ml' }],
    ['2 L', { amount: 2, unit: 'L' }],
    ['1 litre', { amount: 1, unit: 'L' }],
    ['24 x 500 ml', { count: 24, amount: 500, unit: 'ml' }],
    ['6 × 2 L', { count: 6, amount: 2, unit: 'L' }],
    ['4x400g', { count: 4, amount: 400, unit: 'g' }],
    ['12 pieces', { amount: 12, unit: 'pieces' }],
    ['1 x 500 ml', { amount: 500, unit: 'ml' }],
  ])('reads "%s"', (text, size) => {
    expect(parseSize(text)).toEqual(size);
  });

  it('cannot read a count of things that are not a size', () => {
    expect(parseSize('8 x AA')).toBeUndefined();
    expect(parseSize('')).toBeUndefined();
    expect(parseSize(undefined)).toBeUndefined();
  });

  it('falls back to product_quantity and its unit as a single size', () => {
    expect(parseSize(undefined, 415, 'g')).toEqual({ amount: 415, unit: 'g' });
    expect(parseSize('lots', 1.5, 'l')).toEqual({ amount: 1.5, unit: 'L' });
    expect(parseSize(undefined, 70, 'cl')).toEqual({ amount: 700, unit: 'ml' });
    expect(parseSize(undefined, 250)).toEqual({ amount: 250, unit: 'g' });
    expect(parseSize(undefined, 0, 'g')).toBeUndefined();
    expect(parseSize(undefined, 5, 'furlong')).toBeUndefined();
  });

  it('prefers the text, which carries the multipack', () => {
    expect(parseSize('24 x 330 ml', 7920, 'ml')).toEqual({ count: 24, amount: 330, unit: 'ml' });
  });
});

describe('size arithmetic', () => {
  it('baseAmount is the total in g, ml or pieces', () => {
    expect(baseAmount({ amount: 415, unit: 'g' })).toBe(415);
    expect(baseAmount({ amount: 1.5, unit: 'kg' })).toBe(1500);
    expect(baseAmount({ count: 24, amount: 500, unit: 'ml' })).toBe(12000);
    expect(baseAmount({ count: 6, amount: 2, unit: 'L' })).toBe(12000);
    expect(baseAmount({ amount: 8, unit: 'pieces' })).toBe(8);
  });

  it('sizeFits checks the unit against the measure', () => {
    expect(sizeFits({ amount: 1, unit: 'kg' }, 'mass')).toBe(true);
    expect(sizeFits({ amount: 1, unit: 'kg' }, 'volume')).toBe(false);
    expect(sizeFits({ amount: 1, unit: 'L' }, 'volume')).toBe(true);
    expect(sizeFits({ amount: 4, unit: 'pieces' }, 'count')).toBe(true);
    expect(sizeFits({ amount: 4, unit: 'pieces' }, 'mass')).toBe(false);
  });

  it('measureOfUnit', () => {
    expect(measureOfUnit('g')).toBe('mass');
    expect(measureOfUnit('ml')).toBe('volume');
    expect(measureOfUnit('pieces')).toBe('count');
  });

  it('formatSize', () => {
    expect(formatSize({ amount: 415, unit: 'g' })).toBe('415 g');
    expect(formatSize({ count: 24, amount: 500, unit: 'ml' })).toBe('24 × 500 ml');
    expect(formatSize({ amount: 1.5, unit: 'kg' })).toBe('1.5 kg');
    expect(formatSize({ amount: 8, unit: 'pieces' })).toBe('8 pieces');
    expect(formatSize({ amount: 1, unit: 'pieces' })).toBe('1 piece');
  });

  it('sameSize compares the total, the unit family and the count', () => {
    expect(sameSize({ amount: 500, unit: 'g' }, { amount: 0.5, unit: 'kg' })).toBe(true);
    expect(sameSize({ amount: 500, unit: 'g' }, { amount: 500, unit: 'ml' })).toBe(false);
    expect(
      sameSize({ count: 6, amount: 1, unit: 'L' }, { count: 6, amount: 1000, unit: 'ml' }),
    ).toBe(true);
    expect(sameSize({ count: 6, amount: 1, unit: 'L' }, { amount: 6, unit: 'L' })).toBe(false);
    expect(sameSize({ amount: 415, unit: 'g' }, { amount: 220, unit: 'g' })).toBe(false);
  });
});
