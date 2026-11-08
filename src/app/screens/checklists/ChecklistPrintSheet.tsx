import type { ChecklistPhase } from '../../../model';
import { CHECKLIST_PHASE_LABEL, formatRunStart, sourceLabel } from './view';

/** One step as it is printed. Preview steps carry no tick or note; run steps carry what was saved. */
export interface PrintStep {
  id: string;
  text: string;
  source: string;
  sourceTitle?: string;
  sourceChecked?: string;
  /** Names of the scenarios that supplied the step, shown when a list combines several. */
  forNames?: string[];
  doneAt?: string;
  note?: string;
}

export interface PrintGroup {
  phase: ChecklistPhase;
  steps: PrintStep[];
}

/**
 * The paper form of a checklist: a heading, some facts, the steps under their phase headings (a
 * box to tick, the step, its source as plain text, and lines to write on) and a footer. It takes
 * already-projected groups and decides nothing about which steps apply. The `print-*` classes
 * hold no checklist knowledge, so another sheet can reuse them.
 */
export function ChecklistPrintSheet({
  title,
  facts,
  groups,
  footer,
}: {
  title: string;
  /** Lines under the title, such as when the list was started. */
  facts: string[];
  groups: PrintGroup[];
  /** Lines at the foot of the last page. */
  footer: string[];
}) {
  return (
    <article className="print-sheet" aria-label={`${title}, printable`}>
      <header className="print-head">
        <h1>{title}</h1>
        {facts.map((f) => (
          <p key={f} className="print-fact">
            {f}
          </p>
        ))}
      </header>
      {groups.length === 0 ? <p>No steps apply to your household.</p> : null}
      {groups.map((g) => (
        <section key={g.phase} className="print-group" aria-labelledby={`print-${g.phase}`}>
          <h2 id={`print-${g.phase}`}>{CHECKLIST_PHASE_LABEL[g.phase]}</h2>
          <ul className="print-steps">
            {g.steps.map((step) => {
              const src = sourceLabel(step);
              return (
                <li key={step.id} className="print-step">
                  <span className="print-box" aria-hidden="true">
                    {step.doneAt !== undefined ? '✓' : ''}
                  </span>
                  <div className="print-step-body">
                    <p className="print-step-text">{step.text}</p>
                    {step.forNames && step.forNames.length > 0 ? (
                      <p className="print-small">For: {step.forNames.join(', ')}</p>
                    ) : null}
                    {step.doneAt !== undefined ? (
                      <p className="print-small">Done {formatRunStart(step.doneAt)}</p>
                    ) : null}
                    <p className="print-small">
                      Source: {src.text}
                      {src.href ? <span className="print-url"> {src.href}</span> : null}
                    </p>
                    <div className="print-note">
                      <span className="print-small">Notes</span>
                      {step.note !== undefined ? (
                        <p className="print-note-text">{step.note}</p>
                      ) : null}
                      <div className="print-lines" aria-hidden="true" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <footer className="print-foot">
        {footer.map((f) => (
          <p key={f}>{f}</p>
        ))}
      </footer>
    </article>
  );
}
