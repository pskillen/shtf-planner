import { useState } from 'react';
import type { Location } from '../../../model';
import { minimumKey } from '../../../model';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { isDirty } from '../../components/isDirty';

export interface MinimumRow {
  itemId: string;
  name: string;
  unit: string;
  /** What is in the place now (packs of any product of this item). */
  have: number;
}

/**
 * Minimums for one rotating place: the least kept of each item there. What counts towards the
 * plan is the minimum (up to what is there), not today's stock.
 */
export function MinimumSheet({
  location,
  rows,
  minimums,
  onSave,
  onClose,
}: {
  location: Location;
  rows: readonly MinimumRow[];
  /** The document's `minimums`. */
  minimums: Readonly<Record<string, number>>;
  /** The new minimum per item id (0 removes it). */
  onSave: (next: Record<string, number>) => void;
  onClose: () => void;
}) {
  const start = Object.fromEntries(
    rows.map((r) => [r.itemId, minimums[minimumKey(location.id, r.itemId)] ?? 0]),
  );
  const [levels, setLevels] = useState<Record<string, number>>(start);

  return (
    <Sheet
      title={`Always keep at least, in the ${location.name}`}
      onClose={onClose}
      dirty={isDirty(levels, start)}
      actions={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => onSave(levels)}>
            Save minimums
          </button>
        </>
      }
    >
      <p className="muted">
        The least you always keep. The plan counts this minimum, not what is on the shelf today.
      </p>
      {rows.length === 0 ? <p className="muted">Nothing is kept here yet.</p> : null}
      <ul className="row-list">
        {rows.map((r) => (
          <li className="row-item floor-row" key={r.itemId}>
            <div className="row-main">
              <strong>{r.name}</strong>
              <span className="muted">
                {r.have} in stock · {r.unit}
              </span>
            </div>
            <Stepper
              label={`Minimum for ${r.name}`}
              value={levels[r.itemId] ?? 0}
              onChange={(n) => setLevels({ ...levels, [r.itemId]: n })}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
