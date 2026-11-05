// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../src/app/Shell';
import { StoreContext } from '../src/app/state/storeContext';
import { SchemaTooOldError } from '../src/model';
import type { DocumentStore, StoreStatus } from '../src/store';

vi.mock('../src/app/state/sharedSync', () => ({
  startFreshHousehold: vi.fn(),
  forgetThisDevice: vi.fn(),
  getSync: vi.fn(),
}));

const { startFreshHousehold } = await import('../src/app/state/sharedSync');

afterEach(cleanup);

function fakeStore(status: StoreStatus): DocumentStore {
  return {
    get: () => {
      throw new Error('too-old snapshot must not be read');
    },
    status: () => status,
    change: () => {
      throw new Error('read-only');
    },
    subscribe: () => () => {},
    export: () => '{"meta":{"schemaVersion":3}}',
    importJson: () => {
      throw new Error('read-only');
    },
    heads: () => '',
    bytes: () => new Uint8Array(),
    mergeBytes: () => {},
    flush: async () => {},
    close: async () => {},
  };
}

describe('too-old household gate', () => {
  const tooOld: StoreStatus = {
    kind: 'too-old',
    found: 3,
    oldest: 4,
    error: new SchemaTooOldError(3, 4),
  };

  it('replaces routes and the tab bar with the start-again screen', () => {
    render(
      <MemoryRouter initialEntries={['/app/gaps']}>
        <StoreContext.Provider value={fakeStore(tooOld)}>
          <Shell />
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /older version/i })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByText('Gaps')).toBeNull();
  });

  it('starts afresh with Drive kept when confirmed', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <StoreContext.Provider value={fakeStore(tooOld)}>
          <Shell />
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start a new household' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a new household' }));
    expect(startFreshHousehold).toHaveBeenCalled();
  });
});
