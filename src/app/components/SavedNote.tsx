import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DocumentStore } from '../../store';
import { useChange } from '../state';

const SHOWN_MS = 2000;

/**
 * For the screens that save as you go (no Save button): `change` is `useChange()` plus a short
 * "Saved" note, which `note` renders. Put `note` near the top so it is seen without scrolling; it
 * keeps its height when empty, so nothing jumps.
 */
export function useSavedChange(): { change: DocumentStore['change']; note: ReactNode } {
  const write = useChange();
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const change = useCallback<DocumentStore['change']>(
    (label, fn) => {
      write(label, fn);
      if (!mounted.current) return;
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), SHOWN_MS);
    },
    [write],
  );

  const note = (
    <p className="saved-note muted" role="status" aria-live="polite">
      {saved ? 'Saved' : ''}
    </p>
  );
  return { change, note };
}
