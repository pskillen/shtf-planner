import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, coverage, gaps, score } from '../../engine';
import { today } from '../../util';
import { EditArea } from '../components/EditArea';
import { Segmented } from '../components/controls';
import { CAPABILITY_LABEL } from '../labels';
import { useChange, useDocument } from '../state';
import { usePacks } from '../usePacks';
import { buildGapsView, formatPrice, type ShoppingRow, type ShoppingSort } from './gaps/view';
import { QuickAdd, type QuickAddPrefill } from './stores/QuickAdd';

/**
 * The Gaps tab: what to buy and what to do, from the engine's gaps for the chosen horizon, and
 * what is already enough. Ticking a shopping row opens Quick add filled in with that item.
 */
export function GapsScreen() {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const [sort, setSort] = useState<ShoppingSort>('capability');
  const [buying, setBuying] = useState<QuickAddPrefill | null>(null);
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
      }),
    [doc, packs, now, horizonDays, sort],
  );

  function markDone(planItemId: string): void {
    const months = packs.plans[planItemId]?.expiresMonths;
    change('plan done', (d) => {
      d.plans[planItemId] = {
        ...d.plans[planItemId],
        doneAt: now,
        ...(months ? { expires: addMonths(now, months) } : {}),
      };
    });
  }

  const tick = (r: ShoppingRow) => (
    <button
      type="button"
      className="tick"
      aria-label={`Bought: ${r.label}`}
      disabled={!r.itemTypeId}
      onClick={() => r.itemTypeId && setBuying({ typeId: r.itemTypeId, qty: r.qty })}
    >
      ✓
    </button>
  );

  const restock = view.shopping.filter((r) => r.kind === 'replenish');
  const buy = view.shopping.filter((r) => r.kind === 'acquire');
  const shoppingList = (rows: ShoppingRow[]) => (
    <ul className="row-list">
      {rows.map((r) => (
        <li className="row-item" key={r.key}>
          <div className="row-main">
            <strong>{r.label}</strong>
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

  return (
    <section className="screen gaps">
      <h1>Gaps</h1>
      <p className="muted">
        What is missing for {horizonDays} days.{' '}
        <Link to="/app/horizon">Change how long to plan for</Link>
      </p>

      <h2>Shopping</h2>
      {view.shopping.length === 0 ? (
        <p className="muted">Nothing to buy for {horizonDays} days.</p>
      ) : (
        <>
          <Segmented
            label="Sort shopping by"
            value={sort}
            options={[
              { value: 'capability' as const, label: 'Weakest first' },
              { value: 'cost' as const, label: 'Cheapest cover' },
            ]}
            onChange={setSort}
          />
          <EditArea>
            {restock.length > 0 ? (
              <>
                <h3>Back to your floors</h3>
                {shoppingList(restock)}
              </>
            ) : null}
            {restock.length > 0 && buy.length > 0 ? <h3>To buy</h3> : null}
            {buy.length > 0 ? shoppingList(buy) : null}
          </EditArea>
        </>
      )}

      <h2>To do</h2>
      {view.todo.length === 0 ? (
        <p className="muted">Nothing to do.</p>
      ) : (
        <EditArea>
          <ul className="row-list">
            {view.todo.map((r) => (
              <li className="row-item" key={r.key}>
                <div className="row-main">
                  <strong>{r.label}</strong>
                  <span className="muted">
                    {CAPABILITY_LABEL[r.capability]}
                    {r.closes ? ` · ${r.closes}` : ''}
                  </span>
                  {r.assetTypeId ? <Link to="/app/assets">Open Equipment</Link> : null}
                </div>
                {r.planItemId ? (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Done: ${r.label}`}
                    onClick={() => markDone(r.planItemId!)}
                  >
                    Done
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </EditArea>
      )}

      <h2>Enough</h2>
      {view.enough.length === 0 ? (
        <p className="muted">Nothing is fully covered yet.</p>
      ) : (
        <ul className="plain-list">
          {view.enough.map((r) => (
            <li key={r.capability}>{r.text}</li>
          ))}
        </ul>
      )}

      {buying ? <QuickAdd prefill={buying} onClose={() => setBuying(null)} /> : null}
    </section>
  );
}
