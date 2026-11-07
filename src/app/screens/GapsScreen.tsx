import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applicablePlanItems, coverage, gaps, planDone, score } from '../../engine';
import { today } from '../../util';
import { EditArea } from '../components/EditArea';
import { useDeferredDelete } from '../components/useDeferredDelete';
import { CAPABILITY_LABEL } from '../labels';
import { useChange, useDocument } from '../state';
import { usePacks } from '../usePacks';
import { buildGapsView } from './gaps/view';
import { scoreView } from './score/view';
import type { CapabilityId } from '../../model';
import { completePlan } from './review/actions';

/**
 * The Gaps tab: what to buy and what to do, from the engine's gaps for the chosen horizon, and
 * what is already enough. Ticking a shopping row opens Quick add filled in with that item.
 */
export function GapsScreen() {
  const doc = useDocument();
  const change = useChange();
  const packs = usePacks();
  const [expanded, setExpanded] = useState<CapabilityId | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [params] = useSearchParams();
  const selectedPlan = packs.plans[params.get('plan') ?? ''];
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
        sort: 'capability',
        packs,
      }),
    [doc, packs, now, horizonDays],
  );

  // Done waits five seconds with an Undo before it is written, like a delete.
  const done = useDeferredDelete(
    (planItemId) => {
      const months = packs.plans[planItemId]?.expiresMonths;
      change('plan done', (d) => {
        const entry = (d.plans[planItemId] ??= {});
        completePlan(entry, now, months);
      });
    },
    (label) => `Marked done: ${label}`,
  );

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

  const bars = scoreView(score(doc, packs, now, horizonDays), {
    coverage: coverage(doc, packs, now, horizonDays),
    region: doc.settings.region,
  }).bars;
  const needs = bars.filter((bar) => !bar.enough);
  const selected = expanded === undefined ? needs[0]?.capability : expanded;
  const icons: Record<CapabilityId, string> = {
    water: '💧',
    food: '🥫',
    heat: '♨',
    cooking: '🍳',
    light: '☀',
    power: '⚡',
    comms: '📻',
    sanitation: '🧼',
    medical: '✚',
    mobility: '🚗',
    plans: '✓',
  };

  return (
    <section className="screen gaps">
      <h1>Gaps</h1>
      <p className="muted">
        What is missing for {horizonDays} days.{' '}
        <Link to="/app/horizon">Change how long to plan for</Link>
      </p>

      {selectedPlan && applicablePlanItems(doc, packs).includes(selectedPlan.id) ? (
        <section aria-label="Selected plan">
          <h2>Plan to review</h2>
          <p>{selectedPlan.text}</p>
          <p className="muted">
            {planDone(doc, packs, selectedPlan.id, now) ? 'Done' : 'Needs attention'}
          </p>
        </section>
      ) : null}

      {needs.length > 0 ? (
        <>
          <h2>Needs attention</h2>
          <p className="muted">Your least-covered needs for {horizonDays} days.</p>
          <div className="gaps-priorities">
            {needs.slice(0, 3).map((bar) => (
              <a
                className="gaps-priority"
                key={bar.capability}
                href={`#need-${bar.capability}`}
                onClick={() => {
                  setShowAll(true);
                  setExpanded(bar.capability);
                }}
              >
                <span aria-hidden="true">{icons[bar.capability]}</span>
                <strong>{bar.name}</strong>
                <small>{bar.percent}% covered</small>
              </a>
            ))}
          </div>
          <h2>Your gaps</h2>
          {(showAll ? needs : needs.slice(0, 3)).map((bar) => (
            <details
              className="gaps-need"
              key={bar.capability}
              id={`need-${bar.capability}`}
              open={selected === bar.capability}
              onToggle={(event) => {
                if (event.currentTarget.open) setExpanded(bar.capability);
                else if (selected === bar.capability) setExpanded(null);
              }}
            >
              <summary>
                <span aria-hidden="true" className="gaps-need-icon">
                  {icons[bar.capability]}
                </span>
                <span>
                  <strong>{bar.name}</strong>
                  <span className="muted gaps-need-subtitle">
                    {bar.shortfall || `${bar.percent}% covered`}
                  </span>
                </span>
                <span className="gaps-need-percent">{bar.percent}%</span>
              </summary>
              <div className="gaps-need-body">
                {bar.reason ? <p className="muted">{bar.reason}</p> : null}
                {view.shopping.some((row) => row.capability === bar.capability) ? (
                  <Link to={`/app/gaps/shopping?need=${bar.capability}`}>
                    See shopping suggestions →
                  </Link>
                ) : (
                  <p className="muted">Check the to-do list for ways to address this need.</p>
                )}
              </div>
            </details>
          ))}
          {needs.length > 3 ? (
            <button type="button" className="secondary" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer needs' : 'Show all needs'}
            </button>
          ) : null}
        </>
      ) : (
        <p>All scored needs are covered.</p>
      )}
      <Link to="/app/gaps/shopping" className="gaps-shopping-link">
        <span aria-hidden="true">🛒</span>
        <span>
          <strong>Shopping list</strong>
          <span className="muted gaps-need-subtitle">{view.shopping.length} suggestions</span>
        </span>
        <span aria-hidden="true">›</span>
      </Link>

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
    </section>
  );
}
