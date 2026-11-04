// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen } from '../src/app/screens/HomeScreen';
import { StoreContext } from '../src/app/state/storeContext';
import type { Document } from '../src/model';
import type { DocumentStore } from '../src/store';
import { biggarDocument } from '../src/fixtures/household-biggar';

function setup() {
  let doc: Document = biggarDocument();
  const status = { kind: 'ok' as const };
  const change = vi.fn((_label: string, fn: (d: Document) => void) => {
    const next = structuredClone(doc);
    fn(next);
    doc = next;
  });
  const store = {
    get: () => doc,
    status: () => status,
    subscribe: () => () => undefined,
    change,
  } as unknown as DocumentStore;
  const ui = (
    <MemoryRouter>
      <StoreContext.Provider value={store}>
        <HomeScreen />
      </StoreContext.Provider>
    </MemoryRouter>
  );
  return { ui, change, area: () => doc.home.area };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the postcode on the Home screen saves as you type', () => {
  it('saves a moment after typing stops, and says Saved', () => {
    const { ui, change, area } = setup();
    render(ui);
    const box = screen.getByLabelText(/Postcode district/);
    fireEvent.change(box, { target: { value: 'ML12 6' } });
    expect(change).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(700));
    expect(change).toHaveBeenCalledTimes(1);
    expect(area()).toBe('ML12 6');
    expect(screen.getByRole('status').textContent).toBe('Saved');
    act(() => void vi.advanceTimersByTime(2500));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('saves on blur', () => {
    const { ui, area } = setup();
    render(ui);
    const box = screen.getByLabelText(/Postcode district/);
    fireEvent.change(box, { target: { value: 'G1' } });
    fireEvent.blur(box);
    expect(area()).toBe('G1');
  });

  it('saves when the screen is left before the pause or a blur', () => {
    const { ui, area } = setup();
    const view = render(ui);
    fireEvent.change(screen.getByLabelText(/Postcode district/), { target: { value: 'EH1' } });
    view.unmount();
    expect(area()).toBe('EH1');
  });

  it('writes nothing when the text did not change', () => {
    const { ui, change } = setup();
    const view = render(ui);
    view.unmount();
    expect(change).not.toHaveBeenCalled();
  });
});
