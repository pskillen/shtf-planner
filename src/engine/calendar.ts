import type { Document, Packs } from '../model';
import { maintenanceDue } from './maintenance';
import { reviewPeriod } from './review';

export type CalendarIdentity = ['review'] | ['maintenance', string, string];
export interface CalendarCandidate {
  identity: CalendarIdentity;
  kind: 'review' | 'maintenance';
  due: string;
  summary: string;
  label: string;
  selectedByDefault: boolean;
}

/** A small snapshot of the next review and eligible equipment jobs. */
export function calendarCandidates(doc: Document, packs: Packs, asOf: string): CalendarCandidate[] {
  const { scheduledDue, until } = reviewPeriod(doc, asOf);
  const review: CalendarCandidate = {
    identity: ['review'],
    kind: 'review',
    due: scheduledDue,
    summary: 'Household stock review',
    label: 'Household stock review',
    selectedByDefault: true,
  };
  const maintenance: CalendarCandidate[] = maintenanceDue(doc, packs, asOf)
    .filter((job) => job.due <= until)
    .flatMap((job) => {
      const asset = doc.assets[job.assetId];
      const type = asset && packs.assets[asset.typeId];
      if (!asset || !type) return [];
      return [
        {
          identity: ['maintenance', job.assetId, job.jobId],
          kind: 'maintenance',
          due: job.due,
          summary: `${type.name}: ${job.text}`,
          label: `${asset.name?.trim() || type.name}: ${job.text}`,
          selectedByDefault: false,
        },
      ];
    });
  return [review, ...maintenance];
}
