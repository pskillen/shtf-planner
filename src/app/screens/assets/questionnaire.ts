import type { AssetType, Contribution, Question } from '../../../model';
import { equipmentEligibility } from '../../../engine/equipmentEligibility';
import { CAPABILITY_GIVES } from '../../labels';

export type Answer = string | number | boolean;
export type Answers = Record<string, Answer>;

/**
 * The answers a new asset starts with: every yes/no question off and every choice on its first
 * option. Numbers start unanswered, because a made-up capacity would be counted as real.
 */
export function defaultAnswers(type: AssetType): Answers {
  const out: Answers = {};
  for (const q of type.questions) {
    if (q.kind === 'bool') out[q.id] = false;
    else if (q.kind === 'choice' && !q.noDefault && q.choices?.[0] !== undefined)
      out[q.id] = q.choices[0];
  }
  return out;
}

/**
 * Records one answer with the type its question calls for: a bool question stores a boolean, a
 * number question a finite number, a choice question one of its choices. `undefined`, an empty
 * string, `NaN` or a choice that is not offered clears the answer.
 */
export function setAnswer(answers: Answers, question: Question, raw: Answer | undefined): Answers {
  const next = { ...answers };
  const clear = () => {
    delete next[question.id];
    if (question.id === 'chosenLpg' || question.id === 'fuel') {
      delete next.fuelConfirmed;
      delete next.manualRate;
      if (question.id === 'fuel') delete next.fuelPerHour;
    }
    return next;
  };
  if (raw === undefined || raw === '') return clear();
  switch (question.kind) {
    case 'bool':
      next[question.id] = raw === true || raw === 'true';
      return next;
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return clear();
      next[question.id] = n;
      return next;
    }
    case 'choice': {
      const choice = String(raw);
      if (!question.choices?.includes(choice)) return clear();
      if (
        (question.id === 'chosenLpg' || question.id === 'fuel') &&
        answers[question.id] !== choice
      ) {
        delete next.fuelConfirmed;
        delete next.manualRate;
        if (question.id === 'fuel') delete next.fuelPerHour;
      }
      if (question.id === 'setting' && answers[question.id] !== choice) delete next.manualRate;
      next[question.id] = choice;
      return next;
    }
  }
}

export interface ContributionLine {
  capability: Contribution['capability'];
  /** True when the current answers make the asset count toward the capability. */
  gives: boolean;
  /** "Gives power in an outage: no, answer yes to “…”" */
  text: string;
}

function needs(type: AssetType, c: Contribution): string {
  if (!c.when) return 'check the equipment questions below';
  const q = type.questions.find((x) => x.id === c.when!.question);
  const text = q ? `“${q.text}”` : 'a question below';
  return typeof c.when.equals === 'boolean'
    ? `answer ${c.when.equals ? 'yes' : 'no'} to ${text}`
    : `${text} must be ${c.when.equals}`;
}

/**
 * What the asset type gives, in words, with the current answers applied. Contributions to the same
 * capability are one line: it gives if any of them applies (a heater counts at the setting it runs
 * on, not at both).
 */
export function describeContributions(type: AssetType, answers: Answers): ContributionLine[] {
  const lines: ContributionLine[] = [];
  const order: Contribution['capability'][] = [];
  for (const c of type.contributes) if (!order.includes(c.capability)) order.push(c.capability);
  for (const capability of order) {
    const mine = type.contributes.filter((c) => c.capability === capability);
    const applies = mine.some(
      (c) =>
        (!c.when || answers[c.when.question] === c.when.equals) &&
        (!c.converts || equipmentEligibility(type, c, answers).reasons.length === 0),
    );
    const phrase = CAPABILITY_GIVES[capability];
    lines.push({
      capability,
      gives: applies,
      text: applies
        ? `Gives ${phrase}: yes`
        : `Gives ${phrase}: no, ${mine.some((c) => c.converts) ? 'check the equipment questions below' : mine.map((c) => needs(type, c)).join(' or ')}`,
    });
  }
  return lines;
}

/**
 * The one answer that says most about a piece of equipment, for a short row: its first answered
 * number with its unit ("110 Ah"), else its first choice ("Petrol"). A yes/no answer is not one.
 */
export function keyAnswer(type: AssetType, answers: Answers): string | undefined {
  for (const q of type.questions) {
    const a = answers[q.id];
    if (q.kind === 'number' && typeof a === 'number') return q.unit ? `${a} ${q.unit}` : String(a);
    if (q.kind === 'choice' && typeof a === 'string') return q.choiceLabels?.[a] ?? a;
  }
  return undefined;
}
