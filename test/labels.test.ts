import { describe, expect, it } from 'vitest';
import { HORIZONS, HORIZON_SENTENCE } from '../src/app/labels';

describe('HORIZON_SENTENCE', () => {
  it('has a sentence for every horizon', () => {
    for (const h of HORIZONS) expect(HORIZON_SENTENCE[h]).toBeTruthy();
  });

  it('never credits Ready.gov with a length of time', () => {
    for (const h of HORIZONS) expect(HORIZON_SENTENCE[h]).not.toContain('Ready.gov suggests');
  });

  it('names an agency only for the 3-day horizon, whose UK source gives 3 days', () => {
    for (const h of HORIZONS) {
      if (h === 3) continue;
      expect(HORIZON_SENTENCE[h]).not.toMatch(/Ready\.gov|FEMA|UK Gov|Government/i);
    }
  });
});
