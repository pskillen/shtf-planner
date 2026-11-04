import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, STORE_INFO, type Category, type ItemType, type StoreId } from '../../../model';
import { today } from '../../../util';
import { Field, NumberInput } from '../../components/controls';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { CATEGORY_LABEL, labelOf } from '../../labels';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import {
  DEFAULT_STORE,
  GIVEABLE_STORES,
  NEEDS_GIVES,
  buildCustomType,
  givesPrompt,
} from './customType';
import { MonthField } from './MonthField';
import {
  addStock,
  matchTypes,
  pushRecent,
  readLastLocation,
  readRecent,
  suitabilityWarning,
  writeLastLocation,
} from './stock';

export interface QuickAddPrefill {
  typeId: string;
  qty?: number;
}

type Step = 'search' | 'form' | 'custom';

/**
 * Quick add: search for what you are putting away, pick it, then Add. The place is the last one
 * you used and the quantity is one, so a plain item is a search, a tap on the item and a tap on
 * Add. The sheet stays open afterwards with "Same again" (one more with the same details) and
 * "Next item". Something the packs do not list can be added as a custom item.
 */
export function QuickAdd({ onClose, prefill }: { onClose: () => void; prefill?: QuickAddPrefill }) {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();

  const enabled = useMemo(
    () => new Set(['custom', ...packs.enabledPacks(doc.settings).map((p) => p.id)]),
    [packs, doc.settings],
  );
  const types = useMemo(
    () => Object.values(packs.items).filter((t) => enabled.has(t.id.split(':')[0]!)),
    [packs, enabled],
  );
  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const [recent] = useState(readRecent);

  const start = prefill ? packs.items[prefill.typeId] : undefined;
  const [step, setStep] = useState<Step>(start ? 'form' : 'search');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ItemType | undefined>(start);
  const [qty, setQty] = useState(Math.max(1, prefill?.qty ?? 1));
  const [locationId, setLocationId] = useState(() => {
    const last = readLastLocation();
    return last && doc.locations[last] ? last : (locations[0]?.id ?? '');
  });
  const [bestBefore, setBestBefore] = useState<string | undefined>(undefined);
  const [added, setAdded] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== 'search') return;
    // After the sheet has taken focus for itself.
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [step]);

  const location = doc.locations[locationId];
  const warning = type && location ? suitabilityWarning(type, location) : undefined;
  const shown = useMemo(() => matchTypes(types, query, recent), [types, query, recent]);

  /** Any edit to the details means the last Add is no longer what the form shows. */
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setLast(null);
      set(v);
    };

  function put(): void {
    if (!type || !location) return;
    change('add stock', (d) => {
      addStock(d, { typeId: type.id, qty, locationId, bestBefore }, today());
    });
    writeLastLocation(locationId);
    pushRecent(type.id);
    setAdded((n) => n + qty);
    setLast(`Added ${qty} × ${type.name} to ${location.name}`);
  }

  function pick(t: ItemType): void {
    setType(t);
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setStep('form');
  }

  function next(): void {
    setType(undefined);
    setLast(null);
    setQuery('');
    setStep('search');
  }

  const counter =
    added > 0 ? (
      <p className="muted" role="status" data-testid="added-count">
        Added this session: {added}
      </p>
    ) : null;

  if (step === 'custom') {
    return (
      <CustomItemForm
        initialName={query}
        onClose={onClose}
        onBack={() => setStep('search')}
        onMade={(made) => {
          change('add custom item type', (d) => {
            d.customTypes[made.id] = made;
          });
          pick(made);
        }}
      />
    );
  }

  return (
    <Sheet
      title={step === 'search' ? 'Add stock' : `Add ${type?.name ?? ''}`}
      onClose={onClose}
      actions={
        step === 'form' ? (
          last ? (
            <>
              <button type="button" className="secondary" onClick={next}>
                Next item
              </button>
              <button type="button" onClick={put}>
                Same again
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" onClick={next}>
                Back
              </button>
              <button type="button" disabled={!location || qty < 1} onClick={put}>
                Add
              </button>
            </>
          )
        ) : undefined
      }
    >
      {step === 'search' ? (
        <>
          {counter}
          <Field label="What are you adding?">
            <input
              ref={searchRef}
              type="search"
              value={query}
              autoComplete="off"
              placeholder="Water, tinned soup, torch…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          {shown.length === 0 ? <p className="muted">Nothing matches “{query}”.</p> : null}
          <ul className="row-list">
            {shown.map((t) => (
              <li className="row-item" key={t.id}>
                <button type="button" className="row-main" onClick={() => pick(t)}>
                  <strong>{t.name}</strong>
                  <span className="muted">
                    {t.unitSize ? `${t.unit} · ${t.unitSize}` : t.unit}
                    {t.id.startsWith('custom:') ? ' · yours' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="secondary" onClick={() => setStep('custom')}>
            Add as a custom item
          </button>
        </>
      ) : type ? (
        <>
          {last ? (
            <p className="note" role="status">
              {last}
            </p>
          ) : null}
          {counter}
          <Field label={`How many (${type.unit})?`}>
            <Stepper label={`How many ${type.unit}`} value={qty} min={1} onChange={edit(setQty)} />
          </Field>
          {locations.length === 0 ? (
            <p className="note">
              You have no places yet. <Link to="/app/locations">Add a place</Link> first, then come
              back.
            </p>
          ) : (
            <Field label="Where does it go?">
              <select value={locationId} onChange={(e) => edit(setLocationId)(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {warning ? (
            <p className="warn" role="status">
              ⚠ {warning}. You can still add it.
            </p>
          ) : null}
          <MonthField
            value={bestBefore}
            onChange={edit(setBestBefore)}
            shelfLife={type.shelfLife}
            today={today()}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** "Add as a custom item": a name, a category and, for food and water, what one piece gives. */
function CustomItemForm({
  initialName,
  onClose,
  onBack,
  onMade,
}: {
  initialName: string;
  onClose: () => void;
  onBack: () => void;
  onMade: (type: ItemType) => void;
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<Category>('food');
  const [unit, setUnit] = useState('each');
  const [store, setStore] = useState<StoreId | ''>(DEFAULT_STORE.food ?? '');
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

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
      dirty={name.trim() !== initialName.trim() || amount !== undefined}
      actions={
        <>
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              const r = buildCustomType(
                { name, category, unit, store: store || undefined, amount },
                crypto.randomUUID(),
              );
              if (r.ok) onMade(r.type);
              else setProblem(r.problem);
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
          <select value={store} onChange={(e) => setStore(e.target.value as StoreId | '')}>
            <option value="">Nothing the plan counts</option>
            {GIVEABLE_STORES.map((s) => (
              <option key={s} value={s}>
                {STORE_INFO[s].name} ({STORE_INFO[s].unit})
              </option>
            ))}
          </select>
        </Field>
      )}
      {store ? (
        <Field
          label={
            store === 'foodKcal'
              ? 'About how many kcal?'
              : store === 'waterL'
                ? 'About how many litres?'
                : prompt
          }
          hint={store === 'foodKcal' || store === 'waterL' ? prompt : undefined}
        >
          <NumberInput value={amount} min={0} onChange={setAmount} />
        </Field>
      ) : (
        <p className="muted">{prompt}</p>
      )}
      {problem ? (
        <p className="warn" role="alert">
          {problem}
        </p>
      ) : null}
    </Sheet>
  );
}
