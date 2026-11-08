// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ChecklistPreviewScreen } from '../src/app/screens/ChecklistPreviewScreen';
import { ChecklistRunScreen } from '../src/app/screens/ChecklistRunScreen';
import { ChecklistsScreen } from '../src/app/screens/ChecklistsScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { checklistRunLists } from '../src/engine';
import { SchemaTooNewError } from '../src/model';
import type { Document } from '../src/model';
import type { DocumentStore } from '../src/store';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

const FLOOD = '/app/more/checklists/preview/checklists-uk%3Aflood';

function routes() {
  return (
    <Routes>
      <Route path="/app/more/checklists" element={<ChecklistsScreen />} />
      <Route path="/app/more/checklists/preview/:scenarioId" element={<ChecklistPreviewScreen />} />
      <Route path="/app/more/checklists/:runId" element={<ChecklistRunScreen />} />
    </Routes>
  );
}

function renderAt(doc: Document, path: string) {
  const s = liveStore(doc);
  const view = render(
    <StoreContext.Provider value={s.store}>
      <MemoryRouter initialEntries={[path]}>{routes()}</MemoryRouter>
    </StoreContext.Provider>,
  );
  return { ...s, ...view };
}

function startFlood() {
  const h = renderAt(biggarDocument(), FLOOD);
  fireEvent.click(screen.getByRole('button', { name: 'Start this checklist' }));
  return h;
}

describe('starting a run', () => {
  it('creates exactly one run on a double tap and opens it', () => {
    const h = renderAt(biggarDocument(), FLOOD);
    const button = screen.getByRole('button', { name: 'Start this checklist' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(checklistRunLists(h.doc()).open).toHaveLength(1);
    expect(h.labels.filter((l) => l === 'start checklist run')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Flood', level: 1 })).toBeTruthy();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('offers resume first, and a deliberate new incident makes a second run', () => {
    const h = startFlood();
    fireEvent.click(screen.getByRole('link', { name: /Checklists/ }));
    // The hub lists the open run.
    expect(screen.getByRole('heading', { name: 'Your lists' })).toBeTruthy();
    const card = screen
      .getAllByRole('link', { name: /^Flood/ })
      .find((a) => a.getAttribute('href')?.includes('/preview/'))!;
    fireEvent.click(card);
    expect(screen.getByRole('link', { name: /Resume/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start this checklist' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start a new incident' }));
    expect(checklistRunLists(h.doc()).open).toHaveLength(2);
  });
});

describe('an open run', () => {
  it('ticks, shows the time, and unticks', () => {
    const h = startFlood();
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes[0]!);
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/^Done \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText(/^1 of \d+ done$/)).toBeTruthy();
    expect(Object.values(h.doc().checklistStepStates).filter((s) => s.doneAt)).toHaveLength(1);
    expect(h.doc().plans).toEqual(biggarDocument().plans);
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(screen.getByText(/^0 of \d+ done$/)).toBeTruthy();
  });

  it('shows a date for a step ticked on another day', () => {
    const h = startFlood();
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    const d = structuredClone(h.doc());
    const state = Object.values(d.checklistStepStates).find((s) => s.doneAt)!;
    state.doneAt = '2020-03-04T09:30:00.000Z';
    act(() => h.store.change('seed', (draft) => Object.assign(draft, d)));
    expect(screen.getByText(/4 March 2020/)).toBeTruthy();
  });

  it('says so when the run does not exist', () => {
    renderAt(biggarDocument(), '/app/more/checklists/nope');
    expect(screen.getByText(/was not found/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows a clear message when no scenario is selected', () => {
    const h = startFlood();
    const d = structuredClone(h.doc());
    Object.values(d.checklistRuns)[0]!.scenarios = [];
    act(() => h.store.change('merge', (draft) => Object.assign(draft, d)));
    expect(screen.getByText(/no scenario selected/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('is read-only when the document is', () => {
    const h = startFlood();
    const doc = h.doc();
    const runId = Object.keys(doc.checklistRuns)[0]!;
    cleanup();
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
    render(
      <StoreContext.Provider value={store}>
        <MemoryRouter initialEntries={[`/app/more/checklists/${runId}`]}>{routes()}</MemoryRouter>
      </StoreContext.Provider>,
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => b.disabled)).toBe(true);
    expect(screen.getByText(/read-only/)).toBeTruthy();
  });
});
