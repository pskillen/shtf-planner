import type { ReactNode } from 'react';
import { PeopleScreen } from './PeopleScreen';

export const STEP_IDS = ['people', 'home', 'risks', 'horizon'] as const;
export type StepId = (typeof STEP_IDS)[number];

export const firstStepPath = `/app/setup/${STEP_IDS[0]}`;

export const STEP_TITLE: Record<StepId, string> = {
  people: 'People',
  home: 'Home',
  risks: 'Risks',
  horizon: 'How long to plan for',
};

/** The screen for a step: the same component as the editing screen, in embedded mode. */
export function stepScreen(step: StepId): ReactNode {
  switch (step) {
    case 'people':
      return <PeopleScreen embedded />;
    default:
      return <p className="muted">{STEP_TITLE[step]}</p>;
  }
}
