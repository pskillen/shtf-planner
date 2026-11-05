# Scanning

**Status:** Done (barcodes, stocktake and best-before dates read by the camera).
**Tracking:** none

Pick up a tin, scan its barcode, say what it is (once per product: the app remembers), set the
best-before month (the camera can read it off the pack), OK, next. Quick add can scan too. Barcodes the app has not met are looked up on
Open Food Facts for a name and size; offline, scans wait in a queue and are sorted later. It works
in Chrome on Android (torch, zoom, tap to focus) and degrades cleanly in Firefox on Android.

## Map

| Piece               | Where                                                                                               | What                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Camera stream       | `src/scan/camera.ts`                                                                                | One stream per screen; torch, zoom, focus each applied on its own; `captureBox` of the framing box       |
| Barcode loop        | `src/scan/barcode.ts`                                                                               | `BarcodeDetector` where it has EAN, else zxing (lazy chunk); every other zxing attempt turned 90 degrees |
| Open Food Facts     | `src/scan/openFoodFacts.ts`                                                                         | `offClient()`: lookup, own rate limit, the identification string                                         |
| Date reader         | `src/scan/ocr/` (`client.ts`, `ocr.worker.ts`, `paddle.ts`, `reader.ts`, `image.ts`, `provider.ts`) | PaddleOCR in a web worker on onnxruntime-web, WebGPU or WASM; grey-image helpers                         |
| Date loop           | `src/scan/dateLoop.ts`                                                                              | Capture, gates (glare, flat, moving, blurred), one read at a time, agreement, timeout                    |
| Date parser, tally  | `src/engine/datecode/`                                                                              | Reader text to month-years; passes to a frame verdict; frames to an answer. Pure                         |
| Date card           | `screens/stores/DateReader.tsx`, `ReadDateSheet.tsx`, `DateAbout.tsx`                               | Status line, result card, suggestions; quick add's sheet; the "About the date reader" line               |
| Models, notice      | `public/ocr/`                                                                                       | FP16 PaddleOCR models, `NOTICE.md`, Apache-2.0 text, the self-test label                                 |
| Tunables            | `src/scan/tunables.ts`, `screens/stores/stocktakeTunables.ts`                                       | Intervals, zoom, timeouts, limits, box shapes, Undo time, buzz patterns: one line each                   |
| Camera strip        | `src/app/components/CameraStrip.tsx`                                                                | The live strip, framing box, step chip, torch, zoom, tap to focus; "no camera" and fallback lines        |
| The card for a code | `screens/stores/ScanResolve.tsx`                                                                    | Known: straight on. Unknown: Open Food Facts, "Which of these is it?", search, own item, sort later      |
| Quick add's scanner | `screens/stores/ScanSheet.tsx`                                                                      | The strip, type the number, find it by name                                                              |
| Stocktake           | `screens/stores/StocktakeScreen.tsx`, route `/app/stores/stocktake`                                 | Step 1 BARCODE, step 2 DATE, OK, Undo, Done summary                                                      |
| Scans to sort       | `screens/stores/ScansToSort.tsx`, `useScanQueue.ts`                                                 | The queue note on Stores, its sheet, and the lookup of queued codes when online                          |
| Pure pieces         | `src/util/gtin.ts`, `src/engine/productMatch.ts`                                                    | Check digit and normalising; Open Food Facts categories to likely item types                             |
| Document            | `barcodes`, `scans` (schema 3)                                                                      | See [Data model](../data-model/README.md)                                                                |
| Test support        | `e2e/fakeCamera.ts`, `test/helpers/fakeScan.ts`                                                     | A canvas as the camera; a fake Open Food Facts                                                           |

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
`e2e/stocktake.spec.ts` and `e2e/dates.spec.ts`, which use `e2e/fakeCamera.ts`: `getUserMedia` returns a canvas stream and
`window.__fakeCam.show({ ean, sideways, text })` draws a rendered EAN-13 or a text label. It can report Chrome's controls or
none, and install a fake `BarcodeDetector` or remove it so zxing runs, so it needs no real camera
and runs in CI. With `?debug=1`, `window.__shtf.scan.code('...')` injects a code into the active scanner.

## Known gaps

- Only a phone can say how well the real camera, torch, zoom and focus behave; the fake camera
  proves the flow, not the optics.
- A code held sideways is read by zxing's retry only if its whole length fits the tall box.
- Only a phone can say how accurate the date reader is on real print (the e2e reads synthetic
  labels), how long a read takes there, whether WebGPU helps, and how much memory the models use.
- The date step's strip is the compact one, so the framing box on screen is small; the reader sees
  the full video resolution inside it, but aiming is on a thin strip.
- Only upright text is read (no rotation); day-level dates are stored as month-year; a misaligned
  print is not re-aimable (no nudging the crop).
- A remembered barcode can be corrected with Not this item? but not forgotten.
- iOS Safari is not a target.

## Reading dates

On the date step (stocktake) and in Quick add's **Read the date** sheet, the camera reads the
best-before month off the pack, on the phone, with no network once installed. The person sees what
was read with its expiry colour, and **nothing is saved until they OK it** (or tap a suggestion in
the stocktake).

**The flow.** The strip turns yellow (**2 DATE**, taller box) and the reader starts by itself when
"Read dates with the camera" is on (a switch on the stocktake screen, on by default, remembered per
device). One status line says exactly one of: _Getting the date reader ready…_ (first use after
install), _Looking for a date…_, _Hold still_, _Glare: tilt the phone a little_, _Reading…_,
_Got Jun 2027 once, checking…_, _Got it_, _No date found_.

- **Got it**: two buzzes, the loop stops, a card shows the month large, the expiry word and colour,
  "year assumed" where it applies, and the small crop that was read (in memory only). The month
  field below is set to it, so a wrong read is fixed by a chip or the month box. **OK** saves.
  **Read again** starts over.
- **No date found** (after 8 s, or **Stop**): up to three suggestion buttons, best first, each with
  its expiry colour. In the stocktake a tap saves that month and goes to the next barcode (it is the
  person's choice); in Quick add it sets the field.
- **Not available** (models not downloaded and offline, or the load failed): the status says so and
  the month field works as before.
- **Quick add**: a **Read the date** button (only where the browser has a camera) opens a sheet with
  the strip and the same card; **Use this date** sets the field and closes; the person still taps Add.
- **Done summary** adds "dates by camera 9 · picked 4 · from a suggestion 1 · date step 3.2 s
  (median)" and a **Copy summary** button (counts and times only: no text read, no codes, no images).

**Agreement and gates** (numbers are named constants: the tally ones in
`src/engine/datecode/tally.ts`, the loop's in `src/scan/tunables.ts`).

- One frame is read in up to five pictures of the box (shrunk and stretched, native size, inverted,
  inverted native, adaptive threshold last); a pass is _sure_ when the parser's confidence is at least
  0.7, the text reader's at least 0.75 and the year was not assumed. A frame stops at the first sure
  pass, or at two agreeing passes.
- A date settles when two frames give the same month and year, or one frame is confident (0.85) with
  no assumed year. A year-assumed or expired read never settles alone.
- Gates: **glare** (20 to 65 % of the box at 250+ grey: say so, skip; after 25 in a row read anyway);
  **flat** (sharpness under 2: nothing to read); **steadiness** (the first frame is never read; skip a
  frame that moved more than 18 grey levels or is under half as sharp as the sharpest recently; at most
  4 skips in a row, then one is read anyway). One read in flight at a time.

**The reader.** PaddleOCR (PP-OCRv3 mobile detection and PP-OCRv5 English mobile recognition, float16
weights) on onnxruntime-web 1.20.1, in a **web worker** so the screen stays smooth. WebGPU is used only
when the person has not switched it off, the browser has it, an adapter comes back, both models create
and a **self-test** (a synthetic "BEST BEFORE 06/2027" label, read in the worker) comes out right;
otherwise both sessions are made again on WASM (single-threaded: threads need cross-origin isolation,
decision 134). A collapsed **About the date reader** line shows "WebGPU · last read 0.4 s" or "WASM ·
last read 1.5 s" (and why WASM) and holds the per-device WebGPU switch. The worker is stopped when the
stocktake or the sheet goes away; the next use reloads from the cache.

**Offline and size.** The service worker precaches the worker, the single hashed ORT wasm
(21,663,894 B, 20.7 MiB, 5.2 MB gzipped), the two models and `dict.txt` (5,301,452 B). The whole
precache is about 27.4 MiB, roughly 10 MB downloaded once at install. Workbox's per-file limit is
raised to 24 MiB; Cloudflare Pages refuses files over 25 MiB, so the wasm fits. No Tesseract, no
other models, no cloud text reading.

**Privacy.** Frames are read in memory and dropped: never stored (not in the document, IndexedDB or
localStorage; only the two on/off switches are kept) and never sent anywhere. The e2e checks that no
request leaves the app's origin and that nothing image-shaped is in storage.

**Models and licences.** PaddleOCR (PaddlePaddle), Apache-2.0, ONNX conversions from
huggingface.co/monkt/paddleocr-onnx, with the weights stored as float16 by the spike's shrink script
(a modification; the calculation stays float32). onnxruntime-web is MIT. Text, checksums and the
Apache-2.0 licence are in `public/ocr/NOTICE.md` and `public/ocr/LICENSE-Apache-2.0.txt`.

### The parser

The text-to-date step is `src/engine/datecode/parse.ts`, a pure parser: text in, month-years out, today passed in. Its rules:

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

The date reader's tests: `src/engine/datecode/*.test.ts` (152 parser cases, agreement rules),
`src/scan/dateLoop.test.ts` (scripted camera and reader), `src/scan/ocr/*.test.ts` (images, the
provider choice, the worker client with a fake worker, and `paddle.node.test.ts`, which runs the real
float16 models on WASM in node over the synthetic labels in `test/fixtures/datecodes/`, made by
`scripts/datecode-fixtures.mjs`), `test/date-reader.test.tsx` (screens with a fake reader), and
`e2e/dates.spec.ts` (the real worker and models, offline after install, the unavailable fallback,
quick add, privacy). Headless Chrome has no WebGPU adapter, so the e2e runs the WASM path.
