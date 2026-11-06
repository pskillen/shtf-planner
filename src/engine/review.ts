import type { Document } from '../model';
import { addMonths } from './dates';

/** The latest finished review's calendar date, or creation date, plus the chosen cadence. */
export function nextReviewDue(doc: Document): string {
  const finished = Object.values(doc.reviews)
    .flatMap((review) => (review.finished ? [review.finished] : []))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const base = (finished.at(-1) ?? doc.meta.createdAt).slice(0, 10);
  return addMonths(base, doc.settings.reviewCadenceMonths);
}

/** A review is due on its scheduled date and remains due until finished. */
export function reviewIsDue(doc: Document, asOf: string): boolean {
  return nextReviewDue(doc) <= asOf;
}
