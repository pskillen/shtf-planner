import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../model';
import {
  decodeReviewAnswer,
  encodeReviewAnswer,
  reviewSession,
  reviewSummary,
} from './reviewSession';

describe('review answer codec and sessions', () => {
  it('round trips opaque colon keys and ignores malformed metadata', () => {
    const a = { opId: 'op', key: 'maint:a%3Ab:pack%3Ajob', action: 'done' as const };
    expect(decodeReviewAnswer(encodeReviewAnswer(a))).toEqual(a);
    for (const value of [
      'review-answer/v1:bad',
      'review-answer/v2:["x"]',
      'review-answer/v1:["a","stock:x","bad"]',
    ])
      expect(decodeReviewAnswer(value)).toBeUndefined();
  });
  it('orders started timestamps by instant even with offsets', () => {
    const doc = emptyDocument('local', '2026-01-01T00:00:00Z');
    doc.reviews = {
      later: { id: 'later', started: '2026-05-01T23:30:00Z', resolved: [] },
      earlier: { id: 'earlier', started: '2026-05-02T00:30:00+02:00', resolved: [] },
    };
    expect(reviewSession(doc).ids).toEqual(['earlier', 'later']);
  });
  it('unions unfinished sessions and counts duplicate or conflicting answers once', () => {
    const doc = emptyDocument('local', '2026-01-01T00:00:00Z');
    const first = encodeReviewAnswer({ opId: '1', key: 'stock:a:b', action: 'used' });
    const conflict = encodeReviewAnswer({ opId: '2', key: 'stock:a:b', action: 'fine' });
    doc.reviews = {
      b: { id: 'b', started: '2026-02-02T00:00:00Z', resolved: [first, conflict] },
      a: { id: 'a', started: '2026-02-01T00:00:00Z', resolved: [first, 'recount:x'] },
      done: {
        id: 'done',
        started: '2026-01-01T00:00:00Z',
        finished: '2026-01-02T00:00:00Z',
        resolved: [],
      },
    };
    const session = reviewSession(doc);
    expect(session.ids).toEqual(['a', 'b']);
    expect(session.answers).toHaveLength(2);
    expect([...session.resolvedKeys].sort()).toEqual(['recount:x', 'stock:a:b']);
    expect(reviewSummary([doc.reviews.a!, doc.reviews.b!])).toMatchObject({
      checked: 2,
      differingAnswers: 1,
      used: 0,
    });
  });
});
