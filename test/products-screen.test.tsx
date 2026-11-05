// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductsScreen } from '../src/app/screens/stores/ProductsScreen';
import { StoresScreen } from '../src/app/screens/StoresScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderProducts(path = '/app/stores/products') {
  const s = liveStore(biggarDocument());
  render(
    <MemoryRouter initialEntries={[path]}>
      <StoreContext.Provider value={s.store}>
        <Routes>
          <Route path="/app/stores/products" element={<ProductsScreen />} />
        </Routes>
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  return s;
}

describe('ProductsScreen', () => {
  it('opens a product sheet from ?open=', () => {
    renderProducts('/app/stores/products?open=prod-beans');
    expect(screen.getByRole('dialog', { name: 'Test beans 415 g' })).toBeTruthy();
  });

  it('renames a product', () => {
    const s = renderProducts();
    fireEvent.click(screen.getByRole('button', { name: /Test beans 415 g/i }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Heinz Beanz 415 g' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(s.doc().products['prod-beans']!.name).toBe('Heinz Beanz 415 g');
  });

  it('re-points what a product counts as', () => {
    const s = renderProducts();
    fireEvent.click(screen.getByRole('button', { name: /Test beans 415 g/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Change counts as' }));
    const counts = screen.getByRole('dialog', { name: 'Counts as' });
    fireEvent.change(within(counts).getByLabelText('What is it?'), {
      target: { value: 'tinned soup' },
    });
    fireEvent.click(within(counts).getByRole('button', { name: /Tinned soup/i }));
    expect(s.doc().products['prod-beans']!.itemId).toBe('items-base:tinned-soup');
  });

  it('resizes a product', () => {
    const s = renderProducts();
    fireEvent.click(screen.getByRole('button', { name: /Test beans 415 g/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Change size' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: '220 g' }));
    expect(s.doc().products['prod-beans']!.size).toEqual({ amount: 220, unit: 'g' });
  });

  it('merges after confirmation with stock row and barcode counts', () => {
    const doc = structuredClone(biggarDocument());
    doc.products['prod-other'] = {
      id: 'prod-other',
      name: 'Other beans 415 g',
      itemId: 'items-base:baked-beans',
      size: { amount: 415, unit: 'g' },
      added: '2026-09-01',
    };
    doc.stock['stock-other'] = {
      id: 'stock-other',
      productId: 'prod-other',
      qty: 3,
      locationId: 'loc-pantry',
      bestBefore: '2028-06',
      added: '2026-09-01',
      source: 'manual',
    };
    doc.barcodes['5000111111111'] = { productId: 'prod-other', seen: '2026-09-01' };
    cleanup();
    const s2 = liveStore(doc);
    render(
      <MemoryRouter initialEntries={['/app/stores/products']}>
        <StoreContext.Provider value={s2.store}>
          <Routes>
            <Route path="/app/stores/products" element={<ProductsScreen />} />
          </Routes>
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Other beans 415 g/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into…' }));
    const merge = screen.getByRole('dialog', { name: 'Merge into…' });
    fireEvent.click(within(merge).getByRole('button', { name: /Test beans 415 g/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/1 stock row and 1 barcode/i);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(s2.doc().products['prod-other']).toBeUndefined();
    expect(s2.doc().stock['stock-beans']!.qty).toBe(15);
    expect(s2.doc().barcodes['5000111111111']!.productId).toBe('prod-beans');
  });

  it('refuses delete while stock remains and allows delete when empty', () => {
    renderProducts();
    fireEvent.click(screen.getByRole('button', { name: /Test beans 415 g/i }));
    const del = screen.getByRole('button', { name: 'Delete' });
    expect((del as HTMLButtonElement).disabled).toBe(true);

    const empty = structuredClone(biggarDocument());
    delete empty.stock['stock-beans'];
    cleanup();
    const sEmpty = liveStore(empty);
    render(
      <MemoryRouter initialEntries={['/app/stores/products?open=prod-beans']}>
        <StoreContext.Provider value={sEmpty.store}>
          <Routes>
            <Route path="/app/stores/products" element={<ProductsScreen />} />
          </Routes>
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(sEmpty.doc().products['prod-beans']).toBeUndefined();
  });
});

describe('Stores links to Your products', () => {
  it('shows a footer link to the product list', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    const link = screen.getByRole('link', { name: 'Your products' });
    expect(link.getAttribute('href')).toBe('/app/stores/products');
  });
});
