# Inventory

**Status:** Done
**Tracking:** none

The Stores tab: what the household has, by where it is kept, and the quick way to add to it.

## Map

| Piece           | Where                                                                    | What                                                                                                |
| --------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Stores tab      | `/app/stores`, `StoresScreen.tsx`                                        | Stock grouped by place (collapsible), search across places, a floating + for Quick add.             |
| Quick add       | `screens/stores/QuickAdd.tsx`                                            | Search, pick, Add; then Same again or Next item. Also opened from the Gaps tab.                     |
| Edit and floors | `screens/stores/ItemSheet.tsx`, `FloorSheet.tsx`                         | Quantity stepper, place, best-before, delete with undo; the floor of each type in a rotating place. |
| Month field     | `screens/stores/MonthField.tsx`                                          | A month box and one-tap chips for the best-before.                                                  |
| Scanning        | `screens/stores/ScanSheet.tsx`, `StocktakeScreen.tsx`, `ScansToSort.tsx` | Scan a barcode in Quick add, stocktake mode, scans to sort. See [Scanning](../scanning/README.md).  |
| Pure helpers    | `screens/stores/stock.ts`, `customType.ts`                               | Suitability warning, month parsing, search, adding stock, custom item types.                        |
| Custom types    | `customTypes` in the document, `src/packs/custom.ts`                     | `withCustomTypes` merges them into the packs as a pseudo-pack `custom`; `usePacks()` in screens.    |

## Behaviour worth knowing

- **Rows.** Name, quantity and unit, the best-before as "Mar 2027" with a word beside it, a "floor
  6" badge in a rotating place. Tapping a row edits it.
- **Expiry colours.** A best-before is always a colour and a word together (`ExpiryBadge`, from
  `expiryLevel` in `src/engine/expiry.ts`): **Expired** (red) once its month has gone;
  **Expires soon** (red) this month and up to 1 month ahead; **Before next check** (amber) up to 3
  months ahead; nothing extra when later. A `YYYY-MM` best-before is good to the end of its month.
  The two windows are household settings (Settings, Expiry colours: expires soon within 0 to 3
  months, next check in 1, 2, 3, 6 or 12 months), kept in `settings.expirySoonMonths` and
  `expiryCheckMonths` and synced; absent means 1 and 3. The same badge shows in Quick add under the
  best-before. The words are in `src/app/labels.ts` (`EXPIRY_LABEL`).
- **Equipment in a place.** Under a place's stock, the equipment kept there (its "Where is it
  kept?" answer) is listed read-only with an Equipment badge, its name, type and key answer
  ("110 Ah"); tapping it opens its edit form on the Equipment screen. Equipment with no place, or whose place no longer exists, is listed after the places under "Equipment, no place", with the same rows. Search matches equipment names too.
- **Rotating places.** "The floor counts, not today's stock": the engine counts the lower of what is
  on the shelf and the floor. "Set floors" lists the types in that place with a stepper each; 0
  removes the floor. A floor with nothing on the shelf is still listed, at 0.
- **Suitability.** An item whose type does not tolerate every condition of its place (frost, heat,
  damp; indoor and stable asks for nothing) shows a warning such as "Water can (10 L) may freeze in
  the Shed", on the row and in Quick add. Quick add still allows it.
- **Quick add** remembers the last place and recent items in `localStorage` (per device, never in the
  document); the recent list is read again after each add. With nothing typed it shows up to eight
  recent types (on a fresh device, sixteen common ones instead), then "Browse everything by
  category", closed and not built until opened; a search lists matches flat. Equipment is never
  stock: a search that matches a stove, generator or battery lists it under "Equipment: add to
  your home", which opens the equipment form with that type chosen, and with nothing typed there is
  one such route to the equipment screen. The
  equipment matches sit between the search box and "Add as a custom item", so a stove is not saved
  as a custom stock item by mistake.
  "Add as a custom item" is under the search box. The place starts as where that type already
  lives, else the last place used, else the fullest place. Stock of the same type, place and best-before is added to rather than listed twice. The
  best-before is optional; the chips follow how long the type keeps (+1 y, +2 y, +5 y for things that
  keep for years). A counter shows what was added this session.
- **Scanning.** Quick add's search step starts with **Scan a barcode** (above the search box) and
  **Stocktake a pile**. A scanned item lands on the form with its type picked and is saved with
  `source: 'barcode'`; Next item goes back to the scanner. Stores shows "3 scans to sort ›" when
  scans are waiting. See [Scanning](../scanning/README.md).
- **Custom items.** "Add as a custom item" asks for a name, a category and, for food and water, what
  one piece gives (kcal, litres). Other categories may give a store or nothing. The type is saved in
  `customTypes` as `custom:<uuid>` and counts like any pack item. It suits every place and has no
  shelf life; editing or deleting a custom type is not built.
- **Read-only.** When the document is read-only the controls that write are disabled.

## Not done

- Review of items that are about to expire: the colouring and words are display only.
- Editing or deleting a custom type.
- Adding a type to a place's floors without stock in it.
