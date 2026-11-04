/** Date helpers. Everything is ISO text (`YYYY-MM-DD`, `YYYY-MM`); nothing reads the clock. */

const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Whole months from `dob` to `asOf`. Negative when `asOf` is before `dob` (not yet born). */
export function ageInMonths(dob: string, asOf: string): number {
  const a = DATE.exec(dob);
  const b = DATE.exec(asOf);
  if (!a || !b) return -1;
  let months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) months -= 1;
  return months;
}

/** `YYYY-MM` of a date. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** `date` plus `months` calendar months, the day clamped to the end of a shorter month. */
export function addMonths(date: string, months: number): string {
  const m = DATE.exec(date);
  if (!m) return date;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), last);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}
