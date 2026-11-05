import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { suggestItems } from '../../../engine';
import type { Item, OffFacts } from '../../../model';
import type { OffProduct, OffResult } from '../../../scan/openFoodFacts';
import { sizeFits, today } from '../../../util';
import { Field } from '../../components/controls';
import { getOff } from '../../off';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { equipmentAddPath } from '../assets/route';
import { defaultProductName, ensureProduct, matchItems, rememberBarcode, usualSize } from './stock';
import { offFactsOf, productLine, useEquipmentMatches, useStockItems } from './scanHelpers';

/**
 * The card for a barcode just read. A barcode the household has met before is resolved at once
 * (`onProduct`, no card). Otherwise Open Food Facts is asked (only while online), and the person
 * picks from likely items, searches all items, counts towards nothing, or sorts it later.
 */
export function ScanResolve({
  code,
  seed,
  onProduct,
  onSortLater,
  sortLaterBlocked,
  reidentify = false,
}: {
  code: string;
  seed?: OffFacts;
  onProduct: (productId: string) => void;
  onSortLater?: (off: OffFacts | undefined) => void;
  sortLaterBlocked?: string;
  reidentify?: boolean;
}) {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const items = useStockItems();

  const remembered = doc.barcodes[code];
  const knownProduct = remembered ? doc.products[remembered.productId] : undefined;
  const knownItem = knownProduct?.itemId ? packs.items[knownProduct.itemId] : undefined;
  const knownStock =
    knownProduct && (!knownItem || knownItem.assetTypeId === undefined) ? knownProduct : undefined;
  const known = reidentify ? undefined : knownStock;

  const [result, setResult] = useState<OffResult | 'looking'>('looking');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const resolved = useRef<string | null>(null);
  useEffect(() => {
    if (!known || resolved.current === code) return;
    resolved.current = code;
    onProduct(known.id);
  }, [known, code, onProduct]);

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
  const seeded = !found && seed?.found ? seedToOff(seed) : undefined;
  const off = found ?? seeded;
  const line = off ? productLine(off) : '';

  const guesses = useMemo(
    () => (found ? suggestItems({ categories: found.categories, size: found.size }, items) : []),
    [found, items],
  );
  const shown = useMemo(
    () => (searching ? matchItems(items, query) : []),
    [searching, items, query],
  );
  const equipmentShown = useEquipmentMatches(query, searching);

  if (known) return null;

  function rememberAndFinish(item: Item): void {
    let productId = '';
    change('remember barcode', (d) => {
      const size = off?.size && sizeFits(off.size, item.measure) ? off.size : usualSize(item);
      const label =
        off?.kcalPer100 !== undefined && item.measure !== 'count' ? off.kcalPer100 : undefined;
      const name = off ? productLine(off) : undefined;
      ({ id: productId } = ensureProduct(
        d,
        { itemId: item.id, size, labelKcalPer100: label, name },
        packs,
        today(),
      ));
      rememberBarcode(d, code, productId, today());
    });
    onProduct(productId);
  }

  function countsTowardsNothing(): void {
    let productId = '';
    change('remember barcode', (d) => {
      const size = off?.size ?? { amount: 1, unit: 'pieces' as const };
      const name = off ? productLine(off) : defaultProductName(undefined, size);
      ({ id: productId } = ensureProduct(d, { size, name }, packs, today()));
      rememberBarcode(d, code, productId, today());
    });
    onProduct(productId);
  }

  const why =
    result === 'offline'
      ? 'Not known yet. You are offline, so Open Food Facts could not be asked.'
      : result === 'busy'
        ? 'Not known yet. Open Food Facts is busy; try again in a minute.'
        : off
          ? null
          : result === 'looking'
            ? null
            : 'Not known yet. Open Food Facts does not have this one.';

  return (
    <div className="scan-card" aria-label={`Barcode ${code}`}>
      <p className="muted" data-testid="scan-code">
        Barcode {code}
        {reidentify && knownStock ? ` · remembered as ${knownStock.name}` : ''}
      </p>
      {result === 'looking' && !seeded ? <p role="status">Looking it up…</p> : null}
      {off ? (
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
                <button type="button" className="row-main" onClick={() => rememberAndFinish(t)}>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.countsAs}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {searching ? (
        <>
          <Field label="Search items">
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
                <button type="button" className="row-main" onClick={() => rememberAndFinish(t)}>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.countsAs}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="scan-choices">
        {searching ? null : (
          <div className="scan-choice">
            <button
              type="button"
              className="secondary"
              aria-describedby="choice-pick"
              onClick={() => setSearching(true)}
            >
              Pick what it is
            </button>
            <p className="muted" id="choice-pick">
              Choose from the list of items
            </p>
          </div>
        )}
        <div className="scan-choice">
          <button
            type="button"
            className="secondary"
            aria-describedby="choice-nothing"
            onClick={() => countsTowardsNothing()}
          >
            Counts towards nothing
          </button>
          <p className="muted" id="choice-nothing">
            Keep it listed; it scores nothing towards the plan
          </p>
        </div>
        {onSortLater ? (
          <div className="scan-choice">
            <button
              type="button"
              className="secondary"
              aria-describedby="choice-later"
              disabled={sortLaterBlocked !== undefined}
              onClick={() =>
                onSortLater(
                  found ? offFactsOf(found) : seeded ? offFactsOf(seeded as OffProduct) : undefined,
                )
              }
            >
              Decide later
            </button>
            <p className="muted" id="choice-later">
              Keep the scan; sort it on Stores
            </p>
          </div>
        ) : null}
      </div>
      {onSortLater && sortLaterBlocked ? <p className="muted">{sortLaterBlocked}</p> : null}
    </div>
  );
}

function seedToOff(seed: OffFacts): OffProduct {
  return {
    found: true,
    ...(seed.name ? { name: seed.name } : {}),
    ...(seed.brand ? { brand: seed.brand } : {}),
    ...(seed.quantity ? { quantity: seed.quantity } : {}),
    ...(seed.size ? { size: seed.size } : {}),
    ...(seed.kcalPer100 !== undefined ? { kcalPer100: seed.kcalPer100 } : {}),
    categories: seed.categories ?? [],
  };
}
