import { describe, expect, it, vi } from 'vitest';
import {
  formatItemMeasureTotal,
  formatPackTotal,
  worstExpiryWord,
} from '../src/app/screens/stores/storesGrouping';
import { biggarDocument } from '../src/fixtures/household-biggar';

describe('storesGrouping', () => {
  it('formats pack totals with fractions', () => {
    expect(formatPackTotal(1.5, 'tin')).toBe('1½ tins');
  });

  it('formats base measure totals in kg', () => {
    expect(formatItemMeasureTotal('mass', 5800)).toBe('5.8 kg');
  });

  it('picks the worst expiry word on batches', () => {
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    const doc = biggarDocument();
    const stocks = [
      { ...doc.stock['stock-beans']!, bestBefore: '2028-06' },
      {
        id: 's2',
        productId: 'prod-beans',
        qty: 1,
        locationId: 'loc-pantry',
        added: '2026-09-01',
        source: 'manual' as const,
        bestBefore: '2026-10',
      },
    ];
    expect(worstExpiryWord(stocks, '2026-11-04', doc.settings)).toBe('Expired');
  });
});
