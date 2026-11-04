/** Whole months from `dob` to `asOf` (both `YYYY-MM-DD`); 0 when `dob` is in the future or bad. */
export function ageInMonths(dob: string, asOf: string): number {
  const born = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf);
  if (!born || !now) return 0;
  const [by, bm, bd] = [Number(born[1]), Number(born[2]), Number(born[3])];
  const [ny, nm, nd] = [Number(now[1]), Number(now[2]), Number(now[3])];
  let months = (ny - by) * 12 + (nm - bm);
  if (nd < bd) months -= 1;
  return Math.max(0, months);
}

/** "3 months", "1 month", "2 y 5 m", "34 y": the age shown next to a date of birth. */
export function formatAge(dob: string, asOf: string): string {
  const total = ageInMonths(dob, asOf);
  if (total < 24) return total === 1 ? '1 month' : `${total} months`;
  const years = Math.floor(total / 12);
  const months = total % 12;
  if (years >= 10 || months === 0) return `${years} y`;
  return `${years} y ${months} m`;
}

/** Today as `YYYY-MM-DD` in local time. */
export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type AgeTag = 'infant' | 'child' | 'elderly';

/**
 * The risk tags a date of birth suggests: `infant` under 24 months, `child` from 24 months to
 * under 18 years, `elderly` from 65. Only a suggestion: the person can change the tags.
 */
export function suggestedAgeTags(dob: string, asOf: string): AgeTag[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return [];
  const months = ageInMonths(dob, asOf);
  if (months < 24) return ['infant'];
  if (months < 18 * 12) return ['child'];
  if (months >= 65 * 12) return ['elderly'];
  return [];
}
