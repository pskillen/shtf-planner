// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetsScreen } from '../src/app/screens/AssetsScreen';
import { StoresScreen } from '../src/app/screens/StoresScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

/** The Stores and Equipment screens under their real paths, so a link from one reaches the other. */
function app(start: string) {
  const s = liveStore(biggarDocument());
  render(
    <MemoryRouter initialEntries={[start]}>
      <StoreContext.Provider value={s.store}>
        <Routes>
          <Route path="/app/stores" element={<StoresScreen />} />
          <Route path="/app/assets" element={<AssetsScreen />} />
        </Routes>
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  return s;
}

const search = (text: string) =>
  fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: text } });

describe('equipment is added to the home, never as stock', () => {
  it('quick add of a stove ends in an asset, not a stock row', () => {
    const s = app('/app/stores');
    const items = Object.keys(s.doc().items).length;
    const assets = Object.keys(s.doc().assets).length;

    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }));
    search('stove');
    // no stock row for a stove: only the equipment route
    expect(screen.queryByRole('button', { name: /stove/i })).toBeNull();
    const route = screen.getByRole('region', { name: 'Equipment: add to your home' });
    fireEvent.click(within(route).getByRole('link', { name: /Camping stove/ }));

    // the equipment form opens with the type already chosen
    expect(screen.getByText('Add Camping stove (gas canister)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(Object.keys(s.doc().items).length).toBe(items);
    const added = Object.values(s.doc().assets);
    expect(added.length).toBe(assets + 1);
    expect(added.some((a) => a.typeId === 'assets-base:camping-stove')).toBe(true);
  });

  it('shows the equipment route right under the search, before any stock matches', () => {
    app('/app/stores');
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }));
    search('heater');
    const route = screen.getByRole('region', { name: 'Equipment: add to your home' });
    const stock = document.querySelector('.row-list:not(section *)') ?? route;
    const searchRow = document.querySelector('.search-row')!;
    expect(
      searchRow.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(route.compareDocumentPosition(stock) & Node.DOCUMENT_POSITION_PRECEDING).toBeFalsy();
  });

  it('finds equipment by the name of the thing people buy for it', () => {
    app('/app/stores');
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }));
    search('solar panel');
    const route = screen.getByRole('region', { name: 'Equipment: add to your home' });
    expect(within(route).getByRole('link', { name: /Solar PV array/ })).toBeTruthy();
    search('leisure battery');
    expect(screen.queryByRole('button', { name: /Leisure battery/ })).toBeNull();
  });

  it('keeps a power bank as stock: it has no maintenance and is used up', () => {
    app('/app/stores');
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }));
    search('power bank');
    expect(screen.getAllByRole('button', { name: /power bank/i }).length).toBeGreaterThan(0);
  });

  it('offers one route to the equipment screen when nothing is typed', () => {
    app('/app/stores');
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }));
    const link = screen.getByRole('link', { name: /Equipment: add to your home/ });
    expect(link.getAttribute('href')).toBe('/app/assets');
  });
});

describe('Stores shows the equipment kept in each place', () => {
  it('lists a place’s equipment as read-only rows that open the equipment form', () => {
    app('/app/stores');
    const shed = screen.getByRole('region', { name: 'Shed' });
    const row = within(shed).getByRole('link', { name: 'Edit equipment Gas BBQ' });
    expect(row.getAttribute('href')).toBe('/app/assets?edit=asset-bbq');
    // read-only: the row is a link, with no stepper or delete beside it
    expect(within(shed).queryByRole('button', { name: /Gas BBQ/ })).toBeNull();
    fireEvent.click(row);
    expect(screen.getByText('Edit Gas BBQ')).toBeTruthy();
  });

  it('lists equipment with no place, or a place that has gone, under its own group', () => {
    const s = liveStore(biggarDocument());
    s.store.change('orphan', (d) => {
      d.assets['asset-lost'] = {
        id: 'asset-lost',
        typeId: 'assets-base:co-alarm',
        name: 'Spare alarm',
        locationId: 'loc-gone',
        answers: {},
        maintenance: {},
      };
    });
    render(
      <MemoryRouter initialEntries={['/app/stores']}>
        <StoreContext.Provider value={s.store}>
          <StoresScreen />
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    const group = screen.getByRole('region', { name: 'Equipment, no place' });
    // Roof solar has no place at all; the spare alarm's place no longer exists
    expect(within(group).getByRole('link', { name: 'Edit equipment Roof solar' })).toBeTruthy();
    expect(within(group).getByRole('link', { name: 'Edit equipment Spare alarm' })).toBeTruthy();
    // placed equipment stays with its place
    expect(within(group).queryByRole('link', { name: 'Edit equipment Gas BBQ' })).toBeNull();
  });
});

describe('the equipment picker has category chips', () => {
  it('filters the list by category, with All to clear it', () => {
    app('/app/assets');
    fireEvent.click(screen.getByRole('button', { name: 'Add equipment' }));
    const chips = screen.getByRole('group', { name: 'Show category' });
    const all = within(chips).getByRole('button', { name: 'All' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    const sheet = within(screen.getByRole('dialog'));
    const everything = sheet.getAllByRole('listitem').length;

    fireEvent.click(within(chips).getByRole('button', { name: 'Heat' }));
    expect(within(chips).getByRole('button', { name: 'Heat' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const heat = sheet.getAllByRole('listitem');
    expect(heat.length).toBeGreaterThan(0);
    expect(heat.length).toBeLessThan(everything);
    for (const li of heat) expect(li.textContent).toContain('Heat');

    fireEvent.click(all);
    expect(sheet.getAllByRole('listitem').length).toBe(everything);
  });

  it('only offers categories that have a type', () => {
    app('/app/assets');
    fireEvent.click(screen.getByRole('button', { name: 'Add equipment' }));
    const chips = screen.getByRole('group', { name: 'Show category' });
    expect(within(chips).queryByRole('button', { name: 'Pets' })).toBeNull();
    expect(within(chips).getByRole('button', { name: 'Power' })).toBeTruthy();
  });
});

describe('Equipment deep links', () => {
  it('ignores an unknown type id', () => {
    app('/app/assets?add=assets-base:nope');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
