import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../model';
import { nextReviewDue, reviewIsDue } from './review';

describe('review cadence', () => {
  it('uses creation with month-end clamping and the selected cadence', () => {
    const doc = emptyDocument('local', '2027-01-31T12:00:00Z');
    expect(nextReviewDue(doc)).toBe('2027-07-31');
    doc.settings.reviewCadenceMonths = 3;
    expect(nextReviewDue(doc)).toBe('2027-04-30');
    expect(reviewIsDue(doc, '2027-04-29')).toBe(false);
    expect(reviewIsDue(doc, '2027-04-30')).toBe(true);
  });

  it('uses the latest finished calendar date and ignores unfinished reviews', () => {
    const doc = emptyDocument('local', '2025-01-01T00:00:00Z');
    doc.reviews = {
      first: {
        id: 'first',
        started: '2026-01-01T00:00:00Z',
        finished: '2026-01-02T00:00:00Z',
        resolved: [],
      },
      last: {
        id: 'last',
        started: '2026-02-01T00:00:00Z',
        finished: '2026-02-28T23:00:00Z',
        resolved: [],
      },
      open: { id: 'open', started: '2026-12-01T00:00:00Z', resolved: [] },
    };
    expect(nextReviewDue(doc)).toBe('2026-08-28');
  });
});
