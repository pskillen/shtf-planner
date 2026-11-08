import { useParams } from 'react-router-dom';
import { checklist, checklistScenarios } from '../../engine';
import { today } from '../../util';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';
import { CHECKLIST_PHASE_LABEL, checklistsPath, sourceLabel } from './checklists/view';

/** A read-only look at one scenario's steps for this household, grouped by checklist phase. */
export function ChecklistPreviewScreen() {
  const { scenarioId = '' } = useParams();
  const doc = useDocument();
  const packs = usePacks();
  const known = checklistScenarios(doc, packs).find((s) => s.id === scenarioId);
  if (!known) {
    return (
      <div>
        <ScreenHeader title="Scenario checklist" back={checklistsPath} backLabel="Checklists" />
        <p>That scenario is not available for your region.</p>
      </div>
    );
  }
  const view = checklist(doc, packs, [scenarioId], today());
  return (
    <div>
      <ScreenHeader title={known.name} back={checklistsPath} backLabel="Checklists" />
      <p className="muted">A preview of the steps for your household. Nothing here is saved.</p>
      {view.groups.length === 0 ? <p>No steps apply to your household.</p> : null}
      {view.groups.map((g) => (
        <section key={g.phase} aria-labelledby={`phase-${g.phase}`}>
          <h2 id={`phase-${g.phase}`}>{CHECKLIST_PHASE_LABEL[g.phase]}</h2>
          <ul className="checklist-steps">
            {g.steps.map((step) => {
              const src = sourceLabel(step);
              return (
                <li key={step.id}>
                  <span>{step.text}</span>
                  <span className="checklist-source muted">
                    Source:{' '}
                    {src.href ? (
                      <a href={src.href} target="_blank" rel="noopener noreferrer">
                        {src.text}
                      </a>
                    ) : (
                      src.text
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
