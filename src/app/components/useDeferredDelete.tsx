import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const UNDO_MS = 5000;

/**
 * Delete with undo. `request(id, label)` hides the record at once and shows a toast; the real
 * `commit(id)` runs after five seconds unless Undo was tapped. Leaving the screen commits what is
 * still pending, so a delete is never lost. Render `toast` somewhere on the screen and skip the
 * ids in `pending` when listing. `verb` is what the toast says happened.
 */
export function useDeferredDelete(
  commit: (id: string) => void,
  /** What the toast says happened: "deleted" by default, or "marked done" for a plan item. */
  verb = 'deleted',
): {
  pending: ReadonlySet<string>;
  request: (id: string, label: string) => void;
  toast: ReactNode;
} {
  const [pending, setPending] = useState<ReadonlyMap<string, string>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  const finish = useCallback((id: string, run: boolean) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setPending((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    if (run) {
      try {
        commitRef.current(id);
      } catch {
        // The document went read-only meanwhile; the record simply stays.
      }
    }
  }, []);

  const request = useCallback(
    (id: string, label: string) => {
      setPending((m) => new Map(m).set(id, label));
      timers.current.set(
        id,
        setTimeout(() => finish(id, true), UNDO_MS),
      );
    },
    [finish],
  );

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const [id, timer] of live) {
        clearTimeout(timer);
        try {
          commitRef.current(id);
        } catch {
          // read-only now: leave the record
        }
      }
      live.clear();
    };
  }, []);

  const last = [...pending.entries()].at(-1);
  const toast = last ? (
    <div className="toast" role="status">
      <span>
        {last[1]} {verb}.
      </span>
      <button type="button" onClick={() => finish(last[0], false)}>
        Undo
      </button>
    </div>
  ) : null;

  return { pending: new Set(pending.keys()), request, toast };
}
