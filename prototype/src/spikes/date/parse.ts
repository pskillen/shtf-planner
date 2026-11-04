// Date parser over OCR text. Pure, no DOM. Month-year only is stored, so that is what we return.
// Policy: a wrong read is worse than none, so we only accept shapes we recognise, drop times and
// production dates, and only accept this month .. +10 years.

export type MonthYear = { month: number; year: number }; // month 1..12
export type DateHit = MonthYear & { text: string; kind: string; labelled: boolean; day?: number };
export type ParseResult = { best: DateHit | null; all: DateHit[]; confidence: number };

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MON_RE = '(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';
const monthNum = (s: string) => MONTHS.indexOf(s.slice(0, 3)) + 1;

const LABEL_RE = /(BEST\s*BEFORE(?:\s*END)?|USE\s*BY(?:\s*END)?|B\.?B\.?E\.?|B\.?B\.?|BBD|EXP(?:IRY|IRES)?|U\/?B)(?![A-Z])/g;
// Dates after these labels are made/packed dates, not expiry.
const PROD_RE = /(PROD(?:UCED|UCTION)?|MFD|MFG|PKD|PACKED|MADE|MANUFACTURED)\b[^0-9A-Z]{0,3}$/;

const sep = '[\\/.\\-]';

/** Normalise OCR text: uppercase, fix digit look-alikes only inside digit-ish runs, drop times. */
export function normalise(raw: string): string {
  let t = raw.toUpperCase().replace(/[\r\n\t|_]+/g, ' ').replace(/[,;]/g, '.').replace(/\s+/g, ' ');
  // O->0, I/L->1 when inside a run that already has a digit: "O6/2O27"
  t = t.replace(/[0-9OIL][0-9OIL\/.\-]*[0-9OIL]/g, (run) => (/[0-9]/.test(run) ? run.replace(/O/g, '0').replace(/[IL]/g, '1') : run));
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
  // MM/YY(YY)
  run(new RegExp(`(?<![0-9./\\-])(\\d{1,2})\\s?${sep}\\s?(\\d{4}|\\d{2})(?![0-9]|${sep}\\d)`, 'g'), (m) => add(m, +m[1], yr(m[2]), 'MM/YY'));
  return out;
}

export function parseDates(raw: string, now: Date = new Date()): ParseResult {
  const t = normalise(raw);
  const labels = [...t.matchAll(LABEL_RE)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
  // MMYYYY glued after a label ("BB 062027")
  const extra: Raw[] = [];
  for (const l of labels) {
    const m = t.slice(l.end).match(/^\W{0,3}(0[1-9]|1[0-2])(20\d{2})(?![0-9])/);
    if (m) extra.push({ start: l.end, end: l.end + m[0].length, month: +m[1], year: +m[2], kind: 'MMYYYY' });
  }
  const lo = now.getFullYear() * 12 + now.getMonth();
  const hi = lo + 120;
  const hits: DateHit[] = [];
  const cands = [...scan(t), ...extra].sort((a, b) => a.start - b.start);
  // a label claims only the first candidate after it
  const claimed = new Set<Raw>();
  for (const l of labels) {
    const first = cands.find((r) => r.start + 1 >= l.end);
    if (first && first.start - l.end <= 22) claimed.add(first);
  }
  for (const r of cands) {
    const idx = r.year * 12 + (r.month - 1);
    if (idx < lo || idx > hi) continue;
    if (PROD_RE.test(t.slice(Math.max(0, r.start - 14), r.start))) continue;
    const labelled = claimed.has(r);
    hits.push({ month: r.month, year: r.year, day: r.day, text: t.slice(r.start, r.end), kind: r.kind, labelled });
  }
  if (!hits.length) return { best: null, all: [], confidence: 0 };
  const key = (h: DateHit) => h.year * 12 + h.month;
  hits.sort((a, b) => Number(b.labelled) - Number(a.labelled) || key(b) - key(a));
  const best = hits[0];
  const distinct = new Set(hits.map(key)).size;
  let c = best.labelled ? 0.85 : 0.6;
  if (best.kind === 'MM/YY' || best.kind === 'YYYY-MM') c -= 0.1;
  if (best.kind === 'DD MMM YY' || best.kind === 'MMM YY') c += 0.1;
  if (distinct > 1) c -= 0.2;
  return { best, all: hits, confidence: Math.max(0.05, Math.min(0.95, c)) };
}

export const fmtMY = (d: MonthYear) => `${String(d.month).padStart(2, '0')}/${d.year}`;
export const monthName = (m: number) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
export function addMonths(d: MonthYear, n: number): MonthYear {
  const i = d.year * 12 + (d.month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
