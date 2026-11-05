import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { likelyTypes } from '../../../engine';
import type { ItemType, ProductInfo } from '../../../model';
import type { OffProduct, OffResult } from '../../../scan/openFoodFacts';
import { today } from '../../../util';
import { Field } from '../../components/controls';
import { getOff } from '../../off';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { equipmentAddPath } from '../assets/route';
import { CustomItemForm } from './CustomItemForm';
import { matchTypes } from './stock';
import { productInfoOf, productLine, useEquipmentMatches, useStockTypes } from './scanHelpers';

/**
 * The card for a barcode just read: what is it? A barcode the household has met before is
 * resolved at once (`onType`, no card). Otherwise Open Food Facts is asked (only while online),
 * and the person picks from the likely types, searches all types, makes it its own item, or
 * sorts it later. The choice is remembered for the barcode, for the whole household.
 */
export function ScanResolve({
  code,
  seed,
  onType,
  onSortLater,
}: {
  code: string;
  /** What an earlier lookup of a queued scan found, shown while (or instead of) asking again. */
  seed?: ProductInfo;
  onType: (type: ItemType) => void;
  /** Absent: no "Sort later" (the scan is already in the queue). */
  onSortLater?: (product: ProductInfo | undefined) => void;
}) {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const types = useStockTypes();

  const remembered = doc.barcodes[code];
  const knownType = remembered ? packs.items[remembered.typeId] : undefined;
  const known = knownType && knownType.assetTypeId === undefined ? knownType : undefined;

  const [result, setResult] = useState<OffResult | 'looking'>('looking');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [own, setOwn] = useState(false);

  const resolved = useRef<string | null>(null);
  useEffect(() => {
    if (!known || resolved.current === code) return;
    resolved.current = code;
    onType(known);
  }, [known, code, onType]);

  useEffect(() => {
    if (known) return;
    let cancelled = false;
    void getOff()
      .lookup(code)
      .then((r) => {
        if (!cancelled) setResult(r);
      });
    return () => {
      cancelled = true;
    };
  }, [code, known]);

  const product: OffProduct | undefined = typeof result === 'object' ? result : undefined;
  const found = product?.found ? product : undefined;
  const seeded = !found && seed?.found ? seed : undefined;
  const line = found ? productLine(found) : seeded ? productLine(seeded) : '';
  const guesses = useMemo(
    () =>
      found
        ? likelyTypes(
            { categories: found.categories, grams: found.grams, ml: found.ml, name: found.name },
            types,
          )
        : [],
    [found, types],
  );
  const shown = useMemo(
    () => (searching ? matchTypes(types, query) : []),
    [searching, types, query],
  );
  const equipmentShown = useEquipmentMatches(query, searching);

  if (known) return null;

  function choose(type: ItemType): void {
    change('remember barcode', (d) => {
      d.barcodes[code] = { typeId: type.id, ...(line ? { name: line } : {}), seen: today() };
    });
    onType(type);
  }

  if (own) {
    const kcal =
      found?.kcalPer100g !== undefined && found.grams !== undefined
        ? Math.max(1, Math.round((found.kcalPer100g * found.grams) / 100))
        : undefined;
    return (
      <CustomItemForm
        initialName={found?.name ?? seeded?.name ?? ''}
        initialAmount={kcal}
        onClose={() => setOwn(false)}
        onBack={() => setOwn(false)}
        onMade={(made) => {
          change('add custom item type', (d) => {
            d.customTypes[made.id] = made;
            d.barcodes[code] = { typeId: made.id, ...(line ? { name: line } : {}), seen: today() };
          });
          onType(made);
        }}
      />
    );
  }

  const why =
    result === 'offline'
      ? 'Not known yet. You are offline, so Open Food Facts could not be asked.'
      : result === 'busy'
        ? 'Not known yet. Open Food Facts is busy; try again in a minute.'
        : found || seeded
          ? null
          : result === 'looking'
            ? null
            : 'Not known yet. Open Food Facts does not have this one.';

  return (
    <div className="scan-card" aria-label={`Barcode ${code}`}>
      <p className="muted" data-testid="scan-code">
        Barcode {code}
      </p>
      {result === 'looking' && !seeded ? <p role="status">Looking it up…</p> : null}
      {found || seeded ? (
        <p role="status">
          Open Food Facts says: <strong>{line || 'a product with no name'}</strong>
        </p>
      ) : null}
      {why ? <p role="status">{why}</p> : null}
      {guesses.length > 0 ? (
        <>
          <h3>Which of these is it?</h3>
          <ul className="row-list">
            {guesses.map((t) => (
              <li className="row-item" key={t.id}>
                <button type="button" className="row-main" onClick={() => choose(t)}>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.unitSize ? `${t.unit} · ${t.unitSize}` : t.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {searching ? (
        <>
          <Field label="Search all types">
            <input
              type="search"
              autoComplete="off"
              autoFocus
              value={query}
              placeholder="Water, tinned soup, torch…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          {equipmentShown.length > 0 ? (
            <ul className="row-list" aria-label="Equipment: add to your home">
              {equipmentShown.map((t) => (
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
            {shown.slice(0, 30).map((t) => (
              <li className="row-item" key={t.id}>
                <button type="button" className="row-main" onClick={() => choose(t)}>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.unitSize ? `${t.unit} · ${t.unitSize}` : t.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="scan-actions">
        {searching ? null : (
          <button type="button" className="secondary" onClick={() => setSearching(true)}>
            Search all types
          </button>
        )}
        <button type="button" className="secondary" onClick={() => setOwn(true)}>
          Save as its own item
        </button>
        {onSortLater ? (
          <button
            type="button"
            className="secondary"
            onClick={() => onSortLater(found ? productInfoOf(found) : seeded)}
          >
            Sort later
          </button>
        ) : null}
      </div>
    </div>
  );
}
