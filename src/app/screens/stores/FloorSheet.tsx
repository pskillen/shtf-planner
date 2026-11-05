import { useState } from 'react';
import type { Location } from '../../../model';
import { floorKey } from '../../../model';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { isDirty } from '../../components/isDirty';

export interface FloorRow {
  typeId: string;
  name: string;
  unit: string;
  /** What is in the place now. */
  have: number;
}

/**
 * Pantry floors for one rotating place: the level of each type that you never go below. What
 * counts towards the plan is the floor (up to what is there), not today’s stock, so a floor of 0
 * means the type does not count at all. Only types already in this place are listed.
 */
export function FloorSheet({
  location,
  rows,
  floors,
  onSave,
  onClose,
}: {
  location: Location;
  rows: readonly FloorRow[];
  /** The document's `floors`. */
  floors: Readonly<Record<string, number>>;
  /** The new floor per type id (0 removes it). */
  onSave: (next: Record<string, number>) => void;
  onClose: () => void;
}) {
  const start = Object.fromEntries(
    rows.map((r) => [r.typeId, floors[floorKey(location.id, r.typeId)] ?? 0]),
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
          <li className="row-item floor-row" key={r.typeId}>
            <div className="row-main">
              <strong>{r.name}</strong>
              <span className="muted">
                {r.have} in stock · {r.unit}
              </span>
            </div>
            <Stepper
              label={`Minimum for ${r.name}`}
              value={levels[r.typeId] ?? 0}
              onChange={(n) => setLevels({ ...levels, [r.typeId]: n })}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
