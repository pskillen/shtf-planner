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

  it('starts one run however fast Start is tapped', () => {
    const h = renderAt(biggarWithoutRuns(), path);
    const start = screen.getByRole('button', { name: 'Start these checklists together' });
    fireEvent.click(start);
    fireEvent.click(start);
    fireEvent.click(start);
    expect(checklistRunLists(h.doc()).open).toHaveLength(1);
  });

  it.each([
    ['a repeated id', `${previewPath([FLOOD])}+${encodeURIComponent(FLOOD)}`, true],
    ['an empty part', `${previewPath([FLOOD])}++${encodeURIComponent(STORM)}`, true],
    ['a trailing separator', `${previewPath([FLOOD])}+`, true],
    ['a wrong-case id', previewPath(FLOOD.toUpperCase()), false],
    ['only unknown ids', previewPath('nope+gone'), false],
    ['a malformed escape', '/app/more/checklists/preview/%E0%A4%A', false],
  ])('copes with a tampered address: %s', (_name, url, ok) => {
    renderAt(biggarWithoutRuns(), url);
    if (ok) {
      expect(screen.getByRole('button', { name: /Start/ })).toBeTruthy();
    } else {
      expect(screen.getByText(/not available/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
    }
  });

  it('says so when one of the ids is not offered', () => {
    renderAt(biggarWithoutRuns(), `${previewPath([FLOOD])}+nope`);
    expect(screen.getByText(/not available/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
  });
});

describe("changing a run's scenarios", () => {
  function open(doc: Document) {
    const h = renderAt(doc, '/app/more/checklists/run-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change scenarios' }));
    return h;
  }
  const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
  const selected = (h: { doc: () => Document }) => checklistRunView(h.doc(), 'run-1')!.scenarios;

  it('cannot remove the last selected scenario', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD, STORM], 'run-1');
    const h = open(doc);
    fireEvent.click(box('Storm'));
    expect(
      selected(h)
        .filter((s) => s.selected)
        .map((s) => s.id),
    ).toEqual([FLOOD]);
    expect(box('Flood').disabled).toBe(true);
    expect(box('Flood').checked).toBe(true);
  });

  it('hides exclusive steps, and re-adding restores the tick and note', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD, STORM], 'run-1');
    const h = open(doc);
    const view = checklistRunView(h.doc(), 'run-1')!;
    const exclusive = view.groups
      .flatMap((g) => g.steps)
      .find((s) => s.selectedScenarioIds.length === 1 && s.selectedScenarioIds[0] === STORM)!;
    fireEvent.click(screen.getByRole('checkbox', { name: exclusive.text }));
    fireEvent.change(screen.getByLabelText(`Note on: ${exclusive.text}`), {
      target: { value: 'kept safe' },
    });
    fireEvent.blur(screen.getByLabelText(`Note on: ${exclusive.text}`));
    fireEvent.click(box('Storm'));
    expect(screen.queryByText(exclusive.text)).toBeNull();
    expect(screen.getByText(/keeps a tick or note|keep a tick or note/)).toBeTruthy();
    fireEvent.click(box('Storm'));
    expect(
      (screen.getByRole('checkbox', { name: exclusive.text }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByLabelText(`Note on: ${exclusive.text}`) as HTMLTextAreaElement).value).toBe(
      'kept safe',
    );
  });

  it('counts a shared step once and ticks it once', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD, STORM], 'run-1');
    const h = renderAt(doc, '/app/more/checklists/run-1');
    const view = checklistRunView(h.doc(), 'run-1')!;
    const shared = view.groups
      .flatMap((g) => g.steps)
      .find((s) => s.selectedScenarioIds.length === 2)!;
    expect(screen.getAllByRole('checkbox', { name: shared.text })).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: shared.text }));
    expect(checklistRunView(h.doc(), 'run-1')!.done).toBe(1);
  });

  it('recovers a run that needs a scenario, which can then be finished', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD], 'run-1');
    doc.checklistRuns['run-1']!.scenarios = [];
    const h = renderAt(doc, '/app/more/checklists/run-1');
    expect(screen.getByText(/no scenario selected/)).toBeTruthy();
    // The picker is open already, with every catalogue scenario unticked.
    expect(box('Flood').checked).toBe(false);
    expect(box('Storm').checked).toBe(false);
    fireEvent.click(box('Storm'));
    expect(
      selected(h)
        .filter((s) => s.selected)
        .map((s) => s.id),
    ).toEqual([STORM]);
    expect(screen.getByText(/of \d+ done/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish this list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, finish' }));
    expect(checklistRunView(h.doc(), 'run-1')!.finished).toBeDefined();
  });

  it('does not offer Finish on a run that still needs a scenario, and says why', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD], 'run-1');
    doc.checklistRuns['run-1']!.scenarios = [];
    const h = renderAt(doc, '/app/more/checklists/run-1');
    expect(screen.queryByRole('button', { name: 'Finish this list' })).toBeNull();
    expect(screen.getByText('Choose a scenario above to finish this list.')).toBeTruthy();
    expect(checklistRunView(h.doc(), 'run-1')!.finished).toBeUndefined();
    fireEvent.click(box('Flood'));
    expect(screen.getByRole('button', { name: 'Finish this list' })).toBeTruthy();
    expect(screen.queryByText(/to finish this list/)).toBeNull();
  });

  it('keeps a pending note when its scenario is removed before it is saved', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD, STORM], 'run-1');
    const h = open(doc);
    const exclusive = checklistRunView(h.doc(), 'run-1')!
      .groups.flatMap((g) => g.steps)
      .find((s) => s.selectedScenarioIds.length === 1 && s.selectedScenarioIds[0] === STORM)!;
    fireEvent.change(screen.getByLabelText(`Note on: ${exclusive.text}`), {
      target: { value: 'typed, not blurred' },
    });
    fireEvent.click(box('Storm'));
    expect(screen.queryByText(exclusive.text)).toBeNull();
    fireEvent.click(box('Storm'));
    expect((screen.getByLabelText(`Note on: ${exclusive.text}`) as HTMLTextAreaElement).value).toBe(
      'typed, not blurred',
    );
  });

  it('offers only the scenarios the run froze, whatever the packs hold now', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD, STORM], 'run-1');
    const run = doc.checklistRuns['run-1']!;
    // As if the packs gained Heatwave and Power cut and lost Evacuation after the run began.
    run.catalogue.scenarios = run.catalogue.scenarios.filter(
      (s) => s.id === FLOOD || s.id === STORM,
    );
    renderAt(doc, '/app/more/checklists/run-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change scenarios' }));
    const names = screen
      .getAllByRole('checkbox')
      .map((c) => (c as HTMLInputElement).closest('label')?.textContent)
      .filter((t) => t === 'Flood' || t === 'Storm' || t === 'Heatwave' || t === 'Evacuation');
    expect(names.sort()).toEqual(['Flood', 'Storm']);
    expect(screen.queryByRole('checkbox', { name: 'Heatwave' })).toBeNull();
  });

  it('has no picker on a finished run', () => {
    const doc = biggarWithoutRuns();
    addRun(doc, [FLOOD, STORM], 'run-1');
    doc.checklistRuns['run-1']!.finished = '2026-11-08T12:00:00.000Z';
    renderAt(doc, '/app/more/checklists/run-1');
    expect(screen.queryByRole('button', { name: 'Change scenarios' })).toBeNull();
  });
});
