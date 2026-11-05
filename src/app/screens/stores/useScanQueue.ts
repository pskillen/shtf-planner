import { useEffect, useRef } from 'react';
import { getOff } from '../../off';
import { useChange, useDocument } from '../../state';
import { productInfoOf } from './scanHelpers';

/** After Open Food Facts says it is busy, wait this long before asking again. */
const BUSY_WAIT_MS = 60_000;

/**
 * When the device is online, looks up the codes of scans waiting to be sorted (oldest first) so
 * their names are there when the person sorts them. Respects the client's own rate limit: on
 * "busy" it stops and tries again after a minute. A code the household already knows is skipped
 * (it sorts itself). A scan sorted on another device simply disappears (the CRDT), so a result
 * for one that has gone is dropped.
 */
export function useScanQueue(): void {
  const doc = useDocument();
  const change = useChange();
  const live = useRef({ doc, change });
  useEffect(() => {
    live.current = { doc, change };
  });
  const running = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Re-run when the set of unlooked scans changes, or the device comes back online.
  const waiting = Object.values(doc.scans)
    .filter((s) => !s.product && !doc.barcodes[s.code])
    .map((s) => s.id)
    .sort()
    .join(',');

  useEffect(() => {
    let alive = true;
    async function run(): Promise<void> {
      if (running.current || globalThis.navigator?.onLine === false) return;
      running.current = true;
      try {
        for (;;) {
          const { doc: d } = live.current;
          const next = Object.values(d.scans)
            .filter((s) => !s.product && !d.barcodes[s.code])
            .sort((a, b) => a.scanned.localeCompare(b.scanned))[0];
          if (!next || !alive) break;
          const result = await getOff().lookup(next.code);
          if (!alive) break;
          if (result === 'offline') break;
          if (result === 'busy') {
            clearTimeout(retry.current);
            retry.current = setTimeout(() => void run(), BUSY_WAIT_MS);
            break;
          }
          const info = productInfoOf(result);
          try {
            live.current.change('look up scan', (draft) => {
              const scan = draft.scans[next.id];
              if (scan && info) scan.product = info;
            });
          } catch {
            // read-only: leave the queue as it is
          }
          // The change re-renders, which re-runs this effect for the next scan (the document seen
          // here is stale until then, so carrying on would ask about the same scan again).
          break;
        }
      } finally {
        running.current = false;
      }
    }
    if (waiting !== '') void run();
    const online = () => void run();
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    return () => {
      alive = false;
      clearTimeout(retry.current);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
    };
  }, [waiting]);
}
