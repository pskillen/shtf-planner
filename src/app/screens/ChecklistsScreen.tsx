import { Link } from 'react-router-dom';
import { checklistScenarios } from '../../engine';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';
import { previewPath } from './checklists/view';

/** Scenario checklists: the scenarios on offer for the household's region, each with a preview. */
export function ChecklistsScreen() {
  const doc = useDocument();
  const packs = usePacks();
  const scenarios = checklistScenarios(doc, packs);
  return (
    <div>
      <ScreenHeader title="Scenario checklists" back="/app/more" backLabel="More" />
      <p className="muted">Step-by-step lists for things that happen. Pick one to see its steps.</p>
      {/* Lists the household has started will go here. */}
      <section aria-label="Your lists" />
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
    </div>
  );
}
