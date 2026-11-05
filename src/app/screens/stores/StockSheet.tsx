import { useState } from 'react';
import type { Item, Product, Stock } from '../../../model';
import { today } from '../../../util';
import { Field } from '../../components/controls';
import { isDirty } from '../../components/isDirty';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { useDocument } from '../../state';
import { MonthField } from './MonthField';
import { suitabilityWarning } from './stock';

/** Edit one stock batch: how many, where, best-before. Delete asks for undo from the screen. */
export function StockSheet({
  initial,
  product,
  item,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Stock;
  product: Product | undefined;
  item: Item | undefined;
  onSave: (row: Stock) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const doc = useDocument();
  const [row, setRow] = useState<Stock>(initial);
  const locations = Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name));
  const where = doc.locations[row.locationId];
  const warning = item && where ? suitabilityWarning(item, where) : undefined;
  const title = product?.name ?? 'stock';

  return (
    <Sheet
      title={`Edit ${title}`}
      onClose={onClose}
      dirty={isDirty(row, initial)}
      actions={
        <>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
          <button type="button" onClick={() => onSave(row)}>
            Save
          </button>
        </>
      }
    >
      <Field label={`How many (${item?.unit ?? 'packs'})?`}>
        <Stepper
          label={`How many ${item?.unit ?? 'packs'}`}
          value={row.qty}
          min={0.25}
          onChange={(qty) => setRow({ ...row, qty })}
        />
      </Field>
      <Field label="Where is it?">
        <select
          value={row.locationId}
          onChange={(e) => setRow({ ...row, locationId: e.target.value })}
        >
          {where ? null : <option value={row.locationId}>Unknown place</option>}
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
        value={row.bestBefore}
        onChange={(bestBefore) => {
          const { bestBefore: _drop, ...rest } = row;
          void _drop;
          setRow(bestBefore ? { ...rest, bestBefore } : rest);
        }}
        shelfLife={item?.shelfLife ?? 'none'}
        today={today()}
      />
    </Sheet>
  );
}
