// Run: npm run test:parse   (node --experimental-strip-types)
import { parseDates, fmtMY } from './parse.ts';

const NOW = new Date(2026, 10, 15); // 15 Nov 2026

// [ocr text, expected "MM/YYYY" or null (must NOT produce a date)]
export const CASES: [string, string | null, boolean?, boolean?][] = [ // [text, want, year assumed?, expired?]
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
  ['BB 10/2026', '10/2026', false, true], // last month, labelled: expired (round 4a; was none)
  ['BB 11/2036', '11/2036'], // exactly +10y
  ['BB 12/2036', null],
  ['BB O6/2O27', '06/2027'],
  ['BB 0G/2027', null], // G not a digit; do not guess
  ['BB l2/2028', '12/2028'],
  ['BB 06 / 2027', '06/2027'],
  ['BB 06-2027', '06/2027'],
  ['BB 06.27', '06/2027'],
  ['06/27', null], // round 4a: a bare unlabelled MM/YY is too weak to be a result (suggestion only)
  ['BB 06/27', '06/2027'],
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
  ['11 NOV C121206L MD013', '11/2026', true], // no year, month level: Nov is this month, so this year even though the 11th has passed
  ['2214101225014133-2 Expire ???? 22.10.27', '10/2027'],
  ['SEP 2028 Best Before End: Batch Code: 23 09 26 21:01', '09/2028'],
  ['Best Before: 06 10 2028 12:29', '10/2028'],
  // ---- round 2: raw strings the phone OCR returned (owner's first session)
  ['best Bel 11 NOV Keep ef C12120AL MD013', '11/2026', true],
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
  ['BEST BEFORE 14 NOV', '11/2026', true], // day already past this month: still this year
  ['BEST BEFORE 14 OCT', '10/2027', true], // earlier month: next year
  ['03 JAN', '01/2027', true],
  ['29 FEB', '02/2027', true],
  ['11 NOVEMBER', '11/2026', true],
  ['11 NOVA', null],
  ['BB 06/2027 11 NOV', '06/2027'], // a real date beats an assumed-year one

  // ---- round 4a: expired dates (decision 135). Up to 2 years back, only with a label or as a full day-month-year; today 15 Nov 2026
  ['BEST BEFORE 09/2026', '09/2026', false, true], // labelled past
  ['BB 06/2025', '06/2025', false, true], // 17 months back
  ['USE BY 14 MAR 2026', '03/2026', false, true],
  ['EXP 12.25', '12/2025', false, true],
  ['BB 11/2024', '11/2024', false, true], // exactly 24 months back
  ['BB 10/2024', null], // 25 months back
  ['BB 06/2020', null], // far past
  ['05.06.26', '06/2026', false, true], // unlabelled full DD.MM.YY
  ['12/03/2026', '03/2026', false, true], // unlabelled full DD/MM/YYYY
  ['14 MAR 26', '03/2026', false, true], // unlabelled DD MMM YY
  ['22 03 2026', '03/2026', false, true], // spaced DD MM YYYY
  ['22 03 26', null], // spaced DD MM YY still needs a label
  ['BEST BEFORE 22 03 26', '03/2026', false, true],
  ['09/2026', null], // bare past MM/YY: probably a code
  ['09/26', null],
  ['SEP 26', null], // bare past MMM YY
  ['L2314B 09 26', null], // batch-code-looking runs
  ['LOT 12 03 2026', null],
  ['BATCH 05.06.26', null],
  ['BATCH CODE: 22 03 2026', null],
  ['PACKED 05.06.26', null], // a pack date is never an expiry date
  ['PROD 10/2025 BB 10/2027', '10/2027'],
  ['BB 06/2027 BB 06/2026', '06/2027'], // future and past both labelled: the future one
  ['BB 09/2026 06/2027', '09/2026', false, true], // labelled past beats unlabelled future
  ['09/2026 05.06.26', '06/2026', false, true], // two unlabelled: only the full past date counts
  ['BB 12/2026 05.06.26', '12/2026'], // labelled future beats unlabelled full past
  ['12/2027 05.06.26', '12/2027'], // future beats unlabelled past
  ['05.06.26 11 NOV', '11/2026', true], // an assumed-year read beats an unlabelled past date
  ['BB 09/2026 11 NOV', '09/2026', false, true], // ...but a labelled past date beats an assumed one
  // the owner's 09/2026 misread: raw OCR '01:612229 . 12.26'. The 09/2026 is not in the text. 12.26 matched bare MM.YY,
  // which reads like a price or weight, so a dotted two-digit-year MM.YY now needs a label
  ['01:612229 . 12.26', null],
  ['12.26', null],
  ['BB 12.26', '12/2026'],
  ['500mle 4335619112049 D 2214101225014133-2 Expirel 10.27 ATD', '10/2027'], // washup, wide crop: the label came out as Expirel
  ['EXPIREL 12.26', '12/2026'],
  ['BB 06/27', '06/2027'],
  ['12/26', null], // a slash does not make it stronger
  ['12/2026', '12/2026'], // a four-digit year is specific enough
  // ---- round 4a: the crisp packet (12 Jun 2027, three printed lines, no label)
  ['12 06 27 GBS 305 255 05:13 2004', null], // the printed lines joined
  ['1206 27 089 306 390 05:13 2004 POPPED', null], // what the phone OCR returned
];

// suggestions: weak runs that never become a result but are offered as one-tap choices (today 15 Nov 2026)
const SUGGEST: [string, string[]][] = [
  ['01:612229 . 12.26', ['12/2026']], // the rice bag's half-read batch code
  ['12 06 27 GBS 305 255 05:13 2004', ['06/2027']], // the crisp packet, as printed
  ['1206 27 089 306 390 05:13 2004 POPPED', ['06/2027']], // ...as the phone read it
  ['06/27 09/26', ['06/2027', '09/2026']], // future before past
  ['L2314B', []],
  ['BB 06/2027', []], // a result needs no suggestion
  ['LOT 12 03 2026', []], // batch codes are not offered
  ['12.26 AB 12 06 27 CD 05/28 EF 01.29', ['12/2026', '06/2027', '05/2028']], // at most three
];
// month-level year with a different today: the wide-crop milk read `1 NOV` on 5 Nov 2026 is 11/2026
const EXTRA: [string, Date, string | null][] = [
  ['MILK / JC FAT / 1 NOV', new Date(2026, 10, 5), '11/2026'],
  ['11 NOV', new Date(2026, 10, 20), '11/2026'],
  ['11 NOV', new Date(2026, 11, 1), '11/2027'],
];
let ok = 0;
const fails: string[] = [];
for (const [text, want, assumed, expired] of CASES) {
  const r = parseDates(text, NOW);
  const got = r.best ? fmtMY(r.best) : null;
  const gotAssumed = !!r.best?.yearAssumed;
  const gotExpired = !!r.best?.expired;
  if (got === want && gotAssumed === !!assumed && gotExpired === !!expired) ok++;
  else fails.push(`  "${text}" -> ${got}${gotAssumed ? ' (year assumed)' : ''}${gotExpired ? ' expired' : ''} (want ${want}${assumed ? ' (year assumed)' : ''}${expired ? ' expired' : ''})`);
}
for (const [text, now, want] of EXTRA) {
  const r = parseDates(text, now);
  const got = r.best ? fmtMY(r.best) : null;
  if (got === want && r.best?.yearAssumed) ok++; else fails.push(`  "${text}" @${now.toDateString()} -> ${got} (want ${want})`);
}
for (const [text, want] of SUGGEST) {
  const got = parseDates(text, NOW).suggestions.map((x) => fmtMY(x));
  if (JSON.stringify(got) === JSON.stringify(want)) ok++; else fails.push(`  suggestions for "${text}" -> ${got.join(',')} (want ${want.join(',')})`);
}
console.log(`parser: ${ok}/${CASES.length + EXTRA.length + SUGGEST.length} (${((100 * ok) / (CASES.length + EXTRA.length + SUGGEST.length)).toFixed(1)}%)`);
for (const f of fails) console.log(f);
if (fails.length) throw new Error("parser cases failed");
