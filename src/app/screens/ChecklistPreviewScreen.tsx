import { useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  checklist,
  checklistRunLists,
  checklistRunView,
  checklistScenarios,
  startRun,
} from '../../engine';
import { today } from '../../util';
import { ScreenHeader } from '../components/ScreenHeader';
import { useChange, useDocument, useEditable } from '../state';
import { usePacks } from '../usePacks';
import {
  CHECKLIST_PHASE_LABEL,
  checklistsPath,
  formatRunStart,
  progressText,
  runPath,
  sourceLabel,
} from './checklists/view';

/** A look at one scenario's steps for this household, with a way to start (or resume) a run. */
export function ChecklistPreviewScreen() {
  const { scenarioId = '' } = useParams();
  const doc = useDocument();
  const packs = usePacks();
  const change = useChange();
  const editable = useEditable();
  const navigate = useNavigate();
  const starting = useRef(false);
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
  const resumable = checklistRunLists(doc).open.filter((r) =>
    checklistRunView(doc, r.id)?.scenarios.some((s) => s.id === scenarioId && s.selected),
  );

  function start() {
    if (!editable || starting.current) return;
    starting.current = true;
    const runId = crypto.randomUUID();
    let started = false;
    try {
      change('start checklist run', (d) => {
        started =
          startRun(d, packs, {
            runId,
            started: new Date().toISOString(),
            asOf: today(),
            scenarioIds: [scenarioId],
          }) !== undefined;
      });
    } catch {
      started = false;
    }
    if (started) navigate(runPath(runId));
    else starting.current = false;
  }

  return (
    <div>
      <ScreenHeader title={known.name} back={checklistsPath} backLabel="Checklists" />
      {resumable.length > 0 ? (
        <section aria-labelledby="resume-heading" className="checklist-start">
          <h2 id="resume-heading">You already have this list open</h2>
          {resumable.map((r) => (
            <Link key={r.id} to={runPath(r.id)} className="button">
              Resume: {progressText(r.done, r.total)}, started {formatRunStart(r.started)}
            </Link>
          ))}
          <button type="button" className="secondary" disabled={!editable} onClick={start}>
            Start a new incident
          </button>
        </section>
      ) : (
        <div className="checklist-start">
          <button type="button" disabled={!editable || view.groups.length === 0} onClick={start}>
            Start this checklist
          </button>
        </div>
      )}
      <p className="muted">The steps below are for your household. Previewing saves nothing.</p>
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
