// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
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

it('announces a late unfinished session without changing the finished snapshot', () => {
  const store = liveStore(biggarDocument());
  render(store.wrap(<ReviewScreen />));
  fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
  const finished = structuredClone(Object.values(store.doc().reviews)[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Start another review' }));
  act(() =>
    store.store.change('late sync', (doc) => {
      doc.reviews.late = { id: 'late', started: '2026-11-04T11:00:00Z', resolved: [] };
    }),
  );
  expect(screen.getByText('Review in progress')).toBeTruthy();
  expect(store.doc().reviews[finished!.id]).toEqual(finished);
  fireEvent.click(screen.getByRole('button', { name: /Last review/ }));
  expect(screen.getByText(/Checked 0/)).toBeTruthy();
});

it('flushes the completed review to fake Drive exactly once', async () => {
  const { openStore } = await import('../src/store/documentStore');
  const { createFakeCloud } = await import('../src/store/fakeDrive');
  const { createSync } = await import('../src/store/sync');
  const { createMemoryPersistence } = await import('../src/store/syncPersistence');
  const { StoreContext } = await import('../src/app/state/storeContext');
  const { SyncContext } = await import('../src/app/state/syncContext');
  const { JSON_FILE_NAME } = await import('../src/store/drive');
  const { MemoryRouter } = await import('react-router-dom');
  const store = await openStore({
    name: `review-${crypto.randomUUID()}`,
    env: 'local',
    deviceId: 'test',
    channel: false,
  });
  const cloud = createFakeCloud();
  const host = { isOnline: () => true, isVisible: () => true, on: () => () => {} };
  const sync = createSync({
    store,
    drive: cloud.port(),
    persistence: createMemoryPersistence(),
    env: 'local',
    host,
    debounceMs: 100000,
  });
  try {
    await sync.start();
    await sync.connect();
    const flush = vi.spyOn(sync, 'flush');
    render(
      <MemoryRouter>
        <StoreContext.Provider value={store}>
          <SyncContext.Provider value={sync}>
            <ReviewScreen />
          </SyncContext.Provider>
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    await sync.whenIdle();
    const saved = JSON.parse(cloud.text(JSON_FILE_NAME)!) as { reviews: Record<string, unknown> };
    expect(Object.values(saved.reviews)[0]).toMatchObject({
      finished: expect.any(String),
      scoreBefore: expect.any(Number),
      scoreAfter: expect.any(Number),
    });
  } finally {
    cleanup();
    sync.stop();
    await store.close();
  }
});

it('does not finish a read-only household', async () => {
  const { StoreContext } = await import('../src/app/state/storeContext');
  const { MemoryRouter } = await import('react-router-dom');
  const { SchemaTooNewError } = await import('../src/model');
  const { store } = liveStore(biggarDocument());
  const change = vi.fn();
  const status = {
    kind: 'too-new' as const,
    found: 99,
    supported: 1,
    error: new SchemaTooNewError(99, 1),
  };
  const readOnly = { ...store, status: () => status, change };
  render(
    <MemoryRouter>
      <StoreContext.Provider value={readOnly}>
        <ReviewScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  const finish = screen.getByRole('button', { name: 'Finish review' });
  expect(finish.matches(':disabled')).toBe(true);
  fireEvent.click(finish);
  expect(change).not.toHaveBeenCalled();
});
