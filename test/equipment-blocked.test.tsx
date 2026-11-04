// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetsScreen } from '../src/app/screens/AssetsScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument } from '../src/fixtures/household-biggar';
import type { DocumentStore } from '../src/store';

afterEach(cleanup);

const ok = { kind: 'ok' as const };
const storeFor = (doc: ReturnType<typeof biggarDocument>) =>
  ({
    get: () => doc,
    status: () => ok,
    subscribe: () => () => undefined,
    change: () => undefined,
  }) as unknown as DocumentStore;

const show = (doc: ReturnType<typeof biggarDocument>) =>
  render(
    <MemoryRouter>
      <StoreContext.Provider value={storeFor(doc)}>
        <AssetsScreen />
      </StoreContext.Provider>
    </MemoryRouter>,
  );

describe('the Equipment "blocked" badge', () => {
  it('marks solar and the home battery with no EPS, with the engine’s reason', () => {
    show(biggarDocument());
    const solar = screen.getByRole('button', { name: 'Edit Roof solar' });
    expect(within(solar).getByText('Blocked')).toBeTruthy();
    expect(solar.textContent).toMatch(/gives nothing in an outage/);
    expect(
      within(screen.getByRole('button', { name: 'Edit Home battery' })).getByText('Blocked'),
    ).toBeTruthy();
  });

  it('does not mark the EVs that can feed the house, or the smoke alarm', () => {
    show(biggarDocument());
    for (const name of ['Edit Family EV', 'Edit Hall smoke alarm']) {
      expect(within(screen.getByRole('button', { name })).queryByText('Blocked')).toBeNull();
    }
  });

  it('clears the badge once an EPS is fitted', () => {
    const doc = structuredClone(biggarDocument());
    doc.assets['asset-solar']!.answers.hasEps = true;
    show(doc);
    expect(
      within(screen.getByRole('button', { name: 'Edit Roof solar' })).queryByText('Blocked'),
    ).toBeNull();
  });

  it('marks an EV that cannot do vehicle-to-load', () => {
    const doc = structuredClone(biggarDocument());
    doc.assets['asset-ev-1']!.answers.v2l = false;
    show(doc);
    const ev = screen.getByRole('button', { name: 'Edit Family EV' });
    expect(within(ev).getByText('Blocked')).toBeTruthy();
  });
});
