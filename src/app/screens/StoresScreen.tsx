import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { minimumKey, type Asset, type Location, type Product, type Stock } from '../../model';
import { EditArea } from '../components/EditArea';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { useChange, useDocument } from '../state';
import { usePacks } from '../usePacks';
import { equipmentEditPath } from './assets/route';
import { keyAnswer } from './assets/questionnaire';
import { MinimumSheet, type MinimumRow } from './stores/MinimumSheet';
import { QuickAdd } from './stores/QuickAdd';
import { ScansToSort, ScansToSortNote } from './stores/ScansToSort';
import { StockSheet } from './stores/StockSheet';
import { useScanQueue } from './stores/useScanQueue';
import { matchItems, suitabilityWarning } from './stores/stock';

/** One line of the list: a stock batch, or a minimum with nothing on the shelf (`stock` unset). */
interface Row {
  key: string;
  stock?: Stock;
  product?: Product;
  itemId?: string;
  qty: number;
  /** Product name for a batch; item name for a minimum-only row. */
  name: string;
}

/** The Stores tab: everything in stock, grouped by where it is kept. */
export function StoresScreen() {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [minimumLocationId, setMinimumLocationId] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  useScanQueue();

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

  const matchesProduct = (product: Product | undefined): boolean => {
    if (q === '') return true;
    if (!product) return false;
    if (product.name.toLowerCase().includes(q.toLowerCase())) return true;
    return product.itemId ? matchedItemIds!.has(product.itemId) : false;
  };

  const matchesItemId = (itemId: string): boolean => {
    if (q === '') return true;
    if (matchedItemIds!.has(itemId)) return true;
    const item = packs.items[itemId];
    return item
      ? item.name.toLowerCase().includes(q.toLowerCase())
      : itemId.toLowerCase().includes(q.toLowerCase());
  };

  /** The rows of one place: its stock batches, and for a rotating place a row per minimum with none. */
  const rowsFor = (location: Location): Row[] => {
    const rows: Row[] = Object.values(doc.stock)
      .filter((s) => s.locationId === location.id && !remove.pending.has(s.id))
      .map((s) => {
        const product = doc.products[s.productId];
        return {
          key: s.id,
          stock: s,
          product,
          itemId: product?.itemId,
          qty: s.qty,
          name: product?.name ?? s.productId,
        };
      });
    if (location.kind === 'rotating') {
      const have = new Set(
        rows.map((r) => r.itemId).filter((id): id is string => id !== undefined),
      );
      for (const key of Object.keys(doc.minimums)) {
        const [locId, itemId] = key.split('|') as [string, string];
        if (locId === location.id && !have.has(itemId)) {
          const item = packs.items[itemId];
          rows.push({
            key,
            itemId,
            qty: 0,
            name: item?.name ?? itemId.split(':')[1] ?? itemId,
          });
          have.add(itemId);
        }
      }
    }
    return rows
      .filter((r) => (r.stock ? matchesProduct(r.product) : matchesItemId(r.itemId!)))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const equipmentMatches = (a: Asset): boolean => {
    if (q === '') return true;
    const type = packs.assets[a.typeId];
    return [a.name ?? '', type?.name ?? ''].some((n) => n.toLowerCase().includes(q.toLowerCase()));
  };

  /** The equipment kept in a place, shown read-only: it is edited on the Equipment screen. */
  const equipmentFor = (location: Location): Asset[] =>
    Object.values(doc.assets)
      .filter((a) => a.locationId === location.id)
      .filter(equipmentMatches)
      .sort((a, b) => (a.name ?? a.typeId).localeCompare(b.name ?? b.typeId));

  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const knownIds = new Set(locations.map((l) => l.id));
  const lost = Object.values(doc.stock).filter(
    (s) =>
      !knownIds.has(s.locationId) &&
      !remove.pending.has(s.id) &&
      matchesProduct(doc.products[s.productId]),
  );

  // Equipment with no place, or whose place has gone, so the two screens never hide each other.
  const unplaced = Object.values(doc.assets)
    .filter((a) => !a.locationId || !knownIds.has(a.locationId))
    .filter((a) => equipmentMatches(a))
    .sort((a, b) => (a.name ?? a.typeId).localeCompare(b.name ?? b.typeId));

  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  function renderRow(row: Row, location: Location | undefined) {
    const item = row.itemId ? packs.items[row.itemId] : undefined;
    const min =
      location && row.itemId ? doc.minimums[minimumKey(location.id, row.itemId)] : undefined;
    const warning = item && location ? suitabilityWarning(item, location) : undefined;
    return (
      <li className="row-item" key={row.key}>
        <button
          type="button"
          className="row-main"
          aria-label={`${row.stock ? 'Edit' : 'Set minimum for'} ${row.name}`}
          onClick={() =>
            row.stock ? setEditing(row.stock) : location && setMinimumLocationId(location.id)
          }
        >
          <strong>
            {row.name} {min !== undefined ? <span className="badge">min {min}</span> : null}
          </strong>
          <span className="muted">
            {row.qty} × {item?.unit ?? 'packs'}
            {row.stock?.bestBefore ? (
              <>
                {' · '}
                <ExpiryBadge bestBefore={row.stock.bestBefore} showMonth />
              </>
            ) : null}
          </span>
          {warning ? <span className="warn">⚠ {warning}</span> : null}
        </button>
      </li>
    );
  }

  function renderEquipment(asset: Asset) {
    const type = packs.assets[asset.typeId];
    const name = asset.name || type?.name || asset.typeId;
    const detail = [
      asset.name && type ? type.name : undefined,
      type ? keyAnswer(type, asset.answers) : undefined,
    ].filter(Boolean);
    return (
      <li className="row-item" key={asset.id}>
        <Link
          className="row-main"
          to={equipmentEditPath(asset.id)}
          aria-label={`Edit equipment ${name}`}
        >
          <strong>
            {name} <span className="badge">Equipment</span>
          </strong>
          <span className="muted">{detail.length > 0 ? detail.join(' · ') : 'Equipment'}</span>
        </Link>
      </li>
    );
  }

  const minimumLocation = minimumLocationId ? doc.locations[minimumLocationId] : undefined;
  const minimumRows: MinimumRow[] = minimumLocation
    ? (() => {
        const ids = new Set<string>();
        for (const s of Object.values(doc.stock)) {
          if (s.locationId === minimumLocation.id) {
            const itemId = doc.products[s.productId]?.itemId;
            if (itemId) ids.add(itemId);
          }
        }
        for (const key of Object.keys(doc.minimums)) {
          const [locId, itemId] = key.split('|') as [string, string];
          if (locId === minimumLocation.id) ids.add(itemId);
        }
        return [...ids]
          .map((itemId) => ({
            itemId,
            name: packs.items[itemId]?.name ?? itemId.split(':')[1] ?? itemId,
            unit: packs.items[itemId]?.unit ?? 'packs',
            have: Object.values(doc.stock)
              .filter(
                (s) =>
                  s.locationId === minimumLocation.id &&
                  doc.products[s.productId]?.itemId === itemId,
              )
              .reduce((n, s) => n + s.qty, 0),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      })()
    : [];

  const empty = Object.keys(doc.stock).length === 0 && Object.keys(doc.minimums).length === 0;

  return (
    <section className="screen stores">
      <h1>Stores</h1>
      <ScansToSortNote onOpen={() => setSorting(true)} />
      <div className="stores-actions">
        <Link className="button secondary" to="/app/stores/stocktake">
          Stocktake
        </Link>
      </div>
      {empty ? (
        <p className="muted">Nothing in stock yet. Tap + to add what you have.</p>
      ) : (
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
      )}
      {locations.length === 0 && !empty ? (
        <p className="note">Some stock is not in any place. Add places under Home → Locations.</p>
      ) : null}

      {locations.map((l) => {
        const rows = rowsFor(l);
        const equipment = equipmentFor(l);
        if (q !== '' && rows.length === 0 && equipment.length === 0) return null;
        const open = q !== '' || !collapsed.has(l.id);
        return (
          <section key={l.id} className="store-group" aria-label={l.name}>
            <h2>
              <button
                type="button"
                className="group-toggle"
                aria-expanded={open}
                onClick={() => toggle(l.id)}
              >
                <span aria-hidden="true">{open ? '▾' : '▸'}</span> {l.name}{' '}
                <span className="muted">({rows.length + equipment.length})</span>
              </button>
            </h2>
            {open ? (
              <>
                {l.kind === 'rotating' ? (
                  <div className="note rotating-note">
                    This place rotates: the minimum counts, not today’s stock.{' '}
                    <EditArea>
                      <button
                        type="button"
                        className="link"
                        onClick={() => setMinimumLocationId(l.id)}
                      >
                        Set minimums
                      </button>
                    </EditArea>
                  </div>
                ) : null}
                {rows.length === 0 && equipment.length === 0 ? (
                  <p className="muted">Nothing here yet.</p>
                ) : null}
                {rows.length > 0 ? (
                  <ul className="row-list">{rows.map((r) => renderRow(r, l))}</ul>
                ) : null}
                {equipment.length > 0 ? (
                  <ul className="row-list" aria-label={`Equipment in ${l.name}`}>
                    {equipment.map((a) => renderEquipment(a))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </section>
        );
      })}

      {unplaced.length > 0 ? (
        <section className="store-group" aria-label="Equipment, no place">
          <h2>Equipment, no place</h2>
          <ul className="row-list">{unplaced.map((a) => renderEquipment(a))}</ul>
        </section>
      ) : null}

      {lost.length > 0 ? (
        <section className="store-group" aria-label="Unknown place">
          <h2>Unknown place</h2>
          <ul className="row-list">
            {lost.map((s) => {
              const product = doc.products[s.productId];
              return renderRow(
                {
                  key: s.id,
                  stock: s,
                  product,
                  itemId: product?.itemId,
                  qty: s.qty,
                  name: product?.name ?? s.productId,
                },
                undefined,
              );
            })}
          </ul>
        </section>
      ) : null}

      <EditArea>
        <button
          type="button"
          className="fab"
          aria-label="Add stock"
          onClick={() => setAdding(true)}
        >
          +
        </button>
      </EditArea>

      {adding ? <QuickAdd onClose={() => setAdding(false)} /> : null}
      {sorting ? <ScansToSort onClose={() => setSorting(false)} /> : null}
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
              d.stock[row.id] = row;
            });
            setEditing(null);
          }}
          onDelete={() => {
            const product = doc.products[editing.productId];
            remove.request(editing.id, product?.name ?? editing.productId);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {minimumLocation ? (
        <MinimumSheet
          key={minimumLocation.id}
          location={minimumLocation}
          rows={minimumRows}
          minimums={doc.minimums}
          onSave={(levels) => {
            change('set minimums', (d) => {
              for (const [itemId, n] of Object.entries(levels)) {
                const key = minimumKey(minimumLocation.id, itemId);
                if (n > 0) d.minimums[key] = n;
                else delete d.minimums[key];
              }
            });
            setMinimumLocationId(null);
          }}
          onClose={() => setMinimumLocationId(null)}
        />
      ) : null}
      {remove.toast}
    </section>
  );
}
