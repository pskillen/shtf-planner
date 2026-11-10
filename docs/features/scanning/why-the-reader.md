# Why the reader is what it is

Purpose: the measurements and rejected options behind the barcode and date readers, so nobody
re-runs the same experiments. The hub ([Scanning](README.md)) says how the readers behave today;
this page says why they were built that way. Numbers come from throwaway spikes (a prototype
branch, never merged) and the owner's phone runs before the reader shipped. Test labels were
photos of real packs; no photo, crop or product is kept in the repo.

## The go bars

**Barcode.** Scanning had to beat typing: median from barcode in frame to recognised **under 3 s**,
and Open Food Facts knowing **at least half** the items.

**Dates.** The date step went ahead only if, on the owner's phone and pile of tins: the right month
and year on **at least 60 %** of items, a **wrong** one on **under 5 %**, a typical date step **under
2 s**, and an engine download **under about 15 MB**. Otherwise the stocktake would ship with a fast
month picker only. A wrong date the reader is sure of matters most; a missed one only costs the
person a tap on a chip.

## Barcodes: why zxing, and why the rotated retry

- **zxing in the browser is fast enough.** On an Android phone in Firefox: median **384 ms** from
  barcode in frame to recognised, 5 of 7 scans under 0.5 s, worst 3 s. Open Food Facts found every
  food item scanned (it does not hold books' ISBNs).
- **Firefox on Android has no `BarcodeDetector`**, so zxing is the floor every browser gets; Chrome
  on Android uses its native detector where it reads EAN. zxing is a lazy chunk (about 128 kB
  gzipped), so the main bundle does not carry it.
- **zxing reads one orientation.** Turned 90 degrees the code did not read at all, so every other
  zxing attempt is turned 90 degrees, and the guide shows which way to hold it.
- **Frames are drawn from the live video**, not handed to zxing's own stream decoder, which resets
  the video element and would kill the one camera stream the barcode and date steps share.

## Dates: the results

**Desktop, synthetic labels** (76 rendered crops: clean, low contrast, blurred, curved, noisy,
inverse, rotated, dot-matrix, embossed):

| Engine                       | Right | Wrong | No read | Median |
| ---------------------------- | ----- | ----- | ------- | ------ |
| Tesseract.js                 | 62 %  | 0 %   | 38 %    | 232 ms |
| PaddleOCR detection + recog. | 84 %  | 1 %   | 14 %    | 246 ms |
| PaddleOCR recognition only   | 59 %  | 1 %   | 39 %    | 309 ms |

Every Paddle read with a confidence of 0.7 or more was right. Its one wrong read was dot-matrix
garbage the parser turned into a plausible date. Later parser rules took the synthetic set to 88 %
right, 0 % wrong.

**Desktop, real labels** (9 photos of packs, each cut tight, loose and wide: 27 crops): Paddle 24
right, 0 wrong, 3 not read (one print whose year was half hidden by the pack's border, at every
framing). Tesseract got 3 of the 9 tight crops. Framing matters: the only wrong Paddle read came
from the widest crop, where it picked up other text on the label.

**On the phone** (Android, the spike's reader on the main thread, single-threaded WASM):

| Run                      | Right         | Wrong    | Time                                                                     |
| ------------------------ | ------------- | -------- | ------------------------------------------------------------------------ |
| Reader alone, first      | 4 of 8        | 0        | reads that worked 1.7 to 3.2 s; misses ran to a 10 s timeout             |
| Reader alone, re-run     | 7 of 10       | 1 (10 %) | median 2.0 s; phone compute 1.5 s (desktop 0.2 s)                        |
| Timed stocktake, round 2 | 5 of 7        | 1        | 3.5 items a minute; date step 4.0 s, of which aiming 3.8 s               |
| Timed stocktake, round 4 | 6 of 9 (67 %) | 0        | date step median 7.2 to 8.2 s: aiming 4.1 to 5.0 s, compute 2.2 to 2.5 s |

Against the bar: right was met (67 %) and wrong was met (0 % in the last run); **the 2 s step was
not** (phone compute alone was over 2 s). The owner called the stocktake "pretty good, very usable"
and the reader shipped anyway, because the person confirms every date (nothing is saved without OK)
and a fallback is one tap.

**On the phone, the shipped worker** ([#36](https://github.com/pskillen/shtf-planner/issues/36)).
Two six-minute timed stocktakes on an Android phone, Chrome, one per back end, with the `?debug=1`
timing list. "Step" below is the loop's own median per date step; the screen's "date step" figure
is the wall time the person waits.

| Per back end                 | WebGPU (shipped default) | WASM (single thread) |
| ---------------------------- | ------------------------ | -------------------- |
| Reads                        | 76                       | 39                   |
| Per-read median, p90         | 1.2 s, 2.1 s             | 4.0 s, 6.8 s         |
| Model load                   | 7.3 s                    | 26.8 s               |
| Pictures tried per read      | 6 (median)               | 2 (median)           |
| Dates by camera (of items)   | 7 of 10                  | 4 of 9               |
| Date step on screen (median) | 14.0 s                   | 22.6 s \*            |
| Skipped for motion           | 84                       | 59                   |
| Items a minute               | 1.6                      | 1.6                  |

\* The WASM figure is the second run's cumulative median, so it includes the first run's steps.

Against the go bar: **right** (60 %) was met on WebGPU (7 of 10 by camera) and missed on WASM (4 of
9); **wrong** (under 5 %) had none reported in either run; **the 2 s step was missed** by both. The
reads themselves took 1.2 s on WebGPU, but the step took 12 to 14 s, mostly waiting for the phone to
be still: about 9 frames skipped a step, nearly all for motion (the gate fix is below). WebGPU is
3.3 times faster on reads and 3.7 times on load, so it stays the default. On WASM the first load
took long enough that the owner thought it had hung, and reads that found the date often failed to
agree twice in a row, because slow reads make consecutive frames differ more.

The biggest cost in a real stocktake is not reading at all: it is **dexterity** (holding the pack
and the phone, lining the date up and keeping it still). Barcodes are caught so fast that the buzz
is what tells you.

## Why PaddleOCR, and why FP16

- **Tesseract was set up for one line of text** in the first trial, which read nothing on real
  labels (two or three lines in the box). Told to expect a block it got 3 of 9 against Paddle's 8,
  missing every dot-matrix print, loose framing, reflection and low light. It is not shipped
  (about 4.5 MB saved). Paddle finds the lines first (detection), then reads each (recognition).
- **Models compared** on the 27 real crops:

| Model set                            | Download (gzip) | Right | Wrong | No read |
| ------------------------------------ | --------------- | ----- | ----- | ------- |
| PP-OCRv3 det + PP-OCRv5 rec, float32 | 9.4 MB          | 24    | 0     | 3       |
| **The same pair, float16 weights**   | **4.8 MB**      | 24    | 0     | 3       |
| The same pair, int8 weights          | 2.5 MB          | 22    | 0     | 5       |
| PP-OCRv4 det + v5 rec                | 11.6 MB         | 20    | 0     | 7       |
| PP-OCRv5 mobile det + v5 rec         | 11.8 MB         | 19    | 0     | 8       |
| PP-OCRv6 tiny det + rec              | 5.8 MB          | 14    | 2     | 11      |

Float16 weights read exactly as float32 at half the download, so they ship (the arithmetic stays
float32). Int8 weights lost reads and were slower. The v6 tiny pair made two wrong reads and its
multilingual dictionary emitted non-Latin junk in about one pass in seven; the 88 MB v5 server
detector was never a candidate.

- **In a web worker** because on the main thread the buttons were dead during a read (about
  0.1 s on desktop, far longer on a phone). **WebGPU only after a self-test** read comes out right;
  otherwise WASM. **WASM on one thread**: threads need cross-origin isolation (COOP and COEP
  headers), which may break Google sign-in. One ONNX Runtime wasm build serves both WebGPU and
  WASM, and it fits Cloudflare Pages' 25 MiB file limit.

## What the date parser had to handle

The first phone run's misses were mostly the **parser**, not the reader: the text was read, then
not understood. The parser's case table grew from 59 to 152 cases, from every printed string seen
and every raw string the phone produced. It is tuned against that table, so its own score is
optimistic.

- **Spaces and glue.** `06 10 2028` with spaces; day and month glued (`14JUN27`); after a label the
  reader can drop every space (`BEST BEFORE 060227`); a month name glued to a code (`SEP27L4` is a
  date then a code, not September 2714).
- **Mangled labels.** OCR turns "Before" into "Befon" and "Expires" into "Expirel", so labels are
  matched loosely. A label claims only the first date after it, and only if no other label sits
  between (`Best Before End: Batch Code: 23 09 26` gives no date).
- **Codes that look like dates.** Batch, lot and code runs are never dates; neither are dates after
  production labels (packed, made, MFD). Times (`14:32`) are dropped.
- **No year.** A date with no year (`11 NOV`) first took the next such day. On the phone a misread
  `1 NOV` (really 11 November this year) became November next year, so the year is now chosen at
  **month level**: this month or later is this year, earlier months next year. It is always
  "year assumed" and never settles on one frame [D130].
- **Bare month and year.** An unlabelled `12.26` won over a real date because it was half of a
  batch code. An unlabelled `MM/YY` or `MM.YY`, an unlabelled spaced `DD MM YY` and a glued
  `DDMM YY` are never a result, only suggestions [D139].
- **Expired dates.** At first only this month onwards could be read, so a pack already past its date
  was misread as a nearby future number. Past dates up to 24 months back now read, but only with a
  label or a full day-month-year, and never settle on one frame [D135].

## Agreement, gates and preprocessing

- **Agreement.** Over 103 crops, every wrong single pass had a parser confidence of 0.6 or less, so
  one frame settles only at 0.85 with a real year; otherwise two frames must agree. At 0.85 about a
  third of right frames stop on their own. Two frames of a still phone are almost the same picture,
  so agreement guards against noise, not against a consistent misread.
- **Steadiness.** The first gate remembered the sharpest frame too long (it faded 2 % a frame) and
  allowed 12 skips in a row, so one sharp frame made the next 35 look blurred: the phone skipped 11
  to 29 frames an item. The gentler gate in the hub took that to 4 to 12, almost all for motion.
  On the phone that was still too many, almost all for motion, so the gate was loosened to read small
  moves (26 grey levels) and skip at most two in a row; agreement, unchanged, guards against a loose
  frame. Measured on the same phone, both runs on WebGPU (the gate at 26 / 2 with a slightly larger
  box, against the old one):

  |                              | Old gate      | 26 / 2, larger box    |
  | ---------------------------- | ------------- | --------------------- |
  | Items a minute               | 1.6           | 3.4                   |
  | Dates by camera              | 7 of 10       | 8 of 10               |
  | Date step on screen (median) | 14.0 s        | 8.6 s                 |
  | Loop step median             | 11.9 s        | 4.0 s                 |
  | Skips a step (median)        | 9             | 3                     |
  | Skipped for motion, blur     | 84, 6         | 64, 0 (over 15 steps) |
  | Wrong reads                  | none reported | none reported         |

  The date step fell about 40 % (14.0 to 8.6 s) and no wrong read was reported, so the values stay. The two misses were
  half-missing ink and a 2023 code. The 2 s step bar is still not met; what remains is mostly the
  person aiming.

- **Glare.** The 20 to 65 % band is reasoned, not fitted: none of the test photos had real glare.
- **Preprocessing.** Five pictures of the box, cheapest first, stopping at the first sure pass:
  that cut the desktop median from 0.5 s to 0.19 s against trying every variant at two rotations.
  Rotations other than upright cost time and are off. Dilation was dropped, and Sauvola local
  thresholding (with or without dilation) gained nothing; on its own it read 14 of 27.
- **No digital zoom**: the box is already shrunk to 256 px high, so pixel count is not the limit.

## Rejected

- **Cloud OCR or a vision model.** Date photos never leave the phone [D125]; a cloud fallback could
  only come through a proxy, which the app does not have.
- **Tesseract** (above), and **ppu-paddle-ocr** (a wrapper library that downloads its models at run
  time from a third-party host, which breaks the same-origin, on-device rule; the same pipeline is
  about 150 lines here).
- **Always binarise and dilate**, **Julian dates**, **batch-code extraction**, **letter-by-letter
  matching across frames** (agreement is on the parsed month and year instead), **COOP and COEP
  headers**, and **iOS Safari workarounds** [D134].

## Related

- [Scanning](README.md): how the readers behave today, the parser's rules and the tunables.
- `src/engine/datecode/` (parser and tally), `src/scan/ocr/` (the worker), `src/scan/tunables.ts`.
