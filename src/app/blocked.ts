import type { BlockedAsset } from '../engine';

/**
 * A blocked asset in plain words. The engine's own reason (its question and the answer) stays for
 * a "why" the person opens; these are the short forms for a badge and a to-do line.
 */
export function blockedLine(b: Pick<BlockedAsset, 'name' | 'question'>): string {
  switch (b.question) {
    case 'hasEps':
      return `${b.name} gives nothing in a power cut until an EPS is fitted`;
    case 'v2l':
      return `${b.name} gives nothing in a power cut until vehicle-to-load is confirmed`;
    default:
      return `${b.name} gives nothing in a power cut until a question about it is answered`;
  }
}

/** The short reason for a Blocked badge, from the question that is not answered yes. */
export function blockedBadge(b: Pick<BlockedAsset, 'question'>): string {
  switch (b.question) {
    case 'hasEps':
      return 'No EPS fitted';
    case 'v2l':
      return 'No vehicle-to-load';
    default:
      return 'Needs an answer';
  }
}
