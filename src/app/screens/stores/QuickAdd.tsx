import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssetType, Category, Item, OffFacts, Product } from '../../../model';
import { today } from '../../../util';
import { Field } from '../../components/controls';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { CATEGORY_LABEL, labelOf } from '../../labels';
import { useChange, useDocument } from '../../state';
import { EQUIPMENT_PATH, equipmentAddPath } from '../assets/route';
import { usePacks } from '../../usePacks';
import { ScanSheet } from './ScanSheet';
import { MonthField } from './MonthField';
import { hasCamera } from './dateSettings';
import { ReadDateSheet } from './ReadDateSheet';
import { useStockItems } from './scanHelpers';
import {
  addStock,
  defaultLocationId,
  ensureProduct,
  matchItems,
  pushRecent,
  readLastLocation,
  readRecent,
  suitabilityWarning,
  usualSize,
  writeLastLocation,
} from './stock';

export interface QuickAddPrefill {
  itemId: string;
  productId?: string;
  qty?: number;
}

/** How many recent items sit above the list when nothing is typed. */
const RECENT_SHOWN = 8;

/** Common item ids (suffix in the items pack) when nothing has been added on this device yet. */
const COMMON = [
  'bottled-water',
  'baked-beans',
  'dried-pasta',
  'rice',
  'porridge-oats',
  'peanut-butter',
  'uht-milk',
  'gas-canisters',
  'propane-bottle',
  'power-bank-20k',
  'torch-aa',
  'first-aid-kit',
  'candles',
  'hygiene-kit',
  'toilet-bags',
  'aa-cells',
];

type Step = 'search' | 'form' | 'scan' | 'repick' | 'readdate';

/**
 * Quick add: search for what you are putting away, pick it, then Add. The place is the last one
 * you used and the quantity is one, so a plain item is a search, a tap on the item and a tap on
 * Add.
 */
export function QuickAdd({ onClose, prefill }: { onClose: () => void; prefill?: QuickAddPrefill }) {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const items = useStockItems();

  const equipmentTypes = useMemo(
    () =>
      Object.values(packs.assets).filter((t) =>
        packs.enabledPacks(doc.settings).some((p) => t.id.startsWith(`${p.id}:`)),
      ),
    [packs, doc.settings],
  );
  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const [recent, setRecent] = useState(readRecent);

  const prefItem = prefill ? packs.items[prefill.itemId] : undefined;
  const prefProduct = prefill?.productId ? doc.products[prefill.productId] : undefined;
  const startItem = prefItem?.assetTypeId === undefined ? prefItem : undefined;
  const [step, setStep] = useState<Step>(startItem || prefProduct ? 'form' : 'search');
  const [query, setQuery] = useState('');
  const [item, setItem] = useState<Item | undefined>(startItem);
  const [productId, setProductId] = useState<string | undefined>(prefill?.productId);
  const [qty, setQty] = useState(Math.max(1, prefill?.qty ?? 1));
  const [locationId, setLocationId] = useState(() =>
    defaultLocationId(doc, startItem?.id ?? prefItem?.id ?? '', readLastLocation()),
  );
  const [bestBefore, setBestBefore] = useState<string | undefined>(undefined);
  const [added, setAdded] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [putOnce, setPutOnce] = useState(false);
  const [viaScan, setViaScan] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== 'search') return;
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [step]);

  const product: Product | undefined = productId ? doc.products[productId] : undefined;
  const activeItem = item ?? (product?.itemId ? packs.items[product.itemId] : undefined);
  const location = doc.locations[locationId];
  const warning = activeItem && location ? suitabilityWarning(activeItem, location) : undefined;
  const shown = useMemo(() => matchItems(items, query, recent), [items, query, recent]);
  const searching = query.trim() !== '';
  const recentItems = useMemo(
    () =>
      recent
        .map((id) => items.find((t) => t.id === id))
        .filter((t): t is Item => t !== undefined)
        .slice(0, RECENT_SHOWN),
    [recent, items],
  );
  const common = useMemo(
    () =>
      COMMON.map((slug) => items.find((t) => t.id === `items-base:${slug}`)).filter(
        (t): t is Item => t !== undefined,
      ),
    [items],
  );
  const [browsing, setBrowsing] = useState(false);
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
    const skip = new Set(recentItems.map((t) => t.id));
    const groups = new Map<Category, Item[]>();
    for (const t of items)
      if (!skip.has(t.id)) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
    return [...groups.entries()]
      .map(
        ([category, list]) =>
          [category, list.sort((a, b) => a.name.localeCompare(b.name))] as const,
      )
      .sort(([a], [b]) => labelOf(CATEGORY_LABEL, a).localeCompare(labelOf(CATEGORY_LABEL, b)));
  }, [items, recentItems]);

  const itemRow = (t: Item) => (
    <li className="row-item" key={t.id}>
      <button type="button" className="row-main" onClick={() => pickItem(t)}>
        <strong>{t.name}</strong>
        <span className="muted">{t.countsAs}</span>
      </button>
    </li>
  );

  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setLast(null);
      set(v);
    };

  function put(): void {
    if (!location || qty < 1) return;
    let ensured: string | undefined;
    change('add stock', (d) => {
      let pid = productId;
      if (!pid && activeItem) {
        pid = ensureProduct(
          d,
          { itemId: activeItem.id, size: usualSize(activeItem) },
          packs,
          today(),
        ).id;
        ensured = pid;
      }
      if (!pid) return;
      addStock(
        d,
        {
          productId: pid,
          qty,
          locationId,
          bestBefore,
          ...(viaScan ? { source: 'barcode' as const } : {}),
        },
        today(),
      );
    });
    if (ensured) setProductId(ensured);
    if (activeItem) {
      writeLastLocation(locationId);
      pushRecent(activeItem.id);
      setRecent(readRecent());
    }
    const label = product?.name ?? activeItem?.name ?? 'item';
    setAdded((n) => n + qty);
    setLast(`Added ${qty} × ${label} to ${location.name}`);
    setPutOnce(true);
  }

  function pickItem(t: Item): void {
    setViaScan(false);
    setItem(t);
    setProductId(undefined);
    setLocationId(defaultLocationId(doc, t.id, readLastLocation()));
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setPutOnce(false);
    setStep('form');
  }

  function pickProduct(pid: string, code: string, scanned = true): void {
    const p = doc.products[pid];
    setViaScan(scanned);
    setProductId(pid);
    setItem(p?.itemId ? packs.items[p.itemId] : undefined);
    setLocationId(defaultLocationId(doc, p?.itemId ?? '', readLastLocation()));
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setPutOnce(false);
    setScannedCode(code);
    setStep('form');
  }

  function next(): void {
    setItem(undefined);
    setProductId(undefined);
    setLast(null);
    setPutOnce(false);
    setQuery('');
    setStep(viaScan ? 'scan' : 'search');
  }

  function sortLater(code: string, off: OffFacts | undefined): void {
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
        ...(off ? { off } : {}),
      };
    });
  }

  const formTitle = product?.name ?? activeItem?.name ?? '';
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
        onProduct={(pid, code) => pickProduct(pid, code)}
        onSortLater={sortLater}
        sortLaterBlocked={
          locations.length > 0
            ? undefined
            : 'Add a place first, then there is somewhere to keep it.'
        }
      />
    );
  }

  if (step === 'repick' && scannedCode) {
    return (
      <ScanSheet
        key={scannedCode}
        initialCode={scannedCode}
        reidentify
        onClose={onClose}
        onBack={() => setStep('form')}
        onProduct={(pid, code) => pickProduct(pid, code)}
      />
    );
  }

  if (step === 'readdate') {
    return (
      <ReadDateSheet
        onClose={() => setStep('form')}
        onUse={(ym) => {
          edit(setBestBefore)(ym);
          setStep('form');
        }}
      />
    );
  }

  return (
    <Sheet
      title={step === 'search' ? 'Add stock' : `Add ${formTitle}`}
      onClose={onClose}
      actions={
        step === 'form' ? (
          putOnce ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={!location || qty < 1}
                onClick={put}
              >
                Add another
              </button>
              <button type="button" onClick={next}>
                Next item
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" onClick={next}>
                Back
              </button>
              <button
                type="button"
                disabled={!location || qty < 1 || (!productId && !activeItem)}
                onClick={put}
              >
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
            <Link className="button secondary" to="/app/stores/stocktake" onClick={onClose}>
              Stocktake a pile
            </Link>
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
          </div>
          {searching ? (
            <>
              {shown.length === 0 && equipmentShown.length === 0 ? (
                <p className="muted">Nothing matches “{query}”.</p>
              ) : null}
              <ul className="row-list">{shown.map(itemRow)}</ul>
            </>
          ) : (
            <>
              {recentItems.length > 0 ? (
                <section aria-label="Recent" className="recent">
                  <h3>Recent</h3>
                  <ul className="row-list">{recentItems.map(itemRow)}</ul>
                </section>
              ) : (
                <section aria-label="Common" className="recent">
                  <h3>Common</h3>
                  <ul className="row-list">{common.map(itemRow)}</ul>
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
                        <ul className="row-list">{list.map(itemRow)}</ul>
                      </details>
                    ))
                  : null}
              </details>
            </>
          )}
        </>
      ) : activeItem || product ? (
        <>
          {last ? (
            <p className="note" role="status">
              {last}
            </p>
          ) : null}
          {counter}
          <Field label={`How many (${activeItem?.unit ?? 'packs'})?`}>
            <Stepper
              label={`How many ${activeItem?.unit ?? 'packs'}`}
              value={qty}
              min={1}
              onChange={edit(setQty)}
            />
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
          {viaScan && scannedCode ? (
            <button type="button" className="link" onClick={() => setStep('repick')}>
              Not this item?
            </button>
          ) : null}
          {activeItem ? (
            <MonthField
              value={bestBefore}
              onChange={edit(setBestBefore)}
              shelfLife={activeItem.shelfLife}
              today={today()}
            />
          ) : null}
          {bestBefore ? <ExpiryBadge bestBefore={bestBefore} /> : null}
          {hasCamera() ? (
            <button type="button" className="secondary" onClick={() => setStep('readdate')}>
              Read the date
            </button>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
