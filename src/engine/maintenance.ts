import type { Document, Packs } from '../model';
import { addMonths } from './dates';

export interface MaintenanceDue {
  assetId: string;
  jobId: string;
  text: string;
  lastDone?: string;
  due: string;
  overdue: boolean;
}

/** Every known scheduled job, including future occurrences. */
export function maintenanceDue(doc: Document, packs: Packs, asOf: string): MaintenanceDue[] {
  return Object.values(doc.assets).flatMap((asset) =>
    (packs.assets[asset.typeId]?.maintenance ?? []).map((job) => {
      const lastDone = asset.maintenance[job.id];
      const start = lastDone ?? asset.purchased;
      const due = start ? addMonths(start, job.everyMonths) : asOf;
      return {
        assetId: asset.id,
        jobId: job.id,
        text: job.text,
        lastDone,
        due,
        overdue: due <= asOf,
      };
    }),
  );
}
