// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoreContext } from '../src/app/state/storeContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GapsScreen } from '../src/app/screens/GapsScreen';
import { ShoppingScreen } from '../src/app/screens/ShoppingScreen';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { liveStore } from './helpers/liveStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NUMBERS = 'Write down 999 or 112';
const done = () => screen.getByRole('button', { name: new RegExp(`^Done: ${NUMBERS}`) });
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('the Gaps tab: shopping sort', () => {
  it('By aisle groups rows under category and heading', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<ShoppingScreen />));
    fireEvent.click(screen.getByRole('radio', { name: 'By aisle' }));
    expect(screen.getByRole('heading', { name: /Food and cooking ›/ })).toBeTruthy();
  });
});

describe('the Gaps tab: plan items marked done', () => {
  it('hides the item at once with an undo toast, and writes the date after five seconds', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<GapsScreen />));
    expect(s.doc().plans['plans-base:emergency-numbers']?.doneAt).toBeUndefined();

    fireEvent.click(done());
    expect(screen.queryByRole('button', { name: new RegExp(`^Done: ${NUMBERS}`) })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Marked done: Write down 999 or 112');
    expect(s.doc().plans['plans-base:emergency-numbers']?.doneAt).toBeUndefined();

    tick(5100);
    const entry = s.doc().plans['plans-base:emergency-numbers'];
    expect(entry?.doneAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // and it now sits under Done, with an Undo
    expect(screen.getByRole('heading', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(`^Undo done: ${NUMBERS}`) })).toBeTruthy();
  });

  it('Undo on the toast writes nothing and brings the item back', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<GapsScreen />));
    fireEvent.click(done());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(done()).toBeTruthy();
    tick(10_000);
    expect(s.doc().plans['plans-base:emergency-numbers']?.doneAt).toBeUndefined();
    expect(s.labels).not.toContain('plan done');
  });

  it('lists done items, and Undo there clears the date and the expiry', () => {
    const doc = biggarDocument();
    expect(doc.plans['plans-base:meeting-point']?.doneAt).toBeDefined();
    doc.plans['plans-base:meeting-point']!.expires = '2099-01-01';
    const s = liveStore(doc);
    render(s.wrap(<GapsScreen />));
    const undo = screen.getByRole('button', { name: /^Undo done: .*meet/i });
    fireEvent.click(undo);
    const entry = s.doc().plans['plans-base:meeting-point'];
    expect(entry?.doneAt).toBeUndefined();
    expect(entry?.expires).toBeUndefined();
    // back in To do
    expect(screen.getByRole('button', { name: /^Done: .*meet/i })).toBeTruthy();
  });
});

describe('gaps overview', () => {
  it('highlights the weakest needs and keeps shopping on a separate screen', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<GapsScreen />));
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Shopping list/ }).getAttribute('href')).toBe(
      '/app/gaps/shopping',
    );
    expect(screen.queryByRole('radio', { name: 'By aisle' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'To do' })).toBeTruthy();
    expect(screen.getByText(/Heat: 0 of/)).toBeTruthy();
  });
});

describe('fuel shopping alternatives', () => {
  it('keeps one actionable exact fuel and its alternative on the full and heat lists', () => {
    const doc = biggarDocument();
    delete doc.stock['stock-propane'];
    for (const [id, fuel] of [
      ['heater-a', 'items-base:butane-bottle'],
      ['heater-b', 'items-base:propane-bottle'],
    ]) {
      doc.assets[id!] = {
        id: id!,
        typeId: 'assets-base:catalytic-heater',
        maintenance: {},
        answers: { chosenLpg: fuel!, fuelConfirmed: true, indoorUse: 'permitted', highRise: 'no' },
      };
    }
    for (const path of ['/app/gaps/shopping', '/app/gaps/shopping?need=heat']) {
      const s = liveStore(doc);
      const result = render(
        <MemoryRouter initialEntries={[path]}>
          <StoreContext.Provider value={s.store}>
            <ShoppingScreen />
          </StoreContext.Provider>
        </MemoryRouter>,
      );
      const purchase = screen.getByRole('button', { name: /Bought: Butane bottle/ });
      expect(purchase).toBeTruthy();
      expect(screen.getByText(/or .*Propane bottle/)).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: 'By aisle' }));
      expect(screen.getByRole('button', { name: /Bought: Butane bottle/ })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Bought: Butane bottle/ }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      result.unmount();
    }
  });
});
