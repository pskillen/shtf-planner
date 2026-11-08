import { useParams } from 'react-router-dom';
import { checklistRunView, clearStepDone, setStepDone } from '../../engine';
import { ScreenHeader } from '../components/ScreenHeader';
import { useChange, useDocument, useEditable } from '../state';
import {
  CHECKLIST_PHASE_LABEL,
  checklistsPath,
  formatDoneAt,
  formatRunStart,
  progressText,
  sourceLabel,
} from './checklists/view';

/** An open (or finished) run: the frozen steps with a tick each. Reads and writes only through the engine. */
export function ChecklistRunScreen() {
  const { runId = '' } = useParams();
  const doc = useDocument();
  const change = useChange();
  const editable = useEditable();
  const view = checklistRunView(doc, runId);
  if (!view) {
    return (
      <div>
        <ScreenHeader title="Checklist" back={checklistsPath} backLabel="Checklists" />
        <p>
          That list was not found. It may have been removed, or it has not reached this device yet.
        </p>
      </div>
    );
  }
  const selected = view.scenarios.filter((s) => s.selected).map((s) => s.name);
  const canTick = editable && view.finished === undefined;

  function toggle(stepId: string, ticked: boolean) {
    if (!canTick) return;
    change(ticked ? 'tick checklist step' : 'untick checklist step', (d) => {
      if (ticked) setStepDone(d, runId, stepId, new Date().toISOString());
      else clearStepDone(d, runId, stepId);
    });
  }

  return (
    <div>
      <ScreenHeader
        title={selected.length > 0 ? selected.join(', ') : 'Checklist'}
        back={checklistsPath}
        backLabel="Checklists"
      />
      <p className="muted">
        Started {formatRunStart(view.started)}
        {view.finished !== undefined ? `. Finished ${formatRunStart(view.finished)}` : ''}
      </p>
      {view.needsScenario ? (
        <p>
          This list has no scenario selected, which can happen when two devices change it at once.
          Choosing a scenario again is not possible yet.
        </p>
      ) : (
        <>
          <p className="progress">{progressText(view.done, view.total)}</p>
          <progress
            className="checklist-progress"
            value={view.done}
            max={Math.max(view.total, 1)}
            aria-label="Progress"
          />
          {!editable ? (
            <p className="muted">This household is read-only, so steps cannot be ticked.</p>
          ) : null}
          {view.groups.map((g) => (
            <section key={g.phase} aria-labelledby={`phase-${g.phase}`}>
              <h2 id={`phase-${g.phase}`}>{CHECKLIST_PHASE_LABEL[g.phase]}</h2>
              <ul className="checklist-steps">
                {g.steps.map((step) => {
                  const src = sourceLabel(step);
                  return (
                    <li key={step.id}>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={step.doneAt !== undefined}
                          disabled={!canTick}
                          onChange={(e) => toggle(step.id, e.target.checked)}
                        />
                        <span>{step.text}</span>
                      </label>
                      {step.doneAt !== undefined ? (
                        <span className="checklist-source muted">
                          Done {formatDoneAt(step.doneAt)}
                        </span>
                      ) : null}
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
        </>
      )}
    </div>
  );
}
