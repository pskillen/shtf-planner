import type { ReactNode } from 'react';
import { HomeScreen } from './HomeScreen';
import type { HomeAnswers } from './homeQuestions';
import { HorizonScreen } from './HorizonScreen';
import { PeopleScreen } from './PeopleScreen';
import { RisksScreen } from './RisksScreen';

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
export function stepScreen(step: StepId, home: HomeAnswers): ReactNode {
  switch (step) {
    case 'people':
      return <PeopleScreen embedded />;
    case 'home':
      return <HomeScreen embedded answers={home} />;
    case 'risks':
      return <RisksScreen embedded />;
    case 'horizon':
      return <HorizonScreen embedded />;
  }
}
