import type { Document, Product, Size } from '../../../model';

export function renameProduct(draft: Document, id: string, name: string): void {
  const p = draft.products[id];
  if (!p) return;
  draft.products[id] = { ...p, name: name.trim() || p.name };
}

export function setProductItem(draft: Document, id: string, itemId: string | undefined): void {
  const p = draft.products[id];
  if (!p) return;
  if (itemId === undefined) {
    const next = { ...p };
    delete next.itemId;
    draft.products[id] = next;
  } else draft.products[id] = { ...p, itemId };
}

export function setProductSize(draft: Document, id: string, size: Size): void {
  const p = draft.products[id];
  if (!p) return;
  draft.products[id] = { ...p, size };
}

export interface MergeProductsResult {
  /** Stock rows that belonged to the dropped product (merged into another row or repointed). */
  stockRowsMoved: number;
  /** Barcodes that now point at the kept product. */
  barcodesMoved: number;
}

/**
 * Moves every batch and barcode from `dropId` onto `keepId`, merges batches that share place and
 * best-before month, then deletes the dropped product.
 */
export function mergeProducts(
  draft: Document,
  keepId: string,
  dropId: string,
): MergeProductsResult {
  if (keepId === dropId || !draft.products[keepId] || !draft.products[dropId]) {
    return { stockRowsMoved: 0, barcodesMoved: 0 };
  }
  let stockRowsMoved = 0;
  const toMove = Object.values(draft.stock).filter((row) => row.productId === dropId);
  for (const row of toMove) {
    stockRowsMoved += 1;
    const same = Object.values(draft.stock).find(
      (i) =>
        i.id !== row.id &&
        i.productId === keepId &&
        i.locationId === row.locationId &&
        i.bestBefore === row.bestBefore,
    );
    if (same) {
      draft.stock[same.id] = { ...same, qty: same.qty + row.qty };
      delete draft.stock[row.id];
    } else {
      draft.stock[row.id] = { ...row, productId: keepId };
    }
  }
  let barcodesMoved = 0;
  for (const [key, bc] of Object.entries(draft.barcodes)) {
    if (bc.productId === dropId) {
      draft.barcodes[key] = { ...bc, productId: keepId };
      barcodesMoved += 1;
    }
  }
  delete draft.products[dropId];
  return { stockRowsMoved, barcodesMoved };
}

/** Removes a product with no stock and forgets its barcodes. Returns false when stock remains. */
export function deleteProduct(draft: Document, id: string): boolean {
  const hasStock = Object.values(draft.stock).some((s) => s.productId === id);
  if (hasStock || !draft.products[id]) return false;
  delete draft.products[id];
  for (const [key, bc] of Object.entries(draft.barcodes)) {
    if (bc.productId === id) delete draft.barcodes[key];
  }
  return true;
}

/** Household products that count as this item, newest first by name. */
export function productsOfItem(doc: Pick<Document, 'products'>, itemId: string): Product[] {
  return Object.values(doc.products)
    .filter((p) => p.itemId === itemId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
