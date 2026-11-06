import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Item, OffFacts, Product } from '../../../model';
import { formatQty, today } from '../../../util';
import { Field } from '../../components/controls';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { QtyField } from '../../components/QtyField';
import { Sheet } from '../../components/Sheet';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { ItemPicker } from './ItemPicker';
import { MonthField } from './MonthField';
import { ReadDateSheet } from './ReadDateSheet';
import { ScanSheet } from './ScanSheet';
import { SizeStep, type SizeStepDone } from './SizeStep';
import { StockSheet } from './StockSheet';
import { hasCamera } from './dateSettings';
import {
  addStockWithUndo,
  defaultLocationId,
  ensureProduct,
  pushRecent,
  pushRecentProduct,
  readLastLocation,
  suitabilityWarning,
  type NewProduct,
  writeLastLocation,
} from './stock';

export interface QuickAddPrefill {
  itemId?: string;
  locationId?: string;
  productId?: string;
  qty?: number;
}

type Step = 'search' | 'size' | 'form' | 'scan' | 'repick' | 'readdate';

function AddedStatus({
  message,
  stockId,
  onEdit,
}: {
  message: string;
  stockId: string | undefined;
  onEdit: () => void;
}) {
  const doc = useDocument();
  const row = stockId ? doc.stock[stockId] : undefined;
  return (
    <p className="note" role="status" data-testid="last-add-status">
      {message}
      {row ? (
        <>
          {' '}
          <button type="button" className="link" onClick={onEdit}>
            Edit
          </button>
        </>
      ) : null}
    </p>
  );
}

/**
 * Quick add: pick an item and size (or a recent product), then Add. The place is the last one
 * you used and the quantity is one unless you change it.
 */
export function QuickAdd({ onClose, prefill }: { onClose: () => void; prefill?: QuickAddPrefill }) {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();

  const prefItem = prefill?.itemId ? packs.items[prefill.itemId] : undefined;
  const prefProduct = prefill?.productId ? doc.products[prefill.productId] : undefined;
  const startItem = prefItem?.assetTypeId === undefined ? prefItem : undefined;

  const [step, setStep] = useState<Step>(() => {
    if (prefProduct) return 'form';
    if (startItem) return 'size';
    return 'search';
  });
  const [item, setItem] = useState<Item | undefined>(startItem);
  const [productId, setProductId] = useState<string | undefined>(prefill?.productId);
  const [pendingNew, setPendingNew] = useState<NewProduct | undefined>(undefined);
  const [qty, setQty] = useState(Math.max(1, prefill?.qty ?? 1));
  const [locationId, setLocationId] = useState(() =>
    prefill?.locationId && doc.locations[prefill.locationId]
      ? prefill.locationId
      : defaultLocationId(doc, startItem?.id ?? prefItem?.id ?? '', readLastLocation()),
  );
  const [bestBefore, setBestBefore] = useState<string | undefined>(undefined);
  const [added, setAdded] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [lastStockId, setLastStockId] = useState<string | undefined>(undefined);
  const [editStockId, setEditStockId] = useState<string | undefined>(undefined);
  const [viaScan, setViaScan] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );

  useEffect(() => {
    if (step !== 'search') return;
    const t = setTimeout(() => searchRef.current?.querySelector('input')?.focus(), 0);
    return () => clearTimeout(t);
  }, [step]);

  const product: Product | undefined = productId ? doc.products[productId] : undefined;
  const activeItem = item ?? (product?.itemId ? packs.items[product.itemId] : undefined);
  const location = doc.locations[locationId];
  const warning = activeItem && location ? suitabilityWarning(activeItem, location) : undefined;
  const unit = activeItem?.unit ?? 'packs';

  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setLast(null);
      setLastStockId(undefined);
      set(v);
    };

  function resetEntry(): void {
    setItem(undefined);
    setProductId(undefined);
    setPendingNew(undefined);
    setQty(1);
    setBestBefore(undefined);
    setScannedCode(null);
    setViaScan(false);
  }

  function put(): void {
    if (!location || qty <= 0) return;
    const returnStep: Step = viaScan ? 'scan' : 'search';
    let ensured: string | undefined;
    let savedId: string | undefined;
    let stockRowId: string | undefined;
    change('add stock', (d) => {
      let pid = productId;
      if (!pid && pendingNew) {
        pid = ensureProduct(d, pendingNew, packs, today()).id;
        ensured = pid;
      }
      if (!pid) return;
      savedId = pid;
      stockRowId = addStockWithUndo(
        d,
        {
          productId: pid,
          qty,
          locationId,
          bestBefore,
          ...(viaScan ? { source: 'barcode' as const } : {}),
        },
        today(),
      ).id;
    });
    if (ensured) setProductId(ensured);
    if (savedId) pushRecentProduct(savedId);
    if (activeItem) {
      writeLastLocation(locationId);
      pushRecent(activeItem.id);
    }
    const label = product?.name ?? doc.products[savedId ?? '']?.name ?? activeItem?.name ?? 'item';
    setAdded((n) => n + qty);
    setLast(`Added ${formatQty(qty)} × ${label} to ${location.name}`);
    setLastStockId(stockRowId);
    resetEntry();
    setStep(returnStep);
  }

  function pickItem(t: Item): void {
    setViaScan(false);
    setItem(t);
    setProductId(undefined);
    setPendingNew(undefined);
    setLocationId(defaultLocationId(doc, t.id, readLastLocation()));
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setLastStockId(undefined);
    setStep('size');
  }

  function onSizeDone(result: SizeStepDone): void {
    if ('productId' in result) {
      setProductId(result.productId);
      setPendingNew(undefined);
    } else {
      setProductId(undefined);
      setPendingNew(result);
    }
    setLocationId(defaultLocationId(doc, item!.id, readLastLocation()));
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setLastStockId(undefined);
    setStep('form');
  }

  function pickProduct(pid: string, code: string, scanned = true): void {
    const p = doc.products[pid];
    setViaScan(scanned);
    setProductId(pid);
    setPendingNew(undefined);
    setItem(p?.itemId ? packs.items[p.itemId] : undefined);
    setLocationId(defaultLocationId(doc, p?.itemId ?? '', readLastLocation()));
    setQty(1);
    setBestBefore(undefined);
    setLast(null);
    setLastStockId(undefined);
    setScannedCode(code);
    setStep('form');
  }

  function pickRecentProduct(pid: string): void {
    pickProduct(pid, '', false);
  }

  function backToSearch(): void {
    resetEntry();
    setLast(null);
    setLastStockId(undefined);
    setStep('search');
  }

  function backFromForm(): void {
    const back: Step = viaScan ? 'scan' : 'search';
    resetEntry();
    setStep(back);
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
  const canAdd = Boolean(location && qty > 0 && (productId || pendingNew));
  const counter =
    added > 0 ? (
      <p className="muted" role="status" data-testid="added-count">
        Added this session: {added}
      </p>
    ) : null;

  const editSheet = (() => {
    if (!editStockId) return null;
    const row = doc.stock[editStockId];
    if (!row) return null;
    const prod = doc.products[row.productId];
    const it = prod?.itemId ? packs.items[prod.itemId] : undefined;
    return (
      <StockSheet
        key={editStockId}
        initial={row}
        product={prod}
        item={it}
        onSave={(saved) => {
          change('edit stock', (d) => {
            d.stock[saved.id] = saved;
          });
          setEditStockId(undefined);
        }}
        onDelete={() => {
          change('delete stock', (d) => {
            delete d.stock[editStockId];
          });
          setEditStockId(undefined);
        }}
        onClose={() => setEditStockId(undefined)}
      />
    );
  })();

  const openLastEdit = (): void => {
    if (lastStockId && doc.stock[lastStockId]) setEditStockId(lastStockId);
  };

  if (step === 'scan') {
    return (
      <>
        {editSheet}
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
          addedStatus={
            last
              ? {
                  message: last,
                  stockId: lastStockId && doc.stock[lastStockId] ? lastStockId : undefined,
                  onEdit: openLastEdit,
                }
              : undefined
          }
        />
      </>
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

  const sheetTitle =
    step === 'search'
      ? 'Add stock'
      : step === 'size'
        ? `Add ${item?.name ?? ''}`
        : `Add ${formTitle}`;

  return (
    <>
      {editSheet}
      <Sheet
        title={sheetTitle}
        onClose={onClose}
        actions={
          step === 'size' ? (
            <button type="button" className="secondary" onClick={backToSearch}>
              Back
            </button>
          ) : step === 'form' ? (
            <>
              <button type="button" className="secondary" onClick={backFromForm}>
                Back
              </button>
              <button type="button" disabled={!canAdd} onClick={put}>
                Add
              </button>
            </>
          ) : undefined
        }
      >
        {step === 'search' ? (
          <>
            {last ? (
              <AddedStatus message={last} stockId={lastStockId} onEdit={openLastEdit} />
            ) : null}
            {counter}
            <div className="search-row" ref={searchRef}>
              <button type="button" className="secondary" onClick={() => setStep('scan')}>
                Scan a barcode
              </button>
              <Link className="button secondary" to="/app/stores/stocktake" onClick={onClose}>
                Stocktake a pile
              </Link>
              <ItemPicker
                searchLabel="What are you adding?"
                onItem={pickItem}
                onProduct={pickRecentProduct}
              />
            </div>
          </>
        ) : null}
        {step === 'size' && item ? <SizeStep item={item} onDone={onSizeDone} /> : null}
        {step === 'form' && (activeItem || product) ? (
          <>
            {counter}
            <Field label={`How many (${unit})?`}>
              <QtyField value={qty} onChange={edit(setQty)} label={`How many ${unit}`} />
            </Field>
            {locations.length === 0 ? (
              <p className="note">
                You have no places yet. <Link to="/app/locations">Add a place</Link> first, then
                come back.
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
                action={
                  hasCamera() ? (
                    <button type="button" className="secondary" onClick={() => setStep('readdate')}>
                      Read the date
                    </button>
                  ) : undefined
                }
              />
            ) : null}
            {bestBefore ? <ExpiryBadge bestBefore={bestBefore} /> : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
