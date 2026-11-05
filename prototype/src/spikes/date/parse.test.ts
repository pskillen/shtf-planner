// Run: npm run test:parse   (node --experimental-strip-types)
import { parseDates, fmtMY } from './parse.ts';

const NOW = new Date(2026, 10, 15); // 15 Nov 2026

// [ocr text, expected "MM/YYYY" or null (must NOT produce a date)]
export const CASES: [string, string | null, boolean?][] = [
  ['BB 06/2027', '06/2027'],
  ['L2314B 14:32 BB 06/2027', '06/2027'],
  ['BEST BEFORE END 03/2028', '03/2028'],
  ['BEST BEFORE 14/06/2027', '06/2027'],
  ['BEST BEFORE 14.06.27', '06/2027'],
  ['USE BY 22 MAR 2027', '03/2027'],
  ['USE BY 22MAR27', '03/2027'],
  ['BBE 12/27', '12/2027'],
  ['BBE: 12 2027', null], // bare "MM YYYY" with a space: too ambiguous
  ['BB 062027', '06/2027'],
  ['B.B. 09/2029', '09/2029'],
  ['BEST BEFORE END JUN 2028', '06/2028'],
  ['14 JUN 27', '06/2027'],
  ['JUN 2027', '06/2027'],
  ['SEP 28', '09/2028'],
  ['BB SEPT 2028', '09/2028'],
  ['EXP 05.2028', '05/2028'],
  ['EXP 2028-05-31', '05/2028'],
  ['L2314B 14:32', null],
  ['L2314B', null],
  ['14:32', null],
  ['LOT 4471 08:15:22', null],
  ['PROD 10/2025 BB 10/2027', '10/2027'],
  ['MFD 03/2026 EXP 03/2028', '03/2028'],
  ['PACKED 14/05/2026', null],
  ['BB 06/2020', null], // expired
  ['BB 06/2040', null], // >10 years
  ['BB 11/2026', '11/2026'], // this month counts
  ['BB 10/2026', null], // last month
  ['BB 11/2036', '11/2036'], // exactly +10y
  ['BB 12/2036', null],
  ['BB O6/2O27', '06/2027'],
  ['BB 0G/2027', null], // G not a digit; do not guess
  ['BB l2/2028', '12/2028'],
  ['BB 06 / 2027', '06/2027'],
  ['BB 06-2027', '06/2027'],
  ['BB 06.27', '06/2027'],
  ['06/27', '06/2027'],
  ['13/27', null], // no month 13
  ['31/02/2027', null], // no 31 Feb
  ['BB 30.06.2027 L77', '06/2027'],
  ['L19 06/2027 22:10', '06/2027'],
  ['BEST BEFORE SEE LID', null],
  ['BEST BEFORE END OF 2027', null],
  ['EAN 5000169005743', null],
  ['2L 750G 06/2027', '06/2027'],
  ['BB 06/2027 BB 06/2026', '06/2027'], // later of two, label on first
  ['PRODUCED 01/2026 12/2027', '12/2027'],
  ['USE BY 05 JAN 2027 04:12', '01/2027'],
  ['USE BY END 01 2027', null],
  ['', null],
  ['ABCDEF', null],
  ['BB 6/2027', '06/2027'],
  ['EXP 12/2026 LOT 1/2027', '12/2026'.replace('12/2026', '12/2026')], // labelled beats later
  ['10.11.2029', '11/2029'],
  ['AUG-29', '08/2029'],
  ['BB AUGUST 2029', '08/2029'],
  ['BB 2029/08', '08/2029'],
  ['L1234 5678 99', null],

  // ---- round 2: strings printed on real Aldi/Lidl items (annotations.md), month-year only
  ['066JEP6090 BBE MAR 2028', '03/2028'],
  ['14:43 543018 BB 09/03/27', '03/2027'],
  ['29.01.27 502932125', '01/2027'],
  ['SEP27 L4 6272 19:10', '09/2027'],
  ['BEST BEFORE 06 02 27 C 6145 5 07:26', '02/2027'],
  ['11 NOV C121206L MD013', '11/2027', true], // no year: next 11 Nov after 15 Nov 2026
  ['2214101225014133-2 Expire ???? 22.10.27', '10/2027'],
  ['SEP 2028 Best Before End: Batch Code: 23 09 26 21:01', '09/2028'],
  ['Best Before: 06 10 2028 12:29', '10/2028'],
  // ---- round 2: raw strings the phone OCR returned (owner's first session)
  ['best Bel 11 NOV Keep ef C12120AL MD013', '11/2027', true],
  ['29,01.27', '01/2027'],
  ['066JEP6090 BBE MAR 2028 ', '03/2028'],
  ['SEP27 I 627219:13', '09/2027'],
  ['A', null],
  ['1 Best Befon 06 10 2028 12:29', '10/2028'],
  ['Best Befo n: 202O Batch Code: 2309 26', null], // cut off year, then a batch code
  ['2 BEN I', null],
  ['BN EV.', null],
  ['2', null],
  ['FEED', null],
  ['SEP27L4 6272 19:10', '09/2027'], // L4 is a code glued to the month, not part of the year
  ['BEST BEFORE 060227 C 61455 07:2', '02/2027'], // OCR dropped the spaces
  ['060227', null], // ...but only after a label
  // ---- round 2: the new rules
  ['06 10 2028', '10/2028'], // space-separated, 4-digit year
  ['06 10 28', null], // 2-digit year with spaces needs a label
  ['BEST BEFORE 06 10 28', '10/2028'],
  ['Best Befo 06 10 28', '10/2028'],
  ['BEST BEFORE END 06 10 28', '10/2028'],
  ['EXPIRES 06 10 28', '10/2028'],
  ['EXPIRY 06 10 2028', '10/2028'],
  ['EXP. 06 10 28', '10/2028'],
  ['BATCH 06 10 28', null],
  ['LOT 06 10 2028', null],
  ['CODE: 23 09 26', null],
  ['BEST BEFORE 15 NOV', '11/2026', true], // today counts
  ['BEST BEFORE 14 NOV', '11/2027', true],
  ['03 JAN', '01/2027', true],
  ['29 FEB', null], // next 29 Feb is 15 months away: past the 12-month cap
  ['11 NOVEMBER', '11/2027', true],
  ['11 NOVA', null],
  ['BB 06/2027 11 NOV', '06/2027'], // a real date beats an assumed-year one
];

let ok = 0;
const fails: string[] = [];
for (const [text, want, assumed] of CASES) {
  const r = parseDates(text, NOW);
  const got = r.best ? fmtMY(r.best) : null;
  const gotAssumed = !!r.best?.yearAssumed;
  if (got === want && gotAssumed === !!assumed) ok++;
  else fails.push(`  "${text}" -> ${got}${gotAssumed ? ' (year assumed)' : ''} (want ${want}${assumed ? ' (year assumed)' : ''})`);
}
console.log(`parser: ${ok}/${CASES.length} (${((100 * ok) / CASES.length).toFixed(1)}%)`);
for (const f of fails) console.log(f);
if (fails.length) throw new Error("parser cases failed");
