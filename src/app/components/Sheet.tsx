import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useEditable } from '../state';
import { EditArea } from './EditArea';

// How many sheets are open, and whether one history entry stands for them. Sheets open one after
// another (the equipment picker, then its form) and share the entry.
let openSheets = 0;

/** Marks the current history entry as "a sheet is open on top of this page". */
function pushSheetEntry(): void {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  if (!state.sheet) window.history.pushState({ ...state, sheet: true }, '');
}

/** Takes the sheet entry off again, if the page is still on it and no other sheet took over. */
function dropSheetEntry(): void {
  setTimeout(() => {
    if (openSheets === 0 && (window.history.state as { sheet?: boolean } | null)?.sheet) {
      window.history.back();
    }
  }, 0);
}

/**
 * A bottom sheet for adding or editing one thing. The actions sit at the bottom, within a thumb's
 * reach, and focus moves into the sheet on open.
 *
 * Closing: the ✕ button closes at once. A tap on the backdrop or Escape closes too, but when
 * `dirty` (there are unsaved edits) the sheet first asks, so a stray tap does not throw an edit
 * away. While a sheet is open it holds one history entry, so Android's Back button closes the
 * sheet (asking the same way) before it leaves the screen.
 */
export function Sheet({
  title,
  onClose,
  children,
  actions,
  dirty = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  dirty?: boolean;
}) {
  const titleId = useId();
  const editable = useEditable();
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const live = useRef({ onClose, dirty });
  useEffect(() => {
    live.current = { onClose, dirty };
  });

  /** A close that was not an explicit ✕ or Save: ask first if there is something to lose. */
  const requestClose = useCallback(() => {
    if (live.current.dirty) setConfirming(true);
    else live.current.onClose();
  }, []);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  useEffect(() => {
    openSheets += 1;
    pushSheetEntry();
    const onPop = () => {
      // Back took our entry off. If the edits must stay, put it back.
      if (live.current.dirty) pushSheetEntry();
      requestClose();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      openSheets -= 1;
      dropSheetEntry();
    };
  }, [requestClose]);

  return (
    <div className="sheet-backdrop" onClick={requestClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="quiet" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {editable ? null : <p className="sheet-readonly muted">Read-only</p>}
        <div className="sheet-body">
          <EditArea>{children}</EditArea>
        </div>
        {confirming ? (
          <div className="sheet-confirm" role="alert">
            <p>Discard your changes?</p>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              Keep editing
            </button>
            <button type="button" className="danger" onClick={onClose}>
              Discard
            </button>
          </div>
        ) : actions ? (
          <div className="sheet-actions">
            <EditArea>{actions}</EditArea>
          </div>
        ) : null}
      </div>
    </div>
  );
}
