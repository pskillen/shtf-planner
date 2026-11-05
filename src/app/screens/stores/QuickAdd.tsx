import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssetType, Category, ItemType, ProductInfo } from '../../../model';
import { today } from '../../../util';
import { Field } from '../../components/controls';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { CATEGORY_LABEL, labelOf } from '../../labels';
import { useChange, useDocument } from '../../state';
import { EQUIPMENT_PATH, equipmentAddPath } from '../assets/route';
import { usePacks } from '../../usePacks';
import { CustomItemForm } from './CustomItemForm';
import { ScanSheet } from './ScanSheet';
import { MonthField } from './MonthField';
import {
  addStock,
  defaultLocationId,
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

/** How many recent types sit above the list when nothing is typed. */
const RECENT_SHOWN = 8;

/**
 * The everyday types shown when nothing is typed and nothing has been added yet on this device
 * (local ids in the items pack); the rest are one search, or "Browse everything", away.
 */
const COMMON = [
  'bottled-water-6x2l',
  'tinned-food-tin',
  'dried-pasta-1kg',
  'rice-1kg',
  'porridge-oats-1kg',
  'peanut-butter-340g',
  'uht-milk',
  'gas-canisters',
  'lpg-bottle-13kg',
  'power-bank-20000mah',
  'torch-led-200lm',
  'first-aid-kit',
  'candles',
  'hygiene-kit',
  'toilet-bags',
  'aa-cells-8',
];

type Step = 'search' | 'form' | 'custom' | 'scan';

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
  // Stock only: equipment (a stove, a generator, a leisure battery) is kept under Home, Equipment.
  const types = useMemo(
    () =>
      Object.values(packs.items).filter(
        (t) => enabled.has(t.id.split(':')[0]!) && t.assetTypeId === undefined,
      ),
    [packs, enabled],
  );
  const equipmentTypes = useMemo(
    () => Object.values(packs.assets).filter((t) => enabled.has(t.id.split(':')[0]!)),
    [packs, enabled],
  );
  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const [recent, setRecent] = useState(readRecent);

  const prefilled = prefill ? packs.items[prefill.typeId] : undefined;
  const start = prefilled?.assetTypeId === undefined ? prefilled : undefined;
  const [step, setStep] = useState<Step>(start ? 'form' : 'search');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ItemType | undefined>(start);
  const [qty, setQty] = useState(Math.max(1, prefill?.qty ?? 1));
  const [locationId, setLocationId] = useState(() =>
    defaultLocationId(doc, start?.id ?? '', readLastLocation()),
  );
  const [bestBefore, setBestBefore] = useState<string | undefined>(undefined);
  const [added, setAdded] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  /** The item in the form came from a barcode scan: it is saved as `barcode` and Next item scans again. */
  const [viaScan, setViaScan] = useState(false);
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
  // With nothing typed: the few types added lately, then every other type under its category.
  const searching = query.trim() !== '';
  const recentTypes = useMemo(
    () =>
      recent
        .map((id) => types.find((t) => t.id === id))
        .filter((t): t is ItemType => t !== undefined)
        .slice(0, RECENT_SHOWN),
    [recent, types],
  );
  // With no recent additions, the common types stand in for them.
  const common = useMemo(
    () =>
      COMMON.map((id) => types.find((t) => t.id.split(':')[1] === id)).filter(
        (t): t is ItemType => t !== undefined,
      ),
    [types],
  );
  const [browsing, setBrowsing] = useState(false);
  // Equipment that matches the search, by its own name or the name of a thing people buy for it.
  const equipmentShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    const linked = (t: AssetType) =>
      Object.values(packs.items)
        .filter((i) => i.assetTypeId === t.id)
        .map((i) => i.name);
    return equipmentTypes.filter((t) =>
      [t.name, ...linked(t)].some((n) => n.toLowerCase().includes(q)),
    );
  }, [equipmentTypes, packs, query]);
  const byCategory = useMemo(() => {
    const skip = new Set(recentTypes.map((t) => t.id));
    const groups = new Map<Category, ItemType[]>();
    for (const t of types)
      if (!skip.has(t.id)) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
    return [...groups.entries()]
      .map(
        ([category, list]) =>
          [category, list.sort((a, b) => a.name.localeCompare(b.name))] as const,
      )
      .sort(([a], [b]) => labelOf(CATEGORY_LABEL, a).localeCompare(labelOf(CATEGORY_LABEL, b)));
  }, [types, recentTypes]);

  const typeRow = (t: ItemType) => (
    <li className="row-item" key={t.id}>
      <button type="button" className="row-main" onClick={() => pick(t)}>
        <strong>{t.name}</strong>
        <span className="muted">
          {t.unitSize ? `${t.unit} · ${t.unitSize}` : t.unit}
          {t.id.startsWith('custom:') ? ' · yours' : ''}
        </span>
      </button>
    </li>
  );

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
      addStock(
        d,
        {
          typeId: type.id,
          qty,
          locationId,
          bestBefore,
          ...(viaScan ? { source: 'barcode' as const } : {}),
        },
        today(),
      );
    });
    writeLastLocation(locationId);
    pushRecent(type.id);
    setRecent(readRecent());
    setAdded((n) => n + qty);
    setLast(`Added ${qty} × ${type.name} to ${location.name}`);
  }

  function pick(t: ItemType, scanned = false): void {
    setViaScan(scanned);
    setType(t);
    setLocationId(defaultLocationId(doc, t.id, readLastLocation()));
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setStep('form');
  }

  function next(): void {
    setType(undefined);
    setLast(null);
    setQuery('');
    setStep(viaScan ? 'scan' : 'search');
  }

  /** Sort later: keep the scan in the queue with the place last used. */
  function sortLater(code: string, product: ProductInfo | undefined): void {
    const place = defaultLocationId(doc, '', readLastLocation());
    if (!place) return;
    change('keep scan to sort', (d) => {
      const id = crypto.randomUUID();
      d.scans[id] = {
        id,
        code,
        qty: 1,
        locationId: place,
        scanned: new Date().toISOString(),
        ...(product ? { product } : {}),
      };
    });
  }

  const counter =
    added > 0 ? (
      <p className="muted" role="status" data-testid="added-count">
        Added this session: {added}
      </p>
    ) : null;

  if (step === 'scan') {
    return (
      <ScanSheet
        onClose={onClose}
        onBack={() => {
          setViaScan(false);
          setStep('search');
        }}
        onType={(t) => pick(t, true)}
        onSortLater={locations.length > 0 ? sortLater : undefined}
      />
    );
  }

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
          <div className="search-row">
            <button type="button" className="secondary" onClick={() => setStep('scan')}>
              Scan a barcode
            </button>
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
            {equipmentShown.length > 0 ? (
              <section aria-label="Equipment: add to your home" className="equipment-route">
                <h3>Equipment: add to your home</h3>
                <ul className="row-list">
                  {equipmentShown.map((t) => (
                    <li className="row-item" key={t.id}>
                      <Link className="row-main" to={equipmentAddPath(t.id)}>
                        <strong>{t.name}</strong>
                        <span className="muted">Opens the equipment form, not stock</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <button type="button" className="secondary" onClick={() => setStep('custom')}>
              Add as a custom item
            </button>
          </div>
          {searching ? (
            <>
              {shown.length === 0 && equipmentShown.length === 0 ? (
                <p className="muted">Nothing matches “{query}”.</p>
              ) : null}
              <ul className="row-list">{shown.map(typeRow)}</ul>
            </>
          ) : (
            <>
              {recentTypes.length > 0 ? (
                <section aria-label="Recent" className="recent">
                  <h3>Recent</h3>
                  <ul className="row-list">{recentTypes.map(typeRow)}</ul>
                </section>
              ) : (
                <section aria-label="Common" className="recent">
                  <h3>Common</h3>
                  <ul className="row-list">{common.map(typeRow)}</ul>
                </section>
              )}
              <Link className="row-main equipment-route" to={EQUIPMENT_PATH}>
                <strong>Equipment: add to your home</strong>
                <span className="muted">Stoves, heaters, generators, batteries and panels</span>
              </Link>
              <details className="type-group" onToggle={(e) => setBrowsing(e.currentTarget.open)}>
                <summary>Browse everything by category</summary>
                {browsing
                  ? byCategory.map(([category, list]) => (
                      <details className="type-group" key={category}>
                        <summary>
                          {labelOf(CATEGORY_LABEL, category)} ({list.length})
                        </summary>
                        <ul className="row-list">{list.map(typeRow)}</ul>
                      </details>
                    ))
                  : null}
              </details>
            </>
          )}
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
          {bestBefore ? <ExpiryBadge bestBefore={bestBefore} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}
