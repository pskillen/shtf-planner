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
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    const recent = screen.getByRole('region', { name: 'Recent products' });
    expect(within(recent).getByRole('button', { name: /Water can 10 L/i })).toBeTruthy();
    expect(localStorage.getItem('shtf.recentProducts')).toContain('prod-can');
  });

  it('after an add, Next item is the primary button on the right and Add another keeps the form editable', () => {
    open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const another = screen.getByRole('button', { name: 'Add another' });
    const next = screen.getByRole('button', { name: 'Next item' });
    expect(another.className).toBe('secondary');
    expect(next.className).toBe('');
    expect(another.nextElementSibling).toBe(next);
    fireEvent.click(screen.getByRole('button', { name: /^One more/ }));
    expect(screen.getByRole('button', { name: 'Add another' })).toBeTruthy();
    expect(screen.getByTestId('added-count').textContent).toBe('Added this session: 1');
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    expect(screen.getByTestId('added-count').textContent).toBe('Added this session: 3');
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

  it('merges stock when product, place and best-before month match', () => {
    const s = open();
    pickFromSearch('water container', /Water containers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const before = Object.values(s.doc().stock).filter((r) => r.productId === 'prod-can');
    const countBefore = before.length;
    const qtyBefore = before.reduce((n, r) => n + r.qty, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    const after = Object.values(s.doc().stock).filter((r) => r.productId === 'prod-can');
    expect(after.length).toBe(countBefore);
    expect(after.reduce((n, r) => n + r.qty, 0)).toBe(qtyBefore + 1);
  });
});
