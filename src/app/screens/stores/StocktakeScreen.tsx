import { countsAsLine } from './countsAs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Item, OffFacts } from '../../../model';
import { formatSize, today } from '../../../util';
import type { CameraStream } from '../../../scan/camera';
import {
  preloadDateReader,
  releaseDateReader,
  terminateDateReader,
} from '../../../scan/ocr/client';
import { timingsEnabled, timingSummary } from '../../../scan/timings';
import { CameraStrip } from '../../components/CameraStrip';
import { Field, Switch } from '../../components/controls';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { Sheet } from '../../components/Sheet';
import { QtyField } from '../../components/QtyField';
import { Toast } from '../../components/Toast';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { useWakeLock } from '../../useWakeLock';
import { equipmentAddPath } from '../assets/route';
import { DateAbout } from './DateAbout';
import { DateReader, type DateRead } from './DateReader';
import {
  readPropped,
  readSound,
  readUseCamera,
  readUseWebGpu,
  writePropped,
  writeSound,
  writeUseCamera,
} from './dateSettings';
import { MonthField } from './MonthField';
import { ScanResolve } from './ScanResolve';
import {
  dateSummaryText,
  multipackCount,
  quantityHint,
  readTypedCode,
  savedText,
  type DateCounts,
  summaryText,
  useEquipmentMatches,
  useStockItems,
} from './scanHelpers';
import {
  addStockWithUndo,
  defaultLocationId,
  ensureProduct,
  matchItems,
  pushRecent,
  readLastLocation,
  suitabilityWarning,
  undoAddStock,
  usualSize,
  writeLastLocation,
  type StockAddition,
} from './stock';
import { UNDO_MS, buzz, setCueSound } from './stocktakeTunables';
import { useScanQueue } from './useScanQueue';

const HINT_KEY = 'shtf.stocktake.hintSeen';
const readHint = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};
const writeHint = (): void => {
  try {
    globalThis.localStorage?.setItem(HINT_KEY, '1');
  } catch {
    // Not remembered; the card comes back next time.
  }
};

/** The product being counted: its id, and the barcode it came from if any. */
interface Counting {
  productId: string;
  code?: string;
}

interface Saved {
  addition: StockAddition;
  counting: Counting;
  qty: number;
  bestBefore: string | undefined;
  label: string;
  /** How its date was set, and how long the date step took: undone with the item. */
  source: DateSource | null;
  dateMs: number;
}

/** How the date in the card got there. */
type DateSource = 'camera' | 'suggestion' | 'picked';

/**
 * Stocktake: pick up a tin, scan its barcode, confirm what it is (once per product, then the app
 * remembers), set the best-before month, OK, next. Step 1 BARCODE (blue) and step 2 DATE
 * (yellow); OK saves and goes straight back to a barcode, with a few seconds to Undo. A stocktake
 * adds stock like Quick add does; it does not recount a place. One camera stream stays open for
 * the whole session.
 */
export function StocktakeScreen() {
  const doc = useDocument();
  const change = useChange();
  const navigate = useNavigate();
  const packs = usePacks();
  useScanQueue();

  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const [locationId, setLocationId] = useState(() => {
    const last = readLastLocation();
    return last && doc.locations[last] ? last : defaultLocationId(doc, '', null);
  });
  const place = doc.locations[locationId];

  const [phase, setPhase] = useState<'barcode' | 'date' | 'done'>('barcode');
  const [code, setCode] = useState<string | null>(null);
  const [counting, setCounting] = useState<Counting | null>(null);
  const [qty, setQty] = useState(1);
  const [bestBefore, setBestBefore] = useState<string | undefined>(undefined);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  /** "Not this item?" is open: the picker for the remembered barcode of the item being counted. */
  const [repicking, setRepicking] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [hint, setHint] = useState(() => !readHint());
  const [savedCount, setSavedCount] = useState(0);
  const [sortLater, setSortLater] = useState(0);
  const [started] = useState(() => Date.now());
  const [finishedAfter, setFinishedAfter] = useState(0);
  const [cam, setCam] = useState<CameraStream | null>(null);
  const [centre, setCentre] = useState<HTMLElement | null>(null);
  const [flash, setFlash] = useState(0);
  const [handPicked, setHandPicked] = useState(false);
  const [useCamera, setUseCamera] = useState(readUseCamera);
  const [readerKey, setReaderKey] = useState(0);
  const [dateCounts, setDateCounts] = useState<DateCounts>({ camera: 0, picked: 0, suggestion: 0 });
  const [dateMs, setDateMs] = useState<number[]>([]);
  const dateSource = useRef<DateSource | null>(null);
  const dateStarted = useRef(0);
  const [copied, setCopied] = useState(false);
  const [propped, setPropped] = useState(readPropped);
  const [sound, setSound] = useState(readSound);

  // Propped: the screen stays on while counting; the sound with each buzz is for this screen only
  // (Quick add shares `buzz` and never beeps).
  useWakeLock(propped && phase !== 'done');
  useEffect(() => {
    setCueSound(propped && sound);
    return () => setCueSound(false);
  }, [propped, sound]);

  // Start loading the models while the first barcode is being scanned; keep them a while after leaving.
  useEffect(() => {
    if (readUseCamera()) preloadDateReader(readUseWebGpu());
    return () => releaseDateReader();
  }, []);

  // The date step starts with the camera strip in view: the add-product form may have left the
  // page scrolled down. The strip sits at the top of the page, so that is where to go.
  useEffect(() => {
    if (phase !== 'date') return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo?.({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  }, [phase]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [saved]);

  const product = counting ? doc.products[counting.productId] : undefined;
  const packItem = product?.itemId ? packs.items[product.itemId] : undefined;
  const name = product?.name ?? '';
  const unit = packItem?.unit ?? 'pack';
  const shelfLife = packItem?.shelfLife ?? 'months';

  function got(next: string): void {
    buzz('barcode');
    setFlash((n) => n + 1);
    setCode(next);
    // The hint has done its job at the first catch: hide it for good so the date step fits.
    if (hint) {
      writeHint();
      setHint(false);
    }
  }

  function startDate(productId: string, from?: string): void {
    setCounting({ productId, code: from });
    setQty(multipackCount(doc.products[productId]?.name ?? '') ?? 1);
    setBestBefore(undefined);
    setCode(null);
    setFinding(false);
    dateSource.current = null;
    dateStarted.current = Date.now();
    setHandPicked(false);
    setPhase('date');
  }

  function backToBarcode(): void {
    setRepicking(false);
    setCounting(null);
    setCode(null);
    setPhase('barcode');
  }

  function keepForLater(from: string, off: OffFacts | undefined): void {
    if (!place) return;
    change('keep scan to sort', (d) => {
      const id = crypto.randomUUID();
      d.scans[id] = {
        id,
        code: from,
        qty: 1,
        locationId: place.id,
        scanned: new Date().toISOString(),
        ...(off ? { off } : {}),
      };
    });
    setSortLater((n) => n + 1);
    backToBarcode();
  }

  /** Saves the item with `date` (the card's month, or the one a suggestion carried). */
  function save(date: string | undefined, source: DateSource | null): void {
    if (!counting || !place || !product) return;
    let addition: StockAddition | undefined;
    change('stocktake', (d) => {
      addition = addStockWithUndo(
        d,
        {
          productId: counting.productId,
          qty,
          locationId: place.id,
          bestBefore: date,
          source: 'barcode',
        },
        today(),
      );
    });
    if (!addition) return;
    if (packItem) pushRecent(packItem.id);
    setSavedCount((n) => n + qty);
    const took = Date.now() - dateStarted.current;
    if (date && source) setDateCounts((c) => ({ ...c, [source]: c[source] + 1 }));
    setDateMs((l) => [...l, took]);
    setSaved({
      addition,
      counting,
      qty,
      bestBefore: date,
      source: date ? source : null,
      dateMs: took,
      label: savedText(qty, product.name, place.name),
    });
    backToBarcode();
  }

  const ok = (): void => save(bestBefore, dateSource.current);

  function undo(): void {
    if (!saved) return;
    change('undo stocktake', (d) => undoAddStock(d, saved.addition));
    setSavedCount((n) => Math.max(0, n - saved.qty));
    if (saved.source)
      setDateCounts((c) => ({ ...c, [saved.source!]: Math.max(0, c[saved.source!] - 1) }));
    setDateMs((l) => {
      const at = l.lastIndexOf(saved.dateMs);
      return at < 0 ? l : l.filter((_, i) => i !== at);
    });
    if (phase === 'barcode' && code === null) {
      setCounting(saved.counting);
      setQty(saved.qty);
      setBestBefore(saved.bestBefore);
      dateSource.current = saved.source;
      setHandPicked(Boolean(saved.bestBefore));
      dateStarted.current = Date.now();
      setPhase('date');
    }
    setSaved(null);
  }

  function changeDate(next: string | undefined): void {
    if (next && next !== bestBefore) buzz('date');
    dateSource.current = next ? 'picked' : null;
    setHandPicked(true);
    setBestBefore(next);
  }

  function cameraRead(read: DateRead): void {
    dateSource.current = 'camera';
    setBestBefore(read.bestBefore);
  }

  function finish(): void {
    setFinishedAfter(Date.now() - started);
    setSaved(null);
    setPhase('done');
  }

  const dateText = dateSummaryText(dateCounts, dateMs);
  const copySummary = (): void => {
    const text = [
      summaryText(savedCount, finishedAfter, sortLater),
      dateText,
      timingsEnabled() ? timingSummary() : '',
    ]
      .filter(Boolean)
      .join('\n');
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  const warning = packItem && place ? suitabilityWarning(packItem, place) : undefined;

  if (phase === 'done') {
    return (
      <section className={propped ? 'screen stocktake propped' : 'screen stocktake'}>
        <h1>Stocktake done</h1>
        <p role="status" data-testid="stocktake-summary">
          {summaryText(savedCount, finishedAfter, sortLater)}
        </p>
        {dateText ? (
          <p className="muted" data-testid="stocktake-date-summary">
            {dateText}
          </p>
        ) : null}
        <div className="scan-actions">
          <button type="button" className="secondary" onClick={copySummary}>
            Copy summary
          </button>
          <button type="button" onClick={() => navigate('/app/stores')}>
            Back to Stores
          </button>
        </div>
        {copied ? <p role="status">Copied.</p> : null}
      </section>
    );
  }

  return (
    <section className={propped ? 'screen stocktake propped' : 'screen stocktake'}>
      <h1 className="visually-hidden">Stocktake</h1>
      {locations.length === 0 ? (
        <p className="note">
          You have no places yet. <Link to="/app/locations">Add a place</Link> first, then come
          back.
        </p>
      ) : (
        <label className="place-row">
          <span className="field-label">Counting into</span>
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              writeLastLocation(e.target.value);
            }}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {hint ? (
        <p className="stocktake-hint">
          <span>Red line for the barcode, yellow box for the date.</span>
          <button
            type="button"
            className="link"
            onClick={() => {
              writeHint();
              setHint(false);
            }}
          >
            Got it
          </button>
        </p>
      ) : null}

      <CameraStrip
        mode={phase === 'barcode' ? 'barcode' : 'date'}
        chip={phase === 'barcode' ? '1 BARCODE' : '2 DATE'}
        scanning={phase === 'barcode' && code === null && Boolean(place)}
        onCode={got}
        onReady={setCam}
        onCentre={setCentre}
        flashKey={flash}
      />
      {phase === 'barcode' ? (
        code === null ? (
          <>
            <form
              className="number-row"
              onSubmit={(e) => {
                e.preventDefault();
                const r = readTypedCode(typed);
                if ('problem' in r) return setProblem(r.problem);
                setProblem(null);
                setTyped('');
                got(r.code);
              }}
            >
              <Field label="Or type the barcode number">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={typed}
                  aria-invalid={problem ? true : undefined}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </Field>
              <button type="submit" className="secondary" disabled={typed.trim() === ''}>
                Use this number
              </button>
            </form>
            {problem ? (
              <p className="field-hint warn" role="alert">
                {problem}
              </p>
            ) : null}
            <div className="scan-actions">
              <button type="button" className="secondary" onClick={() => setFinding(true)}>
                Find it by name
              </button>
              <button type="button" onClick={finish}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <ScanResolve
              key={code}
              code={code}
              onProduct={(productId) => startDate(productId, code)}
              onSortLater={(off) => keepForLater(code, off)}
              sortLaterBlocked={
                place ? undefined : 'Add a place first, then there is somewhere to keep it.'
              }
            />
            <div className="scan-actions">
              <button type="button" className="secondary" onClick={() => setCode(null)}>
                Scan another
              </button>
            </div>
          </>
        )
      ) : counting ? (
        repicking && counting.code ? (
          <>
            <ScanResolve
              key={counting.code}
              code={counting.code}
              reidentify
              onProduct={(productId) => {
                setCounting({ productId, code: counting.code });
                setRepicking(false);
              }}
            />
            <div className="scan-actions">
              <button type="button" className="secondary" onClick={() => setRepicking(false)}>
                Keep {name}
              </button>
            </div>
          </>
        ) : (
          <>
            {useCamera ? (
              <DateReader
                key={`${counting.productId}:${counting.code ?? ''}:${readerKey}:${savedCount}`}
                cam={cam}
                todayIso={today()}
                paused={handPicked}
                onAgain={() => {
                  setHandPicked(false);
                  dateSource.current = null;
                }}
                centre={centre}
                onResult={cameraRead}
                onSuggestion={(ym) => save(ym, 'suggestion')}
              />
            ) : null}
            <div className="scan-card" aria-label="This item">
              <div className="item-head">
                <h2>{name}</h2>
                {counting.code ? (
                  <button type="button" className="link" onClick={() => setRepicking(true)}>
                    Not this item?
                  </button>
                ) : null}
              </div>
              <p className="muted">
                <span data-testid="product-size">
                  {product?.size ? formatSize(product.size) : 'Size not set'}
                </span>
                {packItem ? ` · Counts as ${packItem.name}` : null}
              </p>
              {warning ? (
                <p className="warn" role="status">
                  ⚠ {warning}
                </p>
              ) : null}
              <MonthField
                quiet
                value={bestBefore}
                onChange={changeDate}
                shelfLife={shelfLife}
                today={today()}
              />
              {bestBefore ? <ExpiryBadge bestBefore={bestBefore} /> : null}
              <Field label={`How many ${unit}s?`}>
                <QtyField value={qty} onChange={setQty} label={`How many ${unit}s`} />
              </Field>
              <p className="muted">{quantityHint(unit, name)}</p>
            </div>
            <div className="sticky-bar">
              <button type="button" className="secondary" onClick={backToBarcode}>
                Cancel
              </button>
              <button type="button" onClick={ok} disabled={!place || qty < 1}>
                OK
              </button>
            </div>
          </>
        )
      ) : null}

      <Switch
        label="Propped"
        hint="The phone stands on its own: the screen stays on, the status and OK are big, and each buzz makes a sound."
        checked={propped}
        onChange={(next) => {
          setPropped(next);
          writePropped(next);
        }}
      />
      {propped ? (
        <Switch
          label="Sound with each buzz"
          checked={sound}
          onChange={(next) => {
            setSound(next);
            writeSound(next);
          }}
        />
      ) : null}
      <Switch
        label="Read dates with the camera"
        checked={useCamera}
        onChange={(next) => {
          setUseCamera(next);
          writeUseCamera(next);
          if (!next) terminateDateReader();
        }}
      />
      {useCamera ? (
        <DateAbout
          onChange={() => {
            terminateDateReader();
            setReaderKey((n) => n + 1);
          }}
        />
      ) : null}

      {saved ? (
        <Toast className="undo-toast" testId="stocktake-saved">
          <span>{saved.label}</span>
          <button type="button" onClick={undo}>
            Undo
          </button>
        </Toast>
      ) : null}

      {finding ? (
        <FindByName
          onPick={(productId) => startDate(productId)}
          onClose={() => setFinding(false)}
        />
      ) : null}
    </section>
  );
}

/** Pick an item by name when there is no barcode to read: stock only; equipment routes away. */
function FindByName({
  onPick,
  onClose,
}: {
  onPick: (productId: string) => void;
  onClose: () => void;
}) {
  const change = useChange();
  const packs = usePacks();
  const stockItems = useStockItems();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => matchItems(stockItems, query).slice(0, 40), [stockItems, query]);
  const equipment = useEquipmentMatches(query);

  function pickItem(item: Item): void {
    change('ensure product', (d) => {
      const { id } = ensureProduct(d, { itemId: item.id, size: usualSize(item) }, packs, today());
      onPick(id);
    });
  }

  return (
    <Sheet title="Find it by name" onClose={onClose}>
      <Field label="What is it?">
        <input
          type="search"
          autoComplete="off"
          autoFocus
          value={query}
          placeholder="Water, tinned soup, torch…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      {equipment.length > 0 ? (
        <ul className="row-list" aria-label="Equipment: add to your home">
          {equipment.map((t) => (
            <li className="row-item" key={t.id}>
              <Link className="row-main" to={equipmentAddPath(t.id)}>
                <strong>{t.name}</strong>
                <span className="muted">Opens the equipment form, not stock</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="row-list">
        {shown.map((t) => (
          <li className="row-item" key={t.id}>
            <button type="button" className="row-main" onClick={() => pickItem(t)}>
              <strong>{t.name}</strong>
              <span className="muted">{countsAsLine(t.countsAs)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
