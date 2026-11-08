import { biggarDocument } from '../../src/fixtures/household-biggar';
import type { Document } from '../../src/model';

/** The Biggar household with no checklist runs, for tests that start their own and count them. */
export function biggarWithoutRuns(): Document {
  const doc = biggarDocument();
  doc.checklistRuns = {};
  doc.checklistStepStates = {};
  return doc;
}
