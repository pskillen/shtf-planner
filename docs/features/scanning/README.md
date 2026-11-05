# Scanning

**Status:** Done (barcodes and stocktake). Reading best-before dates from the camera is a later step.
**Tracking:** none

Pick up a tin, scan its barcode, say what it is (once per product: the app remembers), set the
best-before month, OK, next. Quick add can scan too. Barcodes the app has not met are looked up on
Open Food Facts for a name and size; offline, scans wait in a queue and are sorted later. It works
in Chrome on Android (torch, zoom, tap to focus) and degrades cleanly in Firefox on Android.

## Map

| Piece               | Where                                                               | What                                                                                                     |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Camera stream       | `src/scan/camera.ts`                                                | One stream per screen; torch, zoom, focus each applied on its own; `captureBox` of the framing box       |
| Barcode loop        | `src/scan/barcode.ts`                                               | `BarcodeDetector` where it has EAN, else zxing (lazy chunk); every other zxing attempt turned 90 degrees |
| Open Food Facts     | `src/scan/openFoodFacts.ts`                                         | `offClient()`: lookup, own rate limit, the identification string                                         |
| Tunables            | `src/scan/tunables.ts`, `screens/stores/stocktakeTunables.ts`       | Intervals, zoom, timeouts, limits, box shapes, Undo time, buzz patterns: one line each                   |
| Camera strip        | `src/app/components/CameraStrip.tsx`                                | The live strip, framing box, step chip, torch, zoom, tap to focus; "no camera" and fallback lines        |
| The card for a code | `screens/stores/ScanResolve.tsx`                                    | Known: straight on. Unknown: Open Food Facts, "Which of these is it?", search, own item, sort later      |
| Quick add's scanner | `screens/stores/ScanSheet.tsx`                                      | The strip, type the number, find it by name                                                              |
| Stocktake           | `screens/stores/StocktakeScreen.tsx`, route `/app/stores/stocktake` | Step 1 BARCODE, step 2 DATE, OK, Undo, Done summary                                                      |
| Scans to sort       | `screens/stores/ScansToSort.tsx`, `useScanQueue.ts`                 | The queue note on Stores, its sheet, and the lookup of queued codes when online                          |
| Pure pieces         | `src/util/gtin.ts`, `src/engine/productMatch.ts`                    | Check digit and normalising; Open Food Facts categories to likely item types                             |
| Document            | `barcodes`, `scans` (schema 3)                                      | See [Data model](../data-model/README.md)                                                                |
| Test support        | `e2e/fakeCamera.ts`, `test/helpers/fakeScan.ts`                     | A canvas as the camera; a fake Open Food Facts                                                           |

## The stocktake

**Stores, Stocktake** (also "Stocktake a pile" in Quick add) opens a full screen under the Stores tab.

1. **Counting into: Pantry.** The place for the whole session; it starts at the last place used and
   can change at any time.
2. **1 BARCODE** (blue chip, wide short box). The camera looks continuously. Under the strip: torch,
   zoom (slider with minus and plus) and tap to focus where the browser has them, else one line
   saying so. **Type the number**, **Find it by name**, **Done**.
3. On a barcode there is one buzz. A **known** barcode (remembered by the household) goes straight to
   the date. An **unknown** one asks Open Food Facts (at most four seconds) and shows what it said with
   up to three likely pack types, **Search all types**, **Save as its own item** (a custom type
   filled in from the name and, with weight and energy, kcal per piece) and **Sort later**. The
   choice is remembered for that barcode, for the whole household, on all its devices.
4. **2 DATE** (yellow chip): quantity and the same month field as everywhere, with chips. A date set
   from a chip or a month gives two buzzes. The expiry word and colour show beside it. **OK** saves
   and goes straight to the next barcode, with a **6 second Undo** that takes exactly that addition
   back (a merged addition gives back only its own quantity) and puts the card back.
   Cancel and OK sit in a bar that stays above the tab bar (and the unknown-item card's buttons do the
   same), and the strip is shorter once a code is read, so neither needs a scroll on a 360 by 740 phone.
   Undo gives the undone item's card back only when nothing else is in progress; **Sort later** is off,
   with the reason, when there is no place to keep the scan in.

5. **Done** says "14 items in 5 min (2.8 a minute) · 2 to sort later".

A stocktake **adds** stock, like Quick add. It does not recount a place. An equipment type is never
offered as stock: a search that matches a stove routes to the equipment form.

## Barcode memory

`barcodes` maps the normalised GTIN (a UPC-A and its EAN-13 form are one key) to an item type, with
the name Open Food Facts gave it. It is part of the household document, so it syncs. A number that
fails its check digit is a misread and is ignored.

**Not this item?** If a remembered barcode turns out to be the wrong type, the date card of the
stocktake and Quick add's form both have **Not this item?**. It reopens "Which of these is it?"
(and Search all types) for that barcode; choosing a type replaces what the household remembers,
for all its devices, and keeps the first-seen date and the product name. **Keep** (stocktake) or
**Keep as it was** (Quick add) leaves it alone.

## Scans to sort

Offline, or when Open Food Facts does not know a code, **Sort later** keeps the scan (`scans`):
code, quantity and place (nothing sets a best-before on a scan today; a row shows one if it has one). It counts towards nothing until sorted. Stores shows "3 scans to
sort ›". When the device is online the app looks queued codes up by itself, oldest first, within its
rate limit, so the names are there. Tapping a row shows the same card; choosing a type makes stock
with `source: 'barcode'`, remembers the barcode and removes the scan. A scan sorted on another device
just disappears. Delete has an undo.

## Open Food Facts

- **Sent:** only the digits of the barcode in the URL, with the `fields` list; no cookies, no
  referrer, no name, place, photo or household fact. Photos are never fetched.
- **Only when:** the device is online and the household has not met the barcode, or the person said
  "Not this item?" for it, or it is a queued scan being sorted.
- **Rate limit:** Open Food Facts allows 15 reads a minute per IP. The client keeps to 10 in any
  rolling minute and answers "busy" beyond that; the queue waits a minute and tries again.
- **Identification:** `SHTF-Planner/<version> (https://prep.mm9pdy.net)`, no email. Sent as both
  `User-Agent` and `X-User-Agent`. Chrome (checked on 157) ignores the `User-Agent` set on `fetch`
  and sends its own, so `X-User-Agent` is what carries the identification; Open Food Facts allows
  that header in its CORS answer. Firefox was not available to check here.
- **Answers:** found, not found, `offline` (no network, a timeout, a server error) and `busy`.

## Browsers

|                           | Chrome on Android                                                   | Firefox on Android                                          |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Barcode reading           | native `BarcodeDetector` (EAN/UPC), reading what is in the wide box | zxing, upright, and a retry turned 90 degrees in a tall box |
| Torch, zoom, tap to focus | yes (zoom starts at 1.75x, remembered per browser)                  | not offered: one line says so                               |

zxing measured a median of 384 ms from barcode in frame to recognised on the owner's phone. The
camera stream is shared by the whole screen and never torn down between steps; frames are drawn to
a canvas and decoded there, so they never leave the phone. zxing (`@zxing/library` 0.23.0,
Apache-2.0) is its own lazily loaded chunk, so the main bundle does not carry it.

## Tests

`src/scan/*.test.ts` (loop with a fake detector and fake zxing, and real zxing on rendered bars;
Open Food Facts with a fake `fetch`; camera constraints with a fake track), `test/scan-resolve.test.tsx`,
`test/stocktake.test.tsx`, `test/lint-fence.test.ts` (the `src/scan` fence), and
`e2e/stocktake.spec.ts`, which uses `e2e/fakeCamera.ts`: `getUserMedia` returns a canvas stream and
`window.__fakeCam.show({ ean, sideways })` draws a rendered EAN-13. It can report Chrome's controls or
none, and install a fake `BarcodeDetector` or remove it so zxing runs, so it needs no real camera
and runs in CI. With `?debug=1`, `window.__shtf.scan.code('...')` injects a code into the active scanner.

## Known gaps

- Only a phone can say how well the real camera, torch, zoom and focus behave; the fake camera
  proves the flow, not the optics.
- A code held sideways is read by zxing's retry only if its whole length fits the tall box.
- Reading the best-before date from the camera is not built (the date step is the month field).
- A remembered barcode can be corrected with Not this item? but not forgotten.
- iOS Safari is not a target.

## Reading dates

The date step reads the best-before month from the pack with the camera. The text-to-date step is
`src/engine/datecode/parse.ts`, a pure parser: text in, month-years out, today passed in. Its rules:

- **Normalising.** Upper case. Newlines, tabs, `|` and `_` become spaces; `,` and `;` become `.`.
  Inside a run that already has a digit, `O` reads as 0 and `I`/`L` as 1, except a run glued to a
  month name keeps its I and L (`SEP27L4` is a date then a code). Times such as `14:32` are dropped.
- **Shapes.** `YYYY-MM(-DD)`; `DD MMM YY(YY)`, also glued (`14JUN27`); `MMM YY(YY)`; `DD/MM/YY(YY)`
  with real separators; `DD MM YYYY` with spaces; `DD MM YY` with spaces only when a label claims
  it; `MM/YY(YY)`; `DDMM YY` (day and month glued) only when labelled; `DD MMM` with no year; after
  a label, glued `MMYYYY` (`BB 062027`) and `DDMMYY` (`BEST BEFORE 060227`).
- **Labels**, tolerant of mangled reads: `BEST BEFORE (END)`, `BEFORE`, `USE BY (END)`, `BBE`, `BB`,
  `BBD`, `EXP` and up to six letters (`Expirel`), `U/B`. A label claims only the first date after
  it (within 22 characters) and only if no other label sits between. `BATCH (CODE)`, `LOT (NO)` and
  `CODE` mark the next run as a code, not a date. Dates after `PROD`, `MFD`, `MFG`, `PKD`, `PACKED`,
  `MADE` or `MANUFACTURED` are never expiry dates.
- **Range.** This month to 120 months ahead. A date with no year ("11 NOV") takes its year at month
  level: this month or later is this year, earlier months next year; it is "year assumed" and never
  confident alone. Past dates up to 24 months back are read as expired, but only with a label or a
  full day-month-year. A bare unlabelled `MM/YY` or `MM.YY`, an unlabelled spaced `DD MM YY` and a
  glued `DDMM YY` are never a result: they become suggestions, at most three.
- **Ranking.** Labelled first, then future before past, then later; year-assumed below real dates;
  unlabelled past last. Confidence is capped at 0.45 for an assumed year and 0.6 for an expired date.

`src/engine/datecode/tally.ts` turns passes into a frame verdict and frames into an answer; the
numbers are named constants there. `parse.test.ts` holds 152 cases and `tally.test.ts` the agreement
rules.
