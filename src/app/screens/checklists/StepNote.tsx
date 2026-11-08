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
 * note is saved. It carries the saved note it was typed over (`base`): on the next visit it is
 * saved only if that note is still the saved one, so it can never overwrite or delete a note that
 * changed on another device meanwhile.
 */
const draftKey = (runId: string, stepId: string): string =>
  `shtf:checklist-note-draft:${runId}|${stepId}`;
type Draft = { base: string; text: string };
const draft = {
  read(key: string): Draft | undefined {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      const parsed = JSON.parse(raw) as Partial<Draft> | null;
      if (typeof parsed?.base === 'string' && typeof parsed.text === 'string') {
        return { base: parsed.base, text: parsed.text };
      }
      localStorage.removeItem(key);
    } catch {
      // unreadable or storage blocked: no draft
    }
    return undefined;
  },
  write(key: string, value: Draft): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
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
  const key = draftKey(runId, stepId);
  // Text typed just before the page went away, if the note it was typed over is still the saved
  // one. Read once, so the first paint already shows it.
  const [left] = useState(() => {
    const found = draft.read(key);
    return found && found.base === saved && normalise(found.text) !== saved ? found : undefined;
  });
  const [text, setText] = useState(left?.text ?? saved);
  const textRef = useRef(left?.text ?? saved);
  const savedRef = useRef(saved);
  // A draft for a run finished meanwhile is shown, with the message, and not saved.
  const [notSaved, setNotSaved] = useState(left !== undefined && disabled);
  // The saved note the current draft was typed over; undefined while there is no draft.
  const draftBase = useRef<string | undefined>(undefined);
  const restored = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dropDraft = useCallback(() => {
    draftBase.current = undefined;
    draft.clear(key);
  }, [key]);

  useEffect(() => {
    if (textRef.current === savedRef.current && saved !== textRef.current) {
      textRef.current = saved;
      setText(saved);
      // The note changed elsewhere: a draft typed over the old one must not come back.
      dropDraft();
    }
    savedRef.current = saved;
  }, [saved, dropDraft]);

  const save = useCallback(
    (keepDraft: boolean) => {
      clearTimeout(timer.current);
      const next = normalise(textRef.current);
      if (next === savedRef.current) {
        if (!keepDraft) dropDraft();
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
          // The draft could never be restored into a finished run.
          dropDraft();
          setNotSaved(true);
          return;
        }
        savedRef.current = next;
        // A save made as the page goes away may not reach IndexedDB: the draft stays for next time.
        if (!keepDraft) dropDraft();
        setNotSaved(false);
        onUnsaved(stepId, false);
      } catch {
        // read-only meanwhile: nothing to save
      }
    },
    [change, dropDraft, onUnsaved, runId, stepId],
  );
  const commit = useCallback(() => save(false), [save]);
  const commitLeaving = useCallback(() => save(true), [save]);
  useEffect(() => commit, [commit]);

  // Save the draft taken back above (unusable ones are just removed). Called through a ref: this
  // runs once on arrival, and a later change of `commit` is not a new visit.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (left !== undefined && !disabled) commitRef.current();
    dropDraft();
  }, [disabled, dropDraft, left]);

  // Leaving the page or hiding the app writes the note now. Capture phase, so the change is made
  // before DocumentProvider's own listeners push pending writes to IndexedDB.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') commitLeaving();
      else if (savedRef.current === normalise(textRef.current)) dropDraft();
    };
    document.addEventListener('visibilitychange', onHidden, true);
    window.addEventListener('pagehide', commitLeaving, true);
    return () => {
      document.removeEventListener('visibilitychange', onHidden, true);
      window.removeEventListener('pagehide', commitLeaving, true);
    };
  }, [commitLeaving, dropDraft]);

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
          draftBase.current ??= savedRef.current;
          draft.write(key, { base: draftBase.current, text: e.target.value });
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
