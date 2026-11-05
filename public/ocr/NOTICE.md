# Third-party files in `public/ocr`

These files let the camera read a best-before date on the phone, offline. They are shipped as
they are, are precached by the service worker, and are fetched from this site only.

## `paddle/det-fp16.onnx`, `paddle/rec-fp16.onnx`, `paddle/dict.txt`

- **What:** PaddleOCR text detection (PP-OCRv3 mobile) and English text recognition (PP-OCRv5
  mobile), and the character list the recognition model uses.
- **Made by:** PaddlePaddle (PaddleOCR), https://github.com/PaddlePaddle/PaddleOCR
- **Licence:** Apache License 2.0 (the text is in `LICENSE-Apache-2.0.txt`).
- **Obtained as:** ONNX conversions published at https://huggingface.co/monkt/paddleocr-onnx
- **Modified:** the weights are stored as 16-bit floats instead of 32-bit, to halve the download
  (the calculation still runs in 32-bit). No other change. The reads were compared against the
  32-bit pair on a set of label photos and were the same.

| File             | Bytes     | SHA-256                                                            |
| ---------------- | --------- | ------------------------------------------------------------------ |
| `det-fp16.onnx`  | 1,316,846 | `50f2b4c145541102621813b5dadc9e2241d7f11e03eaa1b3b2e6c563a686da4f` |
| `rec-fp16.onnx`  | 3,983,190 | `e4f4c4ff194c7eaaeda6bd68e8f4e7a9fd9a2fe1e9dd96ebe1ee848881edfe3b` |
| `dict.txt`       | 1,416     | `e025a66d31f327ba0c232e03f407ae8d105e1e709e7ccb3f408aa778c24e70d6` |

## `selftest.png`

A synthetic label ("BEST BEFORE 06/2027") drawn for this app by `scripts/datecode-fixtures.mjs`.
The reader checks it on start-up before it trusts the graphics chip. It is not from a photo.

## ONNX Runtime Web

The runtime that runs the models (`onnxruntime-web` 1.20.1, MIT licence, Microsoft) is built into
the app's own files by the build; it is not kept here.
