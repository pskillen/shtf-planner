// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemPicker } from '../src/app/screens/stores/ItemPicker';
import { groupItemsForPicker } from '../src/app/screens/stores/pickerHelpers';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';
import { liveStore } from './helpers/liveStore';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const stockItems = () => {
  const packs = bundledPacks();
  const enabled = new Set(packs.enabledPacks(biggarDocument().settings).map((p) => p.id));
  return Object.values(packs.items).filter(
    (t) => enabled.has(t.id.split(':')[0]!) && t.assetTypeId === undefined,
  );
};

describe('groupItemsForPicker', () => {
  it('lists headings in pack order inside each category', () => {
    const groups = groupItemsForPicker(stockItems());
    const food = groups.filter((g) => g.category === 'food');
    const headings = food.map((g) => g.heading);
    const unique = [...new Set(headings)];
    let last = -1;
    for (const h of headings) {
      const at = unique.indexOf(h);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
    expect(headings.length).toBeGreaterThan(3);
  });
});

describe('ItemPicker', () => {
  const renderPicker = () => {
    const onItem = vi.fn();
    const onProduct = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<ItemPicker onItem={onItem} onProduct={onProduct} />));
    return { onItem, onProduct, s };
  };

  it('shows countsAs on each item in search results', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('What is it?'), { target: { value: 'baked beans' } });
    const row = screen.getByRole('button', { name: /Baked beans/i });
    expect(row.textContent).toMatch(/label's kcal/i);
  });

  it('routes equipment matches to the equipment form', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('What is it?'), { target: { value: 'camping stove' } });
    const route = screen.getByRole('region', { name: 'Equipment: add to your home' });
    const link = within(route).getByRole('link', { name: /Camping stove/i });
    expect(link.getAttribute('href')).toMatch(/\/app\/assets\?add=/);
  });

  it('shows heading sections when browsing', () => {
    renderPicker();
    const browse = document.querySelector('details.type-group') as HTMLDetailsElement;
    browse.open = true;
    fireEvent(browse, new Event('toggle'));
    const food = [...document.querySelectorAll('details.type-group')].find((d) =>
      d.querySelector('summary')?.textContent?.includes('Food'),
    ) as HTMLDetailsElement;
    food.open = true;
    fireEvent(food, new Event('toggle'));
    expect(document.querySelector('.picker-heading')?.textContent).toBeTruthy();
  });
});
