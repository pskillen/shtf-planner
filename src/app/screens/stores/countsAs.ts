const NOTHING = 'Counts towards nothing';

/**
 * The one line under an item: what it counts as. A pack line that starts "Counts towards nothing"
 * reads like a fault, so it says what is true: the plan has no target that uses the item yet, the
 * stock is kept and listed. A trailing reason in brackets is kept.
 */
export function countsAsLine(text: string): string {
  if (!text.startsWith(NOTHING)) return text;
  const rest = text.slice(NOTHING.length).replace(/^ yet/, '').trim();
  return rest ? `Not scored yet ${rest}` : 'Not scored yet: no target in the plan uses it';
}

/** Under the "Not scored yet" groups on Stores and Products. */
export const NOT_SCORED_NOTE =
  'Kept and listed, but no target in the plan uses these yet, so they add nothing to your score.';
