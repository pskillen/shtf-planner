// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { PeopleScreen } from '../src/app/screens/PeopleScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { SchemaTooNewError } from '../src/model';
import type { DocumentStore } from '../src/store';
import { biggarDocument } from '../src/fixtures/household-biggar';

afterEach(cleanup);

function renderReadOnly() {
  const doc = biggarDocument();
  const status = {
    kind: 'too-new' as const,
    found: 99,
    supported: 1,
    error: new SchemaTooNewError(99, 1),
  };
  const store = {
    get: () => doc,
    status: () => status,
    subscribe: () => () => undefined,
    change: () => {
      throw new Error('read-only');
    },
  } as unknown as DocumentStore;
  return render(
    <MemoryRouter>
      <StoreContext.Provider value={store}>
        <PeopleScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
}

describe('a read-only household', () => {
  it('turns off what writes and leaves rows openable, with nothing dimmed', () => {
    renderReadOnly();
    expect(screen.getByRole('button', { name: 'Add a person' }).matches(':disabled')).toBe(true);
    const row = screen.getByRole('button', { name: 'Edit Pat' });
    expect(row.matches(':disabled')).toBe(false);
    expect(document.querySelector('fieldset.plain:disabled .row-main')).toBeNull();

    fireEvent.click(row);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByLabelText('Name', { selector: 'input' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Close' }).matches(':disabled')).toBe(false);
  });
});
