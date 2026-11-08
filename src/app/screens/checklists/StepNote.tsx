import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { setStepNote } from '../../../engine';
import { useChange } from '../../state';

/** How long typing must pause before the note is saved (the area field on Home uses the same idea). */
export const NOTE_DEBOUNCE_MS = 600;

/** Each mounted note reports what it has typed but not yet saved (`undefined` when nothing). */
export type NoteRegistry = MutableRefObject<Map<string, () => string | undefined>>;

/** A whitespace-only note is no note. Anything else is stored exactly as typed. */
const normalise = (text: string): string => (text.trim() === '' ? '' : text);

/**
 * A write to IndexedDB started while the page is unloading is not reliably kept (a reload right
 * after typing lost it), so every keystroke also leaves the typed text here, synchronously. It is
 * a few characters in this browser's own storage, never the document, and is removed once the
 * note is saved. On the next visit an unsaved draft is saved first.
 */
const draftKey = (runId: string, stepId: string): string =>
  `shtf:checklist-note-draft:${runId}|${stepId}`;
const draft = {
  read(key: string): string | undefined {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  write(key: string, text: string): void {
    try {
      localStorage.setItem(key, text);
    } catch {
      // storage blocked: the timer, blur and page-hide saves still apply
    }
  },
  clear(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to clear
    }
  },
};

/**
 * One step's note. The text lives here while it is typed; the document is written a moment after
 * typing stops, on blur, when the note is removed from the screen, and (through `registry`) when
 * the run is finished. A change arriving from another device replaces the text only while nothing
 * unsaved is being typed.
 */
export function StepNote({
  runId,
  stepId,
  label,
  saved,
  disabled,
  registry,
  onUnsaved,
}: {
  runId: string;
  stepId: string;
  label: string;
  saved: string;
  disabled: boolean;
  registry: NoteRegistry;
  /** Tells the screen whether this note holds text not yet saved, so it can be kept on screen. */
  onUnsaved: (stepId: string, on: boolean) => void;
}) {
  const change = useChange();
  const [text, setText] = useState(saved);
  const textRef = useRef(saved);
  const savedRef = useRef(saved);
  const [notSaved, setNotSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (textRef.current === savedRef.current && saved !== textRef.current) {
      textRef.current = saved;
      setText(saved);
    }
    savedRef.current = saved;
  }, [saved]);

  const key = draftKey(runId, stepId);
  const save = useCallback(
    (keepDraft: boolean) => {
      clearTimeout(timer.current);
      const next = normalise(textRef.current);
      if (next === savedRef.current) {
        if (!keepDraft) draft.clear(key);
        onUnsaved(stepId, false);
        return;
      }
      try {
        let refused = false;
        change('note on checklist step', (d) => {
          // `setStepNote` is also false for an unchanged value, so a refusal is told apart by the
          // run itself: gone, or finished (for instance on another device).
          const wrote = setStepNote(d, runId, stepId, next);
          refused = !wrote && d.checklistRuns[runId]?.finished !== undefined;
        });
        if (refused) {
          setNotSaved(true);
          return;
        }
        savedRef.current = next;
        // A save made as the page goes away may not reach IndexedDB: the draft stays for next time.
        if (!keepDraft) draft.clear(key);
        setNotSaved(false);
        onUnsaved(stepId, false);
      } catch {
        // read-only meanwhile: nothing to save
      }
    },
    [change, key, onUnsaved, runId, stepId],
  );
  const commit = useCallback(() => save(false), [save]);
  const commitLeaving = useCallback(() => save(true), [save]);
  useEffect(() => commit, [commit]);

  // Text typed just before the page went away: take it back and save it.
  useEffect(() => {
    const left = draft.read(key);
    if (left === undefined) return;
    if (disabled || normalise(left) === savedRef.current) {
      draft.clear(key);
      return;
    }
    textRef.current = left;
    setText(left);
    commit();
    // Only on arrival: later changes to `commit` or `disabled` are not a new visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the page or hiding the app writes the note now. Capture phase, so the change is made
  // before DocumentProvider's own listeners push pending writes to IndexedDB.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') commitLeaving();
      else if (savedRef.current === normalise(textRef.current)) draft.clear(key);
    };
    document.addEventListener('visibilitychange', onHidden, true);
    window.addEventListener('pagehide', commitLeaving, true);
    return () => {
      document.removeEventListener('visibilitychange', onHidden, true);
      window.removeEventListener('pagehide', commitLeaving, true);
    };
  }, [commitLeaving, key]);

  useEffect(() => {
    const map = registry.current;
    map.set(stepId, () => {
      const next = normalise(textRef.current);
      return next === savedRef.current ? undefined : next;
    });
    return () => void map.delete(stepId);
  }, [registry, stepId]);

  return (
    <>
      <textarea
        className="step-note"
        aria-label={`Note on: ${label}`}
        placeholder={disabled ? undefined : 'Add a note'}
        disabled={disabled}
        rows={1}
        value={text}
        onChange={(e) => {
          textRef.current = e.target.value;
          setNotSaved(false);
          onUnsaved(stepId, true);
          draft.write(key, e.target.value);
          setText(e.target.value);
          clearTimeout(timer.current);
          timer.current = setTimeout(commit, NOTE_DEBOUNCE_MS);
        }}
        onBlur={commit}
      />
      {notSaved ? (
        <p className="muted" role="status">
          This list was finished, so this note was not saved.
        </p>
      ) : null}
    </>
  );
}
