import type { ChecklistPhase } from '../../../model';

/** The five checklist-phase headings, in the order the engine returns them. */
export const CHECKLIST_PHASE_LABEL: Record<ChecklistPhase, string> = {
  coming: 'When it is coming',
  immediate: 'Immediately',
  'first-days': 'First days',
  'first-week': 'First week',
  'longer-term': 'Longer term',
};

export const checklistsPath = '/app/more/checklists';
export const previewPath = (scenarioId: string): string =>
  `${checklistsPath}/preview/${encodeURIComponent(scenarioId)}`;

/** How a step's source reads: its title and date checked, or an honest "no official source". */
export function sourceLabel(step: {
  source: string;
  sourceTitle?: string;
  sourceChecked?: string;
}): { text: string; href?: string } {
  if (step.source === 'assumption') return { text: 'Our assumption: no official source' };
  const title = step.sourceTitle ?? step.source;
  return {
    text: step.sourceChecked ? `${title} (checked ${step.sourceChecked})` : title,
    href: step.source,
  };
}
