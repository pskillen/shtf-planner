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
import { biggarWithoutRuns } from './helpers/noRuns';
import { checklistRunLists, checklistRunView, setStepNote } from '../src/engine';
import { liveStore } from './helpers/liveStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  localStorage.clear();
  cleanup();
  vi.useRealTimers();
});

function renderFlood() {
  const s = liveStore(biggarWithoutRuns());
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
    expect(h.doc().plans).toEqual(biggarWithoutRuns().plans);
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

  it('writes the note when the page is hidden, before the pending-writes flush', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'hidden in time');
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    spy.mockRestore();
    expect(savedNotes(h)[0]!.note).toBe('hidden in time');
  });

  const remount = (h: Harness) =>
    render(
      <StoreContext.Provider value={h.store}>
        <MemoryRouter initialEntries={[`/app/more/checklists/${h.runId}`]}>
          <Routes>
            <Route path="/app/more/checklists/:runId" element={<ChecklistRunScreen />} />
          </Routes>
        </MemoryRouter>
      </StoreContext.Provider>,
    );
  const firstStep = (h: Harness) => checklistRunView(h.doc(), h.runId)!.groups[0]!.steps[0]!.id;
  const draftKeyOf = (h: Harness) => `shtf:checklist-note-draft:${h.runId}|${firstStep(h)}`;
  const hide = () => {
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    spy.mockRestore();
  };
  // The page is killed: no unmount runs, so whatever was in localStorage stays there.
  const kill = () => {
    const left = Object.entries(localStorage);
    cleanup();
    localStorage.clear();
    for (const [k, v] of left) localStorage.setItem(k, v);
  };
  const remoteNote = (h: Harness, note: string) =>
    act(() => void h.store.change('sync', (d) => void setStepNote(d, h.runId, firstStep(h), note)));

  it('takes back a draft left by a page that went away before the write landed', () => {
    const h = renderFlood();
    cleanup();
    localStorage.setItem(draftKeyOf(h), JSON.stringify({ base: '', text: 'left behind' }));
    remount(h);
    expect(boxes()[0]!.value).toBe('left behind');
    expect(savedNotes(h)[0]!.note).toBe('left behind');
    expect(localStorage.length).toBe(0);
  });

  it('keeps the draft when hidden, and a note changed elsewhere after that is not overwritten', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'MY OLD NOTE');
    hide();
    expect(localStorage.length).toBe(1);
    remoteNote(h, 'NEWER NOTE FROM OTHER DEVICE');
    kill();
    remount(h);
    expect(boxes()[0]!.value).toBe('NEWER NOTE FROM OTHER DEVICE');
    expect(savedNotes(h)[0]!.note).toBe('NEWER NOTE FROM OTHER DEVICE');
    expect(localStorage.length).toBe(0);
  });

  it('an emptied-note draft does not delete a note added elsewhere', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'abc');
    settle();
    type(boxes()[0]!, '');
    hide();
    expect(savedNotes(h)).toHaveLength(0);
    remoteNote(h, 'REMOTE ADDED THIS');
    kill();
    remount(h);
    expect(boxes()[0]!.value).toBe('REMOTE ADDED THIS');
    expect(savedNotes(h)[0]!.note).toBe('REMOTE ADDED THIS');
    expect(localStorage.length).toBe(0);
  });

  it('drops a draft whose base is no longer the saved note, without writing', () => {
    const h = renderFlood();
    remoteNote(h, 'NEWER');
    cleanup();
    localStorage.setItem(draftKeyOf(h), JSON.stringify({ base: 'OLD', text: 'stale text' }));
    remount(h);
    expect(boxes()[0]!.value).toBe('NEWER');
    expect(savedNotes(h)[0]!.note).toBe('NEWER');
    cleanup();
    localStorage.setItem(draftKeyOf(h), JSON.stringify({ base: 'OLD', text: '' }));
    remount(h);
    expect(savedNotes(h)[0]!.note).toBe('NEWER');
    expect(localStorage.length).toBe(0);
  });

  it('drops a draft without a readable base', () => {
    const h = renderFlood();
    cleanup();
    localStorage.setItem(draftKeyOf(h), 'plain text');
    remount(h);
    expect(savedNotes(h)).toHaveLength(0);
    expect(localStorage.length).toBe(0);
  });

  it('shows the not-saved message for a draft whose run was finished elsewhere', () => {
    const h = renderFlood();
    remoteNote(h, 'saved text');
    cleanup();
    act(
      () =>
        void h.store.change(
          'sync',
          (d) => void (d.checklistRuns[h.runId]!.finished = '2026-01-01T10:20:00.000Z'),
        ),
    );
    localStorage.setItem(
      draftKeyOf(h),
      JSON.stringify({ base: 'saved text', text: 'saved text, too late' }),
    );
    remount(h);
    expect(screen.getByRole('status').textContent).toContain('was not saved');
    expect(localStorage.length).toBe(0);
  });

  it('clears the draft when a save is refused because the run was finished', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'typing');
    act(
      () =>
        void h.store.change(
          'sync',
          (d) => void (d.checklistRuns[h.runId]!.finished = '2026-01-01T10:20:00.000Z'),
        ),
    );
    settle();
    expect(screen.getByRole('status').textContent).toContain('was not saved');
    expect(localStorage.length).toBe(0);
  });

  it('removes the draft once the note is saved', () => {
    renderFlood();
    type(boxes()[0]!, 'saved soon');
    expect(localStorage.length).toBe(1);
    settle();
    expect(localStorage.length).toBe(0);
  });

  it('ignores visibilitychange to visible', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'still typing');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(savedNotes(h)).toHaveLength(0);
  });

  it('writes the note on pagehide', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'leaving');
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(savedNotes(h)[0]!.note).toBe('leaving');
  });

  it('makes no write for an unchanged value and stores a whitespace-only note as empty', () => {
    const h = renderFlood();
    const box = boxes()[0]!;
    fireEvent.focus(box);
    fireEvent.blur(box);
    type(box, '');
    fireEvent.blur(box);
    type(box, '   ');
    fireEvent.blur(box);
    expect(noteWrites(h)).toHaveLength(0);
    type(box, 'real');
    fireEvent.blur(box);
    type(box, '   ');
    fireEvent.blur(box);
    expect(savedNotes(h)).toHaveLength(0);
    expect(noteWrites(h)).toHaveLength(2);
  });

  it('keeps the typed text and says so when the list was finished elsewhere', () => {
    const h = renderFlood();
    type(boxes()[0]!, 'too late');
    act(
      () =>
        void h.store.change(
          'sync',
          (d) => void (d.checklistRuns[h.runId]!.finished = '2026-11-08T10:00:00.000Z'),
        ),
    );
    settle();
    expect(boxes()[0]!.value).toBe('too late');
    expect(savedNotes(h)).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toMatch(/finished, so this note was not saved/);
  });

  it('flushes every pending note when finishing, in one write', () => {
    const h = renderFlood();
    const all = boxes();
    type(all[0]!, 'first');
    type(all[2]!, 'third');
    const before = h.labels.length;
    fireEvent.click(screen.getByRole('button', { name: 'Finish this list' }));
    expect(h.labels).toHaveLength(before);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, finish' }));
    expect(h.labels.slice(before)).toEqual(['finish checklist run']);
    expect(
      savedNotes(h)
        .map((s) => s.note)
        .sort(),
    ).toEqual(['first', 'third']);
    expect(h.doc().checklistRuns[h.runId]!.finished).toBeDefined();
    act(() => void vi.advanceTimersByTime(NOTE_DEBOUNCE_MS * 2));
    expect(h.labels.slice(before)).toEqual(['finish checklist run']);
  });

  it('can back out of finishing', () => {
    const h = renderFlood();
    fireEvent.click(screen.getByRole('button', { name: 'Finish this list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(h.doc().checklistRuns[h.runId]!.finished).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Finish this list' })).toBeTruthy();
  });
});

describe('a finished run', () => {
  function finished() {
    const h = renderFlood();
    type(boxes()[0]!, 'kept for the record');
    fireEvent.click(screen.getByRole('button', { name: 'Finish this list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, finish' }));
    return h;
  }

  it('has no enabled controls and shows its notes', () => {
    finished();
    const controls = [...screen.getAllByRole('checkbox'), ...screen.queryAllByRole('textbox')] as (
      HTMLInputElement | HTMLTextAreaElement
    )[];
    expect(controls.every((c) => c.disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /finish this list/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reopen/i })).toBeNull();
    expect(screen.getByDisplayValue('kept for the record')).toBeTruthy();
    expect(screen.getByText(/Finished/)).toBeTruthy();
    // Only the one note exists; empty steps show no box at all.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('keeps its archived text when the household changes afterwards', () => {
    const h = finished();
    const texts = () => screen.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent);
    const before = texts();
    act(
      () =>
        void h.store.change('household changes', (d) => {
          d.household.pets = [];
          d.home.risks = [];
        }),
    );
    expect(texts()).toEqual(before);
  });

  it('is listed last on the hub', () => {
    const h = finished();
    act(
      () =>
        void h.store.change('seed another open run', (d) => {
          const run = structuredClone(d.checklistRuns[h.runId]!);
          run.id = 'open-run';
          delete run.finished;
          run.started = '2000-01-01T00:00:00.000Z';
          d.checklistRuns['open-run'] = run;
        }),
    );
    expect(checklistRunLists(h.doc()).finished).toHaveLength(1);
    fireEvent.click(screen.getByRole('link', { name: /Checklists/ }));
    const headings = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent);
    expect(headings.indexOf('Your lists')).toBeLessThan(headings.indexOf('Finished lists'));
    expect(headings.indexOf('Scenarios')).toBeLessThan(headings.indexOf('Finished lists'));
    expect(headings.at(-1)).toBe('Finished lists');
  });

  it('opens the invented finished Biggar incident read-only with its notes and times', () => {
    cleanup();
    const s = liveStore(biggarDocument());
    render(
      <StoreContext.Provider value={s.store}>
        <MemoryRouter initialEntries={['/app/more/checklists/run-flood-oct-2026']}>
          <Routes>
            <Route path="/app/more/checklists/:runId" element={<ChecklistRunScreen />} />
          </Routes>
        </MemoryRouter>
      </StoreContext.Provider>,
    );
    expect(screen.getByText(/Finished 20 October 2026/)).toBeTruthy();
    expect(screen.getByText('5 of 8 done')).toBeTruthy();
    expect(screen.getByDisplayValue(/Stopcock is under the kitchen sink/)).toBeTruthy();
    const controls = [...screen.getAllByRole('checkbox'), ...screen.getAllByRole('textbox')] as (
      HTMLInputElement | HTMLTextAreaElement
    )[];
    expect(controls.every((c) => c.disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /finish this list/i })).toBeNull();
  });
});
