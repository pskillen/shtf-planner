// Run: npm run test:parse   (node --experimental-strip-types)
import { parseDates, fmtMY } from './parse.ts';

const NOW = new Date(2026, 10, 15); // 15 Nov 2026

// [ocr text, expected "MM/YYYY" or null (must NOT produce a date)]
export const CASES: [string, string | null][] = [
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
];

let ok = 0;
const fails: string[] = [];
for (const [text, want] of CASES) {
  const r = parseDates(text, NOW);
  const got = r.best ? fmtMY(r.best) : null;
  if (got === want) ok++;
  else fails.push(`  "${text}" -> ${got} (want ${want})`);
}
console.log(`parser: ${ok}/${CASES.length} (${((100 * ok) / CASES.length).toFixed(1)}%)`);
for (const f of fails) console.log(f);
if (fails.length) process.exitCode = 1;
