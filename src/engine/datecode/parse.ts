/**
 * The best-before parser: text a camera read off a pack in, month-years out. Pure: no packages,
 * no clock (the caller passes today as ISO text), no images.
 *
 * Policy: a wrong read is worse than none, so only shapes we recognise are accepted; times and
 * production dates are dropped; the range is this month to {@link AHEAD_MONTHS} ahead. Past dates
 * up to {@link EXPIRED_MONTHS} back are read as expired, but only when a label claims them or they
 * carry a full day, month and year. A bare unlabelled two-digit-year `MM/YY` is never a result: it
 * becomes a suggestion.
 */

/** A month (1 to 12) and a full year. */
export interface MonthYear {
  month: number;
  year: number;
}

export interface DateHit extends MonthYear {
  /** The text the date was read from. */
  text: string;
  /** The shape that matched, such as `DD MMM YY`. */
  kind: string;
  /** A label ("BB", "USE BY") claims this date. */
  labelled: boolean;
  day?: number;
  /** Day and month were printed, the year was filled in at month level. */
  yearAssumed?: boolean;
  /** The month has passed (up to {@link EXPIRED_MONTHS} back). */
  expired?: boolean;
}

/**
 * A date-like run too weak to be a result (an unlabelled bare MM/YY, a spaced DD MM YY with no
 * label, a bare past date). Offered as a one-tap suggestion, never read as the answer.
 */
export interface Suggestion extends MonthYear {
  text: string;
  expired: boolean;
}

export interface ParseResult {
  best: DateHit | null;
  all: DateHit[];
  confidence: number;
  suggestions: Suggestion[];
}

/** Past dates up to this many months back are read as expired. */
export const EXPIRED_MONTHS = 24;
/** Dates up to this many months ahead are believed. */
export const AHEAD_MONTHS = 120;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MON_RE =
  '(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';
const monthNum = (s: string): number => MONTHS.indexOf(s.slice(0, 3)) + 1;

// Date labels, including the way a phone's text reader mangles them ("Best Befon", "Best Bel").
const LABEL_RE =
  /(B[EF]ST\s*B[A-Z]{0,6}(?:\s*END)?|BEFO[A-Z]{0,2}(?:\s*END)?|USE\s*BY(?:\s*END)?|B\.?B\.?E\.?|B\.?B\.?|BBD|EXP(?:I[A-Z]{0,6})?\.?|U\/?B)(?![A-Z])/g;
// A batch or lot label says the run after it is a code, not a date ("Batch Code: 23 09 26").
const BATCH_RE = /(BATCH(?:\s*CODE)?|LOT(?:\s*NO\.?)?|CODE)(?![A-Z])/g;
// Dates after these labels are made or packed dates, not expiry.
const PROD_RE = /(PROD(?:UCED|UCTION)?|MFD|MFG|PKD|PACKED|MADE|MANUFACTURED)\b[^0-9A-Z]{0,3}$/;

/** Shapes that carry a day, month and year: a past date in one of these is read as expired even with no label. */
const FULL_DATE = new Set([
  'DD/MM/YY',
  'DD MMM YY',
  'DD MM YYYY',
  'DD MM YY (label)',
  'DDMM YY (label)',
  'DDMMYY',
  'YYYY-MM-DD',
]);
/** Shapes that are too weak to be a result unless a label claims them. */
const WEAK_KINDS = new Set([
  'DD MM YY (label)',
  'DDMM YY (label)',
  'MM/YY (label)',
  'MM YYYY (label)',
  'DD/MM/YY (fixed)',
]);

const sep = '[\\/.\\-]';

/** Normalise OCR text: uppercase, fix digit look-alikes only inside digit-ish runs, drop times. */
export function normalise(raw: string): string {
  let t = raw
    .toUpperCase()
    .replace(/[\r\n\t|_]+/g, ' ')
    .replace(/[,;]/g, '.')
    .replace(/\s+/g, ' ');
  // O to 0, I and L to 1, inside a run that already has a digit: "O6/2O27". A run glued to a
  // month name keeps its I and L: "SEP27L4" is a date then a code, not "SEP2714".
  t = t.replace(/[0-9OIL][0-9OIL/.-]*[0-9OIL]/g, (run, off: number) => {
    if (!/[0-9]/.test(run)) return run;
    const glued = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(
      t.slice(Math.max(0, off - 3), off),
    );
    return glued ? run.replace(/O/g, '0') : run.replace(/O/g, '0').replace(/[IL]/g, '1');
  });
  // The reader takes the colon after a label for a 1 ("BB131.07.2028" for "BB:31.07.2028").
  t = t.replace(/\b(B\.?B)1(?=\d{2}[./-]\d{1,2}[./-])/g, '$1 ');
  // Times: 14:32 (colon only; dots are ambiguous with dates).
  t = t.replace(/\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\b/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const toYear = (s: string): number => (s.length === 2 ? 2000 + Number(s) : Number(s));
/** Days in a month, by the calendar and not the local clock. */
const daysIn = (month: number, year: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

interface Raw {
  start: number;
  end: number;
  month: number;
  year: number;
  day?: number;
  kind: string;
}

function scan(t: string): Raw[] {
  const out: Raw[] = [];
  const taken: Array<[number, number]> = [];
  const free = (s: number, e: number): boolean => !taken.some(([a, b]) => s < b && e > a);
  const add = (m: RegExpMatchArray, month: number, year: number, kind: string, day?: number) => {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (!free(s, e)) return;
    if (month < 1 || month > 12) return;
    if (day !== undefined && (day < 1 || day > daysIn(month, year))) return;
    taken.push([s, e]);
    out.push({ start: s, end: e, month, year, day, kind });
  };
  const run = (re: RegExp, fn: (m: RegExpMatchArray) => void): void => {
    for (const m of t.matchAll(re)) fn(m);
  };
  // Capture groups are present in every pattern below, so `m[n]` is a string when it matches.
  const g = (m: RegExpMatchArray, n: number): string => m[n] ?? '';

  // A damaged year on a full date: dot-matrix print on a tin lid loses or changes the 2 of 2028
  // ("31.07.028", "31.07.6028"). Read as 20YY; weak (it needs a label and two agreeing frames).
  run(
    new RegExp(
      `(?<![0-9])(\\d{1,2})\\s?${sep}\\s?(\\d{1,2})\\s?${sep}\\s?(?:6(0\\d{2})|0(\\d{2}))(?![0-9])`,
      'g',
    ),
    (m) => add(m, +g(m, 2), 2000 + +(m[3] ?? m[4] ?? '0'), 'DD/MM/YY (fixed)', +g(m, 1)),
  );
  // ISO YYYY-MM-DD, YYYY/MM
  run(new RegExp(`(?<![0-9])(20\\d{2})${sep}(\\d{1,2})(?:${sep}(\\d{1,2}))?(?![0-9])`, 'g'), (m) =>
    add(m, +g(m, 2), +g(m, 1), m[3] ? 'YYYY-MM-DD' : 'YYYY-MM', m[3] ? +g(m, 3) : undefined),
  );
  // DD MMM YY(YY), also glued: 14JUN27, 14 JUN 2027
  run(
    new RegExp(
      `(?<![0-9])(\\d{1,2})\\s?[ ./\\-]?\\s?${MON_RE}\\s?[ ./\\-]?\\s?(\\d{4}|\\d{2})(?![0-9])`,
      'g',
    ),
    (m) => add(m, monthNum(g(m, 2)), toYear(g(m, 3)), 'DD MMM YY', +g(m, 1)),
  );
  // MMM YY(YY)
  run(new RegExp(`(?<![A-Z])${MON_RE}\\s?[ ./\\-]?\\s?(\\d{4}|\\d{2})(?![0-9])`, 'g'), (m) =>
    add(m, monthNum(g(m, 1)), toYear(g(m, 2)), 'MMM YY'),
  );
  // DD/MM/YY(YY) with real separators
  run(
    new RegExp(
      `(?<![0-9])(\\d{1,2})\\s?${sep}\\s?(\\d{1,2})\\s?${sep}\\s?(\\d{4}|\\d{2})(?![0-9])`,
      'g',
    ),
    (m) => add(m, +g(m, 2), toYear(g(m, 3)), 'DD/MM/YY', +g(m, 1)),
  );
  // DD MM YYYY with spaces only; DD MM YY with spaces is kept but only counts when a label claims it
  run(/(?<![0-9])(\d{1,2}) (\d{1,2}) (20\d{2})(?![0-9])/g, (m) =>
    add(m, +g(m, 2), +g(m, 3), 'DD MM YYYY', +g(m, 1)),
  );
  run(/(?<![0-9])(\d{1,2}) (\d{1,2}) (\d{2})(?![0-9])/g, (m) =>
    add(m, +g(m, 2), toYear(g(m, 3)), 'DD MM YY (label)', +g(m, 1)),
  );
  // MM/YY(YY)
  run(
    new RegExp(`(?<![0-9./\\-])(\\d{1,2})\\s?${sep}\\s?(\\d{4}|\\d{2})(?![0-9]|${sep}\\d)`, 'g'),
    (m) => add(m, +g(m, 1), toYear(g(m, 2)), g(m, 2).length === 2 ? 'MM/YY (label)' : 'MM/YY'),
  );
  // MM YYYY with a space only ("EXP 12 2027", the month and year on their own line): weak, a label must claim it
  run(/(?<![0-9./-])(0?[1-9]|1[0-2]) (20\d{2})(?![0-9]|[./-]\d)/g, (m) =>
    add(m, +g(m, 1), +g(m, 2), 'MM YYYY (label)'),
  );
  // DDMM YY: the reader glued the day and month and kept the space ("1206 27"); weak, a label must claim it
  run(/(?<![0-9])(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2]) (\d{2})(?![0-9])/g, (m) =>
    add(m, +g(m, 2), toYear(g(m, 3)), 'DDMM YY (label)', +g(m, 1)),
  );
  // Day and month with no year ("11 NOV"): the year is assumed by the caller
  run(new RegExp(`(?<![0-9])(\\d{1,2})\\s?[ ./\\-]?\\s?${MON_RE}(?![A-Z0-9])`, 'g'), (m) =>
    add(m, monthNum(g(m, 2)), 2000, 'DD MMM', +g(m, 1)),
  );
  return out;
}

/** Month index for ordering: year times 12 plus the month from 0. */
const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);

/** This month's year and month from `YYYY-MM-DD` (or `YYYY-MM`) text. */
function thisMonth(todayIso: string): MonthYear {
  const m = /^(\d{4})-(\d{2})/.exec(todayIso);
  if (!m) throw new Error(`Not an ISO date: ${todayIso}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** `YYYY-MM` for a month-year, the form the document stores. */
export function toYearMonth(m: MonthYear): string {
  return `${String(m.year).padStart(4, '0')}-${String(m.month).padStart(2, '0')}`;
}

/** `MM/YYYY`, for logs and tests. */
export const formatMonthYear = (d: MonthYear): string =>
  `${String(d.month).padStart(2, '0')}/${d.year}`;

/**
 * Year for a date printed without one, at month level: this month or later is this year, earlier
 * months next year, so it is always under 12 months away.
 */
function assumedYear(month: number, now: MonthYear): number {
  return month >= now.month ? now.year : now.year + 1;
}

/** Read the best-before out of reader text. `todayIso` is today, `YYYY-MM-DD`. */
export function parseDates(raw: string, todayIso: string): ParseResult {
  const now = thisMonth(todayIso);
  const t = normalise(raw);
  const labels = [...t.matchAll(LABEL_RE)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    batch: false,
  }));
  const batchLabels = [...t.matchAll(BATCH_RE)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    batch: true,
  }));
  const allLabels = [...labels, ...batchLabels].sort((a, b) => a.start - b.start);

  // MMYYYY glued after a label ("BB 062027"), and DDMMYY where the reader dropped the spaces
  // ("BEST BEFORE 060227").
  const extra: Raw[] = [];
  for (const l of labels) {
    const m = /^\W{0,3}(0[1-9]|1[0-2])(20\d{2})(?![0-9])/.exec(t.slice(l.end));
    if (m) {
      extra.push({
        start: l.end,
        end: l.end + m[0].length,
        month: +(m[1] ?? 0),
        year: +(m[2] ?? 0),
        kind: 'MMYYYY',
      });
    }
    const g = /^\W{0,3}(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})(?![0-9])/.exec(t.slice(l.end));
    if (g && !m) {
      extra.push({
        start: l.end,
        end: l.end + g[0].length,
        month: +(g[2] ?? 0),
        year: toYear(g[3] ?? ''),
        day: +(g[1] ?? 0),
        kind: 'DDMMYY',
      });
    }
  }

  const lo = monthIndex(now.year, now.month);
  const hi = lo + AHEAD_MONTHS;
  const hits: DateHit[] = [];
  const weak: Suggestion[] = [];
  const cands = [...scan(t), ...extra].sort((a, b) => a.start - b.start);

  // A label claims only the first candidate after it, and only if no other label sits between.
  const claimed = new Set<Raw>();
  const notDates = new Set<Raw>();
  for (const l of allLabels) {
    const first = cands.find((r) => r.start + 1 >= l.end);
    if (!first || first.start - l.end > 22) continue;
    if (allLabels.some((o) => o !== l && o.start >= l.end - 1 && o.end <= first.start + 1))
      continue;
    (l.batch ? notDates : claimed).add(first);
  }

  for (const r of cands) {
    if (notDates.has(r)) continue;
    let yearAssumed = false;
    if (r.kind === 'DD MMM') {
      r.year = assumedYear(r.month, now);
      yearAssumed = true;
    }
    const idx = monthIndex(r.year, r.month);
    const labelled = claimed.has(r);
    const expired = idx < lo;
    if (idx > hi || idx < lo - EXPIRED_MONTHS) continue;
    if (PROD_RE.test(t.slice(Math.max(0, r.start - 14), r.start))) continue;
    // A bare, unlabelled MM/YY (or a spaced DD MM YY) is too weak to be a result: a batch code, a
    // price or a weight looks the same. A bare past MM/YY is more likely a code. Both only ever
    // become suggestions.
    if (!labelled && (WEAK_KINDS.has(r.kind) || (expired && !FULL_DATE.has(r.kind)))) {
      weak.push({ month: r.month, year: r.year, text: t.slice(r.start, r.end), expired });
      continue;
    }
    hits.push({
      month: r.month,
      year: r.year,
      day: r.day,
      text: t.slice(r.start, r.end),
      kind: r.kind,
      labelled,
      ...(yearAssumed ? { yearAssumed } : {}),
      ...(expired ? { expired } : {}),
    });
  }

  // Suggestions: weak runs, future before past, nearest first; three at most, one per month-year.
  const sug: Suggestion[] = [];
  const addSuggestion = (x: Suggestion): void => {
    if (!sug.some((y) => y.year === x.year && y.month === x.month)) sug.push(x);
  };
  [...weak]
    .sort(
      (a, b) =>
        Number(a.expired) - Number(b.expired) ||
        monthIndex(a.year, a.month) - monthIndex(b.year, b.month),
    )
    .forEach(addSuggestion);
  const suggestions = sug.slice(0, 3);
  if (!hits.length) return { best: null, all: [], confidence: 0, suggestions };

  const key = (h: DateHit): number => monthIndex(h.year, h.month);
  // Tier 0: real dates, and labelled past ones. 1: year assumed. 2: unlabelled past.
  const tier = (h: DateHit): number => (h.expired && !h.labelled ? 2 : h.yearAssumed ? 1 : 0);
  hits.sort(
    (a, b) =>
      tier(a) - tier(b) ||
      Number(b.labelled) - Number(a.labelled) ||
      Number(!!a.expired) - Number(!!b.expired) ||
      key(b) - key(a),
  );
  const best = hits[0]!;
  const distinct = new Set(hits.map(key)).size;
  let c = best.labelled ? 0.85 : 0.6;
  if (best.kind === 'MM/YY' || best.kind === 'YYYY-MM') c -= 0.1;
  if (best.kind === 'DD MMM YY' || best.kind === 'MMM YY') c += 0.1;
  if (distinct > 1) c -= 0.2;
  if (best.kind.endsWith('(fixed)')) c = Math.min(c, 0.55); // a repaired year: two frames must agree
  if (best.yearAssumed) c = Math.min(c, 0.45);
  if (best.expired) c = Math.min(c, 0.6); // never sure on its own: it needs two agreeing frames
  return { best, all: hits, confidence: Math.max(0.05, Math.min(0.95, c)), suggestions };
}
