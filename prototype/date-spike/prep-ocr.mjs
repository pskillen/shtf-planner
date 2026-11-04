// Copies the OCR runtime files that live in node_modules into public/ocr so the app serves them itself
// (nothing is fetched from a CDN at runtime: on-device only). The models and eng.traineddata.gz are committed.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'public/ocr', p);
mkdirSync(out('tess'), { recursive: true });
mkdirSync(out('ort'), { recursive: true });
copyFileSync(nm('tesseract.js/dist/worker.min.js'), out('tess/worker.min.js'));
copyFileSync(nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), out('tess/tesseract-core-simd-lstm.wasm.js'));
copyFileSync(nm('tesseract.js-core/tesseract-core-lstm.wasm.js'), out('tess/tesseract-core-lstm.wasm.js'));
copyFileSync(nm('onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'), out('ort/ort-wasm-simd-threaded.wasm'));
copyFileSync(nm('onnxruntime-web/dist/ort-wasm-simd-threaded.mjs'), out('ort/ort-wasm-simd-threaded.mjs'));
console.log('ocr runtime files copied to public/ocr');
