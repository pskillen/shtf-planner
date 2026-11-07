// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { Shell } from '../src/app/Shell';
import { SettingsScreen } from '../src/app/screens/SettingsScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('shows the Home badge on the due date but not before', () => {
  vi.setSystemTime(new Date(2027, 3, 29, 12));
  const doc = biggarDocument();
  doc.meta.createdAt = '2027-01-31T00:00:00Z';
  doc.reviews = {};
  doc.settings.reviewCadenceMonths = 3;
  const s = liveStore(doc);
  render(
    s.wrap(
      <Routes>
        <Route path="*" element={<Shell />} />
      </Routes>,
    ),
  );
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).queryByText('Review due')).toBeNull();
  vi.setSystemTime(new Date(2027, 3, 30, 12));
  act(() =>
    s.store.change('refresh', (d) => {
      d.settings.anonymise = !d.settings.anonymise;
    }),
  );
  expect(within(nav).getByText('Review due')).toBeTruthy();
});

it('updates the next review date when the cadence changes', () => {
  const doc = biggarDocument();
  doc.meta.createdAt = '2027-01-31T00:00:00Z';
  doc.reviews = {};
  doc.settings.reviewCadenceMonths = 6;
  const s = liveStore(doc);
  render(s.wrap(<SettingsScreen />));
  expect(screen.getByText('Next review 31 July 2027')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Every 3 months' }));
  expect(screen.getByText('Next review 30 April 2027')).toBeTruthy();
});
