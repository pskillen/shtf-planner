// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeferredDelete } from '../src/app/components/useDeferredDelete';

function Probe({ commit }: { commit: (id: string) => void }) {
  const del = useDeferredDelete(commit);
  return (
    <div>
      <button onClick={() => del.request('a', 'Alex')}>delete a</button>
      <button onClick={() => del.request('b', 'Bea')}>delete b</button>
      <p data-testid="pending">{[...del.pending].sort().join(',')}</p>
      {del.toast}
    </div>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pending = () => screen.getByTestId('pending').textContent;
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('useDeferredDelete', () => {
  it('hides the record and shows a toast, then commits after five seconds', () => {
    const commit = vi.fn();
    render(<Probe commit={commit} />);
    fireEvent.click(screen.getByText('delete a'));
    expect(pending()).toBe('a');
    expect(screen.getByRole('status').textContent).toContain('Alex deleted.');
    tick(4900);
    expect(commit).not.toHaveBeenCalled();
    tick(200);
    expect(commit).toHaveBeenCalledExactlyOnceWith('a');
    expect(pending()).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Undo brings the record back and never commits', () => {
    const commit = vi.fn();
    render(<Probe commit={commit} />);
    fireEvent.click(screen.getByText('delete a'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(pending()).toBe('');
    tick(10_000);
    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps each pending delete on its own clock', () => {
    const commit = vi.fn();
    render(<Probe commit={commit} />);
    fireEvent.click(screen.getByText('delete a'));
    tick(3000);
    fireEvent.click(screen.getByText('delete b'));
    expect(pending()).toBe('a,b');
    tick(2100);
    expect(commit.mock.calls).toEqual([['a']]);
    tick(3000);
    expect(commit.mock.calls).toEqual([['a'], ['b']]);
  });

  it('commits what is still pending when the screen is left', () => {
    const commit = vi.fn();
    const view = render(<Probe commit={commit} />);
    fireEvent.click(screen.getByText('delete a'));
    view.unmount();
    expect(commit).toHaveBeenCalledExactlyOnceWith('a');
    tick(10_000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('leaves the record if the document went read-only meanwhile', () => {
    const commit = vi.fn(() => {
      throw new Error('read-only');
    });
    render(<Probe commit={commit} />);
    fireEvent.click(screen.getByText('delete a'));
    expect(() => tick(5100)).not.toThrow();
    expect(pending()).toBe('');
  });
});
