// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentProvider, useChange, useDocument } from '../src/app/state';
import { getStore } from '../src/app/state/sharedStore';

function Probe() {
  const doc = useDocument();
  const change = useChange();
  return (
    <div>
      <p data-testid="count">{doc.household.members.length}</p>
      <button
        onClick={() =>
          change('add member', (d) => {
            d.household.members.push({
              id: `m${d.household.members.length}`,
              name: 'Alex',
              dob: '1984-03-12',
              tags: [],
              medication: [],
            });
          })
        }
      >
        add
      </button>
    </div>
  );
}

afterEach(cleanup);

describe('DocumentProvider', () => {
  it('opens the document, then useChange re-renders useDocument', async () => {
    render(
      <DocumentProvider>
        <Probe />
      </DocumentProvider>,
    );
    expect(screen.getByText(/Loading your plan/)).toBeTruthy();
    expect(await screen.findByTestId('count')).toBeTruthy();
    expect(screen.getByTestId('count').textContent).toBe('0');
    await act(async () => {
      screen.getByRole('button', { name: 'add' }).click();
    });
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('flushes to IndexedDB when the page is hidden or goes away', async () => {
    render(
      <DocumentProvider>
        <Probe />
      </DocumentProvider>,
    );
    await screen.findByTestId('count');
    const flush = vi.spyOn(await getStore(), 'flush');
    // The provider registers its page listeners in an effect: wait until they are really there
    // (a probe event that flushes) before counting calls, so a slow machine cannot beat them.
    await vi.waitFor(() => {
      window.dispatchEvent(new Event('pagehide'));
      expect(flush).toHaveBeenCalled();
    });
    flush.mockClear();

    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);

    // visible: nothing to do; hidden: flush
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(2);
    state.mockRestore();
  });

  it('useDocument outside the provider says so', () => {
    expect(() => render(<Probe />)).toThrow(/inside <DocumentProvider>/);
  });
});
