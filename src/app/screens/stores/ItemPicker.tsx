import { countsAsLine } from './countsAs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category, Item, Product } from '../../../model';
import { Field } from '../../components/controls';
import { CATEGORY_LABEL, labelOf } from '../../labels';
import { useDocument } from '../../state';
import { usePacks } from '../../usePacks';
import { EQUIPMENT_PATH, equipmentAddPath } from '../assets/route';
import { useEquipmentMatches, useStockItems } from './scanHelpers';
import { groupItemsForPicker, type ItemPickerGroup } from './pickerHelpers';
import { matchItems, readRecent, readRecentProducts } from './stock';

/** Common item ids when nothing has been added on this device yet. */
const COMMON = [
  'bottled-water',
  'baked-beans',
  'dried-pasta',
  'rice',
  'porridge-oats',
  'peanut-butter',
  'uht-milk',
  'gas-canisters',
  'propane-bottle',
  'power-bank-20k',
  'torch-aa',
  'first-aid-kit',
  'candles',
  'hygiene-kit',
  'toilet-bags',
  'aa-cells',
];

const RECENT_PRODUCTS_SHOWN = 8;
const PRODUCT_MATCHES_SHOWN = 8;

/**
 * Pick a pack item or a recent product: search, recent products, common items, then browse by
 * category and heading. Equipment matches route to the equipment form.
 */
export function ItemPicker({
  onItem,
  onProduct,
  searchLabel = 'What is it?',
  searchHint,
  showEquipmentLink = true,
  showRecentProducts = true,
  showProductMatches = true,
}: {
  onItem: (item: Item) => void;
  onProduct: (productId: string) => void;
  searchLabel?: string;
  /** A line under the search box. */
  searchHint?: string;
  showEquipmentLink?: boolean;
  /** Recent products, to reuse one for a barcode; off, the common items show instead. */
  showRecentProducts?: boolean;
  /** A search also finds the household's products by name (off where picking one does nothing). */
  showProductMatches?: boolean;
}) {
  const doc = useDocument();
  const items = useStockItems();
  const packs = usePacks();
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const recentItemIds = useMemo(() => readRecent(), []);
  const recentProductIds = useMemo(() => readRecentProducts(), []);

  const equipmentShown = useEquipmentMatches(query);
  const searching = query.trim() !== '';
  const shown = useMemo(
    () => matchItems(items, query, recentItemIds),
    [items, query, recentItemIds],
  );

  const productMatches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!showProductMatches || words.length === 0) return [];
    return Object.values(doc.products)
      .filter((p) => words.every((w) => p.name.toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, PRODUCT_MATCHES_SHOWN);
  }, [doc.products, query, showProductMatches]);

  const recentProductRows = useMemo(
    () =>
      recentProductIds
        .map((id) => {
          const product = doc.products[id];
          return product ? { id, product } : undefined;
        })
        .filter((x): x is { id: string; product: Product } => x !== undefined)
        .slice(0, RECENT_PRODUCTS_SHOWN),
    [doc.products, recentProductIds],
  );

  const common = useMemo(
    () =>
      COMMON.map((slug) => items.find((t) => t.id === `items-base:${slug}`)).filter(
        (t): t is Item => t !== undefined,
      ),
    [items],
  );

  const groups = useMemo(() => groupItemsForPicker(items), [items]);

  const categories = useMemo(() => {
    const order: Category[] = [];
    const map = new Map<Category, ItemPickerGroup[]>();
    for (const g of groups) {
      if (!map.has(g.category)) order.push(g.category);
      map.set(g.category, [...(map.get(g.category) ?? []), g]);
    }
    return order.map((category) => [category, map.get(category)!] as const);
  }, [groups]);

  const itemRow = (t: Item) => (
    <li className="row-item" key={t.id}>
      <button type="button" className="row-main" onClick={() => onItem(t)}>
        <strong>{t.name}</strong>
        <span className="muted">{countsAsLine(t.countsAs)}</span>
      </button>
    </li>
  );

  return (
    <>
      <Field label={searchLabel} hint={searchHint}>
        <input
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Water, tinned soup, torch…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      {searching ? (
        <>
          {shown.length === 0 && productMatches.length === 0 && equipmentShown.length === 0 ? (
            <p className="muted">Nothing matches “{query}”.</p>
          ) : null}
          {shown.length > 0 ? (
            <section aria-label="Items" className="recent">
              <h3>Items</h3>
              <ul className="row-list">{shown.map(itemRow)}</ul>
            </section>
          ) : null}
          {productMatches.length > 0 ? (
            <section aria-label="Your products" className="recent">
              <h3>Your products</h3>
              <ul className="row-list">
                {productMatches.map((product) => (
                  <li className="row-item" key={product.id}>
                    <button
                      type="button"
                      className="row-main"
                      onClick={() => onProduct(product.id)}
                    >
                      <strong>{product.name}</strong>
                      <span className="muted">
                        {product.itemId
                          ? (packs.items[product.itemId]?.name ?? '')
                          : 'Counts towards nothing'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <>
          {showRecentProducts && recentProductRows.length > 0 ? (
            <section aria-label="Recent products" className="recent">
              <h3>Recent products</h3>
              <ul className="row-list">
                {recentProductRows.map(({ id, product }) => (
                  <li className="row-item" key={id}>
                    <button type="button" className="row-main" onClick={() => onProduct(id)}>
                      <strong>{product.name}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section aria-label="Common" className="recent">
              <h3>Common</h3>
              <ul className="row-list">{common.map(itemRow)}</ul>
            </section>
          )}
          <details className="type-group" onToggle={(e) => setBrowsing(e.currentTarget.open)}>
            <summary>Browse everything by category</summary>
            {browsing
              ? categories.map(([category, catGroups]) => (
                  <details className="type-group" key={category}>
                    <summary>
                      {labelOf(CATEGORY_LABEL, category)} (
                      {catGroups.reduce((n, g) => n + g.items.length, 0)})
                    </summary>
                    {catGroups.map((g) => (
                      <section
                        key={`${g.category}/${g.heading}`}
                        aria-label={`${labelOf(CATEGORY_LABEL, g.category)} › ${g.heading || 'Other'}`}
                      >
                        {g.heading ? <h4 className="picker-heading">{g.heading}</h4> : null}
                        <ul className="row-list">{g.items.map(itemRow)}</ul>
                      </section>
                    ))}
                  </details>
                ))
              : null}
          </details>
          {showEquipmentLink ? (
            <Link className="row-main equipment-route" to={EQUIPMENT_PATH}>
              <strong>Equipment: add to your home</strong>
              <span className="muted">Stoves, heaters, generators, batteries and panels</span>
            </Link>
          ) : null}
        </>
      )}
      {equipmentShown.length > 0 ? (
        <section aria-label="Equipment: add to your home" className="equipment-route">
          <h3>Equipment: add to your home</h3>
          <ul className="row-list">
            {equipmentShown.map((t) => (
              <li className="row-item" key={t.id}>
                <Link className="row-main" to={equipmentAddPath(t.id)}>
                  <strong>{t.name}</strong>
                  <span className="muted">Opens the equipment form, not stock</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
