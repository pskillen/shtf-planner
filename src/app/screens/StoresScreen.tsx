import { NOT_SCORED_NOTE, countsAsLine } from './stores/countsAs';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { equipmentRuntime } from '../../engine';
import { minimumKey, type Asset, type Item, type Location, type Stock } from '../../model';
import { formatQty, today } from '../../util';
import { EditArea } from '../components/EditArea';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { Sheet } from '../components/Sheet';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { CATEGORY_LABEL, EXPIRY_LABEL, labelOf } from '../labels';
import { useChange, useDocument } from '../state';
import { usePacks } from '../usePacks';
import { equipmentEditPath } from './assets/route';
import { keyAnswer } from './assets/questionnaire';
import { RuntimeQuickAdd, RuntimeText } from './assets/RuntimeLines';
import { runtimeLines } from './assets/runtimeView';
import { ItemPicker } from './stores/ItemPicker';
import { PlaceWarningBox } from './stores/PlaceWarningBox';
import { MinimumSheet } from './stores/MinimumSheet';
import { QuickAdd, type QuickAddPrefill } from './stores/QuickAdd';
import { ScansToSort, ScansToSortNote } from './stores/ScansToSort';
import { StockSheet } from './stores/StockSheet';
import {
  batchesForProduct,
  formatItemMeasureTotal,
  formatPackTotal,
  itemIdsInView,
  locationName,
  minBadgesForItem,
  nothingProductIds,
  orderedItemsInView,
  productsOfItemInDoc,
  rotatingPlaces,
  stocksForItem,
  sumItemBase,
  sumProductPacks,
  totalPacksForItem,
  useFirstMap,
  worstExpiryLevel,
} from './stores/storesGrouping';
import { useScanQueue } from './stores/useScanQueue';
import { matchItems, placeWarnings } from './stores/stock';
import { groupItemsForPicker } from './stores/pickerHelpers';

/** The Stores tab: stock grouped by item, product and batch. */
export function StoresScreen() {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const todayIso = today();
  const [params, setParams] = useSearchParams();
  const stockId = params.get('stock');
  const placeId = params.get('place');
  const [lastStockId, setLastStockId] = useState(stockId);
  const [lastPlaceId, setLastPlaceId] = useState(placeId);
  const [query, setQuery] = useState('');
  const [placeFilter, setPlaceFilter] = useState<string | 'all'>(() => placeId ?? 'all');
  const activePlaceFilter =
    placeFilter !== 'all' && !doc.locations[placeFilter] ? 'all' : placeFilter;
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<ReadonlySet<string>>(new Set());
  const [openItems, setOpenItems] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<QuickAddPrefill | null>(null);
  const [editing, setEditing] = useState<Stock | null>(() => doc.stock[stockId ?? ''] ?? null);
  // Keep local changes until the corresponding URL destination actually changes.
  if (stockId !== lastStockId) {
    setLastStockId(stockId);
    setEditing(doc.stock[stockId ?? ''] ?? null);
  }
  if (placeId !== lastPlaceId) {
    setLastPlaceId(placeId);
    setPlaceFilter(placeId ?? 'all');
  }
  if (editing && !doc.stock[editing.id]) setEditing(null);
  const [minimumItem, setMinimumItem] = useState<Item | null>(null);
  const [pickMinimumItem, setPickMinimumItem] = useState(false);
  const [sorting, setSorting] = useState(false);
  useScanQueue();
  const closeEditing = () => {
    setEditing(null);
    if (params.has('stock')) {
      const next = new URLSearchParams(params);
      next.delete('stock');
      setParams(next, { replace: true });
    }
  };

  const remove = useDeferredDelete((id) =>
    change('delete stock', (d) => {
      delete d.stock[id];
    }),
  );

  const q = query.trim();
  const packItems = useMemo(() => Object.values(packs.items), [packs.items]);
  const matchedItemIds = useMemo(() => {
    if (q === '') return undefined;
    return new Set(matchItems(packItems, q).map((t) => t.id));
  }, [packItems, q]);

  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const knownIds = new Set(locations.map((l) => l.id));
  const useFirst = useFirstMap(doc, packs, todayIso);
  const rotating = rotatingPlaces(doc);

  const matchesPlaceName = (loc: Location): boolean =>
    q === '' || loc.name.toLowerCase().includes(q.toLowerCase());

  const matchesItem = (item: Item): boolean => {
    if (q === '') return true;
    if (item.name.toLowerCase().includes(q.toLowerCase())) return true;
    if (item.countsAs.toLowerCase().includes(q.toLowerCase())) return true;
    if (matchedItemIds!.has(item.id)) return true;
    for (const p of productsOfItemInDoc(doc, item.id, activePlaceFilter, remove.pending)) {
      if (p.name.toLowerCase().includes(q.toLowerCase())) return true;
    }
    for (const loc of locations) {
      if (!loc.name.toLowerCase().includes(q.toLowerCase())) continue;
      if (totalPacksForItem(doc, item.id, loc.id, remove.pending) > 0) return true;
      if (doc.minimums[minimumKey(loc.id, item.id)] !== undefined) return true;
    }
    return false;
  };

  const matchesProduct = (product: { name: string; itemId?: string }): boolean => {
    if (q === '') return true;
    if (product.name.toLowerCase().includes(q.toLowerCase())) return true;
    return product.itemId ? matchedItemIds!.has(product.itemId) : false;
  };

  const placeMatchesSearch =
    q === '' ||
    activePlaceFilter === 'all' ||
    (doc.locations[activePlaceFilter] !== undefined &&
      matchesPlaceName(doc.locations[activePlaceFilter]!));

  const itemIds = useMemo(() => itemIdsInView(doc, activePlaceFilter), [doc, activePlaceFilter]);
  const categoriesInView = useMemo(() => {
    const present = new Set([...itemIds].map((id) => packs.items[id]?.category));
    return [...new Set(packItems.map((i) => i.category))].filter((c) => present.has(c));
  }, [itemIds, packs.items, packItems]);
  const activeCategoryFilter = categoriesInView.includes(categoryFilter as never)
    ? categoryFilter
    : 'all';
  const needsAttention = (item: Item): boolean => {
    const level = worstExpiryLevel(
      stocksForItem(doc, item.id, activePlaceFilter, remove.pending),
      todayIso,
      doc.settings,
    );
    return level !== undefined && level !== 'ok';
  };
  const orderedItems = orderedItemsInView(packs, itemIds)
    .filter(matchesItem)
    .filter((i) => activeCategoryFilter === 'all' || i.category === activeCategoryFilter)
    .filter((i) => !attentionOnly || needsAttention(i));
  // A category or "needs attention" filter is about food and kit by item: the sections below
  // that are not items (not scored, equipment, unknown place) step aside.
  const itemFiltered = activeCategoryFilter !== 'all' || attentionOnly;
  const nothingIds = itemFiltered
    ? []
    : nothingProductIds(doc, activePlaceFilter, remove.pending).filter((id) =>
        matchesProduct(doc.products[id]!),
      );

  const categoryGroups = useMemo(() => {
    return groupItemsForPicker(packItems)
      .map((g) => ({
        key: `${g.category}|${g.heading}`,
        label: g.heading
          ? `${labelOf(CATEGORY_LABEL, g.category)} › ${g.heading}`
          : labelOf(CATEGORY_LABEL, g.category),
        items: g.items.filter((i) => orderedItems.some((v) => v.id === i.id)),
      }))
      .filter((g) => g.items.length > 0);
  }, [orderedItems, packItems]);

  const warnings = placeWarnings(
    doc,
    packs,
    (s) =>
      !remove.pending.has(s.id) &&
      (activePlaceFilter === 'all' || s.locationId === activePlaceFilter) &&
      matchesProduct(doc.products[s.productId] ?? { name: s.productId }),
  );

  const equipmentMatches = (a: Asset): boolean => {
    if (q === '') return true;
    const type = packs.assets[a.typeId];
    return [a.name ?? '', type?.name ?? ''].some((n) => n.toLowerCase().includes(q.toLowerCase()));
  };

  const equipmentLines = useMemo(
    () => runtimeLines(equipmentRuntime(doc, packs, today()), doc, packs),
    [doc, packs],
  );

  const equipmentRows = Object.values(doc.assets)
    .filter((a) => {
      if (itemFiltered) return false;
      if (!equipmentMatches(a)) return false;
      if (activePlaceFilter !== 'all') {
        return a.locationId === activePlaceFilter;
      }
      return true;
    })
    .sort((a, b) => (a.name ?? a.typeId).localeCompare(b.name ?? b.typeId));

  const lost = Object.values(doc.stock).filter((s) => {
    if (knownIds.has(s.locationId)) return false;
    if (remove.pending.has(s.id)) return false;
    if (activePlaceFilter !== 'all' || itemFiltered) return false;
    return matchesProduct(doc.products[s.productId] ?? { name: s.productId });
  });

  const filterLocation = activePlaceFilter === 'all' ? undefined : doc.locations[activePlaceFilter];

  const toggleCat = (key: string) =>
    setCollapsedCats((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const toggleItem = (itemId: string) =>
    setOpenItems((cur) => {
      const next = new Set(cur);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });

  const itemOpen = (itemId: string): boolean =>
    q !== '' || openItems.has(itemId) || (matchedItemIds?.has(itemId) ?? false);

  const haveByPlaceForItem = (itemId: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const loc of rotating) {
      out[loc.id] = totalPacksForItem(doc, itemId, loc.id, remove.pending);
    }
    return out;
  };

  const renderEquipment = (asset: Asset) => {
    const type = packs.assets[asset.typeId];
    const name = asset.name || type?.name || asset.typeId;
    const detail = [
      asset.locationId ? locationName(doc, asset.locationId) : 'No place',
      asset.name && type ? type.name : undefined,
      type ? keyAnswer(type, asset.answers) : undefined,
    ].filter(Boolean);
    const lines = equipmentLines.get(asset.id) ?? [];
    return (
      <li
        className={lines.some((l) => l.quickAdd) ? 'row-item row-item-wrap' : 'row-item'}
        key={asset.id}
      >
        <Link
          className="row-main"
          to={equipmentEditPath(asset.id)}
          aria-label={`Edit equipment ${name}`}
        >
          <strong>
            {name} <span className="badge">Equipment</span>
          </strong>
          <span className="muted">{detail.join(' · ')}</span>
          <RuntimeText lines={lines} />
        </Link>
        <RuntimeQuickAdd lines={lines} onQuickAdd={setAdding} />
      </li>
    );
  };

  const renderBatch = (stock: Stock) => {
    const product = doc.products[stock.productId];
    const where = locationName(doc, stock.locationId);
    const first =
      product?.itemId && useFirst.get(product.itemId) === stock.id ? (
        <strong className="use-first">Use first</strong>
      ) : null;
    return (
      <li className="row-item" key={stock.id}>
        <button
          type="button"
          className="row-main"
          aria-label={`Edit ${formatQty(stock.qty)} ${product?.name ?? stock.productId} in ${where}`}
          onClick={() => setEditing(stock)}
        >
          <strong>
            {formatQty(stock.qty)} · {where}
          </strong>
          <span className="muted">
            {stock.bestBefore ? <ExpiryBadge bestBefore={stock.bestBefore} showMonth /> : 'No date'}
            {first ? <> · {first}</> : null}
          </span>
        </button>
      </li>
    );
  };

  const renderItemPanel = (item: Item) => {
    const products = productsOfItemInDoc(doc, item.id, activePlaceFilter, remove.pending).filter(
      matchesProduct,
    );
    return (
      <div className="item-panel">
        <p className="muted counts-as">{countsAsLine(item.countsAs)}</p>
        <ul className="row-list">
          {products.map((product) => {
            const packsTotal = sumProductPacks(doc, product.id, activePlaceFilter, remove.pending);
            const batches = batchesForProduct(doc, product.id, activePlaceFilter, remove.pending);
            return (
              <li key={product.id}>
                <div className="row-item">
                  <Link
                    className="row-main"
                    to={`/app/stores/products?open=${product.id}`}
                    aria-label={`Product list: ${product.name}`}
                  >
                    <span className="muted product-tag">Product</span>
                    <strong>
                      {product.name} · {formatPackTotal(packsTotal, item.unit)} ›
                    </strong>
                  </Link>
                </div>
                <ul className="row-list batch-list">{batches.map((s) => renderBatch(s))}</ul>
              </li>
            );
          })}
        </ul>
        <EditArea>
          <button type="button" className="link" onClick={() => setMinimumItem(item)}>
            Set minimum
          </button>
        </EditArea>
      </div>
    );
  };

  const renderItemRow = (item: Item) => {
    const packsTotal = totalPacksForItem(doc, item.id, activePlaceFilter, remove.pending);
    const base = sumItemBase(doc, item.id, activePlaceFilter, remove.pending);
    const measure = formatItemMeasureTotal(item.measure, base);
    const mins = minBadgesForItem(doc, item.id);
    const stocks = stocksForItem(doc, item.id, activePlaceFilter, remove.pending);
    const worstLevel = worstExpiryLevel(stocks, todayIso, doc.settings);
    const expiryWord = worstLevel && worstLevel !== 'ok' ? EXPIRY_LABEL[worstLevel] : undefined;
    const open = itemOpen(item.id);
    return (
      <li className="row-item row-item-stack" key={item.id}>
        <button
          type="button"
          className="row-main"
          aria-expanded={open}
          onClick={() => toggleItem(item.id)}
        >
          <strong>
            {item.name} · {formatPackTotal(packsTotal, item.unit)} · {measure}
            {mins.map((m) => (
              <span className="badge" key={m.locationId}>
                min {m.min} in {m.name}
              </span>
            ))}
            {expiryWord ? <span className={`badge bb bb-${worstLevel}`}>{expiryWord}</span> : null}
          </strong>
        </button>
        {open ? renderItemPanel(item) : null}
      </li>
    );
  };

  const empty =
    Object.keys(doc.stock).length === 0 &&
    Object.keys(doc.minimums).length === 0 &&
    Object.keys(doc.assets).length === 0;

  const showGroups =
    (q === '' && !itemFiltered) ||
    orderedItems.length > 0 ||
    nothingIds.length > 0 ||
    equipmentRows.length > 0 ||
    lost.length > 0;

  return (
    <section className="screen stores">
      <h1>Stores</h1>
      {filterLocation ? <p>Place: {filterLocation.name}</p> : null}
      <ScansToSortNote onOpen={() => setSorting(true)} />
      <div className="stores-actions">
        <Link className="button secondary" to="/app/stores/stocktake">
          Stocktake
        </Link>
      </div>
      {empty ? (
        <p className="muted">Nothing in stock yet. Tap + to add what you have.</p>
      ) : (
        <>
          <div className="field">
            <input
              type="search"
              aria-label="Search stock"
              placeholder="Search your stock"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {locations.length > 0 ? (
            <FieldLike label="Place filter">
              <select
                aria-label="Place filter"
                value={activePlaceFilter}
                onChange={(e) => setPlaceFilter(e.target.value === 'all' ? 'all' : e.target.value)}
              >
                <option value="all">All places</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FieldLike>
          ) : null}
          <div className="stores-filters">
            <FieldLike label="Category">
              <select
                aria-label="Category filter"
                value={activeCategoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {categoriesInView.map((c) => (
                  <option key={c} value={c}>
                    {labelOf(CATEGORY_LABEL, c)}
                  </option>
                ))}
              </select>
            </FieldLike>
            <label className="check-row">
              <input
                type="checkbox"
                checked={attentionOnly}
                onChange={(e) => setAttentionOnly(e.target.checked)}
              />
              <span>Only what needs attention (expiring or past date)</span>
            </label>
            {categoryGroups.length > 1 ? (
              <button
                type="button"
                className="link"
                onClick={() =>
                  setCollapsedCats(
                    collapsedCats.size >= categoryGroups.length
                      ? new Set()
                      : new Set(categoryGroups.map((g) => g.key)),
                  )
                }
              >
                {collapsedCats.size >= categoryGroups.length
                  ? 'Expand all groups'
                  : 'Collapse all groups'}
              </button>
            ) : null}
          </div>
        </>
      )}

      {filterLocation?.kind === 'rotating' && placeMatchesSearch ? (
        <div className="note rotating-note">
          This place rotates: the minimum counts, not today’s stock.{' '}
          <EditArea>
            <button type="button" className="link" onClick={() => setPickMinimumItem(true)}>
              Set a minimum
            </button>
          </EditArea>
        </div>
      ) : null}

      {locations.length === 0 && !empty ? (
        <p className="note">Some stock is not in any place. Add places under Home → Locations.</p>
      ) : null}

      {warnings.map((w) => (
        <PlaceWarningBox key={w.locationId} warning={w} />
      ))}

      {!showGroups && (q !== '' || itemFiltered) ? (
        <p className="muted">No stock matches your search or filters.</p>
      ) : null}

      {categoryGroups.map((g) => {
        const open = q !== '' || !collapsedCats.has(g.key);
        return (
          <section key={g.key} className="store-group" aria-label={g.label}>
            <h2>
              <button
                type="button"
                className="group-toggle"
                aria-expanded={open}
                onClick={() => toggleCat(g.key)}
              >
                <span aria-hidden="true">{open ? '▾' : '▸'}</span> {g.label}{' '}
                <span className="muted">({g.items.length})</span>
              </button>
            </h2>
            {open ? (
              <ul className="row-list">{g.items.map((item) => renderItemRow(item))}</ul>
            ) : null}
          </section>
        );
      })}

      {nothingIds.length > 0 ? (
        <section className="store-group" aria-label="Not scored yet">
          <h2>Not scored yet</h2>
          <p className="muted">{NOT_SCORED_NOTE}</p>
          <ul className="row-list">
            {nothingIds.map((productId) => {
              const product = doc.products[productId]!;
              const batches = batchesForProduct(doc, productId, activePlaceFilter, remove.pending);
              const packsTotal = sumProductPacks(doc, productId, activePlaceFilter, remove.pending);
              return (
                <li key={productId}>
                  <div className="row-item">
                    <strong>
                      {product.name} · {formatPackTotal(packsTotal, 'pack')}
                    </strong>
                  </div>
                  <ul className="row-list batch-list">{batches.map((s) => renderBatch(s))}</ul>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {equipmentRows.length > 0 ? (
        <section className="store-group" aria-label="Equipment">
          <h2>Equipment</h2>
          <ul className="row-list">{equipmentRows.map((a) => renderEquipment(a))}</ul>
        </section>
      ) : null}

      {lost.length > 0 ? (
        <section className="store-group" aria-label="Unknown place">
          <h2>Unknown place</h2>
          <ul className="row-list">{lost.map((s) => renderBatch(s))}</ul>
        </section>
      ) : null}

      <p className="note">
        <Link to="/app/stores/products">Your products</Link>
        {' — rename, merge duplicates, or change what they count as.'}
      </p>

      <EditArea>
        <button type="button" className="fab" aria-label="Add stock" onClick={() => setAdding({})}>
          +
        </button>
      </EditArea>

      {adding ? <QuickAdd prefill={adding} onClose={() => setAdding(null)} /> : null}
      {sorting ? <ScansToSort onClose={() => setSorting(false)} /> : null}
      {pickMinimumItem ? (
        <Sheet title="Set a minimum" onClose={() => setPickMinimumItem(false)}>
          <ItemPicker
            searchLabel="Which item?"
            onItem={(item) => {
              setPickMinimumItem(false);
              setMinimumItem(item);
            }}
            onProduct={() => undefined}
            showEquipmentLink={false}
          />
        </Sheet>
      ) : null}
      {editing ? (
        <StockSheet
          key={editing.id}
          initial={editing}
          product={doc.products[editing.productId]}
          item={
            doc.products[editing.productId]?.itemId
              ? packs.items[doc.products[editing.productId]!.itemId!]
              : undefined
          }
          onSave={(row) => {
            change('edit stock', (d) => {
              if (d.stock[row.id]) d.stock[row.id] = row;
            });
            closeEditing();
          }}
          onDelete={() => {
            const product = doc.products[editing.productId];
            remove.request(editing.id, product?.name ?? editing.productId);
            closeEditing();
          }}
          onClose={closeEditing}
        />
      ) : null}
      {minimumItem ? (
        <MinimumSheet
          key={minimumItem.id}
          item={minimumItem}
          locations={rotating}
          haveByPlace={haveByPlaceForItem(minimumItem.id)}
          minimums={doc.minimums}
          onSave={(levels) => {
            change('set minimums', (d) => {
              for (const [locId, n] of Object.entries(levels)) {
                const key = minimumKey(locId, minimumItem.id);
                if (n > 0) d.minimums[key] = n;
                else delete d.minimums[key];
              }
            });
            setMinimumItem(null);
          }}
          onClose={() => setMinimumItem(null)}
        />
      ) : null}
      {remove.toast}
    </section>
  );
}

function FieldLike({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        {children}
      </label>
    </div>
  );
}
