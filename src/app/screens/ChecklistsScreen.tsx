import { Link } from 'react-router-dom';
import { checklistRunLists, checklistScenarios } from '../../engine';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';
import { formatRunStart, previewPath, progressText, runPath } from './checklists/view';

/** Scenario checklists: lists in progress, then the scenarios on offer for the household's region. */
export function ChecklistsScreen() {
  const doc = useDocument();
  const packs = usePacks();
  const scenarios = checklistScenarios(doc, packs);
  const { open, finished } = checklistRunLists(doc);
  return (
    <div>
      <ScreenHeader title="Scenario checklists" back="/app/more" backLabel="More" />
      {scenarios.length > 0 ? (
        <p className="muted">
          Step-by-step lists for things that happen. Pick one to see its steps.
        </p>
      ) : null}
      {open.length > 0 ? (
        <section aria-labelledby="open-lists">
          <h2 id="open-lists">Your lists</h2>
          <div className="cards">
            {open.map((r) => (
              <Link key={r.id} to={runPath(r.id)} className="card">
                <span className="card-title">
                  {r.scenarioNames.length > 0 ? r.scenarioNames.join(', ') : 'Checklist'}
                </span>
                <span className="card-body">
                  {r.needsScenario
                    ? 'Needs a scenario'
                    : `${progressText(r.done, r.total)}, started ${formatRunStart(r.started)}`}
                </span>
                <span className="card-go" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {scenarios.length === 0 ? (
        <p>
          There are no scenario checklists for your region ({doc.settings.region}) yet. You can
          change your region in Settings.
        </p>
      ) : (
        <>
          <h2>Scenarios</h2>
          <div className="cards">
            {scenarios.map((s) => (
              <Link key={s.id} to={previewPath(s.id)} className="card">
                <span className="card-title">{s.name}</span>
                <span className="card-body">
                  {s.riskMatch ? 'Matches a risk you recorded' : 'Preview the steps'}
                </span>
                <span className="card-go" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      {finished.length > 0 ? (
        <section aria-labelledby="finished-lists">
          <h2 id="finished-lists">Finished lists</h2>
          <div className="cards">
            {finished.map((r) => (
              <Link key={r.id} to={runPath(r.id)} className="card">
                <span className="card-title">
                  {r.scenarioNames.length > 0 ? r.scenarioNames.join(', ') : 'Checklist'}
                </span>
                <span className="card-body">
                  Started {formatRunStart(r.started)}. Finished {formatRunStart(r.finished!)}
                </span>
                <span className="card-go" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
