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
  parsePreviewIds,
  progressText,
  runPath,
  sourceLabel,
} from './checklists/view';

/** A look at one scenario's steps for this household, with a way to start (or resume) a run. */
export function ChecklistPreviewScreen() {
  const { scenarioId = '' } = useParams();
  const requested = parsePreviewIds(scenarioId);
  const doc = useDocument();
  const packs = usePacks();
  const change = useChange();
  const editable = useEditable();
  const navigate = useNavigate();
  const starting = useRef(false);
  const offered = checklistScenarios(doc, packs);
  const known = offered.filter((s) => requested.includes(s.id));
  const knownIds = known.map((s) => s.id);
  const combined = known.length > 1;
  if (requested.length === 0 || known.length < requested.length) {
    return (
      <div>
        <ScreenHeader title="Scenario checklist" back={checklistsPath} backLabel="Checklists" />
        <p>That scenario is not available for your region.</p>
      </div>
    );
  }
  const view = checklist(doc, packs, knownIds, today());
  const nameOf = new Map(known.map((s) => [s.id, s.name]));
  // An open run is offered when it includes every scenario selected here.
  const resumable = checklistRunLists(doc).open.filter((r) => {
    const selected = new Set(
      checklistRunView(doc, r.id)
        ?.scenarios.filter((s) => s.selected)
        .map((s) => s.id),
    );
    return knownIds.every((id) => selected.has(id));
  });

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
            scenarioIds: knownIds,
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
      <ScreenHeader
        title={known.map((s) => s.name).join(', ')}
        back={checklistsPath}
        backLabel="Checklists"
      />
      {resumable.length > 0 ? (
        <section aria-labelledby="resume-heading" className="checklist-start">
          <h2 id="resume-heading">
            {combined ? 'You already have these lists open' : 'You already have this list open'}
          </h2>
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
            {combined ? 'Start these checklists together' : 'Start this checklist'}
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
                  {combined ? (
                    <span className="checklist-source muted">
                      For: {step.scenarioIds.map((id) => nameOf.get(id) ?? id).join(', ')}
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
    </div>
  );
}
