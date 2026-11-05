import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORY_LABEL, labelOf } from '../../labels';
import { useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { useStockItems } from './scanHelpers';
import { groupAllProducts, productKcalLine, productSizeLine, barcodeCount } from './productDisplay';
import { ProductSheet } from './ProductSheet';
import { formatPackTotal, sumProductPacks } from './storesGrouping';
import { groupItemsForPicker } from './pickerHelpers';

/** Every household product, grouped by item; tap one to edit it. */
export function ProductsScreen() {
  const doc = useDocument();
  const packs = usePacks();
  const stockItems = useStockItems();
  const [params, setParams] = useSearchParams();
  const openParam = params.get('open');
  const [openId, setOpenId] = useState<string | null>(() =>
    openParam && doc.products[openParam] ? openParam : null,
  );

  const hasLink = params.has('open');
  useEffect(() => {
    if (hasLink) setParams({}, { replace: true });
  }, [hasLink, setParams]);

  const { groups, nothing } = useMemo(() => groupAllProducts(doc, stockItems), [doc, stockItems]);

  const categorySections = useMemo(() => {
    const map = new Map<string, typeof groups>();
    for (const g of groups) {
      if (!g.item) continue;
      const key = `${g.item.category}|${g.item.heading ?? ''}`;
      map.set(key, [...(map.get(key) ?? []), g]);
    }
    const order = groupItemsForPicker(stockItems).map((x) => `${x.category}|${x.heading}`);
    const seen = new Set<string>();
    const out: { key: string; label: string; groups: typeof groups }[] = [];
    for (const key of order) {
      if (seen.has(key) || !map.has(key)) continue;
      seen.add(key);
      const gs = map.get(key)!;
      const sample = gs[0]!.item!;
      const label = sample.heading
        ? `${labelOf(CATEGORY_LABEL, sample.category)} › ${sample.heading}`
        : labelOf(CATEGORY_LABEL, sample.category);
      out.push({ key, label, groups: gs });
    }
    return out;
  }, [groups, stockItems]);

  const renderProduct = (product: (typeof groups)[0]['products'][0]) => {
    const item = product.itemId ? packs.items[product.itemId] : undefined;
    const packsTotal = sumProductPacks(doc, product.id, 'all', new Set());
    const unit = item?.unit ?? 'packs';
    const kcal = productKcalLine(product, item);
    const bc = barcodeCount(doc, product.id);
    return (
      <li className="row-item" key={product.id}>
        <button type="button" className="row-main" onClick={() => setOpenId(product.id)}>
          <strong>{product.name}</strong>
          <span className="muted">
            {productSizeLine(product)}
            {kcal ? ` · ${kcal}` : ''}
            {' · '}
            {formatPackTotal(packsTotal, unit)}
            {bc > 0 ? ` · ${bc} ${bc === 1 ? 'barcode' : 'barcodes'}` : ''}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className="screen stores">
      <h1>Your products</h1>
      <p className="muted">
        Rename, change what a product counts as, resize it, or merge duplicates. Stock and barcodes
        move when you merge.
      </p>
      {groups.length === 0 && nothing.length === 0 ? (
        <p className="muted">No products yet. Add stock from Stores.</p>
      ) : null}
      {categorySections.map((section) => (
        <section key={section.key} className="store-group" aria-label={section.label}>
          <h2>{section.label}</h2>
          <ul className="row-list">
            {section.groups.flatMap((g) => g.products.map((p) => renderProduct(p)))}
          </ul>
        </section>
      ))}
      {groups.some((g) => !g.item) ? (
        <section className="store-group" aria-label="Other products">
          <h2>Other products</h2>
          <ul className="row-list">
            {groups.filter((g) => !g.item).flatMap((g) => g.products.map((p) => renderProduct(p)))}
          </ul>
        </section>
      ) : null}
      {nothing.length > 0 ? (
        <section className="store-group" aria-label="Counts towards nothing">
          <h2>Counts towards nothing</h2>
          <ul className="row-list">{nothing.map((p) => renderProduct(p))}</ul>
        </section>
      ) : null}
      <Link className="button secondary" to="/app/stores">
        Back to Stores
      </Link>
      {openId && doc.products[openId] ? (
        <ProductSheet
          key={openId}
          productId={openId}
          onClose={() => setOpenId(null)}
          onGone={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}
