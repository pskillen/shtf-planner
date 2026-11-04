# Gaps and score

**Status:** Done
**Tracking:** none

The Gaps and Score tabs. Both only show what the engine returns for the chosen horizon (see
[Engine](../engine/README.md)); neither works out a target or a scoring rule.

## Map

| Piece         | Where                              | What                                                                    |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Gaps tab      | `/app/gaps`, `GapsScreen.tsx`      | Shopping, To do, Enough.                                                |
| Gaps view     | `screens/gaps/view.ts`             | Groups, orders and words the engine's `gaps`, `score` and `coverage`.   |
| Score tab     | `/app/score`, `ScoreScreen.tsx`    | The headline on a notebook-page card, a bar per need, the next horizon. |
| Score view    | `screens/score/view.ts`            | Orders the bars, rounds, picks the words.                               |
| Horizon table | `screens/horizon/previewSource.ts` | The engine's `preview`; the three biggest asks.                         |
| Blocked badge | `AssetsScreen.tsx`                 | From `coverage(...).blockedAssets`, with the engine's reason.           |

## Gaps

- **Shopping.** One line per suggestion: "2 × Water can (10 L)", what it closes ("water: 20 L short of
  14 days"), a rough price when the pack has one. Restocking a rotating place comes first, then
  buying. A store or radio shortfall lists the best choice with "or" alternatives; a shortfall of
  heat or cooking hours lists a heater and its fuel as separate lines. Sort by weakest need first
  or by cheapest cover (price per unit given, unpriced last). The tick opens Quick add with that
  item and quantity.
- **To do.** Plan items with Done, which writes `plans[id].doneAt` and `expires` (from the plan's
  `expiresMonths`). Tasks, such as "Fit an EPS to the solar PV", link to Equipment.
- **Enough.** Needs at or over target, neutrally: "Water: enough for 14 days; 6 L more than needed".

## Score

- The overall percent, "{weakest} is your gap", and "at 14 days" linking to the horizon screen. The
  numeral is in Caveat, an open-licence handwritten font **self-hosted** in `public/fonts/` (licence
  beside it) and precached by the service worker; nothing is requested from another host.
- A bar per need, weakest first, with the percent, "Enough" once at target, and the weakest
  target's own wording as the reason. Below the headline, "At 28 days you'd be at 41 %".
- How a percent is worked out (the weakest target of each need; the overall is their mean) is the
  engine's rule. If it changes, only the engine does.

## Equipment and the horizon table

Equipment that gives the plan nothing (solar with no EPS, an EV with no vehicle-to-load) carries a
Blocked badge and the engine's reason. The horizon table shows the engine's preview with sentence-case
titles; rows are matched across horizons by need, and the three needs furthest short of their target
at 28 days are in bold.

## Tests

`test/gaps-view.test.ts`, `test/score-screen.test.tsx`, `test/equipment-blocked.test.tsx`,
`test/stores-helpers.test.ts`, `test/custom-item.test.ts`, `test/self-hosted-font.test.ts`, and
Playwright `e2e/inventory.spec.ts` (ten items through Quick add, floors, plan items, a phone width).
