// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetsScreen } from '../src/app/screens/AssetsScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument, biggarFuelDocument } from '../src/fixtures/household-biggar';
import type { Document } from '../src/model';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const BBQ_LINE =
  "Cooking: 3 days at your plan's use · 7.5 of 43 hours available · on 1 × Propane 13 kg";

function show(doc: Document) {
  const s = liveStore(doc);
  render(
    <MemoryRouter>
      <StoreContext.Provider value={s.store}>
        <AssetsScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  return s;
}

describe('equipment runtime on the Equipment screen', () => {
  it('shows what the fuel gives on the row and in the form', () => {
    show(biggarDocument());
    const row = screen.getByRole('button', { name: 'Edit Gas BBQ' });
    expect(row.textContent).toContain(BBQ_LINE);
    fireEvent.click(row);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(BBQ_LINE)).toBeTruthy();
    expect(within(dialog).queryByText('With these answers:')).toBeNull();
  });

  it('previews unsaved answers in the form', () => {
    show(biggarFuelDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Butane heater' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/^Heat: .* hours available/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('switch', { name: /checked the chosen fuel/ }));
    expect(within(dialog).getByText('With these answers:')).toBeTruthy();
    expect(within(dialog).getByText('Heat: not counted until its checks are done')).toBeTruthy();
  });

  it('puts Quick add outside the Edit button and opens it on the fuel', () => {
    const doc = biggarFuelDocument();
    delete doc.stock['stock-butane'];
    show(doc);
    const edit = screen.getByRole('button', { name: 'Edit Butane heater' });
    expect(edit.textContent).toContain('Heat: no Butane bottle in stock');
    const quick = screen.getByRole('button', { name: 'Quick add Butane bottle' });
    expect(edit.contains(quick)).toBe(false);
    expect(quick.closest('button:not(.runtime-add)')).toBeNull();
    fireEvent.click(quick);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Add Butane/)).toBeTruthy();
  });
});
