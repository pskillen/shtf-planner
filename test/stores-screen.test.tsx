// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoresScreen } from '../src/app/screens/StoresScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const showWaterCan = () => {
  fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: 'water can' } });
};

const edit = () => screen.getByRole('button', { name: 'Edit 2 Water can 10 L in Garage' });

describe('the Stores edit sheet', () => {
  it('saves a new quantity', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    showWaterCan();
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: /^One more: / }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(s.doc().stock['stock-can']!.qty).toBe(3);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('stops the stepper at a quarter pack: deleting is the way to zero', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    showWaterCan();
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: /^One fewer: / }));
    fireEvent.click(screen.getByRole('radio', { name: '¼' }));
    fireEvent.click(screen.getByRole('button', { name: /^One fewer: / }));
    const fewer = screen.getByRole('button', { name: /^One fewer: / });
    expect(screen.getByRole('radio', { name: '¼' }).getAttribute('aria-checked')).toBe('true');
    expect((fewer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(s.doc().stock['stock-can']!.qty).toBe(0.25);
  });

  it('Delete hides the row with an undo toast and removes it after five seconds', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    showWaterCan();
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('button', { name: /Edit .*Water can 10 L in Garage/ })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('deleted');
    expect(s.doc().stock['stock-can']).toBeDefined();
    tick(5100);
    expect(s.doc().stock['stock-can']).toBeUndefined();
  });

  it('Undo after Delete brings the row back and keeps the stock', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    showWaterCan();
    fireEvent.click(edit());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(edit()).toBeTruthy();
    tick(10_000);
    expect(s.doc().stock['stock-can']!.qty).toBe(2);
  });
});

describe('the Stores minimum sheet', () => {
  it('saves a changed minimum, and a minimum taken to 0 is removed', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.change(screen.getByLabelText('Place filter'), { target: { value: 'loc-pantry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set a minimum' }));
    const pick = screen.getByRole('dialog', { name: 'Set a minimum' });
    fireEvent.click(within(pick).getByRole('button', { name: /^UHT milk/i }));
    let sheet = screen.getByRole('dialog');
    fireEvent.click(
      within(sheet).getByRole('button', { name: /^One more: Minimum for UHT milk in the Pantry/ }),
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save minimums' }));

    fireEvent.click(screen.getByRole('button', { name: 'Set a minimum' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Dried pasta/i }),
    );
    sheet = screen.getByRole('dialog');
    const pasta = within(sheet).getByRole('button', {
      name: /^One fewer: Minimum for Dried pasta in the Pantry/,
    });
    fireEvent.click(pasta);
    fireEvent.click(pasta);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save minimums' }));

    const mins = s.doc().minimums;
    expect(mins['loc-pantry|items-base:uht-milk']).toBe(2);
    expect(mins['loc-pantry|items-base:dried-pasta']).toBeUndefined();
    expect(mins['loc-pantry|items-base:rice']).toBe(1);
  });

  it('writes nothing on Cancel', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.change(screen.getByLabelText('Place filter'), { target: { value: 'loc-pantry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set a minimum' }));
    const pick = screen.getByRole('dialog', { name: 'Set a minimum' });
    fireEvent.click(within(pick).getByRole('button', { name: /^UHT milk/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /^One more: Minimum for UHT milk in the Pantry/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(s.labels).not.toContain('set minimums');
  });
});

describe('stock in a missing place', () => {
  it('shows Unknown place without crashing', () => {
    const doc = biggarDocument();
    doc.stock['stock-lost'] = {
      id: 'stock-lost',
      productId: 'prod-can',
      qty: 1,
      locationId: 'loc-deleted',
      added: '2026-09-01',
      source: 'manual',
    };
    const s = liveStore(doc);
    render(s.wrap(<StoresScreen />));
    expect(screen.getByRole('heading', { name: 'Unknown place' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit 1 Water can 10 L in Unknown place' }),
    ).toBeTruthy();
  });
});

describe('the Stores search', () => {
  it('finds stock whose type is not in the packs whatever the case', () => {
    const doc = biggarDocument();
    doc.products['prod-odd'] = {
      id: 'prod-odd',
      name: 'Mystery-Tin',
      size: { amount: 1, unit: 'pieces' },
      added: '2026-09-01',
    };
    doc.stock['stock-odd'] = {
      id: 'stock-odd',
      productId: 'prod-odd',
      qty: 1,
      locationId: 'loc-shed',
      added: '2026-09-01',
      source: 'manual',
    };
    const s = liveStore(doc);
    render(s.wrap(<StoresScreen />));
    fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: 'mystery' } });
    expect(screen.getByRole('button', { name: 'Edit 1 Mystery-Tin in Shed' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: 'MYSTERY' } });
    expect(screen.getByRole('button', { name: 'Edit 1 Mystery-Tin in Shed' })).toBeTruthy();
  });
});

describe('the Stores screen markup', () => {
  it('logs no React warning for the rotating-place note (no fieldset inside a paragraph)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    fireEvent.change(screen.getByLabelText('Place filter'), { target: { value: 'loc-pantry' } });
    expect(screen.getByRole('button', { name: 'Set a minimum' })).toBeTruthy();
    expect(error.mock.calls.map((c) => String(c[0]))).toEqual([]);
    error.mockRestore();
  });
});

describe('best-before words and colours', () => {
  const rowFor = () => screen.getByRole('button', { name: /Edit .*Water can 10 L in Garage/ });

  it('shows Expired, Expires soon and Before next check beside the month, never colour alone', () => {
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    const doc = biggarDocument();
    doc.stock['stock-can']!.bestBefore = '2026-10';
    const s = liveStore(doc);
    render(s.wrap(<StoresScreen />));
    showWaterCan();
    const badge = within(rowFor()).getByText(/Oct 2026/);
    expect(badge.textContent).toBe('Oct 2026 · Expired');
    expect(badge.className).toContain('bb-expired');

    act(() => {
      s.store.change('t', (d) => void (d.stock['stock-can']!.bestBefore = '2026-12'));
    });
    expect(within(rowFor()).getByText(/Dec 2026/).textContent).toBe('Dec 2026 · Expires soon');
    act(() => {
      s.store.change('t', (d) => void (d.stock['stock-can']!.bestBefore = '2027-02'));
    });
    const check = within(rowFor()).getByText(/Feb 2027/);
    expect(check.textContent).toBe('Feb 2027 · Before next check');
    expect(check.className).toContain('bb-check');
    act(() => {
      s.store.change('t', (d) => void (d.stock['stock-can']!.bestBefore = '2027-06'));
    });
    expect(within(rowFor()).getByText(/Jun 2027/).textContent).toBe('Jun 2027');
  });

  it('follows the household settings', () => {
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    const doc = biggarDocument();
    doc.stock['stock-can']!.bestBefore = '2027-02';
    doc.settings.expirySoonMonths = 3;
    const s = liveStore(doc);
    render(s.wrap(<StoresScreen />));
    showWaterCan();
    expect(within(rowFor()).getByText(/Feb 2027/).textContent).toBe('Feb 2027 · Expires soon');
  });
});

describe('equipment runtime on Stores rows', () => {
  const LINE = "3 days at your plan's use · 7.5 of 43 hours available";
  const equipment = () => screen.queryByRole('region', { name: 'Equipment' });

  it('shows the BBQ line unfiltered and under its place, and hides it under a category', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<StoresScreen />));
    expect(within(equipment()!).getByRole('link', { name: /Gas BBQ/ }).textContent).toContain(LINE);

    fireEvent.change(screen.getByLabelText('Place filter'), { target: { value: 'loc-shed' } });
    expect(within(equipment()!).getByRole('link', { name: /Gas BBQ/ }).textContent).toContain(LINE);

    fireEvent.change(screen.getByLabelText('Place filter'), { target: { value: 'all' } });
    const category = screen.getByLabelText('Category filter') as HTMLSelectElement;
    fireEvent.change(category, { target: { value: category.options[1]!.value } });
    expect(equipment()).toBeNull();
  });

  it('puts the no-fuel Quick add outside the link and opens it', () => {
    const doc = biggarDocument();
    delete doc.stock['stock-propane'];
    const s = liveStore(doc);
    render(s.wrap(<StoresScreen />));
    const button = screen.getByRole('button', { name: 'Quick add Propane bottle' });
    expect(button.closest('a')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
