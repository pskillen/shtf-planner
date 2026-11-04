import { useEffect, useId, useRef, type ReactNode } from 'react';
import { EditArea } from './EditArea';

/**
 * A bottom sheet for adding or editing one thing. Closes on Escape or a tap on the backdrop; the
 * actions sit at the bottom, within a thumb's reach. Moves focus into the sheet on open.
 */
export function Sheet({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
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
        <div className="sheet-body">
          <EditArea>{children}</EditArea>
        </div>
        {actions ? (
          <div className="sheet-actions">
            <EditArea>{actions}</EditArea>
          </div>
        ) : null}
      </div>
    </div>
  );
}
