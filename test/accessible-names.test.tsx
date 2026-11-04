// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeScreen } from '../src/app/screens/HomeScreen';
import { PeopleScreen } from '../src/app/screens/PeopleScreen';
import { StoreContext } from '../src/app/state/storeContext';
import type { DocumentStore } from '../src/store';
import { biggarDocument } from '../src/fixtures/household-biggar';

afterEach(cleanup);

const doc = biggarDocument();
const ok = { kind: 'ok' as const };
const store = {
  get: () => doc,
  status: () => ok,
  subscribe: () => () => undefined,
  change: () => undefined,
} as unknown as DocumentStore;

const wrap = (ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <StoreContext.Provider value={store}>{ui}</StoreContext.Provider>
    </MemoryRouter>,
  );

describe('accessible names include the visible text', () => {
  it('names each medication number box by its label and the medicine', () => {
    wrap(<PeopleScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Pat' }));
    for (const visible of ['Units taken per day', 'Units on hand', 'Repeat cycle in days']) {
      const box = screen.getByRole('spinbutton', { name: new RegExp(`^${visible} for Ramipril`) });
      expect(box).toBeTruthy();
    }
  });

  it('lets the visible label name a number box that sits alone in its field', () => {
    wrap(<HomeScreen />);
    expect(screen.getByRole('spinbutton', { name: 'How many floors?' })).toBeTruthy();
  });
});
