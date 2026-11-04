/** True when a form's draft differs from what it started as (compared as JSON). */
export const isDirty = (draft: unknown, initial: unknown): boolean =>
  JSON.stringify(draft) !== JSON.stringify(initial);
