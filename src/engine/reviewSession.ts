import type { Document, Review } from '../model';

const PREFIX = 'review-answer/v1:';
const ACTIONS = [
  'fine',
  'used',
  'replace',
  'binned',
  'done',
  'not-now',
  'noted',
  'recounted',
  'still-true',
  'no-longer',
] as const;
export type ReviewAction = (typeof ACTIONS)[number];
export interface ReviewAnswer {
  opId: string;
  key: string;
  action: ReviewAction;
}
export interface ReviewSession {
  ids: string[];
  primaryId?: string;
  answers: ReviewAnswer[];
  resolvedKeys: ReadonlySet<string>;
}

export function encodeReviewAnswer(answer: ReviewAnswer): string {
  return PREFIX + JSON.stringify([answer.opId, answer.key, answer.action]);
}
export function decodeReviewAnswer(entry: string): ReviewAnswer | undefined {
  if (!entry.startsWith(PREFIX)) return undefined;
  try {
    const value: unknown = JSON.parse(entry.slice(PREFIX.length));
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      typeof value[0] !== 'string' ||
      !value[0] ||
      typeof value[1] !== 'string' ||
      !validKey(value[1]) ||
      typeof value[2] !== 'string' ||
      !ACTIONS.some((a) => a === value[2])
    )
      return undefined;
    return { opId: value[0], key: value[1], action: value[2] as ReviewAction };
  } catch {
    return undefined;
  }
}
function validKey(key: string): boolean {
  return /^(stock|maint|age|recount|plan):.+/.test(key);
}
export function reviewSession(doc: Document): ReviewSession {
  const open = Object.values(doc.reviews)
    .filter((r) => !r.finished)
    .sort((a, b) => Date.parse(a.started) - Date.parse(b.started) || a.id.localeCompare(b.id));
  const resolvedKeys = new Set<string>();
  const answers = new Map<string, ReviewAnswer>();
  for (const review of open)
    for (const entry of review.resolved) {
      const answer = decodeReviewAnswer(entry);
      if (answer) {
        resolvedKeys.add(answer.key);
        if (!answers.has(answer.opId)) answers.set(answer.opId, answer);
      } else if (validKey(entry)) resolvedKeys.add(entry);
    }
  return {
    ids: open.map((r) => r.id),
    primaryId: open[0]?.id,
    answers: [...answers.values()],
    resolvedKeys,
  };
}
export interface ReviewSummary {
  checked: number;
  used: number;
  replaceChosen: number;
  binned: number;
  maintenanceDone: number;
  deferred: number;
  differingAnswers: number;
  before?: number;
  after?: number;
}
export function reviewSummary(reviews: readonly Review[]): ReviewSummary {
  const ordered = [...reviews].sort(
    (a, b) => Date.parse(a.started) - Date.parse(b.started) || a.id.localeCompare(b.id),
  );
  const actions = new Map<string, Set<ReviewAction>>();
  const ops = new Set<string>();
  for (const r of ordered)
    for (const entry of r.resolved) {
      const answer = decodeReviewAnswer(entry);
      if (answer) {
        if (ops.has(answer.opId)) continue;
        ops.add(answer.opId);
        const set = actions.get(answer.key) ?? new Set<ReviewAction>();
        set.add(answer.action);
        actions.set(answer.key, set);
      } else if (validKey(entry) && !actions.has(entry)) actions.set(entry, new Set());
    }
  const result: ReviewSummary = {
    checked: actions.size,
    used: 0,
    replaceChosen: 0,
    binned: 0,
    maintenanceDone: 0,
    deferred: 0,
    differingAnswers: 0,
    before: ordered[0]?.scoreBefore,
    after: ordered.find((r) => r.scoreAfter !== undefined)?.scoreAfter,
  };
  for (const set of actions.values()) {
    if (set.size > 1) {
      result.differingAnswers++;
      continue;
    }
    const action = [...set][0];
    if (action === 'used') result.used++;
    if (action === 'replace') result.replaceChosen++;
    if (action === 'binned') result.binned++;
    if (action === 'done') result.maintenanceDone++;
    if (action === 'not-now') result.deferred++;
  }
  return result;
}
