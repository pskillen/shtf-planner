// Date parser over OCR text. Pure, no DOM. Month-year only is stored, so that is what we return.
// Policy: a wrong read is worse than none, so we only accept shapes we recognise, drop times and
// production dates, and only accept this month .. +10 years. Past dates (up to 2 years back) are read as `expired`,
// but only when a label claims them or they are a full day-month-year.

export type MonthYear = { month: number; year: number }; // month 1..12
export type DateHit = MonthYear & { text: string; kind: string; labelled: boolean; day?: number; yearAssumed?: boolean; expired?: boolean };
export type ParseResult = { best: DateHit | null; all: DateHit[]; confidence: number };

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MON_RE = '(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';
const monthNum = (s: string) => MONTHS.indexOf(s.slice(0, 3)) + 1;

// Date labels, including the way phone OCR mangles them ("Best Befon", "Best Bel", "Befo n").
const LABEL_RE = /(B[EF]ST\s*B[A-Z]{0,6}(?:\s*END)?|BEFO[A-Z]{0,2}(?:\s*END)?|USE\s*BY(?:\s*END)?|B\.?B\.?E\.?|B\.?B\.?|BBD|EXP(?:IRY|IRES|IRE|IRATION)?\.?|U\/?B)(?![A-Z])/g;
// A batch / lot / code label says the run after it is a code, not a date ("Batch Code: 23 09 26").
const BATCH_RE = /(BATCH(?:\s*CODE)?|LOT(?:\s*NO\.?)?|CODE)(?![A-Z])/g;
// Dates after these labels are made/packed dates, not expiry.
const PROD_RE = /(PROD(?:UCED|UCTION)?|MFD|MFG|PKD|PACKED|MADE|MANUFACTURED)\b[^0-9A-Z]{0,3}$/;

/** Shapes that carry a day, month and year: a past date in one of these is read as expired even with no label. */
const FULL_DATE = new Set(['DD/MM/YY', 'DD MMM YY', 'DD MM YYYY', 'DD MM YY (label)', 'DDMMYY', 'YYYY-MM-DD']);
const EXPIRED_MONTHS = 24;

const sep = '[\\/.\\-]';

/** Normalise OCR text: uppercase, fix digit look-alikes only inside digit-ish runs, drop times. */
export function normalise(raw: string): string {
  let t = raw.toUpperCase().replace(/[\r\n\t|_]+/g, ' ').replace(/[,;]/g, '.').replace(/\s+/g, ' ');
  // O->0, I/L->1 when inside a run that already has a digit: "O6/2O27"
  // (a run glued to a month name keeps its I/L: "SEP27L4" is a date then a code, not "SEP2714")
  t = t.replace(/[0-9OIL][0-9OIL\/.\-]*[0-9OIL]/g, (run, off: number) => {
    if (!/[0-9]/.test(run)) return run;
    const glued = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(t.slice(Math.max(0, off - 3), off));
    return glued ? run.replace(/O/g, '0') : run.replace(/O/g, '0').replace(/[IL]/g, '1');
  });
  // times: 14:32 (colon only; dots are ambiguous with dates)
  t = t.replace(/\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\b/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const yr = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
const dim = (m: number, y: number) => new Date(y, m, 0).getDate();

type Raw = { start: number; end: number; month: number; year: number; day?: number; kind: string };

function scan(t: string): Raw[] {
  const out: Raw[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && e > a);
  const add = (m: RegExpMatchArray, month: number, year: number, kind: string, day?: number) => {
    const s = m.index!, e = s + m[0].length;
    if (!free(s, e)) return;
    if (month < 1 || month > 12) return;
    if (day !== undefined && (day < 1 || day > dim(month, year))) return;
    taken.push([s, e]);
    out.push({ start: s, end: e, month, year, day, kind });
  };
  const run = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { for (const m of t.matchAll(re)) fn(m); };

  // ISO YYYY-MM-DD / YYYY/MM
  run(new RegExp(`(?<![0-9])(20\\d{2})${sep}(\\d{1,2})(?:${sep}(\\d{1,2}))?(?![0-9])`, 'g'), (m) => add(m, +m[2], +m[1], m[3] ? 'YYYY-MM-DD' : 'YYYY-MM', m[3] ? +m[3] : undefined));
  // DD MMM YY(YY), also glued: 14JUN27, 14 JUN 2027
  run(new RegExp(`(?<![0-9])(\\d{1,2})\\s?[ ./\\-]?\\s?${MON_RE}\\s?[ ./\\-]?\\s?(\\d{4}|\\d{2})(?![0-9])`, 'g'), (m) => add(m, monthNum(m[2]), yr(m[3]), 'DD MMM YY', +m[1]));
  // MMM YY(YY)
  run(new RegExp(`(?<![A-Z])${MON_RE}\\s?[ ./\\-]?\\s?(\\d{4}|\\d{2})(?![0-9])`, 'g'), (m) => add(m, monthNum(m[1]), yr(m[2]), 'MMM YY'));
  // DD/MM/YY(YY) with real separators
  run(new RegExp(`(?<![0-9])(\\d{1,2})\\s?${sep}\\s?(\\d{1,2})\\s?${sep}\\s?(\\d{4}|\\d{2})(?![0-9])`, 'g'), (m) => add(m, +m[2], yr(m[3]), 'DD/MM/YY', +m[1]));
  // DD MM YYYY with spaces only; DD MM YY with spaces is kept but only counts when a label claims it
  run(/(?<![0-9])(\d{1,2}) (\d{1,2}) (20\d{2})(?![0-9])/g, (m) => add(m, +m[2], +m[3], 'DD MM YYYY', +m[1]));
  run(/(?<![0-9])(\d{1,2}) (\d{1,2}) (\d{2})(?![0-9])/g, (m) => add(m, +m[2], yr(m[3]), 'DD MM YY (label)', +m[1]));
  // MM/YY(YY)
  run(new RegExp(`(?<![0-9./\\-])(\\d{1,2})\\s?${sep}\\s?(\\d{4}|\\d{2})(?![0-9]|${sep}\\d)`, 'g'), (m) => add(m, +m[1], yr(m[2]), /^\d{1,2}\s?[.,]\s?\d{2}$/.test(m[0]) ? 'MM.YY (label)' : 'MM/YY'));
  // Day and month with no year ("11 NOV"): the year is assumed by the caller
  run(new RegExp(`(?<![0-9])(\\d{1,2})\\s?[ ./\\-]?\\s?${MON_RE}(?![A-Z0-9])`, 'g'), (m) => add(m, monthNum(m[2]), 2000, 'DD MMM', +m[1]));
  return out;
}

/** Year for a date printed without one, at month level: this month or later is this year, earlier months next year. */
function nextYear(_day: number, month: number, now: Date): number {
  return month >= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() + 1;
}

export function parseDates(raw: string, now: Date = new Date()): ParseResult {
  const t = normalise(raw);
  const labels = [...t.matchAll(LABEL_RE)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, batch: false }));
  const batchLabels = [...t.matchAll(BATCH_RE)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, batch: true }));
  const allLabels = [...labels, ...batchLabels].sort((a, b) => a.start - b.start);
  // MMYYYY glued after a label ("BB 062027")
  const extra: Raw[] = [];
  for (const l of labels) {
    const m = t.slice(l.end).match(/^\W{0,3}(0[1-9]|1[0-2])(20\d{2})(?![0-9])/);
    if (m) extra.push({ start: l.end, end: l.end + m[0].length, month: +m[1], year: +m[2], kind: 'MMYYYY' });
    // DDMMYY glued after a label, where OCR dropped the spaces ("BEST BEFORE 060227")
    const g = t.slice(l.end).match(/^\W{0,3}(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})(?![0-9])/);
    if (g && !m) extra.push({ start: l.end, end: l.end + g[0].length, month: +g[2], year: yr(g[3]), day: +g[1], kind: 'DDMMYY' });
  }
  const lo = now.getFullYear() * 12 + now.getMonth();
  const hi = lo + 120;
  const hits: DateHit[] = [];
  const cands = [...scan(t), ...extra].sort((a, b) => a.start - b.start);
  // a label claims only the first candidate after it, and only if no other label sits between them
  const claimed = new Set<Raw>();
  const notDates = new Set<Raw>();
  for (const l of allLabels) {
    const first = cands.find((r) => r.start + 1 >= l.end);
    if (!first || first.start - l.end > 22) continue;
    if (allLabels.some((o) => o !== l && o.start >= l.end - 1 && o.end <= first.start + 1)) continue;
    (l.batch ? notDates : claimed).add(first);
  }
  for (const r of cands) {
    if (notDates.has(r)) continue;
    if ((r.kind === 'DD MM YY (label)' || r.kind === 'MM.YY (label)') && !claimed.has(r)) continue; // a bare "12.26" is as likely a price or weight
    let yearAssumed = false;
    if (r.kind === 'DD MMM') {
      r.year = nextYear(r.day!, r.month, now);
      if (!r.year) continue;
      yearAssumed = true;
    }
    const idx = r.year * 12 + (r.month - 1);
    const labelled = claimed.has(r);
    const expired = idx < lo;
    if (idx > hi || idx < lo - EXPIRED_MONTHS) continue;
    if (expired && !labelled && !FULL_DATE.has(r.kind)) continue; // a bare past MM/YY is more likely a code
    if (PROD_RE.test(t.slice(Math.max(0, r.start - 14), r.start))) continue;
    hits.push({ month: r.month, year: r.year, day: r.day, text: t.slice(r.start, r.end), kind: r.kind, labelled, ...(yearAssumed ? { yearAssumed } : {}), ...(expired ? { expired } : {}) });
  }
  if (!hits.length) return { best: null, all: [], confidence: 0 };
  const key = (h: DateHit) => h.year * 12 + h.month;
  // tier 0: real dates, and labelled past ones (labelled first, then the future one, then the later). 1: year assumed. 2: unlabelled past.
  const tier = (h: DateHit) => (h.expired && !h.labelled ? 2 : h.yearAssumed ? 1 : 0);
  hits.sort((a, b) => tier(a) - tier(b) || Number(b.labelled) - Number(a.labelled) || Number(!!a.expired) - Number(!!b.expired) || key(b) - key(a));
  const best = hits[0];
  const distinct = new Set(hits.map(key)).size;
  let c = best.labelled ? 0.85 : 0.6;
  if (best.kind === 'MM/YY' || best.kind === 'YYYY-MM') c -= 0.1;
  if (best.kind === 'DD MMM YY' || best.kind === 'MMM YY') c += 0.1;
  if (distinct > 1) c -= 0.2;
  if (best.yearAssumed) c = Math.min(c, 0.45);
  if (best.expired) c = Math.min(c, 0.6); // never sure on its own: it needs two agreeing frames
  return { best, all: hits, confidence: Math.max(0.05, Math.min(0.95, c)) };
}

export const fmtMY = (d: MonthYear) => `${String(d.month).padStart(2, '0')}/${d.year}`;
export const monthName = (m: number) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
export function addMonths(d: MonthYear, n: number): MonthYear {
  const i = d.year * 12 + (d.month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
