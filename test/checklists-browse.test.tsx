// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ChecklistPreviewScreen } from '../src/app/screens/ChecklistPreviewScreen';
import { ChecklistsScreen } from '../src/app/screens/ChecklistsScreen';
import { MoreScreen } from '../src/app/screens/MoreScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument } from '../src/fixtures/household-biggar';
import type { Document } from '../src/model';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

function renderAt(doc: Document, path: string) {
  const s = liveStore(doc);
  return render(
    <StoreContext.Provider value={s.store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/more" element={<MoreScreen />} />
          <Route path="/app/more/checklists" element={<ChecklistsScreen />} />
          <Route
            path="/app/more/checklists/preview/:scenarioId"
            element={<ChecklistPreviewScreen />}
          />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>,
  );
}

describe('checklist hub', () => {
  it('is linked from More', () => {
    renderAt(biggarDocument(), '/app/more');
    const link = screen.getByRole('link', { name: /Scenario checklists/ });
    expect(link.getAttribute('href')).toBe('/app/more/checklists');
  });

  it('lists the UK scenarios, each linking to its preview', () => {
    renderAt(biggarDocument(), '/app/more/checklists');
    for (const name of ['Power cut', 'Storm', 'Flood', 'Heatwave', 'Evacuation']) {
      const link = screen
        .getAllByRole('link', { name: new RegExp(name) })
        .find((a) => a.getAttribute('href')?.includes('/preview/'))!;
      expect(link.getAttribute('href')).toMatch(/^\/app\/more\/checklists\/preview\/checklists-uk/);
    }
  });

  it('says so for a region with no checklist content, without UK advice', () => {
    const doc = biggarDocument();
    doc.settings.region = 'US';
    renderAt(doc, '/app/more/checklists');
    expect(screen.getByText(/no scenario checklists for your region \(US\)/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Power cut/ })).toBeNull();
  });
});

describe('checklist preview', () => {
  it('groups steps under the phase headings with source links and no controls', () => {
    renderAt(biggarDocument(), '/app/more/checklists/preview/checklists-uk%3Aflood');
    expect(screen.getByRole('heading', { name: 'Flood', level: 1 })).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['When it is coming', 'Immediately', 'First days', 'Longer term']);
    const external = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('https://'));
    expect(external.length).toBeGreaterThan(0);
    expect(external[0]?.getAttribute('rel')).toContain('noopener');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Start this checklist',
    ]);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says honestly when the scenario is unknown', () => {
    renderAt(biggarDocument(), '/app/more/checklists/preview/nope');
    expect(screen.getByText(/not available for your region/)).toBeTruthy();
  });

  it('does not offer a UK scenario to a US household', () => {
    const doc = biggarDocument();
    doc.settings.region = 'US';
    renderAt(doc, '/app/more/checklists/preview/checklists-uk%3Aflood');
    expect(screen.getByText(/not available for your region/)).toBeTruthy();
  });
});
