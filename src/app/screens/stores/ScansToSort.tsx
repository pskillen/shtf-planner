import { useState } from 'react';
import type { Scan } from '../../../model';
import { today } from '../../../util';
import { EditArea } from '../../components/EditArea';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { Sheet } from '../../components/Sheet';
import { useDeferredDelete } from '../../components/useDeferredDelete';
import { useChange, useDocument } from '../../state';
import { ScanResolve } from './ScanResolve';
import { productLine } from './scanHelpers';
import { addStock } from './stock';

/** "3 scans to sort ›": the note at the top of Stores. Nothing when the queue is empty. */
export function ScansToSortNote({ onOpen }: { onOpen: () => void }) {
  const { scans } = useDocument();
  const n = Object.keys(scans).length;
  if (n === 0) return null;
  return (
    <button type="button" className="note scans-note" onClick={onOpen}>
      {n === 1 ? '1 scan to sort' : `${n} scans to sort`} ›
    </button>
  );
}

/** What Open Food Facts said about a queued scan, in a line. */
function scanLine(scan: Scan): string {
  if (!scan.off) return 'not looked up yet';
  if (!scan.off.found) return 'Open Food Facts doesn’t know this one';
  return productLine(scan.off) || 'a product with no name';
}

/**
 * The scans waiting to be sorted. Tap one for the same "Which of these is it?" card as when
 * scanning; choosing makes it stock (`source: 'barcode'`) and takes it off the list. Each row can
 * be deleted, with undo.
 */
export function ScansToSort({ onClose }: { onClose: () => void }) {
  const doc = useDocument();
  const change = useChange();
  const [sorting, setSorting] = useState<string | null>(null);
  const remove = useDeferredDelete(
    (id) =>
      change('delete scan', (d) => {
        delete d.scans[id];
      }),
    (label) => `Scan ${label} deleted.`,
  );

  const scans = Object.values(doc.scans)
    .filter((s) => !remove.pending.has(s.id))
    .sort((a, b) => a.scanned.localeCompare(b.scanned));
  const scan = sorting ? doc.scans[sorting] : undefined;

  if (scan) {
    const place = doc.locations[scan.locationId]?.name ?? 'No place';
    return (
      <Sheet
        title="Sort this scan"
        onClose={() => setSorting(null)}
        actions={
          <button type="button" className="secondary" onClick={() => setSorting(null)}>
            Back
          </button>
        }
      >
        <p className="muted">
          {scan.qty} × to {place}
          {scan.bestBefore ? ` · best before ${scan.bestBefore}` : ''}
        </p>
        <ScanResolve
          key={scan.id}
          code={scan.code}
          seed={scan.off}
          onProduct={(productId) => {
            change('sort scan', (d) => {
              const s = d.scans[scan.id];
              if (!s) return;
              addStock(
                d,
                {
                  productId,
                  qty: s.qty,
                  locationId: s.locationId,
                  bestBefore: s.bestBefore,
                  source: 'barcode',
                },
                today(),
              );
              delete d.scans[scan.id];
            });
            setSorting(null);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title="Scans to sort" onClose={onClose}>
      {scans.length === 0 ? <p className="muted">Nothing left to sort.</p> : null}
      <ul className="row-list">
        {scans.map((s) => (
          <li className="row-item" key={s.id}>
            <button
              type="button"
              className="row-main"
              aria-label={`Sort scan ${s.code}`}
              onClick={() => setSorting(s.id)}
            >
              <strong>{scanLine(s)}</strong>
              <span className="muted">
                {s.code} · {s.qty} × · {doc.locations[s.locationId]?.name ?? 'No place'}
                {s.bestBefore ? ' · ' : ''}
              </span>
              {s.bestBefore ? <ExpiryBadge bestBefore={s.bestBefore} showMonth /> : null}
            </button>
            <EditArea>
              <button
                type="button"
                className="secondary"
                aria-label={`Delete scan ${s.code}`}
                onClick={() => remove.request(s.id, s.code)}
              >
                Delete
              </button>
            </EditArea>
          </li>
        ))}
      </ul>
      {remove.toast}
    </Sheet>
  );
}
