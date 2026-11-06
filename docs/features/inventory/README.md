# Inventory

**Status:** Done  
**Tracking:** none

The Stores tab: what the household has, grouped by **item** (the generic from the pack), then **product**
(the household's size and name), then **batches** (quantity in a place with a best-before month).

## Map

| Piece             | Where                                                            | What                                                                                                       |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Stores tab        | `/app/stores`, `StoresScreen.tsx`                                | Items in category and heading order, search, place filter, Stocktake, scans to sort, **Your products**.    |
| Quick add         | `screens/stores/QuickAdd.tsx`                                    | Item picker, size step, Add; Scan a barcode and Stocktake a pile. Opened from Gaps with a row pre-filled.  |
| Product list      | `/app/stores/products`, `ProductsScreen.tsx`, `ProductSheet.tsx` | Rename, counts-as, size, merge, delete. Linked from a product's › in Stores.                               |
| Edit and minimums | `StockSheet.tsx`, `MinimumSheet.tsx`                             | Batch quantity with ¼ ½ ¾, place, best-before, delete with undo; **minimum per item** in a rotating place. |
| Month field       | `MonthField.tsx`                                                 | Month box and quick chips for best-before.                                                                 |
| Scanning          | `ScanSheet.tsx`, `StocktakeScreen.tsx`, `ScansToSort.tsx`        | See [Scanning](../scanning/README.md).                                                                     |
| Grouping helpers  | `storesGrouping.ts`, `pickerHelpers.ts`, `products.ts`           | Pack totals, use first, aisle order, product ops.                                                          |

## Stores list

- **Grouping.** Collapsible categories (Food, Water, …), then **items** in pack heading order (Tins, Dried, …).
  Each item row shows pack total, amount in base units (g, kg, ml, L), **min N in Pantry** badges on rotating
  places, and the worst expiry word on its batches. Tap an item to expand: its counts-as line, each **product**
  with its total and › to the product list, then **batches** (quantity · place · month, expiry badge, **Use first**
  on the earliest in-date batch across that item's products).
- **Place filter.** All places, or one place. A rotating place shows: "This place rotates: the minimum counts,
  not today's stock." and **Set a minimum** (or **Set minimum** on an open item).
- **Minimums.** One stepper per item in that rotating place ("Always keep at least"). Any product of the item
  counts towards the minimum. Badge text: **min N in Pantry**.
- **Quarters.** Batch and quick-add quantities use whole packs plus optional ¼, ½ or ¾ (shown as ½, 2½, …).
- **Quick add.** Pick an item (search, recent products, or browse by category and heading), then a **size** (your
  products of that item, suggested chips, or another size with optional name). Same item + name + size reuses the
  product. No custom items. After Add you return to search or the scanner with **Added …** and **Edit** for the
  row just saved. Scan a barcode and Stocktake a pile sit above the search box.
- **Your products.** Footer link and each product's › in Stores open the list: every product by item, with kcal
  source, stock total and barcode count. Merge moves **packs** and barcodes to another product and deletes the
  duplicate.
- **Counts towards nothing.** Products with no item sit in a last group. Equipment in places is read-only with an
  Equipment badge, as before.
- **Expiry colours.** One rule app-wide (`src/engine/expiry.ts`, `ExpiryBadge`), always a word as well
  as a colour: **Expired** (red) once the best-before month has gone; **Expires soon** (red) from this
  month to `expirySoonMonths` ahead (default 1, 0 to 3); **Before next check** (amber) up to
  `expiryCheckMonths` ahead (default 3, 1 to 12, never shorter than the soon window); nothing after
  that. Both windows are household settings (More, Settings, Expiry colours). The stocktake, Stores
  rows and the date reader use the same rule.
- **Same batch, one row.** Adding stock of the same product, in the same place, with the same
  best-before month adds to that row instead of listing it twice (quick add, stocktake and scans to
  sort alike).
- **Suitability.** A place's conditions (frost, heat, damp; indoor-stable asks nothing) are checked
  against the item's `suitability`; a mismatch shows a warning such as "Water containers, kept filled
  may freeze in the Shed" when adding, in the stocktake and on the batch. It warns; it never blocks.
- **Remembered per device, never in the document.** The last place used and the recent items and
  products (up to 12) live in localStorage, so they do not sync and a private window simply forgets
  them.

## Not done

- Editing pack **items** in the app (items come only from content packs).
- **Custom items** by design; a recurring "nothing fits" is a pack change.

## Not built yet

- A review queue for expiring stock and places not recounted, beyond the colours and words on screen:
  [#20](https://github.com/pskillen/shtf-planner/issues/20). Until then a stocktake only adds stock;
  it never recounts a place.
- Water containers are stock "kept filled" for now, counting what they hold; whether they should be
  equipment that holds a resource up to a capacity is open
  ([#91](https://github.com/pskillen/shtf-planner/issues/91), under
  [#28](https://github.com/pskillen/shtf-planner/issues/28)).

## Tests

`test/stores-screen.test.tsx`, `test/stores-helpers.test.ts`, `test/stores-grouping.test.ts`, `test/quick-add.test.tsx`, `test/products-screen.test.tsx`,
`test/size-step.test.tsx`, `test/item-picker.test.tsx`, Playwright `e2e/inventory.spec.ts`, `e2e/products.spec.ts`.
