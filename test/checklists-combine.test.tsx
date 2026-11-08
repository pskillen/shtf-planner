// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ChecklistPreviewScreen } from '../src/app/screens/ChecklistPreviewScreen';
import { ChecklistRunScreen } from '../src/app/screens/ChecklistRunScreen';
import { ChecklistsScreen } from '../src/app/screens/ChecklistsScreen';
import { parsePreviewIds, previewPath } from '../src/app/screens/checklists/view';
import { StoreContext } from '../src/app/state/storeContext';
import { checklistRunLists, checklistRunView, startRun } from '../src/engine';
import type { Document } from '../src/model';
import { bundledPacks } from '../src/packs';
import { biggarWithoutRuns } from './helpers/noRuns';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

const FLOOD = 'checklists-uk:flood';
const STORM = 'checklists-uk:storm';
const EVAC = 'checklists-uk:evacuation';

function renderAt(doc: Document, path: string) {
  const s = liveStore(doc);
  const view = render(
    <StoreContext.Provider value={s.store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/more/checklists" element={<ChecklistsScreen />} />
          <Route
            path="/app/more/checklists/preview/:scenarioId"
            element={<ChecklistPreviewScreen />}
          />
          <Route path="/app/more/checklists/:runId" element={<ChecklistRunScreen />} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>,
  );
  return { ...s, ...view };
}

/** Add a run of the given scenarios to a document, under a fixed id. */
function addRun(doc: Document, ids: string[], runId: string, started = '2026-11-08T10:00:00.000Z') {
  startRun(doc, bundledPacks(), { runId, started, asOf: '2026-11-08', scenarioIds: ids });
}

describe('the combined route form', () => {
  it('round-trips ids joined by +', () => {
    expect(previewPath(FLOOD)).toBe('/app/more/checklists/preview/checklists-uk%3Aflood');
    const path = previewPath([FLOOD, STORM]);
    expect(path.endsWith('checklists-uk%3Aflood+checklists-uk%3Astorm')).toBe(true);
    expect(parsePreviewIds('a+b+a+')).toEqual(['a', 'b']);
  });
});

describe('combining on the hub', () => {
  it('previews the ticked scenarios together', () => {
    renderAt(biggarWithoutRuns(), '/app/more/checklists');
    fireEvent.click(screen.getByRole('button', { name: 'Combine scenarios' }));
    expect(screen.queryByRole('link', { name: /together/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Flood' }));
    expect(screen.queryByRole('link', { name: /together/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Storm' }));
    fireEvent.click(screen.getByRole('link', { name: 'Preview 2 together' }));
    expect(
      screen.getByRole('heading', { name: /Flood, Storm|Storm, Flood/, level: 1 }),
    ).toBeTruthy();
  });
});

describe('a combined preview', () => {
  const path = previewPath([STORM, FLOOD]);

  it('shows each step once with the scenarios that supplied it, and starts them all', () => {
    const h = renderAt(biggarWithoutRuns(), path);
    const supplied = screen.getAllByText(/^For: /);
    expect(supplied.some((s) => /Flood.*Storm|Storm.*Flood/.test(s.textContent!))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start these checklists together' }));
    const open = checklistRunLists(h.doc()).open;
    expect(open).toHaveLength(1);
    const view = checklistRunView(h.doc(), open[0]!.id)!;
    expect(
      view.scenarios
        .filter((s) => s.selected)
        .map((s) => s.id)
        .sort(),
    ).toEqual([FLOOD, STORM].sort());
    // The run says which scenarios supplied the shared step.
    expect(screen.getAllByText(/^For: /).length).toBeGreaterThan(0);
  });

  it('offers only open runs that include every selected scenario', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD], 'only-flood');
    addRun(doc, [FLOOD, STORM, EVAC], 'both', '2026-11-08T11:00:00.000Z');
    renderAt(doc, path);
    const links = screen.getAllByRole('link', { name: /Resume/ });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toContain('both');
  });

  it('says so when one of the ids is not offered', () => {
    renderAt(biggarWithoutRuns(), `${previewPath([FLOOD])}+nope`);
    expect(screen.getByText(/not available/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
  });
});
