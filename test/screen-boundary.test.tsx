// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenBoundary } from '../src/app/ScreenBoundary';
import { Shell } from '../src/app/Shell';
import { labelOf, HEATING_LABEL } from '../src/app/labels';
import { StoreContext } from '../src/app/state/storeContext';
import type { DocumentStore } from '../src/store';
import { biggarDocument } from '../src/fixtures/household-biggar';

afterEach(cleanup);

describe('labelOf', () => {
  it('gives the label, or the fallback for a value the app does not know', () => {
    expect(labelOf(HEATING_LABEL, 'heat-pump')).toBe('Heat pump');
    expect(labelOf(HEATING_LABEL, 'bogus')).toBe('Unknown');
    expect(labelOf(HEATING_LABEL, undefined, 'Not set')).toBe('Not set');
    expect(labelOf(HEATING_LABEL, 'toString')).toBe('Unknown');
  });
});

describe('ScreenBoundary', () => {
  it('shows a way out instead of a blank page when a screen throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <MemoryRouter>
        <ScreenBoundary>
          <Boom />
        </ScreenBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert').textContent).toContain('could not be shown');
    expect(screen.getByRole('link', { name: 'Go to settings' }).getAttribute('href')).toBe(
      '/app/more/settings',
    );
    vi.restoreAllMocks();
  });
});

describe('the Home hub with an unknown value in the document', () => {
  it('still draws, with the banner above it and a fallback label', () => {
    const doc = biggarDocument();
    (doc.home as { heating: string }).heating = 'bogus';
    const status = { kind: 'invalid' as const, error: new Error('bad heating') };
    const store = {
      get: () => doc,
      status: () => status,
      subscribe: () => () => undefined,
    } as unknown as DocumentStore;
    render(
      <MemoryRouter initialEntries={['/app']}>
        <StoreContext.Provider value={store}>
          <Routes>
            <Route path="/app/*" element={<Shell />} />
          </Routes>
        </StoreContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Your household' })).toBeTruthy();
    expect(screen.getByText(/unknown heating/)).toBeTruthy();
    expect(screen.getByText(/could not be read, so it is read-only/)).toBeTruthy();
  });
});
