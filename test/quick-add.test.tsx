// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuickAdd } from '../src/app/screens/stores/QuickAdd';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const open = (doc = biggarDocument(), prefill?: { typeId: string; qty?: number }) => {
  const s = liveStore(doc);
  render(s.wrap(<QuickAdd onClose={() => undefined} prefill={prefill} />));
  return s;
};

describe('Quick add: the search step', () => {
  it('puts "Add as a custom item" beside the search box, not under a long list', () => {
    open();
    const search = screen.getByLabelText('What are you adding?');
    const custom = screen.getByRole('button', { name: 'Add as a custom item' });
    expect(search.closest('.search-row')).toBe(custom.closest('.search-row'));
  });

  it('on a fresh device shows a few common types, not 110 rows', () => {
    open();
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull();
    const common = screen.getByRole('region', { name: 'Common' });
    const rows = within(common).getAllByRole('button');
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThanOrEqual(16);
    // the categories are behind one closed "Browse everything" and not even built until opened
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

  it('shows up to eight recent types above the categories', () => {
    const ids = [
      'water-can',
      'torch-led-200lm',
      'tinned-food',
      'rice-sack',
      'dried-pasta',
      'gas-bottle',
      'toilet-bags',
      'candles',
      'first-aid-kit',
    ].map((n) => `items-base:${n}`);
    localStorage.setItem('shtf.recentItemTypes', JSON.stringify(ids));
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

  it('reads the recent types again after each add, so the next search starts with them', () => {
    open();
    fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: 'water' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Water can/i })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    const recent = screen.getByRole('region', { name: 'Recent' });
    expect(within(recent).getByRole('button', { name: /Water can/i })).toBeTruthy();
  });

  it('after an add, Next item is the primary button on the right and Add another keeps the form editable', () => {
    open();
    fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: 'water' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Water can/i })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const another = screen.getByRole('button', { name: 'Add another' });
    const next = screen.getByRole('button', { name: 'Next item' });
    expect(another.className).toBe('secondary');
    expect(next.className).toBe('');
    expect(another.nextElementSibling).toBe(next);
    // an edit keeps both buttons, and nothing is added until Add another is tapped
    fireEvent.click(screen.getByRole('button', { name: /^One more/ }));
    expect(screen.getByRole('button', { name: 'Add another' })).toBeTruthy();
    expect(screen.getByTestId('added-count').textContent).toBe('Added this session: 1');
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    expect(screen.getByTestId('added-count').textContent).toBe('Added this session: 3');
  });

  it('puts an item where its type already lives, not in the first place by name', () => {
    open();
    fireEvent.change(screen.getByLabelText('What are you adding?'), { target: { value: 'UHT' } });
    fireEvent.click(screen.getByRole('button', { name: /UHT milk/ }));
    expect((screen.getByLabelText('Where does it go?') as HTMLSelectElement).value).toBe(
      'loc-pantry',
    );
    expect(screen.queryByText(/may freeze/)).toBeNull();
  });
});

describe('Quick add: a custom item', () => {
  it('with the kcal left blank, focuses the field and says what is missing beside it', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add as a custom item' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: "Gran's soup" } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    const kcal = screen.getByLabelText(/About how many kcal/);
    expect(document.activeElement).toBe(kcal);
    const hint = kcal.closest('label')!.querySelector('[role="alert"]');
    expect(hint?.textContent).toMatch(/How many kcal of food in one each\?/);
    // typing the amount clears the complaint
    fireEvent.change(kcal, { target: { value: '300' } });
    expect(kcal.closest('label')!.querySelector('[role="alert"]')).toBeNull();
  });
});
