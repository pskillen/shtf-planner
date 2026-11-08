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
}: {
  runId: string;
  stepId: string;
  label: string;
  saved: string;
  disabled: boolean;
  registry: NoteRegistry;
}) {
  const change = useChange();
  const [text, setText] = useState(saved);
  const textRef = useRef(saved);
  const savedRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (textRef.current === savedRef.current && saved !== textRef.current) {
      textRef.current = saved;
      setText(saved);
    }
    savedRef.current = saved;
  }, [saved]);

  const commit = useCallback(() => {
    clearTimeout(timer.current);
    const next = normalise(textRef.current);
    if (next === savedRef.current) return;
    try {
      change('note on checklist step', (d) => void setStepNote(d, runId, stepId, next));
      savedRef.current = next;
    } catch {
      // read-only meanwhile: nothing to save
    }
  }, [change, runId, stepId]);
  useEffect(() => commit, [commit]);

  useEffect(() => {
    const map = registry.current;
    map.set(stepId, () => {
      const next = normalise(textRef.current);
      return next === savedRef.current ? undefined : next;
    });
    return () => void map.delete(stepId);
  }, [registry, stepId]);

  return (
    <textarea
      className="step-note"
      aria-label={`Note on: ${label}`}
      placeholder={disabled ? undefined : 'Add a note'}
      disabled={disabled}
      rows={1}
      value={text}
      onChange={(e) => {
        textRef.current = e.target.value;
        setText(e.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(commit, NOTE_DEBOUNCE_MS);
      }}
      onBlur={commit}
    />
  );
}
