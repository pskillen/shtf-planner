// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoreContext } from '../src/app/state/storeContext';
import { Shell } from '../src/app/Shell';
import { ReviewScreen } from '../src/app/screens/ReviewScreen';
import { StoresScreen } from '../src/app/screens/StoresScreen';
import { reviewItems, reviewPeriod } from '../src/engine';
import { bundledPacks } from '../src/packs';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

function fixture() {
  const doc = biggarDocument();
  doc.household.members.push({
    id: 'baby:alex',
    name: 'Baby Alex',
    dob: '2026-08-01',
    tags: [],
    medication: [],
  });
  doc.plans['plans-base:first-aid-course'] = { doneAt: '2023-02-01' };
  return doc;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('shows engine order, urgency words and destinations for every kind', () => {
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  const doc = fixture();
  const store = liveStore(doc);
  render(store.wrap(<ReviewScreen />));
  const rows = within(screen.getByRole('list', { name: 'Items to review' })).getAllByRole(
    'listitem',
  );
  const expected = reviewItems(
    doc,
    bundledPacks(),
    '2026-11-04',
    reviewPeriod(doc, '2026-11-04').until,
  );
  expect(rows.map((row) => row.dataset.reviewKind)).toEqual(expected.map((row) => row.kind));
  expect(new Set(rows.map((row) => row.dataset.reviewKind))).toEqual(
    new Set(['expiry', 'maintenance', 'age', 'recount', 'plan']),
  );
  for (const row of rows) {
    expect(within(row).getByRole('link').getAttribute('href')).toMatch(/^\/app\//);
    expect(row.textContent).toMatch(/Overdue|Due today|Upcoming/);
  }
});
it('shows the empty boundary date', () => {
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  const doc = fixture();
  doc.stock = {};
  doc.assets = {};
  doc.locations = {};
  doc.plans = {};
  doc.household.members = [];
  render(liveStore(doc).wrap(<ReviewScreen />));
  expect(screen.getByText(/Nothing to check until/)).toBeTruthy();
});
it('opens the queue from Home and follows a stock row to its sheet', () => {
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  const store = liveStore(fixture());
  render(
    <MemoryRouter initialEntries={['/app']}>
      <StoreContext.Provider value={store.store}>
        <Routes>
          <Route path="/app/*" element={<Shell />} />
        </Routes>
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('link', { name: /Review.*to check/ }));
  const row = document.querySelector('[data-review-kind="expiry"]')!;
  fireEvent.click(within(row as HTMLElement).getByRole('link'));
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('keeps rows navigable but disables editing in a read-only stock sheet', () => {
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  const store = liveStore(fixture());
  const invalid = { kind: 'invalid' as const, error: new Error('invalid') };
  vi.spyOn(store.store, 'status').mockReturnValue(invalid);
  render(
    <MemoryRouter initialEntries={['/app/review']}>
      <StoreContext.Provider value={store.store}>
        <Routes>
          <Route path="/app/review" element={<ReviewScreen />} />
          <Route path="/app/stores" element={<StoresScreen />} />
        </Routes>
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  const row = document.querySelector('[data-review-kind="expiry"]')!;
  fireEvent.click(within(row as HTMLElement).getByRole('link'));
  const sheet = screen.getByRole('dialog');
  expect(within(sheet).getByText('Read-only')).toBeTruthy();
  expect(
    (within(sheet).getByRole('button', { name: 'Save' }) as HTMLButtonElement).closest('fieldset')
      ?.disabled,
  ).toBe(true);
  expect(store.labels).toEqual([]);
});
