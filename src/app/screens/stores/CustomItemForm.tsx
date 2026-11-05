import { useRef, useState } from 'react';
import {
  CATEGORIES,
  RESOURCE_INFO,
  type Category,
  type ItemType,
  type ResourceId,
} from '../../../model';
import { Field, NumberInput } from '../../components/controls';
import { Sheet } from '../../components/Sheet';
import { CATEGORY_LABEL, labelOf } from '../../labels';
import {
  DEFAULT_STORE,
  GIVEABLE_STORES,
  NEEDS_GIVES,
  buildCustomType,
  givesPrompt,
} from './customType';

/** "Add as a custom item": a name, a category and, for food and water, what one piece gives. */
export function CustomItemForm({
  initialName,
  initialAmount,
  onClose,
  onBack,
  onMade,
}: {
  initialName: string;
  /** What one piece gives (kcal for food), when something already knows. */
  initialAmount?: number;
  onClose: () => void;
  onBack: () => void;
  onMade: (type: ItemType) => void;
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<Category>('food');
  const [unit, setUnit] = useState('each');
  const [store, setStore] = useState<ResourceId | ''>(DEFAULT_STORE.food ?? '');
  const [amount, setAmount] = useState<number | undefined>(initialAmount);
  const [problem, setProblem] = useState<string | null>(null);
  // The amount is what is usually missing: say so beside it and put the cursor there.
  const [amountMissing, setAmountMissing] = useState(false);
  const amountBox = useRef<HTMLDivElement>(null);

  function pickCategory(c: Category): void {
    setCategory(c);
    setStore(DEFAULT_STORE[c] ?? '');
  }

  const prompt = store
    ? givesPrompt(store, unit)
    : 'It will be listed but will not count towards the plan.';

  return (
    <Sheet
      title="Add a custom item"
      onClose={onClose}
      dirty={name.trim() !== initialName.trim() || amount !== initialAmount}
      actions={
        <>
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              const r = buildCustomType(
                { name, category, unit, resource: store || undefined, amount },
                crypto.randomUUID(),
              );
              if (r.ok) return onMade(r.type);
              const missing = Boolean(store) && !(amount !== undefined && amount > 0);
              setAmountMissing(missing && name.trim() !== '');
              setProblem(r.problem);
              if (missing && name.trim() !== '') amountBox.current?.querySelector('input')?.focus();
            }}
          >
            Save item
          </button>
        </>
      }
    >
      <p className="muted">
        For something the lists do not have. It is kept in your plan only, on this household’s
        devices.
      </p>
      <Field label="Name">
        <input
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Category">
        <select value={category} onChange={(e) => pickCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {labelOf(CATEGORY_LABEL, c)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="One piece is a…" hint="Tin, bottle, pack, each.">
        <input
          type="text"
          autoComplete="off"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </Field>
      {NEEDS_GIVES.has(category) ? null : (
        <Field label="What does it give?">
          <select value={store} onChange={(e) => setStore(e.target.value as ResourceId | '')}>
            <option value="">Nothing the plan counts</option>
            {GIVEABLE_STORES.map((s) => (
              <option key={s} value={s}>
                {RESOURCE_INFO[s].name} ({RESOURCE_INFO[s].unit})
              </option>
            ))}
          </select>
        </Field>
      )}
      {store ? (
        <div ref={amountBox}>
          <Field
            label={
              store === 'foodKcal'
                ? 'About how many kcal?'
                : store === 'waterL'
                  ? 'About how many litres?'
                  : prompt
            }
            hint={
              amountMissing ? (
                <span className="warn" role="alert">
                  {problem}
                </span>
              ) : store === 'foodKcal' || store === 'waterL' ? (
                prompt
              ) : undefined
            }
          >
            <NumberInput
              value={amount}
              min={0}
              onChange={(v) => {
                setAmount(v);
                setAmountMissing(false);
              }}
            />
          </Field>
        </div>
      ) : (
        <p className="muted">{prompt}</p>
      )}
      {problem && !amountMissing ? (
        <p className="warn" role="alert">
          {problem}
        </p>
      ) : null}
    </Sheet>
  );
}
