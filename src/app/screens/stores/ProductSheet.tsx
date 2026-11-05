import { useMemo, useState } from 'react';
import type { Item } from '../../../model';
import { formatSize, sizeFits } from '../../../util';
import { Field } from '../../components/controls';
import { isDirty } from '../../components/isDirty';
import { Sheet } from '../../components/Sheet';
import { useChange, useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { ItemPicker } from './ItemPicker';
import { barcodeCount, productKcalLine } from './productDisplay';
import {
  deleteProduct,
  mergeProducts,
  renameProduct,
  setProductItem,
  setProductSize,
} from './products';
import { SizeStep, type SizeStepDone } from './SizeStep';
import { formatPackTotal, sumProductPacks } from './storesGrouping';

type Mode = 'main' | 'countsAs' | 'size' | 'merge' | 'mergeConfirm' | 'deleteConfirm';

function mergePreview(
  doc: Pick<import('../../../model').Document, 'stock' | 'barcodes' | 'products'>,
  dropId: string,
  unit: string,
) {
  const packs = sumProductPacks(doc, dropId, 'all', new Set());
  const barcodes = Object.values(doc.barcodes).filter((b) => b.productId === dropId).length;
  return { packs, unit, barcodes };
}

/** Edit one product: name, counts-as, size, merge, delete. */
export function ProductSheet({
  productId,
  onClose,
  onGone,
}: {
  productId: string;
  onClose: () => void;
  /** The product was merged away or deleted. */
  onGone: () => void;
}) {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const product = doc.products[productId];
  const item = product?.itemId ? packs.items[product.itemId] : undefined;

  const [mode, setMode] = useState<Mode>('main');
  const [name, setName] = useState(product?.name ?? '');
  const [mergeKeepId, setMergeKeepId] = useState<string | null>(null);
  const [repickItem, setRepickItem] = useState<Item | undefined>(undefined);

  const stockPacks = useMemo(
    () => (product ? sumProductPacks(doc, productId, 'all', new Set()) : 0),
    [doc, product, productId],
  );
  const hasStock = stockPacks > 0;
  const unit = item?.unit ?? 'packs';
  const barcodes = product ? barcodeCount(doc, productId) : 0;
  const kcal = product ? productKcalLine(product, item) : undefined;

  const otherProducts = useMemo(
    () =>
      Object.values(doc.products)
        .filter((p) => p.id !== productId)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [doc.products, productId],
  );

  if (!product) {
    return (
      <Sheet title="Product" onClose={onClose}>
        <p className="muted">That product is no longer in your household.</p>
      </Sheet>
    );
  }

  const saveName = () => {
    change('rename product', (d) => renameProduct(d, productId, name));
  };

  const applyItem = (next: Item | undefined) => {
    if (next === undefined) {
      change('set product item', (d) => setProductItem(d, productId, undefined));
      setRepickItem(undefined);
      setMode('main');
      return;
    }
    if (sizeFits(product.size, next.measure)) {
      change('set product item', (d) => setProductItem(d, productId, next.id));
      setRepickItem(undefined);
      setMode('main');
      return;
    }
    setRepickItem(next);
    setMode('size');
  };

  const applySize = (done: SizeStepDone) => {
    const itemToSet = repickItem;
    if ('productId' in done) {
      if (done.productId === productId) {
        if (itemToSet) {
          change('set product item', (d) => setProductItem(d, productId, itemToSet.id));
        }
        setRepickItem(undefined);
        setMode('main');
        return;
      }
      const other = doc.products[done.productId];
      if (other) {
        change('set product size', (d) => {
          setProductSize(d, productId, other.size);
          if (itemToSet) setProductItem(d, productId, itemToSet.id);
        });
      }
      setRepickItem(undefined);
      setMode('main');
      return;
    }
    change('set product size', (d) => {
      setProductSize(d, productId, done.size);
      if (itemToSet) setProductItem(d, productId, itemToSet.id);
      if (done.name) renameProduct(d, productId, done.name);
      if (done.labelKcalPer100 !== undefined && d.products[productId]) {
        d.products[productId] = {
          ...d.products[productId]!,
          labelKcalPer100: done.labelKcalPer100,
        };
      }
    });
    setRepickItem(undefined);
    setMode('main');
  };

  const confirmMerge = () => {
    if (!mergeKeepId) return;
    change('merge products', (d) => mergeProducts(d, mergeKeepId, productId));
    onGone();
  };

  const fixDelete = () => {
    change('delete product', (d) => {
      if (deleteProduct(d, productId)) onGone();
    });
  };

  if (mode === 'countsAs') {
    return (
      <Sheet title="Counts as" onClose={() => setMode('main')}>
        <ItemPicker
          searchLabel="What is it?"
          showEquipmentLink={false}
          onItem={(picked) => applyItem(picked)}
          onProduct={() => undefined}
        />
        <div className="scan-choice">
          <button type="button" className="secondary" onClick={() => applyItem(undefined)}>
            Counts towards nothing
          </button>
        </div>
      </Sheet>
    );
  }

  if (mode === 'size' && (repickItem ?? item)) {
    const sizeItem = repickItem ?? item!;
    return (
      <Sheet title="Size" onClose={() => setMode('main')}>
        <SizeStep
          item={sizeItem}
          labelKcalPer100={product.labelKcalPer100}
          initialName={product.name}
          onDone={applySize}
        />
      </Sheet>
    );
  }

  if (mode === 'merge') {
    return (
      <Sheet title="Merge into…" onClose={() => setMode('main')}>
        {otherProducts.length === 0 ? (
          <p className="muted">There is no other product to merge into.</p>
        ) : (
          <ul className="row-list">
            {otherProducts.map((p) => (
              <li className="row-item" key={p.id}>
                <button
                  type="button"
                  className="row-main"
                  onClick={() => {
                    setMergeKeepId(p.id);
                    setMode('mergeConfirm');
                  }}
                >
                  <strong>{p.name}</strong>
                  <span className="muted">{formatSize(p.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    );
  }

  const keep = mergeKeepId ? doc.products[mergeKeepId] : undefined;
  if (mode === 'mergeConfirm' && keep) {
    const { packs, unit: mergeUnit, barcodes: bc } = mergePreview(doc, productId, unit);
    const bcWord = bc === 1 ? 'barcode' : 'barcodes';
    return (
      <Sheet title="Merge into…" onClose={() => setMode('merge')}>
        <div className="sheet-confirm" role="alert">
          <p>
            Move {formatPackTotal(packs, mergeUnit)} and {bc} {bcWord} to {keep.name}, and delete
            this product?
          </p>
          <button type="button" className="secondary" onClick={() => setMode('merge')}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={confirmMerge}>
            Merge
          </button>
        </div>
      </Sheet>
    );
  }

  if (mode === 'deleteConfirm') {
    const bcWord = barcodes === 1 ? 'barcode' : 'barcodes';
    return (
      <Sheet title={product.name} onClose={() => setMode('main')}>
        <div className="sheet-confirm" role="alert">
          <p>
            Delete {product.name}
            {barcodes > 0 ? ` and forget ${barcodes} ${bcWord}` : ''}?
          </p>
          <button type="button" className="secondary" onClick={() => setMode('main')}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={fixDelete}>
            Delete
          </button>
        </div>
      </Sheet>
    );
  }

  const countsAsLabel = item ? item.name : 'Counts towards nothing';

  return (
    <Sheet
      title={product.name}
      onClose={onClose}
      dirty={isDirty(name.trim(), product.name)}
      actions={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Done
          </button>
          <button type="button" onClick={saveName} disabled={!isDirty(name.trim(), product.name)}>
            Save name
          </button>
        </>
      }
    >
      <Field label="Name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="field">
        <span className="field-label">Counts as</span>
        <p>{countsAsLabel}</p>
        <button
          type="button"
          className="secondary"
          aria-label="Change counts as"
          onClick={() => setMode('countsAs')}
        >
          Change
        </button>
      </div>
      <div className="field">
        <span className="field-label">Size</span>
        <p>{formatSize(product.size)}</p>
        <button
          type="button"
          className="secondary"
          aria-label="Change size"
          disabled={!item}
          onClick={() => setMode('size')}
        >
          Change
        </button>
      </div>
      {kcal ? <p className="muted">{kcal}</p> : null}
      <p className="muted">
        {formatPackTotal(stockPacks, unit)} in stock
        {barcodes > 0 ? ` · ${barcodes} ${barcodes === 1 ? 'barcode' : 'barcodes'}` : ''}
      </p>
      <button type="button" className="secondary" onClick={() => setMode('merge')}>
        Merge into…
      </button>
      <button type="button" className="danger" disabled={hasStock} onClick={() => setMode('deleteConfirm')}>
        Delete
      </button>
      {hasStock ? (
        <p className="muted">Remove all stock before you can delete this product.</p>
      ) : null}
    </Sheet>
  );
}
