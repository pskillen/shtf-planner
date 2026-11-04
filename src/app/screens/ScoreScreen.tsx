import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { score } from '../../engine';
import { today } from '../../util';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';
import { scoreView } from './score/view';

function Bar({ name, percent, label }: { name: string; percent: number; label?: string }) {
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label ?? name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent} per cent`}
    >
      <div className="meter-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** The Score tab: one number, the capability that holds it back, and a bar for each capability. */
export function ScoreScreen() {
  const doc = useDocument();
  const packs = usePacks();
  const horizonDays = doc.settings.horizonDays;
  const view = useMemo(
    () => scoreView(score(doc, packs, today(), horizonDays)),
    [doc, packs, horizonDays],
  );

  return (
    <section className="screen score">
      <h1>Score</h1>

      <div className="notebook" aria-label="Your score">
        <div className="notebook-number" data-testid="overall">
          {view.overall}
          <span className="notebook-pct">%</span>
        </div>
        <div className="notebook-text">
          <p className="notebook-gap">
            <strong>{view.weakest}</strong> is your gap
          </p>
          <p className="notebook-horizon">
            <Link to="/app/horizon">at {horizonDays} days</Link>
          </p>
        </div>
      </div>

      {view.next ? (
        <div className="next-horizon">
          <p>
            At {view.next.days} days you’d be at <strong>{view.next.percent} %</strong>.
          </p>
          <Bar name={`Overall at ${view.next.days} days`} percent={view.next.percent} />
        </div>
      ) : null}

      <h2>By need</h2>
      <ul className="bars">
        {view.bars.map((b) => (
          <li key={b.capability} className="bar-row">
            <div className="bar-head">
              <strong>{b.name}</strong>
              <span className={b.enough ? 'bar-pct enough' : 'bar-pct'}>
                {b.enough ? 'Enough' : `${b.percent} %`}
              </span>
            </div>
            <Bar name={b.name} percent={b.percent} />
            {b.reason ? <p className="muted bar-why">{b.reason}</p> : null}
          </li>
        ))}
      </ul>
      <p className="muted">
        <Link to="/app/gaps">See what to buy and do</Link>
      </p>
    </section>
  );
}
