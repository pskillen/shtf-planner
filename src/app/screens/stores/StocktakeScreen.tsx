import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ItemType, ProductInfo } from '../../../model';
import { today } from '../../../util';
import { CameraStrip } from '../../components/CameraStrip';
import { Field } from '../../components/controls';
import { ExpiryBadge } from '../../components/ExpiryBadge';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { Toast } from '../../components/Toast';
import { useChange, useDocument } from '../../state';
import { equipmentAddPath } from '../assets/route';
import { MonthField } from './MonthField';
import { ScanResolve } from './ScanResolve';
import {
  readTypedCode,
  savedText,
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
}

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
  const [saved, setSaved] = useState<Saved | null>(null);
  const [hint, setHint] = useState(() => !readHint());
  const [items, setItems] = useState(0);
  const [sortLater, setSortLater] = useState(0);
  const [started] = useState(() => Date.now());
  const [finishedAfter, setFinishedAfter] = useState(0);

  // The Undo toast goes after a few seconds; only the latest save can be undone.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [saved]);

  function got(next: string): void {
    buzz('barcode');
    setCode(next);
  }

  function startDate(type: ItemType, from?: string): void {
    setCounting({ type, code: from });
    setQty(1);
    setBestBefore(undefined);
    setCode(null);
    setFinding(false);
    setPhase('date');
  }

  function backToBarcode(): void {
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

  function ok(): void {
    if (!counting || !place) return;
    let addition: StockAddition | undefined;
    change('stocktake', (d) => {
      addition = addStockWithUndo(
        d,
        {
          typeId: counting.type.id,
          qty,
          locationId: place.id,
          bestBefore,
          source: 'barcode',
        },
        today(),
      );
    });
    if (!addition) return;
    pushRecent(counting.type.id);
    setItems((n) => n + qty);
    setSaved({
      addition,
      counting,
      qty,
      bestBefore,
      label: savedText(qty, counting.type.name, place.name),
    });
    backToBarcode();
  }

  function undo(): void {
    if (!saved) return;
    change('undo stocktake', (d) => undoAddStock(d, saved.addition));
    setItems((n) => Math.max(0, n - saved.qty));
    setCounting(saved.counting);
    setQty(saved.qty);
    setBestBefore(saved.bestBefore);
    setCode(null);
    setPhase('date');
    setSaved(null);
  }

  function changeDate(next: string | undefined): void {
    if (next && next !== bestBefore) buzz('date');
    setBestBefore(next);
  }

  function finish(): void {
    setFinishedAfter(Date.now() - started);
    setSaved(null);
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <section className="screen stocktake">
        <h1>Stocktake done</h1>
        <p role="status" data-testid="stocktake-summary">
          {summaryText(items, finishedAfter, sortLater)}
        </p>
        <button type="button" onClick={() => navigate('/app/stores')}>
          Back to Stores
        </button>
      </section>
    );
  }

  const name = counting?.type.name ?? '';
  const productName = counting?.code ? doc.barcodes[counting.code]?.name : undefined;
  const warning = counting && place ? suitabilityWarning(counting.type, place) : undefined;

  return (
    <section className="screen stocktake">
      <h1>Stocktake</h1>
      {locations.length === 0 ? (
        <p className="note">
          You have no places yet. <Link to="/app/locations">Add a place</Link> first, then come
          back.
        </p>
      ) : (
        <Field label="Counting into">
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
        </Field>
      )}

      {hint ? (
        <p className="note stocktake-hint">
          Hold the barcode upright in the blue box. OK saves and goes to the next one.{' '}
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
      />

      {phase === 'barcode' ? (
        code === null ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const r = readTypedCode(typed);
                if ('problem' in r) return setProblem(r.problem);
                setProblem(null);
                setTyped('');
                got(r.code);
              }}
            >
              <Field label="Type the number" hint={problem ?? undefined}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={typed}
                  aria-invalid={problem ? true : undefined}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </Field>
              <div className="scan-actions">
                <button type="submit" className="secondary" disabled={typed.trim() === ''}>
                  Use this number
                </button>
                <button type="button" className="secondary" onClick={() => setFinding(true)}>
                  Find it by name
                </button>
                <button type="button" onClick={finish}>
                  Done
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <ScanResolve
              key={code}
              code={code}
              onType={(type) => startDate(type, code)}
              onSortLater={(product) => keepForLater(code, product)}
            />
            <button type="button" className="secondary" onClick={() => setCode(null)}>
              Scan another
            </button>
          </>
        )
      ) : counting ? (
        <div className="scan-card" aria-label="This item">
          <p>
            <span className="step-chip" style={{ background: '#fc0' }}>
              2 DATE
            </span>
          </p>
          <h2>{name}</h2>
          {productName ? <p className="muted">{productName}</p> : null}
          {warning ? (
            <p className="warn" role="status">
              ⚠ {warning}
            </p>
          ) : null}
          <Field label={`How many (${counting.type.unit})?`}>
            <Stepper
              label={`How many ${counting.type.unit}`}
              value={qty}
              min={1}
              onChange={setQty}
            />
          </Field>
          <MonthField
            value={bestBefore}
            onChange={changeDate}
            shelfLife={counting.type.shelfLife}
            today={today()}
          />
          {bestBefore ? <ExpiryBadge bestBefore={bestBefore} /> : null}
          <div className="scan-actions">
            <button type="button" className="secondary" onClick={backToBarcode}>
              Cancel
            </button>
            <button type="button" onClick={ok} disabled={!place || qty < 1}>
              OK
            </button>
          </div>
        </div>
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
