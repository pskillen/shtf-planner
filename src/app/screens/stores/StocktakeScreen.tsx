import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ItemType, ProductInfo } from '../../../model';
import { today } from '../../../util';
import type { CameraStream } from '../../../scan/camera';
import { terminateDateReader } from '../../../scan/ocr/client';
import { CameraStrip } from '../../components/CameraStrip';
import { Field, Switch } from '../../components/controls';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { Toast } from '../../components/Toast';
import { useChange, useDocument } from '../../state';
import { equipmentAddPath } from '../assets/route';
import { DateAbout } from './DateAbout';
import { DateReader, type DateRead } from './DateReader';
import { readUseCamera, writeUseCamera } from './dateSettings';
import { MonthField } from './MonthField';
import { ScanResolve } from './ScanResolve';
import {
  dateSummaryText,
  readTypedCode,
  savedText,
  type DateCounts,
  summaryText,
  useEquipmentMatches,
  useStockTypes,
} from './scanHelpers';
import {
  addStockWithUndo,
  defaultLocationId,
  matchTypes,
  pushRecent,
  readLastLocation,
  suitabilityWarning,
  undoAddStock,
  writeLastLocation,
  type StockAddition,
} from './stock';
import { UNDO_MS, buzz } from './stocktakeTunables';
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

/** The item being counted: its type, the barcode it came from if any, and the product's name. */
interface Counting {
  type: ItemType;
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
  const types = useStockTypes();
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
  const [items, setItems] = useState(0);
  const [sortLater, setSortLater] = useState(0);
  const [started] = useState(() => Date.now());
  const [finishedAfter, setFinishedAfter] = useState(0);
  const [cam, setCam] = useState<CameraStream | null>(null);
  // The centre of the camera strip, where the status and the read month are drawn, and the catch tick.
  const [centre, setCentre] = useState<HTMLElement | null>(null);
  const [flash, setFlash] = useState(0);
  // The date was set by hand: the camera stops looking and cannot overwrite it.
  const [handPicked, setHandPicked] = useState(false);
  const [useCamera, setUseCamera] = useState(readUseCamera);
  // Bumped when the graphics-chip switch changes, so the date step starts a fresh reader.
  const [readerKey, setReaderKey] = useState(0);
  const [dateCounts, setDateCounts] = useState<DateCounts>({ camera: 0, picked: 0, suggestion: 0 });
  const [dateMs, setDateMs] = useState<number[]>([]);
  const dateSource = useRef<DateSource | null>(null);
  const dateStarted = useRef(0);
  const [copied, setCopied] = useState(false);

  // The reader's models go back to the browser when the screen goes.
  useEffect(() => () => terminateDateReader(), []);

  // The Undo toast goes after a few seconds; only the latest save can be undone.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [saved]);

  function got(next: string): void {
    buzz('barcode');
    setFlash((n) => n + 1);
    setCode(next);
  }

  function startDate(type: ItemType, from?: string): void {
    setCounting({ type, code: from });
    setQty(1);
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

  function keepForLater(from: string, product: ProductInfo | undefined): void {
    if (!place) return;
    change('keep scan to sort', (d) => {
      const id = crypto.randomUUID();
      d.scans[id] = {
        id,
        code: from,
        qty: 1,
        locationId: place.id,
        scanned: new Date().toISOString(),
        ...(product ? { product } : {}),
      };
    });
    setSortLater((n) => n + 1);
    backToBarcode();
  }

  /** Saves the item with `date` (the card's month, or the one a suggestion carried). */
  function save(date: string | undefined, source: DateSource | null): void {
    if (!counting || !place) return;
    let addition: StockAddition | undefined;
    change('stocktake', (d) => {
      addition = addStockWithUndo(
        d,
        {
          typeId: counting.type.id,
          qty,
          locationId: place.id,
          bestBefore: date,
          source: 'barcode',
        },
        today(),
      );
    });
    if (!addition) return;
    pushRecent(counting.type.id);
    setItems((n) => n + qty);
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
      label: savedText(qty, counting.type.name, place.name),
    });
    backToBarcode();
  }

  const ok = (): void => save(bestBefore, dateSource.current);

  function undo(): void {
    if (!saved) return;
    change('undo stocktake', (d) => undoAddStock(d, saved.addition));
    setItems((n) => Math.max(0, n - saved.qty));
    // The date counts and time go with the item; saving it again counts once.
    if (saved.source)
      setDateCounts((c) => ({ ...c, [saved.source!]: Math.max(0, c[saved.source!] - 1) }));
    setDateMs((l) => {
      const at = l.lastIndexOf(saved.dateMs);
      return at < 0 ? l : l.filter((_, i) => i !== at);
    });
    // The undone item's card comes back only when nothing else is being worked on: an item
    // already in progress (or a code just read) is left exactly as it is.
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

  /** The camera settled on a month: it fills the field, and nothing is saved until OK. */
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
    const text = [summaryText(items, finishedAfter, sortLater), dateText]
      .filter(Boolean)
      .join('\n');
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  if (phase === 'done') {
    return (
      <section className="screen stocktake">
        <h1>Stocktake done</h1>
        <p role="status" data-testid="stocktake-summary">
          {summaryText(items, finishedAfter, sortLater)}
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

  const name = counting?.type.name ?? '';
  const productName = counting?.code ? doc.barcodes[counting.code]?.name : undefined;
  const warning = counting && place ? suitabilityWarning(counting.type, place) : undefined;

  return (
    <section className="screen stocktake">
      <h1 className="visually-hidden">Stocktake</h1>
      {locations.length === 0 ? (
        <p className="note">
          You have no places yet. <Link to="/app/locations">Add a place</Link> first, then come
          back.
        </p>
      ) : (
        // One compact line on both steps, so the strip stays exactly where it is.
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
        <p className="note stocktake-hint">
          Hold the barcode upright in the blue box. Then hold the date in the yellow box. OK saves
          and goes to the next one.{' '}
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
            <h3 className="type-title">Type the barcode number</h3>
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
              <Field label="Barcode number">
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
              onType={(type) => startDate(type, code)}
              onSortLater={(product) => keepForLater(code, product)}
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
              onType={(type) => {
                setCounting({ type, code: counting.code });
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
                key={`${counting.type.id}:${counting.code ?? ''}:${readerKey}:${items}`}
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
              {productName ? <p className="muted">{productName}</p> : null}
              {warning ? (
                <p className="warn" role="status">
                  ⚠ {warning}
                </p>
              ) : null}
              <MonthField
                value={bestBefore}
                onChange={changeDate}
                shelfLife={counting.type.shelfLife}
                today={today()}
              />
              {bestBefore ? <ExpiryBadge bestBefore={bestBefore} /> : null}
              <Field label={`How many (${counting.type.unit})?`}>
                <Stepper
                  label={`How many ${counting.type.unit}`}
                  value={qty}
                  min={1}
                  onChange={setQty}
                />
              </Field>
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
          types={types}
          onPick={(type) => startDate(type)}
          onClose={() => setFinding(false)}
        />
      ) : null}
    </section>
  );
}

/** Pick a type by name when there is no barcode to read: stock only; equipment routes away. */
function FindByName({
  types,
  onPick,
  onClose,
}: {
  types: ItemType[];
  onPick: (t: ItemType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => matchTypes(types, query).slice(0, 40), [types, query]);
  const equipment = useEquipmentMatches(query);
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
            <button type="button" className="row-main" onClick={() => onPick(t)}>
              <strong>{t.name}</strong>
              <span className="muted">{t.unitSize ? `${t.unit} · ${t.unitSize}` : t.unit}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
