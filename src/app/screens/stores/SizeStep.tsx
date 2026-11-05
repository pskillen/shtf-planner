import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Item, Size, SizeUnit } from '../../../model';
import { MEASURE_UNITS } from '../../../model';
import { formatSize } from '../../../util';
import { Field, NumberInput } from '../../components/controls';
import { useDocument } from '../../state';
import { shouldSkipSizeStep } from './pickerHelpers';
import { productsOfItem } from './products';
import { defaultProductName, findProduct, type NewProduct } from './stock';

export type SizeStepDone = { productId: string } | NewProduct;

/**
 * Choose or define a product size: yours first, then the item's chips, then a typed multipack.
 * Same item, name and size reuses an existing product. Skipped when there is one size and no products.
 */
export function SizeStep({
  item,
  labelKcalPer100,
  initialName,
  onDone,
}: {
  item: Item;
  labelKcalPer100?: number;
  /** Prefill the optional name field (e.g. from Open Food Facts on a scan). */
  initialName?: string;
  onDone: (result: SizeStepDone) => void;
}) {
  const doc = useDocument();
  const skipped = useRef(false);
  const yours = useMemo(() => productsOfItem(doc, item.id), [doc, item.id]);
  const units = MEASURE_UNITS[item.measure];
  const defaultUnit = item.sizes[0]?.unit ?? units[0]!;

  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState(item.sizes[0]?.amount ?? 1);
  const [unit, setUnit] = useState<SizeUnit>(defaultUnit);
  const [multipack, setMultipack] = useState<number | undefined>(undefined);
  const [name, setName] = useState(initialName ?? '');

  useLayoutEffect(() => {
    if (!shouldSkipSizeStep(doc, item) || skipped.current) return;
    skipped.current = true;
    onDone({
      itemId: item.id,
      size: item.sizes[0]!,
      ...(labelKcalPer100 !== undefined ? { labelKcalPer100 } : {}),
    });
  }, [doc, item, labelKcalPer100, onDone]);

  if (shouldSkipSizeStep(doc, item)) return null;

  const pickSize = (size: Size) => {
    const draftName = name.trim() || defaultProductName(item, size);
    const existing = findProduct(doc, { itemId: item.id, name: draftName, size });
    if (existing) onDone({ productId: existing.id });
    else {
      onDone({
        itemId: item.id,
        size,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(labelKcalPer100 !== undefined ? { labelKcalPer100 } : {}),
      });
    }
  };

  const finishCustom = () => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const count = multipack !== undefined && multipack >= 2 ? Math.round(multipack) : undefined;
    const size: Size = { amount, unit, ...(count ? { count } : {}) };
    pickSize(size);
  };

  const placeholder = defaultProductName(item, item.sizes[0] ?? { amount: 1, unit: units[0]! });

  return (
    <>
      {yours.length > 0 ? (
        <section aria-label="Your products">
          <h3>Yours</h3>
          <ul className="row-list chip-list">
            {yours.map((p) => (
              <li key={p.id}>
                <button type="button" className="chip" onClick={() => onDone({ productId: p.id })}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {item.sizes.length > 0 ? (
        <section aria-label="Suggested sizes">
          <h3>Suggested sizes</h3>
          <ul className="row-list chip-list">
            {item.sizes.map((size) => (
              <li key={formatSize(size)}>
                <button type="button" className="chip" onClick={() => pickSize(size)}>
                  {formatSize(size)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!custom ? (
        <button type="button" className="secondary" onClick={() => setCustom(true)}>
          Another size
        </button>
      ) : (
        <section aria-label="Another size" className="another-size">
          <Field label="Amount">
            <NumberInput
              value={amount}
              min={0.01}
              step="any"
              ariaLabel="Amount, number"
              onChange={(n) => n !== undefined && setAmount(n)}
            />
          </Field>
          <div className="segmented" role="radiogroup" aria-label="Unit">
            {units.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                className={unit === u ? 'segment on' : 'segment'}
                onClick={() => setUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
          <Field label="× count (optional multipack)">
            <NumberInput
              value={multipack}
              min={2}
              step={1}
              placeholder="e.g. 24"
              ariaLabel="Multipack count, optional"
              onChange={setMultipack}
            />
          </Field>
          <button type="button" onClick={finishCustom}>
            Use this size
          </button>
        </section>
      )}
      <Field label="Name (optional)">
        <input
          type="text"
          value={name}
          placeholder={placeholder}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
    </>
  );
}
