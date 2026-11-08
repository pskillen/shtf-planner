// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChecklistPreviewScreen } from '../src/app/screens/ChecklistPreviewScreen';
import {
  ChecklistPreviewPrintScreen,
  ChecklistRunPrintScreen,
} from '../src/app/screens/ChecklistPrintScreen';
import { ChecklistRunScreen } from '../src/app/screens/ChecklistRunScreen';
import { previewPath, previewPrintPath, runPrintPath } from '../src/app/screens/checklists/view';
import { StoreContext } from '../src/app/state/storeContext';
import { checklistRunView, finishRun, setStepDone, setStepNote, startRun } from '../src/engine';
import type { Document } from '../src/model';
import { bundledPacks } from '../src/packs';
import { biggarWithoutRuns } from './helpers/noRuns';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

const FLOOD = 'checklists-uk:flood';
const STORM = 'checklists-uk:storm';

function renderAt(doc: Document, path: string) {
  const s = liveStore(doc);
  return render(
    <StoreContext.Provider value={s.store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/app/more/checklists/preview/:scenarioId"
            element={<ChecklistPreviewScreen />}
          />
          <Route
            path="/app/more/checklists/preview/:scenarioId/print"
            element={<ChecklistPreviewPrintScreen />}
          />
          <Route path="/app/more/checklists/:runId" element={<ChecklistRunScreen />} />
          <Route path="/app/more/checklists/:runId/print" element={<ChecklistRunPrintScreen />} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>,
  );
}

function withRun(ids: string[], edit?: (doc: Document) => void) {
  const doc = biggarWithoutRuns();
  startRun(doc, bundledPacks(), {
    runId: 'run-1',
    started: '2026-11-08T10:00:00.000Z',
    asOf: '2026-11-08',
    scenarioIds: ids,
  });
  edit?.(doc);
  return doc;
}

describe('printing a preview', () => {
  it('links to the print view and prints a blank single list', () => {
    renderAt(biggarWithoutRuns(), previewPath(FLOOD));
    expect(screen.getByRole('link', { name: 'Print a blank copy' }).getAttribute('href')).toBe(
      previewPrintPath(FLOOD),
    );
    cleanup();
    renderAt(biggarWithoutRuns(), previewPrintPath(FLOOD));
    const sheet = screen.getByRole('article');
    expect(within(sheet).getByRole('heading', { level: 1, name: 'Flood' })).toBeTruthy();
    expect(within(sheet).getAllByText(/^Source: /).length).toBeGreaterThan(0);
    // Sources are text, not links, and nothing is ticked.
    expect(within(sheet).queryAllByRole('link')).toHaveLength(0);
    expect(sheet.textContent).not.toContain('✓');
    expect(within(sheet).queryByText(/^For: /)).toBeNull();
    expect(within(sheet).getByText(/^Printed /)).toBeTruthy();
    expect(within(sheet).getByText(/^Content: checklists-uk version \d+/)).toBeTruthy();
  });

  it('prints a combined list once per step with its For: line', () => {
    renderAt(biggarWithoutRuns(), previewPrintPath([FLOOD, STORM]));
    const sheet = screen.getByRole('article');
    expect(
      within(sheet)
        .getAllByText(/^For: /)
        .some((n) => /Flood.*Storm|Storm.*Flood/.test(n.textContent!)),
    ).toBe(true);
    expect(within(sheet).getAllByText(/^Never drive through floodwater/)).toHaveLength(1);
  });

  it('calls window.print from the Print button', () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderAt(biggarWithoutRuns(), previewPrintPath(FLOOD));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it.each([
    ['unknown ids', previewPrintPath('nope+gone')],
    ['a malformed escape', '/app/more/checklists/preview/%E0%A4%A/print'],
    ['one unknown among known', previewPrintPath([FLOOD, 'nope'])],
  ])('says so honestly for %s', (_n, url) => {
    renderAt(biggarWithoutRuns(), url);
    expect(screen.getByText(/not available/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });
});

describe('printing a run', () => {
  it('prints ticks, times and saved notes, including long notes and URLs', () => {
    const long = `${'word '.repeat(300)}\nhttps://example.test/${'a'.repeat(200)}`;
    const doc = withRun([FLOOD, STORM], (d) => {
      const first = checklistRunView(d, 'run-1')!.groups[0]!.steps[0]!;
      setStepDone(d, 'run-1', first.id, '2026-11-08T10:30:00.000Z');
      setStepNote(d, 'run-1', first.id, long);
      finishRun(d, 'run-1', '2026-11-08T12:00:00.000Z');
    });
    const total = checklistRunView(doc, 'run-1')!.total;
    renderAt(doc, runPrintPath('run-1'));
    const sheet = screen.getByRole('article');
    expect(sheet.textContent).toContain('✓');
    expect(within(sheet).getAllByText(/^Done /)).toHaveLength(1);
    expect(within(sheet).getByText(/Finished 8 November 2026/)).toBeTruthy();
    expect(
      within(sheet).getByText(new RegExp(`^1 of ${total} done\\. Saved notes only`)),
    ).toBeTruthy();
    expect(sheet.querySelector('.print-note-text')!.textContent).toBe(long);
    expect(within(sheet).getAllByText(/^For: /).length).toBeGreaterThan(0);
    expect(within(sheet).getByText(/^Content: checklists-uk version \d+/)).toBeTruthy();
  });

  it('links to the print view from a run', () => {
    renderAt(withRun([FLOOD]), '/app/more/checklists/run-1');
    expect(screen.getByRole('link', { name: 'Print this list' }).getAttribute('href')).toBe(
      runPrintPath('run-1'),
    );
  });

  it('says honestly that a run needing a scenario has nothing to print', () => {
    const doc = withRun([FLOOD], (d) => {
      d.checklistRuns['run-1']!.scenarios = [];
    });
    renderAt(doc, runPrintPath('run-1'));
    expect(screen.getByText(/no steps to print/)).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });

  it('says so for an unknown run', () => {
    renderAt(biggarWithoutRuns(), runPrintPath('gone'));
    expect(screen.getByText(/not found/)).toBeTruthy();
  });

  it('prints the frozen steps, not the current packs', () => {
    const doc = withRun([FLOOD], (d) => {
      const id = checklistRunView(d, 'run-1')!.groups[0]!.steps[0]!.id;
      d.checklistRuns['run-1']!.catalogue.steps.find((s) => s.id === id)!.text = 'Frozen wording';
    });
    renderAt(doc, runPrintPath('run-1'));
    expect(screen.getByText('Frozen wording')).toBeTruthy();
  });
});
