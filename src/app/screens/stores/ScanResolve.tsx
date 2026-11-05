import { useEffect, useMemo, useRef, useState } from 'react';
import { suggestItems } from '../../../engine';
import type { Item, OffFacts } from '../../../model';
import type { OffProduct, OffResult } from '../../../scan/openFoodFacts';
import { sizeFits, today } from '../../../util';
import { getOff } from '../../off';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { ItemPicker } from './ItemPicker';
import { SizeStep, type SizeStepDone } from './SizeStep';
import { defaultProductName, ensureProduct, rememberBarcode, type NewProduct } from './stock';
import { offFactsOf, offPreviewText, productLine, useStockItems } from './scanHelpers';

type Phase = 'countsAs' | 'pickItem' | 'size';

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

function seedToResult(seed: OffFacts): OffResult {
  if (seed.found) return seedToOff(seed);
  return { found: false, categories: seed.categories ?? [] };
}

/**
 * The card for a barcode just read. A barcode the household has met before is resolved at once
 * (`onProduct`, no card). Open Food Facts makes the product; the person confirms what it counts as,
 * picks an item, or sorts it later.
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

  const [result, setResult] = useState<OffResult | 'looking'>(() =>
    seed ? seedToResult(seed) : reidentify ? { found: false, categories: [] } : 'looking',
  );
  const [phase, setPhase] = useState<Phase>(() => (reidentify ? 'pickItem' : 'countsAs'));
  const [sizeItem, setSizeItem] = useState<Item | undefined>(undefined);
  const [sizeName, setSizeName] = useState<string | undefined>(undefined);

  const resolved = useRef<string | null>(null);
  useEffect(() => {
    if (!known || resolved.current === code) return;
    resolved.current = code;
    onProduct(known.id);
  }, [known, code, onProduct]);

  useEffect(() => {
    if (known || seed || reidentify) return;
    let cancelled = false;
    void getOff()
      .lookup(code)
      .then((r) => {
        if (!cancelled) setResult(r);
      });
    return () => {
      cancelled = true;
    };
  }, [code, known, seed, reidentify]);

  const product: OffProduct | undefined = typeof result === 'object' ? result : undefined;
  const found = product?.found ? product : undefined;
  const seeded = !found && seed?.found ? seedToOff(seed) : undefined;
  const off = found ?? seeded;
  const suggest = useMemo(
    () =>
      off ? suggestItems({ categories: off.categories, size: off.size }, items)[0] : undefined,
    [off, items],
  );

  if (known) return null;

  const labelKcal = off?.kcalPer100 !== undefined ? off.kcalPer100 : undefined;
  const offName = off ? productLine(off) : undefined;

  function rememberProduct(productId: string): void {
    change('remember barcode', (d) => {
      rememberBarcode(d, code, productId, today());
    });
    onProduct(productId);
  }

  function finishNew(p: NewProduct): void {
    let productId = '';
    change('remember barcode', (d) => {
      ({ id: productId } = ensureProduct(d, p, packs, today()));
      rememberBarcode(d, code, productId, today());
    });
    onProduct(productId);
  }

  function finishItem(item: Item): void {
    const size = off?.size && sizeFits(off.size, item.measure) ? off.size : undefined;
    if (size) {
      const label = labelKcal !== undefined && item.measure !== 'count' ? labelKcal : undefined;
      finishNew({
        itemId: item.id,
        size,
        labelKcalPer100: label,
        name: offName,
      });
      return;
    }
    setSizeItem(item);
    setSizeName(offName);
    setPhase('size');
  }

  function onSizeDone(done: SizeStepDone): void {
    if ('productId' in done) {
      rememberProduct(done.productId);
      return;
    }
    finishNew(done);
  }

  function countsTowardsNothing(): void {
    const size = off?.size ?? { amount: 1, unit: 'pieces' as const };
    const name = off ? productLine(off) : defaultProductName(undefined, size);
    finishNew({ size, name });
  }

  function onPickedProduct(productId: string): void {
    rememberProduct(productId);
  }

  const why = reidentify
    ? null
    : result === 'offline'
      ? 'Not known yet. You are offline, so Open Food Facts could not be asked.'
      : result === 'busy'
        ? 'Not known yet. Open Food Facts is busy; try again in a minute.'
        : off
          ? null
          : result === 'looking'
            ? null
            : 'Not known yet. Open Food Facts does not have this one.';

  const showCountsAs = Boolean(off && phase === 'countsAs' && suggest);
  const showPicker =
    result !== 'looking' &&
    (phase === 'pickItem' || !off || (Boolean(off) && !suggest && phase === 'countsAs'));
  const preview = off ? offPreviewText(off, suggest) : '';

  return (
    <div className="scan-card" aria-label={`Barcode ${code}`}>
      <p className="muted" data-testid="scan-code">
        Barcode {code}
        {reidentify && knownStock ? ` · remembered as ${knownStock.name}` : ''}
      </p>
      {result === 'looking' && !seed ? <p role="status">Looking it up…</p> : null}
      {off && phase !== 'size' ? (
        <p role="status">
          <strong>{preview}</strong>
        </p>
      ) : null}
      {why ? <p role="status">{why}</p> : null}
      {showCountsAs && suggest ? (
        <>
          <h3>Counts as: {suggest.name}?</h3>
          <div className="scan-choices">
            <div className="scan-choice">
              <button
                type="button"
                aria-describedby="choice-yes"
                onClick={() => finishItem(suggest)}
              >
                Yes
              </button>
              <p className="muted" id="choice-yes">
                Make this product and remember the barcode
              </p>
            </div>
            <div className="scan-choice">
              <button
                type="button"
                className="secondary"
                aria-describedby="choice-other"
                onClick={() => setPhase('pickItem')}
              >
                Something else
              </button>
              <p className="muted" id="choice-other">
                Choose a different item from the list
              </p>
            </div>
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
                      found
                        ? offFactsOf(found)
                        : seeded
                          ? offFactsOf(seeded as OffProduct)
                          : undefined,
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
        </>
      ) : null}
      {showPicker && phase !== 'size' ? (
        <>
          <ItemPicker
            searchLabel="What is it?"
            onItem={(item) => finishItem(item)}
            onProduct={onPickedProduct}
          />
          {!showCountsAs ? (
            <div className="scan-choices">
              <div className="scan-choice">
                <button
                  type="button"
                  className="secondary"
                  aria-describedby="choice-nothing-unknown"
                  onClick={() => countsTowardsNothing()}
                >
                  Counts towards nothing
                </button>
                <p className="muted" id="choice-nothing-unknown">
                  Keep it listed; it scores nothing towards the plan
                </p>
              </div>
              {onSortLater ? (
                <div className="scan-choice">
                  <button
                    type="button"
                    className="secondary"
                    aria-describedby="choice-later-unknown"
                    disabled={sortLaterBlocked !== undefined}
                    onClick={() =>
                      onSortLater(
                        found
                          ? offFactsOf(found)
                          : seeded
                            ? offFactsOf(seeded as OffProduct)
                            : undefined,
                      )
                    }
                  >
                    Decide later
                  </button>
                  <p className="muted" id="choice-later-unknown">
                    Keep the scan; sort it on Stores
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {phase === 'size' && sizeItem ? (
        <SizeStep
          item={sizeItem}
          labelKcalPer100={labelKcal}
          initialName={sizeName}
          onDone={onSizeDone}
        />
      ) : null}
      {onSortLater && sortLaterBlocked ? <p className="muted">{sortLaterBlocked}</p> : null}
    </div>
  );
}
