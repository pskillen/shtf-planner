# Date-reading spike (throwaway, for P9)

Screens: `#/date` (reader on its own) and `#/stocktake` (timed mock stocktake). On-device only: every model and
runtime file is served from `/ocr` on the same origin; nothing is fetched from a CDN and no image leaves the phone.

Run: `npm ci && npm run build && npx vite preview --host 0.0.0.0 --port 4174` (build copies the runtime files from
`node_modules` into `public/ocr` via `date-spike/prep-ocr.mjs`).

Desktop checks: `npm test` (100-case parser table; was 59 before round 2), `python3 date-spike/gen.py DIR` (76 synthetic crops, seeded),
`npm run bench -- DIR tesseract paddle paddle-rec` (needs the set from gen.py; runs the same reader code in node).

Photo bench (round 2). The owner's phone photos are kept outside the repo; `photo-crops.json` holds only the crop
rectangles (pixels of the 1205x1600 photos) and the true date. `python3 date-spike/photo-crops.py PHOTO_DIR CROP_DIR`
cuts them the way the app's `captureBox()` does (and writes tight, loose and wide framings), then
`node --experimental-strip-types --no-warnings date-spike/photo-bench.ts CROP_DIR paddle tesseract` prints the tables.
`LEGACY=1` runs the round-1 reader (and Tesseract psm 7) for the before column. `date-spike/explore.ts` tries OCR
settings without the reader; `date-spike/sharp.ts` shows how the blur gate's sharpness number behaves.

Round 3 (camera control, frame agreement, glare, trials)
- `npm test` now also runs `src/spikes/date/loop.test.ts`: the scan loop with a scripted camera and engine (agreement, one confident
  read, assumed year, glare). `date-spike/confidence.ts` writes every pass of every crop with its confidences (where the "read alone"
  bar of 0.85 came from); `date-spike/trials.ts` runs the Sauvola grid, per-variant passes, variant sets and model sets on the photo crops
  (`MODE CROP_DIR [ENGINE] [VARIANTSET]`, see its header). Sauvola is bench-only: it did not raise right reads (`sauvola()` in `image.ts`).
- Models you can pick in the engine dropdown on the phone: FP16 and INT8 weights (made from the round-1 files by
  `date-spike/shrink-onnx.mjs`, weights only, no Python) and a PP-OCRv4 detector (from the npm package `paddle-ocr-onnx-models`,
  copied to `public/ocr/paddle/det4.onnx` by the prebuild, not committed). The default is unchanged.
- Camera: zoom slider, tap to focus, continuous focus where the browser offers them; the line under the strip says what it got. The
  remembered zoom is in localStorage per browser (`date-spike-zoom:<browser>`). "Need two frames to agree" is on by default on both screens.

Committed assets and licences
- `public/ocr/paddle/det.onnx`: PP-OCRv3 mobile text detection, `rec.onnx` + `dict.txt`: PP-OCRv5 English mobile recognition.
  From huggingface.co/monkt/paddleocr-onnx (ONNX conversions of PaddlePaddle/PaddleOCR), Apache-2.0.
- `public/ocr/paddle/{det,rec}-{fp16,int8}.onnx`: the two files above with weights stored as float16 or int8 by `date-spike/shrink-onnx.mjs`
  (compute stays float32). Same licence as their source, Apache-2.0. `det4.onnx` (not committed): PP-OCRv4 det from `paddle-ocr-onnx-models`
  (npm, Apache-2.0, a redistribution of huggingface.co/SWHL/RapidOCR).
- `public/ocr/tess/eng.traineddata.gz`: `best_int` English model from the `@tesseract.js-data/eng` npm package, Apache-2.0.
- Tesseract.js, tesseract.js-core and onnxruntime-web come from npm (Apache-2.0 / MIT).
- No real-world photos are committed, only crop coordinates (`photo-crops.json`). The synthetic set is generated, not stored.
