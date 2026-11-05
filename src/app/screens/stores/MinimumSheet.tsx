import { useState } from 'react';
import type { Item, Location } from '../../../model';
import { minimumKey } from '../../../model';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { isDirty } from '../../components/isDirty';

/**
 * Minimums for one item: the least kept in each rotating place. What counts towards the plan is
 * the minimum (up to what is there), not today's stock.
 */
export function MinimumSheet({
  item,
  locations,
  haveByPlace,
  minimums,
  onSave,
  onClose,
}: {
  item: Item;
  /** Rotating places, sorted by name. */
  locations: readonly Location[];
  /** Packs of any product of this item currently in each place. */
  haveByPlace: Readonly<Record<string, number>>;
  minimums: Readonly<Record<string, number>>;
  /** Minimum per rotating place id (0 removes it). */
  onSave: (next: Record<string, number>) => void;
  onClose: () => void;
}) {
  const start = Object.fromEntries(
    locations.map((l) => [l.id, minimums[minimumKey(l.id, item.id)] ?? 0]),
  );
  const [levels, setLevels] = useState<Record<string, number>>(start);

  return (
    <Sheet
      title="Always keep at least"
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
        {item.name}. The least you always keep in each rotating place. The plan counts this minimum,
        not what is on the shelf today.
      </p>
      {locations.length === 0 ? (
        <p className="muted">Add a rotating place under Home → Locations to set minimums.</p>
      ) : null}
      <ul className="row-list">
        {locations.map((l) => (
          <li className="row-item floor-row" key={l.id}>
            <div className="row-main">
              <strong>{l.name}</strong>
              <span className="muted">
                {haveByPlace[l.id] ?? 0} in stock · {item.unit}
              </span>
            </div>
            <Stepper
              label={`Minimum for ${item.name} in the ${l.name}`}
              value={levels[l.id] ?? 0}
              onChange={(n) => setLevels({ ...levels, [l.id]: n })}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
