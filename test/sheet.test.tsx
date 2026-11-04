// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../src/app/components/Sheet';
import { isDirty } from '../src/app/components/isDirty';
import { StoreContext } from '../src/app/state/storeContext';
import type { DocumentStore } from '../src/store';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '');
});

const doc = {};
const ok = { kind: 'ok' };
const store = {
  get: () => doc,
  status: () => ok,
  subscribe: () => () => undefined,
} as unknown as DocumentStore;

function open(props: { dirty?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <StoreContext.Provider value={store}>
      <Sheet title="Edit" onClose={onClose} dirty={props.dirty}>
        <p>body</p>
      </Sheet>
    </StoreContext.Provider>,
  );
  return { onClose, view };
}

const backdrop = () => document.querySelector('.sheet-backdrop')!;

describe('Sheet', () => {
  it('closes on a backdrop tap when there is nothing to lose', () => {
    const { onClose } = open({ dirty: false });
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before a backdrop tap or Escape throws away edits', () => {
    const { onClose } = open({ dirty: true });
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard your changes?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard your changes?')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Discard your changes?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once from the ✕ button, even with edits', () => {
    const { onClose } = open({ dirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('holds a history entry, so Back closes the sheet first', () => {
    const before = window.history.length;
    const { onClose } = open({ dirty: false });
    expect(window.history.length).toBe(before + 1);
    expect((window.history.state as { sheet?: boolean }).sheet).toBe(true);
    // Back takes the entry off and fires popstate
    window.history.replaceState(null, '');
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('on Back with edits, asks and keeps the entry for the next Back', () => {
    const { onClose } = open({ dirty: true });
    window.history.replaceState(null, '');
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard your changes?')).toBeTruthy();
    expect((window.history.state as { sheet?: boolean }).sheet).toBe(true);
  });
});

describe('isDirty', () => {
  it('compares by value', () => {
    expect(isDirty({ a: [1] }, { a: [1] })).toBe(false);
    expect(isDirty({ a: [1] }, { a: [2] })).toBe(true);
  });
});
