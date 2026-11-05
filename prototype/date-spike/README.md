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

Committed assets and licences
- `public/ocr/paddle/det.onnx`: PP-OCRv3 mobile text detection, `rec.onnx` + `dict.txt`: PP-OCRv5 English mobile recognition.
  From huggingface.co/monkt/paddleocr-onnx (ONNX conversions of PaddlePaddle/PaddleOCR), Apache-2.0.
- `public/ocr/tess/eng.traineddata.gz`: `best_int` English model from the `@tesseract.js-data/eng` npm package, Apache-2.0.
- Tesseract.js, tesseract.js-core and onnxruntime-web come from npm (Apache-2.0 / MIT).
- No real-world photos are committed, only crop coordinates (`photo-crops.json`). The synthetic set is generated, not stored.
