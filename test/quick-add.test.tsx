// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuickAdd } from '../src/app/screens/stores/QuickAdd';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const open = (
  doc = biggarDocument(),
  prefill?: { itemId: string; productId?: string; qty?: number },
) => {
  const s = liveStore(doc);
  render(s.wrap(<QuickAdd onClose={() => undefined} prefill={prefill} />));
  return s;
};

/** After picking an item, choose a product chip or a suggested size (skipped when auto-sized). */
function finishSizeStep(): void {
  const yours = screen.queryByRole('region', { name: 'Your products' });
  if (yours) {
    fireEvent.click(within(yours).getAllByRole('button')[0]!);
    return;
  }
  const suggested = screen.queryByRole('region', { name: 'Suggested sizes' });
  if (suggested) {
    fireEvent.click(within(suggested).getAllByRole('button')[0]!);
  }
}

function pickFromSearch(query: string, itemName: RegExp): void {
  fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: query } });
  fireEvent.click(screen.getAllByRole('button', { name: itemName })[0]!);
  finishSizeStep();
}

describe('Quick add: the search step', () => {
  it('on a fresh device shows a few common items, not 110 rows', () => {
    open();
    expect(screen.queryByRole('heading', { name: 'Recent products' })).toBeNull();
    const common = screen.getByRole('region', { name: 'Common' });
    const rows = within(common).getAllByRole('button');
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThanOrEqual(16);
    const browse = document.querySelector('details.type-group') as HTMLDetailsElement;
    expect(browse.open).toBe(false);
    expect(browse.querySelectorAll('details.type-group').length).toBe(0);
  });

  it('lists the categories, collapsed, once Browse everything is opened', () => {
    open();
    const browse = document.querySelector('details.type-group') as HTMLDetailsElement;
    browse.open = true;
    fireEvent(browse, new Event('toggle'));
    const groups = browse.querySelectorAll('details.type-group');
    expect(groups.length).toBeGreaterThan(3);
    for (const g of groups) expect((g as HTMLDetailsElement).open).toBe(false);
  });

  it('shows up to eight recent products when the household has them', () => {
    const ids = ['prod-beans', 'prod-can', 'prod-spread', 'prod-soup', 'prod-rice'];
    localStorage.setItem('shtf.recentProducts', JSON.stringify(ids));
    open();
    const recent = screen.getByRole('region', { name: 'Recent products' });
    const rows = within(recent).getAllByRole('button');
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('a search lists the matches flat, whatever the categories', () => {
    open();
    fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: 'water' } });
    expect(document.querySelector('details.type-group')).toBeNull();
    expect(screen.getAllByRole('button', { name: /water/i }).length).toBeGreaterThan(1);
  });

  it('reads recent products again after each add, so the next search starts with them', () => {
    open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('What are you adding?')).toBeTruthy();
    expect(screen.getByTestId('last-add-status').textContent).toMatch(/Added .* to /);
    const recent = screen.getByRole('region', { name: 'Recent products' });
    expect(within(recent).getByRole('button', { name: /Water can 10 L/i })).toBeTruthy();
    expect(localStorage.getItem('shtf.recentProducts')).toContain('prod-can');
  });

  it('after Add from search returns to search with Added status and Edit, not Add another', () => {
    open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('What are you adding?')).toBeTruthy();
    expect(screen.queryByLabelText(/^How many/)).toBeNull();
    expect(screen.getByTestId('last-add-status').textContent).toMatch(/Added 1 × .* to /);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add another' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next item' })).toBeNull();
  });

  it('Edit opens the stock row; saving there changes it', () => {
    const s = open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: /Edit / })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^One more: / }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('What are you adding?')).toBeTruthy();
    expect(screen.getByTestId('last-add-status').textContent).toMatch(/Added 1 × .* to /);
    const rows = Object.values(s.doc().stock).filter((r) => r.productId === 'prod-can');
    expect(rows.reduce((n, r) => n + r.qty, 0)).toBe(4);
  });

  it('the form is empty when the next item is picked after an add', () => {
    open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    pickFromSearch('UHT', /UHT milk/);
    expect(screen.getByLabelText('Where does it go?')).toBeTruthy();
    expect(screen.queryByRole('status', { name: /Added .*Water can/i })).toBeNull();
    const qtyButtons = screen.getAllByRole('button', { name: /^One more: / });
    expect(qtyButtons.length).toBeGreaterThan(0);
  });

  it('shows ½ in the Added notification when quantity is 0.5', () => {
    open(biggarDocument(), {
      itemId: 'items-base:tinned-soup',
      productId: 'prod-soup',
    });
    fireEvent.click(screen.getByRole('radio', { name: '½' }));
    fireEvent.click(screen.getByRole('button', { name: /^One fewer: / }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByTestId('last-add-status').textContent).toContain('Added ½ ×');
  });

  it('puts an item where it already lives, not in the first place by name', () => {
    open();
    pickFromSearch('UHT', /UHT milk/);
    expect((screen.getByLabelText('Where does it go?') as HTMLSelectElement).value).toBe(
      'loc-pantry',
    );
    expect(screen.queryByText(/may freeze/)).toBeNull();
  });

  it('a recent product skips the size step straight to the form', () => {
    localStorage.setItem('shtf.recentProducts', JSON.stringify(['prod-can']));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Water can 10 L' }));
    expect(screen.getByLabelText('Where does it go?')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Suggested sizes' })).toBeNull();
  });

  it('prefill with itemId opens the size step', () => {
    open(biggarDocument(), { itemId: 'items-base:tinned-soup' });
    expect(screen.getByRole('region', { name: 'Suggested sizes' })).toBeTruthy();
  });

  it('prefill with productId lands on the form', () => {
    open(biggarDocument(), { itemId: 'items-base:tinned-soup', productId: 'prod-soup' });
    expect(screen.getByLabelText('Where does it go?')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Suggested sizes' })).toBeNull();
  });

  it('adds a half pack when quantity is 0.5', () => {
    const s = open(biggarDocument(), {
      itemId: 'items-base:tinned-soup',
      productId: 'prod-soup',
    });
    const before = s.doc().stock['stock-soup']!.qty;
    fireEvent.click(screen.getByRole('radio', { name: '½' }));
    fireEvent.click(screen.getByRole('button', { name: /^One fewer: / }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const total = Object.values(s.doc().stock)
      .filter((r) => r.productId === 'prod-soup')
      .reduce((n, r) => n + r.qty, 0);
    expect(total).toBe(before + 0.5);
  });

  it('merges stock when product, place and best-before month match', () => {
    const s = open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const before = Object.values(s.doc().stock).filter((r) => r.productId === 'prod-can');
    const countBefore = before.length;
    const qtyBefore = before.reduce((n, r) => n + r.qty, 0);
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const after = Object.values(s.doc().stock).filter((r) => r.productId === 'prod-can');
    expect(after.length).toBe(countBefore);
    expect(after.reduce((n, r) => n + r.qty, 0)).toBe(qtyBefore + 1);
  });
});
