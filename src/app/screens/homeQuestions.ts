/**
 * The Home questions that must be answered on purpose during first-run setup. The document holds
 * a value for each from the start, so without this a person could click Next past them and keep
 * a default they never chose.
 */
export const HOME_QUESTIONS = ['type', 'heating', 'cooking', 'mainsGas'] as const;
export type HomeQuestion = (typeof HOME_QUESTIONS)[number];

/** What the Home screen needs to know in setup: which questions have an answer so far. */
export interface HomeAnswers {
  answered: ReadonlySet<HomeQuestion>;
  mark: (q: HomeQuestion) => void;
}

export const allHomeAnswered = (answered: ReadonlySet<HomeQuestion>): boolean =>
  HOME_QUESTIONS.every((q) => answered.has(q));
