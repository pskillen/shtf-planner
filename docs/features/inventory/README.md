# Inventory

**Status:** Done
**Tracking:** none

The Stores tab: what the household has, by where it is kept, and the quick way to add to it.

## Map

| Piece           | Where                                                | What                                                                                                |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Stores tab      | `/app/stores`, `StoresScreen.tsx`                    | Stock grouped by place (collapsible), search across places, a floating + for Quick add.             |
| Quick add       | `screens/stores/QuickAdd.tsx`                        | Search, pick, Add; then Same again or Next item. Also opened from the Gaps tab.                     |
| Edit and floors | `screens/stores/ItemSheet.tsx`, `FloorSheet.tsx`     | Quantity stepper, place, best-before, delete with undo; the floor of each type in a rotating place. |
| Month field     | `screens/stores/MonthField.tsx`                      | A month box and one-tap chips for the best-before.                                                  |
| Pure helpers    | `screens/stores/stock.ts`, `customType.ts`           | Suitability warning, month parsing and colouring, search, adding stock, custom item types.          |
| Custom types    | `customTypes` in the document, `src/packs/custom.ts` | `withCustomTypes` merges them into the packs as a pseudo-pack `custom`; `usePacks()` in screens.    |

## Behaviour worth knowing

- **Rows.** Name, quantity and unit, the best-before as "Mar 2027" (red once its month has gone,
  amber within three months), a "floor 6" badge in a rotating place. Tapping a row edits it.
- **Rotating places.** "The floor counts, not today's stock": the engine counts the lower of what is
  on the shelf and the floor. "Set floors" lists the types in that place with a stepper each; 0
  removes the floor. A floor with nothing on the shelf is still listed, at 0.
- **Suitability.** An item whose type does not tolerate every condition of its place (frost, heat,
  damp; indoor and stable asks for nothing) shows a warning such as "Water can (10 L) may freeze in
  the Shed", on the row and in Quick add. Quick add still allows it.
- **Quick add** remembers the last place and recent items in `localStorage` (per device, never in the
  document). Stock of the same type, place and best-before is added to rather than listed twice. The
  best-before is optional; the chips follow how long the type keeps (+1 y, +2 y, +5 y for things that
  keep for years). A counter shows what was added this session.
- **Custom items.** "Add as a custom item" asks for a name, a category and, for food and water, what
  one piece gives (kcal, litres). Other categories may give a store or nothing. The type is saved in
  `customTypes` as `custom:<uuid>` and counts like any pack item. It suits every place and has no
  shelf life; editing or deleting a custom type is not built.
- **Read-only.** When the document is read-only the controls that write are disabled.

## Not done

- Barcode scanning (`source: 'barcode'` is unused).
- Review of items that are about to expire: the colouring is display only.
- Editing or deleting a custom type.
- Adding a type to a place's floors without stock in it.
