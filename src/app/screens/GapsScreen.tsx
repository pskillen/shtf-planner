import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, applicablePlanItems, coverage, gaps, planDone, score } from '../../engine';
import { today } from '../../util';
import { EditArea } from '../components/EditArea';
import { useDeferredDelete } from '../components/useDeferredDelete';
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

  // Done waits five seconds with an Undo before it is written, like a delete.
  const done = useDeferredDelete((planItemId) => {
    const months = packs.plans[planItemId]?.expiresMonths;
    change('plan done', (d) => {
      d.plans[planItemId] = {
        ...d.plans[planItemId],
        doneAt: now,
        ...(months ? { expires: addMonths(now, months) } : {}),
      };
    });
  }, 'marked done');

  function undoDone(planItemId: string): void {
    change('plan undone', (d) => {
      const entry = d.plans[planItemId];
      if (!entry) return;
      delete entry.doneAt;
      delete entry.expires;
    });
  }

  const todo = view.todo.filter((r) => !r.planItemId || !done.pending.has(r.planItemId));
  const doneItems = applicablePlanItems(doc, packs).filter(
    (id) => planDone(doc, packs, id, now) && !done.pending.has(id),
  );

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
      {todo.length === 0 ? (
        <p className="muted">Nothing to do.</p>
      ) : (
        <EditArea>
          <ul className="row-list">
            {todo.map((r) => (
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
                    onClick={() => done.request(r.planItemId!, r.label)}
                  >
                    Done
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </EditArea>
      )}
      {doneItems.length > 0 ? (
        <>
          <h3>Done</h3>
          <EditArea>
            <ul className="row-list">
              {doneItems.map((id) => (
                <li className="row-item" key={id}>
                  <div className="row-main">
                    <span>{packs.plans[id]?.text ?? id}</span>
                    <span className="muted">Done {doc.plans[id]?.doneAt}</span>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Undo done: ${packs.plans[id]?.text ?? id}`}
                    onClick={() => undoDone(id)}
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </EditArea>
        </>
      ) : null}
      {done.toast}

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
