import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { checklistRunView, clearStepDone, finishRun, setStepDone, setStepNote } from '../../engine';
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
import { StepNote, type NoteRegistry } from './checklists/StepNote';

/** An open (or finished) run: the frozen steps with a tick each. Reads and writes only through the engine. */
export function ChecklistRunScreen() {
  const { runId = '' } = useParams();
  const doc = useDocument();
  const change = useChange();
  const editable = useEditable();
  const notes: NoteRegistry = useRef(new Map());
  const [confirming, setConfirming] = useState(false);
  const [finishRefused, setFinishRefused] = useState(false);
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(new Set());
  const markUnsaved = useCallback((stepId: string, on: boolean) => {
    setUnsaved((was) => {
      if (was.has(stepId) === on) return was;
      const next = new Set(was);
      if (on) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
  }, []);
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
  const nameOf = new Map(view.scenarios.map((s) => [s.id, s.name]));
  const canTick = editable && view.finished === undefined;

  function toggle(stepId: string, ticked: boolean) {
    if (!canTick) return;
    change(ticked ? 'tick checklist step' : 'untick checklist step', (d) => {
      if (ticked) setStepDone(d, runId, stepId, new Date().toISOString());
      else clearStepDone(d, runId, stepId);
    });
  }

  /** Save every note still being typed and finish, in one change. */
  function finish() {
    if (!canTick) return;
    const pending = [...notes.current.entries()].flatMap(([stepId, read]) => {
      const text = read();
      return text === undefined ? [] : [[stepId, text] as const];
    });
    try {
      let refused = false;
      change('finish checklist run', (d) => {
        // Already finished (on another device) or gone: neither the notes nor the finish count.
        refused = d.checklistRuns[runId]?.finished !== undefined;
        for (const [stepId, text] of pending) setStepNote(d, runId, stepId, text);
        finishRun(d, runId, new Date().toISOString());
      });
      setFinishRefused(refused);
    } finally {
      setConfirming(false);
    }
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
          {finishRefused ? (
            <p className="muted" role="status">
              This list was already finished, so the notes you were typing were not saved.
            </p>
          ) : null}
          {view.finished !== undefined ? (
            <p className="muted">
              This list is finished. It is kept as a record and cannot be changed.
            </p>
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
                      {selected.length > 1 ? (
                        <span className="checklist-source muted">
                          For:{' '}
                          {step.selectedScenarioIds.map((id) => nameOf.get(id) ?? id).join(', ')}
                        </span>
                      ) : null}
                      {step.doneAt !== undefined ? (
                        <span className="checklist-source muted">
                          Done {formatDoneAt(step.doneAt)}
                        </span>
                      ) : null}
                      {/* Text typed but never saved (the list was finished meanwhile) stays visible. */}
                      {canTick || step.note !== undefined || unsaved.has(step.id) ? (
                        <StepNote
                          key={`${runId}|${step.id}`}
                          runId={runId}
                          stepId={step.id}
                          label={step.text}
                          saved={step.note ?? ''}
                          disabled={!canTick}
                          registry={notes}
                          onUnsaved={markUnsaved}
                        />
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
          {canTick ? (
            <div className="checklist-start">
              {confirming ? (
                <>
                  <p>
                    Finish this list? Your notes are saved and it becomes a read-only record. It
                    cannot be reopened.
                  </p>
                  <button type="button" onClick={finish}>
                    Yes, finish
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirming(false)}>
                    Keep going
                  </button>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => setConfirming(true)}>
                  Finish this list
                </button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
