// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sync, SyncState } from '../src/store';
import { SyncChrome } from '../src/app/sync/SyncChrome';
import { SyncPill } from '../src/app/sync/SyncPill';
import { describeStatus } from '../src/app/sync/syncText';
import { DataScreen } from '../src/app/screens/data/DataScreen';
import { SyncContext } from '../src/app/state/syncContext';
import { NO_SYNC_STATE, useSyncState } from '../src/app/state/syncContext';

vi.mock('../src/app/state', async (importActual) => ({
  ...(await importActual<typeof import('../src/app/state')>()),
  useStoreFiles: () => ({ export: () => '{}', importJson: () => ({}) }),
}));

afterEach(cleanup);

/** A sync engine whose state the test sets. */
function fakeSync(initial: Partial<SyncState> = {}) {
  let state: SyncState = { ...NO_SYNC_STATE, configured: true, ...initial };
  const listeners = new Set<(s: SyncState) => void>();
  const calls: string[] = [];
  const sync = {
    state: () => state,
    subscribe: (l: (s: SyncState) => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    resolveConflicts: vi.fn(
      async (c: Record<string, string>) => void calls.push(JSON.stringify(c)),
    ),
    resolveAll: vi.fn(async (side: string) => void calls.push(`all:${side}`)),
    resolveEnv: vi.fn(async (c: string) => void calls.push(`env:${c}`)),
    resolveFirstConnect: vi.fn(async (c: string) => void calls.push(`first:${c}`)),
    dismissNotice: vi.fn(),
  } as unknown as Sync;
  return {
    sync,
    calls,
    set(next: Partial<SyncState>) {
      state = { ...state, ...next };
      act(() => listeners.forEach((l) => l(state)));
    },
  };
}

const wrap = (sync: Sync | null, ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <SyncContext.Provider value={sync}>{ui}</SyncContext.Provider>
    </MemoryRouter>,
  );

describe('describeStatus', () => {
  it('says something short and something full for every status', () => {
    const at = '2026-11-04T14:05:00.000Z';
    const all = [
      { kind: 'disconnected' },
      { kind: 'synced', at },
      { kind: 'pending', since: at, edits: 3 },
      { kind: 'pushing' },
      { kind: 'pulling' },
      { kind: 'remoteNewer', at },
      { kind: 'offline', since: at, edits: 12 },
      { kind: 'error', message: 'Reconnect Google Drive', reconnect: true },
      { kind: 'error', message: 'Could not reach Google Drive.' },
    ] as const;
    for (const s of all) {
      const t = describeStatus(s);
      expect(t.short.length).toBeGreaterThan(0);
      expect(t.long.length).toBeGreaterThan(t.short.length - 1);
    }
    expect(describeStatus({ kind: 'offline', since: at, edits: 12 }).long).toMatch(
      /12 edits waiting/,
    );
    expect(describeStatus({ kind: 'pending', since: at, edits: 1 }).short).toBe('1 edit to send');
    expect(describeStatus({ kind: 'error', message: 'x', reconnect: true }).short).toBe(
      'Reconnect Drive',
    );
  });
});

describe('the status pill', () => {
  it('is always there, links to the Data screen, and follows the state', () => {
    const f = fakeSync();
    wrap(f.sync, <SyncPill />);
    const pill = screen.getByTestId('sync-pill');
    expect(pill.getAttribute('href')).toBe('/app/more/data');
    expect(pill.textContent).toContain('Not synced');
    f.set({
      connected: true,
      status: { kind: 'pending', since: '2026-11-04T14:00:00Z', edits: 2 },
    });
    expect(screen.getByTestId('sync-pill').getAttribute('data-status')).toBe('pending');
    expect(screen.getByTestId('sync-pill').textContent).toContain('2 edits to send');
  });

  it('renders without any provider (the shell alone)', () => {
    wrap(null, <SyncPill />);
    expect(screen.getByTestId('sync-pill').textContent).toContain('Not synced');
  });
});

describe('the sync chrome', () => {
  const conflict = {
    key: 'items/a',
    title: 'Water cans',
    noun: 'Item',
    minePresent: true,
    theirsPresent: true,
    fields: [{ field: 'qty', mine: 4, theirs: 9 }],
  };

  it('shows nothing when there is nothing to say', () => {
    const f = fakeSync();
    const { container } = wrap(f.sync, <SyncChrome />);
    expect(container.textContent).toBe('');
  });

  it('shows the itemised changes and answers per card or for all', () => {
    const f = fakeSync({ conflicts: [conflict], status: { kind: 'remoteNewer', at: 'x' } });
    wrap(f.sync, <SyncChrome />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Water cans');
    expect(dialog.textContent).toContain('qty');
    expect(dialog.textContent).toContain('4');
    expect(dialog.textContent).toContain('9');
    fireEvent.click(screen.getByRole('button', { name: 'Take theirs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep all mine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take all theirs' }));
    expect(f.calls).toEqual([
      '{"items/a":"theirs"}',
      '{"items/a":"mine"}',
      'all:mine',
      'all:theirs',
    ]);
  });

  it('shows the env banner and passes the choice on', () => {
    const f = fakeSync({ envWarning: { fileEnv: 'dev', buildEnv: 'prod' } });
    wrap(f.sync, <SyncChrome />);
    expect(screen.getByTestId('env-banner').textContent).toContain('dev');
    expect(screen.getByTestId('env-banner').textContent).toContain('prod');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    expect(f.calls).toEqual(['env:continue', 'env:dont-sync']);
  });

  it('asks the first-connect question', () => {
    const f = fakeSync({ firstConnect: true });
    wrap(f.sync, <SyncChrome />);
    fireEvent.click(screen.getByRole('button', { name: 'Merge them' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(f.calls).toEqual(['first:merge', 'first:cancel']);
  });

  it('toasts a notice and lets it go', () => {
    const f = fakeSync({ notice: { id: 1, text: '3 changes from your other device' } });
    wrap(f.sync, <SyncChrome />);
    expect(screen.getByTestId('sync-toast').textContent).toContain('3 changes');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(f.sync.dismissNotice).toHaveBeenCalled();
  });

  it('says so when the other device runs a newer version', () => {
    const f = fakeSync({
      status: { kind: 'error', message: 'Your other device runs a newer version; update this one' },
    });
    wrap(f.sync, <SyncChrome />);
    expect(screen.getByTestId('newer-banner').textContent).toContain('newer version');
  });
});

describe('Data screen', () => {
  const reconnect = () => screen.queryByRole('button', { name: 'Reconnect Google Drive' });

  it('offers Reconnect only when the fix is the Connect button', () => {
    const f = fakeSync({
      connected: true,
      account: 'me@example.test',
      status: { kind: 'error', message: 'Reconnect Google Drive', reconnect: true },
    });
    wrap(f.sync, <DataScreen />);
    expect(reconnect()).not.toBeNull();

    f.set({
      status: { kind: 'error', message: 'Sync is off: the file on Drive was last written by dev' },
    });
    expect(reconnect()).toBeNull();
    f.set({ status: { kind: 'error', message: 'The copy on Drive could not be read.' } });
    expect(reconnect()).toBeNull();
    expect(screen.getByRole('button', { name: 'Check Drive' })).toBeTruthy();
  });
});

describe('useSyncState', () => {
  it('gives the idle state without a provider', () => {
    function Probe() {
      return <p>{useSyncState().status.kind}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('disconnected')).toBeTruthy();
  });
});
