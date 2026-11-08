import type { ChecklistPhase } from '../../../model';
import { formatReviewDate } from '../../reviewDisplay';

/** The five checklist-phase headings, in the order the engine returns them. */
export const CHECKLIST_PHASE_LABEL: Record<ChecklistPhase, string> = {
  coming: 'When it is coming',
  immediate: 'Immediately',
  'first-days': 'First days',
  'first-week': 'First week',
  'longer-term': 'Longer term',
};

export const checklistsPath = '/app/more/checklists';
/**
 * The preview route for one scenario or several: `/preview/a` or `/preview/a+b`. Each id is
 * percent-encoded and the ids are joined by a literal `+` (an encoded `+` never occurs in an id).
 */
export const previewPath = (scenarioIds: string | readonly string[]): string =>
  `${checklistsPath}/preview/${(typeof scenarioIds === 'string' ? [scenarioIds] : scenarioIds)
    .map(encodeURIComponent)
    .join('+')}`;

/** The scenario ids a preview route parameter holds, each once. */
export const parsePreviewIds = (param: string): string[] => [
  ...new Set(param.split('+').filter((id) => id !== '')),
];

export const runPath = (runId: string): string => `${checklistsPath}/${encodeURIComponent(runId)}`;

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "8 November 2026, 14:05" in the viewer's time zone. */
export function formatRunStart(iso: string): string {
  const d = new Date(iso);
  return `${dayFormat.format(d)}, ${timeFormat.format(d)}`;
}

/** The time a step was ticked; the date is added when it was not today. */
export function formatDoneAt(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString()
    ? timeFormat.format(d)
    : `${dayFormat.format(d)}, ${timeFormat.format(d)}`;
}

/** "3 of 12 done". */
export const progressText = (done: number, total: number): string => `${done} of ${total} done`;

/** How a step's source reads: its title and date checked, or an honest "no official source". */
export function sourceLabel(step: {
  source: string;
  sourceTitle?: string;
  sourceChecked?: string;
}): { text: string; href?: string } {
  if (step.source === 'assumption') return { text: 'Our assumption: no official source' };
  const title = step.sourceTitle ?? step.source;
  return {
    text: step.sourceChecked ? `${title} (checked ${formatReviewDate(step.sourceChecked)})` : title,
    href: step.source,
  };
}
