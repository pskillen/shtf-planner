import { useEffect, useRef, useState } from 'react';
import type { CalendarCandidate } from '../../engine';
import { calendarFile } from '../calendarExport';
import { Sheet } from './Sheet';

/** Standalone preview; the caller supplies a validated snapshot and closes the sheet. */
export function CalendarExport({
  candidates,
  createdAt,
  asOf,
  onClose,
}: {
  candidates: readonly CalendarCandidate[];
  createdAt: string;
  asOf: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(
    () =>
      new Set(candidates.filter((c) => c.selectedByDefault).map((c) => JSON.stringify(c.identity))),
  );
  const effectiveSelection = candidates.filter((candidate) =>
    selected.has(JSON.stringify(candidate.identity)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const live = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const close = () => {
    live.current = false;
    onClose();
  };
  const download = async () => {
    if (busy.current || effectiveSelection.length === 0) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      const text = await calendarFile(createdAt, effectiveSelection, new Date().toISOString());
      if (!live.current) return;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'shtf-planner.ics';
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      if (live.current) setError(true);
    } finally {
      busy.current = false;
      if (live.current) setPending(false);
    }
  };
  return (
    <Sheet
      title="Add to calendar"
      onClose={close}
      actions={
        <>
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || effectiveSelection.length === 0}
            onClick={() => void download()}
          >
            Download calendar
          </button>
        </>
      }
    >
      <p>
        Choose reminders to include. This file is a snapshot, not a live subscription. Calendar apps
        handle repeat imports differently.
      </p>
      {candidates.map((candidate) => {
        const key = JSON.stringify(candidate.identity);
        return (
          <label key={key}>
            <input
              type="checkbox"
              disabled={pending}
              checked={selected.has(key)}
              onChange={(event) => {
                const checked = event.target.checked;
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(key);
                  else next.delete(key);
                  return next;
                });
              }}
            />{' '}
            {candidate.label} — {candidate.due}
            {candidate.due < asOf ? ' (overdue)' : ''}
          </label>
        );
      })}
      {!candidates.some((candidate) => candidate.kind === 'maintenance') && (
        <p className="muted">No equipment reminders due in this period.</p>
      )}
      <p>{effectiveSelection.length} selected</p>
      {error && <p role="alert">Could not prepare the calendar. Please try again.</p>}
    </Sheet>
  );
}
