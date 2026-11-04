// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Shell } from '../src/app/Shell';
import { StoreContext } from '../src/app/state/storeContext';
import { SchemaTooNewError, emptyDocument } from '../src/model';
import type { DocumentStore, StoreStatus } from '../src/store';

function fakeStore(status: StoreStatus): DocumentStore {
  const doc = emptyDocument('local');
  doc.household.members.push({
    id: 'm1',
    name: 'Alex',
    dob: '1984-03-12',
    tags: [],
    medication: [],
  });
  return {
    get: () => doc,
    status: () => status,
    change: () => {
      throw new Error('read-only');
    },
    subscribe: () => () => {},
  } as unknown as DocumentStore;
}

function renderShell(status: StoreStatus) {
  return render(
    <MemoryRouter initialEntries={['/app/people']}>
      <StoreContext.Provider value={fakeStore(status)}>
        <Routes>
          <Route path="/app/*" element={<Shell />} />
        </Routes>
      </StoreContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('a read-only household', () => {
  it('says a newer version saved it, and disables the screen', () => {
    renderShell({
      kind: 'too-new',
      found: 9,
      supported: 1,
      error: new SchemaTooNewError(9, 1),
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'This household was saved by a newer version of the app. Update this device to keep editing.',
    );
    expect(screen.getByRole('button', { name: 'Add a person' }).matches(':disabled')).toBe(true);
  });

  it('points an invalid household at Settings, data', () => {
    renderShell({ kind: 'invalid', error: new Error('bad') });
    expect(screen.getByRole('alert').textContent).toContain('More → Settings → data');
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('href')).toBe(
      '/app/more/settings',
    );
  });

  it('shows no banner and lets you edit when the store is fine', () => {
    renderShell({ kind: 'ok' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a person' }).matches(':disabled')).toBe(false);
  });
});
