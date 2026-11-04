# Gaps and score

**Status:** Done
**Tracking:** none

The Gaps and Score tabs. Both only show what the engine returns for the chosen horizon (see
[Engine](../engine/README.md)); neither works out a target or a scoring rule.

## Map

| Piece         | Where                              | What                                                                         |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Gaps tab      | `/app/gaps`, `GapsScreen.tsx`      | Shopping, To do, Enough.                                                     |
| Gaps view     | `screens/gaps/view.ts`             | Groups, orders and words the engine's `gaps`, `score` and `coverage`.        |
| Score tab     | `/app/score`, `ScoreScreen.tsx`    | The headline on a notebook-page card, a bar per need, the next horizon.      |
| Score view    | `screens/score/view.ts`            | Orders the bars, rounds, picks the words.                                    |
| Horizon table | `screens/horizon/previewSource.ts` | The engine's `preview`; the three biggest asks.                              |
| Blocked badge | `AssetsScreen.tsx`                 | From `coverage(...).blockedAssets`: a plain reason, the engine's under Why?. |

## Gaps

- **Shopping.** One line per suggestion: "2 × Water can (10 L)", what it closes ("water: 20 L short of
  14 days"), a rough price when the pack has one. Restocking a rotating place comes first,
  under "Back to your floors" and worded from the floor ("Pantry: UHT milk is 3 below its floor of
  6", no "short of N days"), then buying; a buy row for the same need says "beyond restocking".
  Nothing sums the two. A store or radio shortfall lists the best choice with "or" alternatives; a shortfall of
  heat or cooking hours lists a heater and its fuel as separate lines. Sort by weakest need first
  or by cheapest cover (the row's own price, unpriced last). The tick opens Quick add with that
  item and quantity.
- **To do.** Plan items with Done, which waits five seconds behind an Undo toast and then writes
  `plans[id].doneAt` and `expires` (from the plan's `expiresMonths`). A "Done" list under To do keeps
  the items already done, each with an Undo that clears `doneAt` and `expires`. Tasks, such as "Fit
  an EPS so Roof solar keeps working", link to Equipment and say what the asset gives ("Roof solar
  gives nothing in a power cut until an EPS is fitted"), never a shortfall. A plan item a task
  already covers (the EPS plan, while EPS tasks show) is left out.
- **Enough.** Needs at or over target, neutrally: "Water: enough for 14 days; 6 L more than needed".

## Score

- The overall percent, "{weakest} is your gap", and "at 14 days" linking to the horizon screen. The
  numeral is in Caveat, an open-licence handwritten font **self-hosted** in `public/fonts/` (licence
  beside it) and precached by the service worker; nothing is requested from another host.
- A bar per need, weakest first, with the percent, "Enough" once at target, and the weakest
  target's own wording as the reason. Below the headline, "At 28 days you'd be at 41 %".
- How a percent is worked out (the product of a need's cover ratios, plans as (done / total) to the
  power 1.5, the overall as their mean) is the engine's rule: see [Engine](../engine/README.md#score)
  for the rules and the worked examples. If it changes, only the engine does.

## Equipment and the horizon table

Equipment that gives the plan nothing (solar with no EPS, an EV with no vehicle-to-load) carries a
Blocked badge and a plain reason from its type ("No EPS fitted", "No vehicle-to-load"); the engine's
full reason, with the question and the answer, is under "Why?" and only shows when opened. The horizon table shows the engine's preview with sentence-case
titles; rows are matched across horizons by need, and the three needs furthest short of their target
at 28 days are in bold.

## Tests

`test/gaps-view.test.ts`, `test/score-screen.test.tsx`, `test/equipment-blocked.test.tsx`,
`test/stores-helpers.test.ts`, `test/custom-item.test.ts`, `test/self-hosted-font.test.ts`, and
Playwright `e2e/inventory.spec.ts` (ten items through Quick add, floors, plan items, a phone width).
