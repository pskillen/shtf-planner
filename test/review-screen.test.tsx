// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { StoreContext } from '../src/app/state/storeContext';
import { Shell } from '../src/app/Shell';
import { ReviewScreen } from '../src/app/screens/ReviewScreen';
import { PeopleScreen } from '../src/app/screens/PeopleScreen';
import { StoresScreen } from '../src/app/screens/StoresScreen';
import { reviewItems, reviewPeriod } from '../src/engine';
import { bundledPacks } from '../src/packs';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back in test</button>
      <button onClick={() => navigate(1)}>Forward in test</button>
    </>
  );
}
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
    expect(within(row).getAllByRole('link')[0]!.getAttribute('href')).toMatch(/^\/app\//);
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

it('updates the person sheet on query navigation and keeps a draft on unrelated updates', () => {
  const doc = fixture();
  const store = liveStore(doc);
  const [first, second] = doc.household.members;
  render(
    <MemoryRouter initialEntries={[`/app/people?member=${first!.id}`]}>
      <StoreContext.Provider value={store.store}>
        <HistoryControls />
        <Link to={`/app/people?member=${second!.id}`}>Second person</Link>
        <Link to="/app/people?member=missing">Missing person</Link>
        <PeopleScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  const name = within(screen.getByRole('dialog')).getByLabelText('Name') as HTMLInputElement;
  fireEvent.change(name, { target: { value: 'Unsaved draft' } });
  act(() =>
    store.store.change('unrelated', (d) => {
      d.settings.anonymise = !d.settings.anonymise;
    }),
  );
  expect(name.value).toBe('Unsaved draft');
  fireEvent.click(screen.getByRole('link', { name: 'Second person' }));
  expect(screen.getByRole('dialog', { name: `Edit ${second!.name}` })).toBeTruthy();
  expect(
    (within(screen.getByRole('dialog')).getByLabelText('Name') as HTMLInputElement).value,
  ).toBe(second!.name);
  fireEvent.click(screen.getByRole('button', { name: 'Back in test' }));
  expect(screen.getByRole('dialog', { name: `Edit ${first!.name}` })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Forward in test' }));
  expect(screen.getByRole('dialog', { name: `Edit ${second!.name}` })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Missing person' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('updates stock and place on same-route navigation and preserves unrelated query parameters', () => {
  const doc = fixture();
  const store = liveStore(doc);
  const [first, second] = Object.values(doc.stock);
  const firstName = doc.products[first!.productId]!.name;
  const secondName = doc.products[second!.productId]!.name;
  render(
    <MemoryRouter initialEntries={[`/app/stores?stock=${first!.id}&place=loc-pantry`]}>
      <StoreContext.Provider value={store.store}>
        <HistoryControls />
        <Link to={`/app/stores?stock=${second!.id}&place=loc-garage`}>Second stock</Link>
        <Link to="/app/stores?stock=missing&place=missing">Missing stock</Link>
        <StoresScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  expect(screen.getByRole('dialog', { name: `Edit ${firstName}` })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Second stock' }));
  expect(screen.getByRole('dialog', { name: `Edit ${secondName}` })).toBeTruthy();
  expect(screen.getByText('Place: Garage')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back in test' }));
  expect(screen.getByRole('dialog', { name: `Edit ${firstName}` })).toBeTruthy();
  expect(screen.getByText('Place: Pantry')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Forward in test' }));
  expect(screen.getByRole('dialog', { name: `Edit ${secondName}` })).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Place: Garage')).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Missing stock' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText(/^Place:/)).toBeNull();
});

it('closes an existing person draft when the person disappears', () => {
  const doc = fixture();
  const store = liveStore(doc);
  const first = doc.household.members[0]!;
  render(
    <MemoryRouter initialEntries={[`/app/people?member=${first.id}&keep=yes`]}>
      <StoreContext.Provider value={store.store}>
        <Link to="/app/people?keep=yes">Remove member query</Link>
        <Link to={`/app/people?member=${first.id}&keep=yes`}>Open person</Link>
        <PeopleScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('link', { name: 'Remove member query' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Open person' }));
  act(() =>
    store.store.change('remove person elsewhere', (d) => {
      d.household.members = d.household.members.filter((m) => m.id !== first.id);
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(store.doc().household.members.some((m) => m.id === first.id)).toBe(false);
});

it('closes an existing stock draft when the stock disappears', () => {
  const doc = fixture();
  const store = liveStore(doc);
  const first = Object.values(doc.stock)[0]!;
  render(
    <MemoryRouter initialEntries={[`/app/stores?stock=${first.id}&place=loc-pantry`]}>
      <StoreContext.Provider value={store.store}>
        <Link to="/app/stores">Remove queries</Link>
        <Link to={`/app/stores?stock=${first.id}&place=loc-pantry`}>Open stock</Link>
        <StoresScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('link', { name: 'Remove queries' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText(/^Place:/)).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Open stock' }));
  act(() =>
    store.store.change('remove stock elsewhere', (d) => {
      delete d.stock[first.id];
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(store.doc().stock[first.id]).toBeUndefined();
});
