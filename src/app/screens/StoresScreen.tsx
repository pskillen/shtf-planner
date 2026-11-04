import { useMemo, useState } from 'react';
import { floorKey, type ItemInstance, type ItemType, type Location } from '../../model';
import { today } from '../../util';
import { EditArea } from '../components/EditArea';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { useChange, useDocument } from '../state';
import { usePacks } from '../usePacks';
import { FloorSheet, type FloorRow } from './stores/FloorSheet';
import { ItemSheet } from './stores/ItemSheet';
import { formatMonth, matchTypes, monthTone, suitabilityWarning } from './stores/stock';

/** One line of the list: a stock entry, or a floor with nothing on the shelf (`item` unset). */
interface Row {
  key: string;
  typeId: string;
  item?: ItemInstance;
  qty: number;
}

const typeName = (type: ItemType | undefined, typeId: string): string =>
  type?.name ?? typeId.split(':')[1] ?? typeId;

/** The Stores tab: everything in stock, grouped by where it is kept. */
export function StoresScreen() {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<ItemInstance | null>(null);
  const [flooring, setFlooring] = useState<string | null>(null);
  const now = today();

  const remove = useDeferredDelete((id) =>
    change('delete stock', (d) => {
      delete d.items[id];
    }),
  );

  const q = query.trim();
  const matches = (typeId: string): boolean => {
    if (q === '') return true;
    const type = packs.items[typeId];
    return type ? matchTypes([type], q).length > 0 : typeName(type, typeId).includes(q);
  };

  /** The rows of one place: its stock, and for a rotating place a row per floor with none. */
  const rowsFor = (location: Location): Row[] => {
    const rows: Row[] = Object.values(doc.items)
      .filter((i) => i.locationId === location.id && !remove.pending.has(i.id))
      .map((i) => ({ key: i.id, typeId: i.typeId, item: i, qty: i.qty }));
    if (location.kind === 'rotating') {
      const have = new Set(rows.map((r) => r.typeId));
      for (const key of Object.keys(doc.floors)) {
        const [locId, typeId] = key.split('|') as [string, string];
        if (locId === location.id && !have.has(typeId)) {
          rows.push({ key, typeId, qty: 0 });
          have.add(typeId);
        }
      }
    }
    return rows
      .filter((r) => matches(r.typeId))
      .sort((a, b) =>
        typeName(packs.items[a.typeId], a.typeId).localeCompare(
          typeName(packs.items[b.typeId], b.typeId),
        ),
      );
  };

  const locations = useMemo(
    () => Object.values(doc.locations).sort((a, b) => a.name.localeCompare(b.name)),
    [doc.locations],
  );
  const knownIds = new Set(locations.map((l) => l.id));
  const lost = Object.values(doc.items).filter(
    (i) => !knownIds.has(i.locationId) && !remove.pending.has(i.id) && matches(i.typeId),
  );

  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  function renderRow(row: Row, location: Location | undefined) {
    const type = packs.items[row.typeId];
    const name = typeName(type, row.typeId);
    const floor = location ? doc.floors[floorKey(location.id, row.typeId)] : undefined;
    const warning = type && location ? suitabilityWarning(type, location) : undefined;
    const tone = row.item?.bestBefore ? monthTone(row.item.bestBefore, now) : undefined;
    return (
      <li className="row-item" key={row.key}>
        <button
          type="button"
          className="row-main"
          aria-label={`${row.item ? 'Edit' : 'Set floor for'} ${name}`}
          onClick={() => (row.item ? setEditing(row.item) : location && setFlooring(location.id))}
        >
          <strong>
            {name} {floor !== undefined ? <span className="badge">floor {floor}</span> : null}
          </strong>
          <span className="muted">
            {row.qty} × {type?.unit ?? 'each'}
            {row.item?.bestBefore ? (
              <>
                {' · '}
                <span className={`bb bb-${tone}`}>{formatMonth(row.item.bestBefore)}</span>
                {tone === 'past' ? ' (past)' : ''}
              </>
            ) : null}
          </span>
          {warning ? <span className="warn">⚠ {warning}</span> : null}
        </button>
      </li>
    );
  }

  const flooringLocation = flooring ? doc.locations[flooring] : undefined;
  const floorRows: FloorRow[] = flooringLocation
    ? (() => {
        const ids = new Set<string>();
        for (const i of Object.values(doc.items))
          if (i.locationId === flooringLocation.id) ids.add(i.typeId);
        for (const key of Object.keys(doc.floors)) {
          const [locId, typeId] = key.split('|') as [string, string];
          if (locId === flooringLocation.id) ids.add(typeId);
        }
        return [...ids]
          .map((typeId) => ({
            typeId,
            name: typeName(packs.items[typeId], typeId),
            unit: packs.items[typeId]?.unit ?? 'each',
            have: Object.values(doc.items)
              .filter((i) => i.locationId === flooringLocation.id && i.typeId === typeId)
              .reduce((n, i) => n + i.qty, 0),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      })()
    : [];

  const empty = Object.keys(doc.items).length === 0 && Object.keys(doc.floors).length === 0;

  return (
    <section className="screen stores">
      <h1>Stores</h1>
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
        if (q !== '' && rows.length === 0) return null;
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
                <span className="muted">({rows.length})</span>
              </button>
            </h2>
            {open ? (
              <>
                {l.kind === 'rotating' ? (
                  <p className="note rotating-note">
                    This place rotates: the floor counts, not today’s stock.{' '}
                    <EditArea>
                      <button type="button" className="link" onClick={() => setFlooring(l.id)}>
                        Set floors
                      </button>
                    </EditArea>
                  </p>
                ) : null}
                {rows.length === 0 ? (
                  <p className="muted">Nothing here yet.</p>
                ) : (
                  <ul className="row-list">{rows.map((r) => renderRow(r, l))}</ul>
                )}
              </>
            ) : null}
          </section>
        );
      })}

      {lost.length > 0 ? (
        <section className="store-group" aria-label="Unknown place">
          <h2>Unknown place</h2>
          <ul className="row-list">
            {lost.map((i) =>
              renderRow({ key: i.id, typeId: i.typeId, item: i, qty: i.qty }, undefined),
            )}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <ItemSheet
          key={editing.id}
          initial={editing}
          type={packs.items[editing.typeId]}
          onSave={(item) => {
            change('edit stock', (d) => {
              d.items[item.id] = item;
            });
            setEditing(null);
          }}
          onDelete={() => {
            remove.request(editing.id, typeName(packs.items[editing.typeId], editing.typeId));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {flooringLocation ? (
        <FloorSheet
          key={flooringLocation.id}
          location={flooringLocation}
          rows={floorRows}
          floors={doc.floors}
          onSave={(levels) => {
            change('set floors', (d) => {
              for (const [typeId, n] of Object.entries(levels)) {
                const key = floorKey(flooringLocation.id, typeId);
                if (n > 0) d.floors[key] = n;
                else delete d.floors[key];
              }
            });
            setFlooring(null);
          }}
          onClose={() => setFlooring(null)}
        />
      ) : null}
      {remove.toast}
    </section>
  );
}
