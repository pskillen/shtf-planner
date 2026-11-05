import { describe, expect, it } from 'vitest';
import {
  deleteProduct,
  mergeProducts,
  renameProduct,
  setProductItem,
  setProductSize,
} from '../src/app/screens/stores/products';
import { biggarDocument } from '../src/fixtures/household-biggar';

const clone = () => structuredClone(biggarDocument());

describe('renameProduct', () => {
  it('trims and updates the name', () => {
    const d = clone();
    renameProduct(d, 'prod-beans', '  Heinz 415 g  ');
    expect(d.products['prod-beans']!.name).toBe('Heinz 415 g');
  });
});

describe('setProductItem', () => {
  it('points at another item or clears counts-as', () => {
    const d = clone();
    setProductItem(d, 'prod-beans', 'items-base:tinned-soup');
    expect(d.products['prod-beans']!.itemId).toBe('items-base:tinned-soup');
    setProductItem(d, 'prod-beans', undefined);
    expect(d.products['prod-beans']!.itemId).toBeUndefined();
  });
});

describe('setProductSize', () => {
  it('replaces the size', () => {
    const d = clone();
    setProductSize(d, 'prod-beans', { amount: 220, unit: 'g' });
    expect(d.products['prod-beans']!.size).toEqual({ amount: 220, unit: 'g' });
  });
});

describe('mergeProducts', () => {
  it('moves stock and barcodes and merges same place and month', () => {
    const d = clone();
    d.products['prod-other'] = {
      id: 'prod-other',
      name: 'Other beans 415 g',
      itemId: 'items-base:baked-beans',
      size: { amount: 415, unit: 'g' },
      added: '2026-09-01',
    };
    d.stock['stock-other'] = {
      id: 'stock-other',
      productId: 'prod-other',
      qty: 3,
      locationId: 'loc-pantry',
      bestBefore: '2028-06',
      added: '2026-09-01',
      source: 'manual',
    };
    d.barcodes['5000111111111'] = { productId: 'prod-other', seen: '2026-09-01' };

    const { stockRowsMoved, barcodesMoved } = mergeProducts(d, 'prod-beans', 'prod-other');
    expect(stockRowsMoved).toBe(1);
    expect(barcodesMoved).toBe(1);
    expect(d.products['prod-other']).toBeUndefined();
    expect(d.stock['stock-other']).toBeUndefined();
    expect(d.stock['stock-beans']!.qty).toBe(15);
    expect(d.barcodes['5000111111111']!.productId).toBe('prod-beans');
  });
});

describe('deleteProduct', () => {
  it('refuses when stock remains and forgets barcodes when empty', () => {
    const d = clone();
    expect(deleteProduct(d, 'prod-beans')).toBe(false);
    d.barcodes['5000111111111'] = { productId: 'prod-beans', seen: '2026-09-01' };
    delete d.stock['stock-beans'];
    expect(deleteProduct(d, 'prod-beans')).toBe(true);
    expect(d.products['prod-beans']).toBeUndefined();
    expect(d.barcodes['5000111111111']).toBeUndefined();
  });
});
