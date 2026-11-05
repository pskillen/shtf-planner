// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuickAdd } from '../src/app/screens/stores/QuickAdd';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const open = (doc = biggarDocument(), prefill?: { itemId: string; qty?: number }) => {
  const s = liveStore(doc);
  render(s.wrap(<QuickAdd onClose={() => undefined} prefill={prefill} />));
  return s;
};

describe('Quick add: the search step', () => {
  it('on a fresh device shows a few common items, not 110 rows', () => {
    open();
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull();
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

  it('shows up to eight recent items above the categories', () => {
    const ids = [
      'water-container',
      'torch-aa',
      'tinned-soup',
      'rice',
      'dried-pasta',
      'propane-bottle',
      'toilet-bags',
      'candles',
      'first-aid-kit',
    ].map((n) => `items-base:${n}`);
    localStorage.setItem('shtf.recentItems', JSON.stringify(ids));
    open();
    const recent = screen.getByRole('region', { name: 'Recent' });
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

  it('reads the recent items again after each add, so the next search starts with them', () => {
    const s = open();
    fireEvent.change(screen.getByLabelText('What are you adding?'), {
      target: { value: 'water container' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Water container/i })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    const recent = screen.getByRole('region', { name: 'Recent' });
    expect(within(recent).getByRole('button', { name: /Water container/i })).toBeTruthy();
    expect(Object.keys(s.doc().products).length).toBeGreaterThan(
      Object.keys(biggarDocument().products).length,
    );
  });

  it('after an add, Next item is the primary button on the right and Add another keeps the form editable', () => {
    open();
    fireEvent.change(screen.getByLabelText('What are you adding?'), {
      target: { value: 'water container' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Water container/i })[0]!);
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
    fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: 'UHT' } });
    fireEvent.click(screen.getByRole('button', { name: /UHT milk/ }));
    expect((screen.getByLabelText('Where does it go?') as HTMLSelectElement).value).toBe(
      'loc-pantry',
    );
    expect(screen.queryByText(/may freeze/)).toBeNull();
  });
});
