import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { coverage, gaps, score } from '../../engine';
import { today } from '../../util';
import { EditArea } from '../components/EditArea';
import { Segmented } from '../components/controls';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';
import { CAPABILITY_LABEL } from '../labels';
import type { CapabilityId } from '../../model';
import {
  buildGapsView,
  formatPrice,
  groupShoppingByAisle,
  type ShoppingRow,
  type ShoppingSort,
} from './gaps/view';
import { equipmentAddPath } from './assets/route';
import { QuickAdd, type QuickAddPrefill } from './stores/QuickAdd';

export function ShoppingScreen() {
  const doc = useDocument();
  const packs = usePacks();
  const [sort, setSort] = useState<ShoppingSort>('capability');
  const [buying, setBuying] = useState<QuickAddPrefill | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const need = params.get('need');
  const needLabel =
    need && Object.hasOwn(CAPABILITY_LABEL, need)
      ? CAPABILITY_LABEL[need as CapabilityId]
      : undefined;
  const horizonDays = doc.settings.horizonDays;
  const now = today();
  const view = useMemo(
    () =>
      buildGapsView({
        gaps: gaps(doc, packs, now, horizonDays),
        score: score(doc, packs, now, horizonDays),
        coverage: coverage(doc, packs, now, horizonDays),
        horizonDays,
        region: doc.settings.region,
        sort,
        packs,
      }),
    [doc, packs, now, horizonDays, sort],
  );
  const tick = (r: ShoppingRow) => (
    <button
      type="button"
      className="tick"
      aria-label={`Bought: ${r.label}`}
      disabled={!r.itemId && !r.assetTypeId}
      onClick={() => {
        // Equipment goes to the equipment form with its type chosen, never into stock.
        if (r.assetTypeId) navigate(equipmentAddPath(r.assetTypeId));
        else if (r.itemId) setBuying({ itemId: r.itemId, productId: r.productId, qty: r.qty });
      }}
    >
      ✓
    </button>
  );

  const rows = needLabel ? view.shopping.filter((r) => r.capability === need) : view.shopping;
  const restock = rows.filter((r) => r.kind === 'replenish');
  const buy = rows.filter((r) => r.kind === 'acquire');
  const shoppingList = (rows: ShoppingRow[]) => (
    <ul className="row-list">
      {rows.map((r) => (
        <li className="row-item" key={r.key}>
          <div className="row-main">
            <strong>{r.label}</strong>
            {r.detail ? <span className="muted">{r.detail}</span> : null}
            <span className="muted">
              {r.closes}
              {r.pricePence !== undefined ? ` · about ${formatPrice(r.pricePence)}` : ''}
            </span>
            {r.alternatives.length > 0 ? (
              <span className="muted">or {r.alternatives.join(', ')}</span>
            ) : null}
          </div>
          {tick(r)}
        </li>
      ))}
    </ul>
  );

  const aisleShoppingList = (rows: ShoppingRow[]) => (
    <>
      {groupShoppingByAisle(rows, packs).map((g) => (
        <div key={g.heading}>
          <h3>{g.heading}</h3>
          {shoppingList(g.rows)}
        </div>
      ))}
    </>
  );

  const listFor = (rows: ShoppingRow[]) =>
    sort === 'aisle' ? aisleShoppingList(rows) : shoppingList(rows);

  return (
    <section className="screen gaps">
      <p>
        <Link to="/app/gaps">← Back to gaps</Link>
      </p>
      <h1>{needLabel ? `Shopping: ${needLabel}` : 'Shopping'}</h1>
      {needLabel ? (
        <p>
          <Link to="/app/gaps/shopping">See the full shopping list</Link>
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="muted">Nothing to buy for {horizonDays} days.</p>
      ) : (
        <>
          <Segmented
            label="Sort shopping by"
            value={sort}
            options={[
              { value: 'capability' as const, label: 'Weakest first' },
              { value: 'cost' as const, label: 'Cheapest cover' },
              { value: 'aisle' as const, label: 'By aisle' },
            ]}
            onChange={setSort}
          />
          <EditArea>
            {restock.length > 0 ? (
              <>
                <h3>Back to your minimums</h3>
                {listFor(restock)}
              </>
            ) : null}
            {restock.length > 0 && buy.length > 0 ? <h3>To buy</h3> : null}
            {buy.length > 0 ? listFor(buy) : null}
          </EditArea>
        </>
      )}

      {buying ? <QuickAdd prefill={buying} onClose={() => setBuying(null)} /> : null}
    </section>
  );
}
