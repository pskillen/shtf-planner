import { useState } from 'react';
import type { ItemInstance, ItemType } from '../../../model';
import { today } from '../../../util';
import { Field } from '../../components/controls';
import { isDirty } from '../../components/isDirty';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { useDocument } from '../../state';
import { MonthField } from './MonthField';
import { suitabilityWarning } from './stock';

/** Edit one stock entry: how many, where, best-before. Delete asks for undo from the screen. */
export function ItemSheet({
  initial,
  type,
  onSave,
  onDelete,
  onClose,
}: {
  initial: ItemInstance;
  type: ItemType | undefined;
  onSave: (item: ItemInstance) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const doc = useDocument();
  const [item, setItem] = useState<ItemInstance>(initial);
  const locations = Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name));
  const where = doc.locations[item.locationId];
  const warning = type && where ? suitabilityWarning(type, where) : undefined;

  return (
    <Sheet
      title={`Edit ${type?.name ?? 'item'}`}
      onClose={onClose}
      dirty={isDirty(item, initial)}
      actions={
        <>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
          <button type="button" onClick={() => onSave(item)}>
            Save
          </button>
        </>
      }
    >
      <Field label={`How many (${type?.unit ?? 'items'})?`}>
        <Stepper
          label={`How many ${type?.unit ?? 'items'}`}
          value={item.qty}
          onChange={(qty) => setItem({ ...item, qty })}
        />
      </Field>
      <Field label="Where is it?">
        <select
          value={item.locationId}
          onChange={(e) => setItem({ ...item, locationId: e.target.value })}
        >
          {where ? null : <option value={item.locationId}>Unknown place</option>}
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      {warning ? (
        <p className="warn" role="status">
          ⚠ {warning}.
        </p>
      ) : null}
      <MonthField
        value={item.bestBefore}
        onChange={(bestBefore) => {
          const { bestBefore: _drop, ...rest } = item;
          void _drop;
          setItem(bestBefore ? { ...rest, bestBefore } : rest);
        }}
        shelfLife={type?.shelfLife ?? 'none'}
        today={today()}
      />
    </Sheet>
  );
}
