// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTE_DEBOUNCE_MS } from '../src/app/screens/checklists/StepNote';
import { ChecklistPreviewScreen } from '../src/app/screens/ChecklistPreviewScreen';
import { ChecklistRunScreen } from '../src/app/screens/ChecklistRunScreen';
import { ChecklistsScreen } from '../src/app/screens/ChecklistsScreen';
import { StoreContext } from '../src/app/state/storeContext';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { checklistRunView, setStepNote } from '../src/engine';
import { liveStore } from './helpers/liveStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderFlood() {
  const s = liveStore(biggarDocument());
  render(
    <StoreContext.Provider value={s.store}>
      <MemoryRouter initialEntries={['/app/more/checklists/preview/checklists-uk%3Aflood']}>
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
  fireEvent.click(screen.getByRole('button', { name: 'Start this checklist' }));
  const runId = Object.keys(s.doc().checklistRuns)[0]!;
  return { ...s, runId };
}
type Harness = ReturnType<typeof renderFlood>;

const boxes = () => screen.getAllByRole('textbox') as HTMLTextAreaElement[];
const type = (box: HTMLTextAreaElement, value: string) =>
  fireEvent.change(box, { target: { value } });
const settle = () => act(() => void vi.advanceTimersByTime(NOTE_DEBOUNCE_MS));
const noteWrites = (h: Harness) => h.labels.filter((l) => l === 'note on checklist step');
const savedNotes = (h: Harness) =>
  Object.values(h.doc().checklistStepStates).filter((s) => s.note !== undefined);

describe('notes on steps', () => {
  it('keeps a note on an unticked step, saved after typing stops and not per keystroke', () => {
    const h = renderFlood();
    const box = boxes()[0]!;
    type(box, 'S');
    type(box, 'Sandbags');
    type(box, 'Sandbags at the gate');
    expect(noteWrites(h)).toHaveLength(0);
    settle();
    expect(noteWrites(h)).toHaveLength(1);
    const [state] = savedNotes(h);
    expect(state!.note).toBe('Sandbags at the gate');
    expect(state!.doneAt).toBeUndefined();
    expect(h.doc().plans).toEqual(biggarDocument().plans);
  });

  it('keeps the note when the step is ticked and unticked', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'Called the council');
    settle();
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(savedNotes(h)[0]!.doneAt).toBeDefined();
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    const [state] = savedNotes(h);
    expect(state!.note).toBe('Called the council');
    expect(state!.doneAt).toBeUndefined();
    expect(boxes()[0]!.value).toBe('Called the council');
  });

  it('deletes the field when the note is cleared', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'x');
    settle();
    expect(savedNotes(h)).toHaveLength(1);
    type(boxes()[0]!, '');
    settle();
    expect(savedNotes(h)).toHaveLength(0);
  });

  it('does not clobber text being typed when the document changes underneath', () => {
    const h = renderFlood();
    const ids = checklistRunView(h.doc(), h.runId)!.groups.flatMap((g) => g.steps.map((x) => x.id));
    type(boxes()[0]!, 'half a thou');
    // Another device writes a note on a different step, and a rerender follows.
    act(
      () => void h.store.change('sync', (d) => void setStepNote(d, h.runId, ids[3]!, 'elsewhere')),
    );
    expect(boxes()[0]!.value).toBe('half a thou');
    // Even a remote write to this very step does not replace unsaved text.
    act(() => void h.store.change('sync', (d) => void setStepNote(d, h.runId, ids[0]!, 'remote')));
    expect(boxes()[0]!.value).toBe('half a thou');
    type(boxes()[0]!, 'half a thought');
    settle();
    expect(savedNotes(h).map((s) => s.note)).toContain('half a thought');
  });

  it('shows a note that arrives from elsewhere while nothing is being typed', () => {
    const h = renderFlood();
    const ids = checklistRunView(h.doc(), h.runId)!.groups.flatMap((g) => g.steps.map((x) => x.id));
    act(
      () =>
        void h.store.change('sync', (d) => void setStepNote(d, h.runId, ids[0]!, 'from my phone')),
    );
    expect(screen.getByDisplayValue('from my phone')).toBeTruthy();
  });

  it('flushes on blur', () => {
    const h = renderFlood();
    const box = boxes()[0]!;
    type(box, 'on blur');
    fireEvent.blur(box);
    expect(savedNotes(h)).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(NOTE_DEBOUNCE_MS * 2));
    expect(noteWrites(h)).toHaveLength(1);
  });

  it('flushes when the screen is left', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'on leave');
    cleanup();
    expect(savedNotes(h)[0]!.note).toBe('on leave');
  });
});
