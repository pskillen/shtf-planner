# Date-reading spike (throwaway, for P9)

Screens: `#/date` (reader on its own) and `#/stocktake` (timed mock stocktake). On-device only: every model and
runtime file is served from `/ocr` on the same origin; nothing is fetched from a CDN and no image leaves the phone.

Run: `npm ci && npm run build && npx vite preview --host 0.0.0.0 --port 4174` (build copies the runtime files from
`node_modules` into `public/ocr` via `date-spike/prep-ocr.mjs`).

Desktop checks: `npm run test:parse` (59-case parser table), `python3 date-spike/gen.py DIR` (76 synthetic crops, seeded),
`npm run bench -- DIR tesseract paddle paddle-rec` (needs the set from gen.py; runs the same reader code in node).

Committed assets and licences
- `public/ocr/paddle/det.onnx`: PP-OCRv3 mobile text detection, `rec.onnx` + `dict.txt`: PP-OCRv5 English mobile recognition.
  From huggingface.co/monkt/paddleocr-onnx (ONNX conversions of PaddlePaddle/PaddleOCR), Apache-2.0.
- `public/ocr/tess/eng.traineddata.gz`: `best_int` English model from the `@tesseract.js-data/eng` npm package, Apache-2.0.
- Tesseract.js, tesseract.js-core and onnxruntime-web come from npm (Apache-2.0 / MIT).
- No real-world photos are used or committed. The synthetic set is generated, not stored.
