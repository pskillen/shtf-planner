# Scanning

**Status:** Done (barcodes, stocktake and best-before dates read by the camera).  
**Tracking:** none

Pick up a tin, scan its barcode, confirm what it **counts as** (once per product), set the best-before month,
OK, next. Open Food Facts supplies name and size for codes it knows; offline scans wait in a queue and are sorted
later without a new lookup when facts were stored. Quick add can scan too.

## Map

| Piece             | Where                                          | What                                                     |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Camera stream     | `src/scan/camera.ts`                           | Torch, zoom, focus; `captureBox` for the framing box     |
| Barcode loop      | `src/scan/barcode.ts`                          | `BarcodeDetector` or zxing (turned attempts)             |
| Open Food Facts   | `src/scan/openFoodFacts.ts`                    | Lookup, rate limit, identification string                |
| Date reader       | `src/scan/ocr/`                                | PaddleOCR in a worker; see `public/ocr/`                 |
| Scan card         | `screens/stores/ScanResolve.tsx`               | Counts-as, item picker, size step, Decide later          |
| Quick add scanner | `ScanSheet.tsx`                                | Strip, type a code, find by name                         |
| Stocktake         | `StocktakeScreen.tsx`, `/app/stores/stocktake` | Barcode step, date step, OK, Undo, Done                  |
| Scans to sort     | `ScansToSort.tsx`, `useScanQueue.ts`           | Queue on Stores; sort uses stored OFF facts when present |
| Document          | `barcodes`, `scans`, `products` (schema 4)     | [Data model](../data-model/README.md)                    |
| e2e               | `e2e/fakeCamera.ts`, `e2e/stocktake.spec.ts`   | Fake camera and faked Open Food Facts                    |

## The Counts as card

When Open Food Facts knows a code, the card shows the **product** it will create (name, size, label kcal when
present) and one question: **Counts as: [suggested item]?**

- **Yes** — make the product for that item and remember the barcode for the household.
- **Something else** — item picker, then size if needed.
- **Counts towards nothing** — listed; scores nothing.
- **Decide later** (stocktake / offline) — queue the scan on Stores.

Each choice has a one-line hint under the button (same style as other scan choices).

A **remembered** barcode skips the card and goes straight to quantity and date.

**Not this?** on the date step (or quick add) clears the remembered mapping for that code so the household can
answer again.

## Unknown codes

When Open Food Facts does not know a code (or you are offline with no stored facts), the card asks **What is it?**
(item picker), then the **size step** if size is not already known, then the date (stocktake) or Add (quick add).
You can choose **Counts towards nothing** or **Decide later** instead.

## Product from Open Food Facts

The app builds a household **product**: name and size from the label, optional **label kcal per 100 g or 100 ml**
when OFF provides it. Calories count from the label when present, else the item's typical figure; the product list
shows which ("label: …" or "typical for …").

Multipacks (e.g. 24 × 330 ml) are stored as count × amount; water and food from soft drinks follow the item rules
(1 L water per litre of drink plus label kcal).

## Scans to sort

Queued scans appear on Stores as "N scans to sort ›". Sorting opens the same card, using **stored** Open Food Facts
facts when the queue already has them — no second lookup for those fields. Choosing a product adds stock with
`source: 'barcode'` and removes the queue entry.

## Privacy

Only the app host and `world.openfoodfacts.org` are contacted, and only with the barcode digits in the product API
URL (see `e2e/stocktake.spec.ts` privacy test).

## Tests

`test/scan-resolve.test.tsx`, `test/stocktake.test.tsx`, `src/scan/openFoodFacts.test.ts`, Playwright
`e2e/stocktake.spec.ts`.
