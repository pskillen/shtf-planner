import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useDocument } from '../state';
import { allHomeAnswered, type HomeAnswers, type HomeQuestion } from './homeQuestions';
import { STEP_IDS, STEP_TITLE, stepScreen, type StepId } from './onboardingSteps';

/**
 * First-run setup: People, Home, Risks, Horizon, one screen per step, each the same component as
 * its editing screen. Edits save as you go, so leaving half-way loses nothing. Needs one person
 * before it lets you past the first step; the last step lands on the Home hub.
 */
export function Onboarding() {
  const { step } = useParams();
  const navigate = useNavigate();
  const doc = useDocument();
  // Which Home questions were answered on purpose this time round (kept while moving between steps: the shell keeps this component mounted across the setup steps).
  const [answered, setAnswered] = useState<ReadonlySet<HomeQuestion>>(new Set());
  const homeAnswers: HomeAnswers = {
    answered,
    mark: (q) => setAnswered((cur) => (cur.has(q) ? cur : new Set(cur).add(q))),
  };
  const index = STEP_IDS.indexOf(step as StepId);
  if (index < 0) return <Navigate to={`/app/setup/${STEP_IDS[0]}`} replace />;

  const id = STEP_IDS[index]!;
  const last = index === STEP_IDS.length - 1;
  const noPeople = id === 'people' && doc.household.members.length === 0;
  const homeOpen = id === 'home' && !allHomeAnswered(answered);
  const blocked = noPeople || homeOpen;

  return (
    <section className="screen onboarding">
      <p className="progress" aria-live="polite">
        Step {index + 1} of {STEP_IDS.length}: {STEP_TITLE[id]}
      </p>
      <progress max={STEP_IDS.length} value={index + 1} aria-hidden="true" />
      {stepScreen(id, homeAnswers)}
      <div className="onboarding-nav">
        {index > 0 ? (
          <Link to={`/app/setup/${STEP_IDS[index - 1]}`} className="button quiet-button">
            Back
          </Link>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={blocked}
          onClick={() => navigate(last ? '/app' : `/app/setup/${STEP_IDS[index + 1]}`)}
        >
          {last ? 'Finish' : 'Next'}
        </button>
      </div>
      {noPeople ? <p className="muted">Add at least one person to continue.</p> : null}
      {homeOpen ? (
        <p className="muted">Answer the questions about your home above to continue.</p>
      ) : null}
    </section>
  );
}
