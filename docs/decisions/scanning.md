# Scanning and quick entry

**Status:** Accepted. See the [scanning hub](../features/scanning/README.md) and
[inventory](../features/inventory/README.md).

**Entry has to be faster than typing.** Camera barcode scanning was worth building only if
near-live, since a 20–30 s trip per item is slower than typing. Quick entry is search, month-year
expiry and the last place as the default; no USB scanner. [D25]

**Barcodes: zxing in the browser, or the native detector.** zxing measured a median 384 ms from
barcode in frame to recognised on an Android phone; the native `BarcodeDetector` is used where
Chrome has it. The scan screen shows which way to hold the barcode, and zxing also tries frames
turned 90°. [D101, D151]

**Open Food Facts for names and sizes.** It is reachable from the browser (CORS `*`). A barcode
Open Food Facts knows makes the product from it and asks only "Counts as: [suggested item]?"; an
unknown barcode asks name, size and item; a remembered barcode asks nothing. Scans made offline
wait in a queue in the document and are sorted later. [D64, D146, D168]

**The barcode-to-product memory belongs to the household** and syncs with it. [D146]

**Dates are read on the phone, never in the cloud.** Date photos never leave the phone. [D125]

**The date reader: PaddleOCR FP16 only, in a worker.** It ships the float16 PP-OCRv3 detection and
PP-OCRv5 recognition pair (about 4.8 MB), fetched on first use and kept in its own cache, same origin only, so a
household that never reads dates never downloads it ([#37](https://github.com/pskillen/shtf-planner/issues/37)),
and runs in a web worker. No Tesseract in the app. Why: on the photo bench
Tesseract read 3 of 9 dates and Paddle 8 of 9. [D131 → D144, D133]

**One onnxruntime wasm for both back ends.** WebGPU when the browser has it and it passes a
self-test, WASM otherwise, from the single `jsep` build. [D133, D153]

**No cross-origin isolation for now.** COOP/COEP headers (needed for threaded wasm) may break
Google sign-in, so the wasm runs single-threaded. Also left out: always binarising and dilating
(the photo bench contradicted it), Julian dates and batch-code extraction. [D134]

**A date with no year takes its year at month level.** This month or later is this year, earlier
months next year, so it is always under 12 months away, and it is marked "year assumed". Why:
day-level turned a misread "1 NOV" into the following year's November. [D130]

**A bare unlabelled MM/YY is never a result on its own.** It becomes a suggestion. Why: a half-read
batch code looked like a date. [D139]

**Expired dates are read** up to two years back, but only with a label or a full day-month-year.
[D135]

**A stocktake adds stock; it does not recount.** It adds exactly like quick add; recounting a place is a separate review action. [D149, D157]
