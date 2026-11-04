// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Landing } from '../src/app/Landing';
import { Shell } from '../src/app/Shell';
import { installDebugHook } from '../src/app/debug';
import { DocumentProvider } from '../src/app/state';
import { paragraphs } from '../src/util/text';

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/app/*"
          element={
            <DocumentProvider>
              <Shell />
            </DocumentProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the shell', () => {
  it('shows the top bar, the five tabs and the footer', async () => {
    renderShell('/app');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(screen.getAllByText('SHTF Planner').length).toBeGreaterThan(0);
    for (const label of ['Home', 'Stores', 'Gaps', 'Score', 'More']) {
      expect(nav.textContent).toContain(label);
    }
    expect(screen.getByTestId('footer').textContent).toBe('SHTF Planner · local · local');
  });

  it('renders a placeholder for the tabs built later', async () => {
    renderShell('/app/stores');
    expect(await screen.findByRole('heading', { name: 'Stores' })).toBeTruthy();
    expect(screen.getByText('Not in this version yet.')).toBeTruthy();
  });
});

describe('the landing page', () => {
  it('says there are no releases yet when the list is empty', () => {
    render(
      <MemoryRouter>
        <Landing list={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No releases yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start' }).getAttribute('href')).toBe('/app');
    expect(screen.getByTestId('footer')).toBeTruthy();
  });

  it('lists releases newest first as plain paragraphs', () => {
    render(
      <MemoryRouter>
        <Landing
          list={[
            { tag: '0.2.0', name: '0.2.0', publishedAt: '2026-02-01T00:00:00Z', body: 'a\n\nb' },
            { tag: '0.1.0', name: '0.1.0', publishedAt: '2026-01-01T00:00:00Z', body: 'c' },
          ]}
        />
      </MemoryRouter>,
    );
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['0.2.0', '0.1.0']);
    expect(screen.getByText('b')).toBeTruthy();
  });

  it('splits bodies on blank lines', () => {
    expect(paragraphs('one\r\n\r\ntwo\n\n\n three ')).toEqual(['one', 'two', 'three']);
    expect(paragraphs('')).toEqual([]);
  });
});

describe('the debug hook', () => {
  it('installs window.__shtf only with ?debug=1', () => {
    const off = {} as Window;
    expect(installDebugHook('', off)).toBeUndefined();
    expect(off.__shtf).toBeUndefined();
    const on = {} as Window;
    expect(installDebugHook('?debug=1', on)).toEqual({});
    expect(on.__shtf).toEqual({});
  });
});
