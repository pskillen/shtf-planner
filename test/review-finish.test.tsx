// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewScreen } from '../src/app/screens/ReviewScreen';
import { finishReview } from '../src/app/screens/review/actions';
import { encodeReviewAnswer, reviewSummary } from '../src/engine';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';
import { liveStore } from './helpers/liveStore';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('finishes all known records and preserves snapshots when late answers arrive', () => {
  const doc = biggarDocument();
  const token = (opId: string, action: 'used' | 'binned') =>
    encodeReviewAnswer({ opId, key: 'stock:one', action });
  doc.reviews = {
    a: {
      id: 'a',
      started: '2026-01-01T00:00:00Z',
      resolved: [token('1', 'used')],
      scoreBefore: 20,
    },
    b: {
      id: 'b',
      started: '2026-01-02T00:00:00Z',
      resolved: [token('1', 'used')],
      scoreBefore: 30,
    },
  };
  finishReview(doc, bundledPacks(), '2026-11-04', '2026-11-04T12:00:00Z', 'new');
  const before = reviewSummary(Object.values(doc.reviews));
  expect(before).toMatchObject({ checked: 1, used: 1, before: 20 });
  expect(doc.reviews.a!.finished).toBe(doc.reviews.b!.finished);
  doc.reviews.b!.resolved.push(token('2', 'binned'));
  expect(reviewSummary(Object.values(doc.reviews))).toMatchObject({
    checked: 1,
    used: 0,
    binned: 0,
    differingAnswers: 1,
    after: before.after,
  });
});
it('finishes an empty review once and reopens its summary', () => {
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  const store = liveStore(biggarDocument());
  render(store.wrap(<ReviewScreen />));
  const finish = screen.getByRole('button', { name: 'Finish review' });
  fireEvent.click(finish);
  fireEvent.click(finish);
  expect(Object.values(store.doc().reviews)).toHaveLength(1);
  expect(screen.getByText(/Checked 0/)).toBeTruthy();
  expect(screen.getByText(/Score at finish/)).toBeTruthy();
  expect(screen.getByText(/Current weakest/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start another review' }));
  fireEvent.click(screen.getByRole('button', { name: /Last review/ }));
  expect(screen.getByText(/Checked 0/)).toBeTruthy();
});

it('flushes once after finish and keeps the local review if sync fails', async () => {
  const { SyncContext } = await import('../src/app/state/syncContext');
  const flush = vi.fn().mockRejectedValue(new Error('offline'));
  const store = liveStore(biggarDocument());
  render(
    store.wrap(
      <SyncContext.Provider value={{ flush } as never}>
        <ReviewScreen />
      </SyncContext.Provider>,
    ),
  );
  const finish = screen.getByRole('button', { name: 'Finish review' });
  fireEvent.click(finish);
  fireEvent.click(finish);
  expect(flush).toHaveBeenCalledTimes(1);
  expect(Object.values(store.doc().reviews)[0]?.finished).toBeTruthy();
  expect(screen.getByText(/Checked 0/)).toBeTruthy();
});
