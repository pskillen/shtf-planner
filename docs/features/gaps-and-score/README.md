# Gaps and score

**Status:** Done  
**Tracking:** none

The Gaps and Score tabs show what the engine returns for the chosen horizon (see [Engine](../engine/README.md));
neither computes targets or scoring rules.

## Map

| Piece         | Where                                      | What                                                                  |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Gaps tab      | `/app/gaps`, `GapsScreen.tsx`              | Lowest-scoring needs, expandable gaps, To do and Enough.              |
| Shopping      | `/app/gaps/shopping`, `ShoppingScreen.tsx` | Suggestions, filters and buying actions.                              |
| Gaps view     | `screens/gaps/view.ts`                     | Groups, orders and words the engine's `gaps`, `score` and `coverage`. |
| Score tab     | `/app/score`, `ScoreScreen.tsx`            | Headline, bar per need, next horizon.                                 |
| Score view    | `screens/score/view.ts`                    | Orders bars and wording.                                              |
| Horizon table | `screens/horizon/previewSource.ts`         | Engine `preview`; three biggest asks.                                 |
| Blocked badge | `AssetsScreen.tsx`                         | From `coverage(...).blockedAssets`.                                   |

## Gaps overview

The three least-covered needs appear as links above expandable need sections, ordered like the Score tab. The weakest section opens first; Show all needs reveals the remaining shortfalls. Each section shows the score, the weakest target and its guidance, and links to shopping suggestions for that need where available. A separate link opens the complete shopping list. To do and Enough remain on the overview, including plan Done and Undo actions.

## Gaps — shopping

The separate shopping screen can show the full list or the suggestions for one need. Both retain the existing sorting and buying actions.

- Rows name **items** with an amount and, when the household has one, the **usual product** under the label as
  **detail** (e.g. "Dried pasta: about 5 kg more" with "10 × Tesco fusilli 500 g").
- Restock rows come first ("Back to your minimums"), worded from the minimum; buy rows for the same need say
  "beyond restocking".
- Sort: **Weakest first**, **Cheapest cover** (row price), or **By aisle** — category and heading in pack order,
  with group headings such as "Food and cooking › Tins".
- The tick opens Quick add on that item (and product when the engine named one); equipment rows open the equipment
  form.

## Gaps — to do and enough

- **To do.** Plan items with Done (five-second undo toast), tasks with plain reasons, Done list with Undo.
- **Enough.** Needs at or over target, with optional surplus wording for resources.

## Score

- Overall percent, weakest need, link to horizon. Bar per need, weakest first.
- Rules live in the engine; see [Engine](../engine/README.md#score).
- The headline is written on a ruled notebook page in a handwritten face (Caveat, self-hosted in
  `public/fonts/` with its OFL licence and precached; no font is fetched from Google or anyone
  else). It is the app's one nod to the SHTF game; every other screen stays plain.
- Enough is enough: a need at or over its target scores 100 % and shows under **Enough**. Over-stock
  is neutral; it never lifts another need's score.

## Equipment and the horizon table

Blocked equipment shows a badge and reason; full text under Why? on Equipment. The horizon table bolds the weakest
shortfall row per need at 28 days.

The [review summary](../review/README.md) shows the score snapshots captured before answers and at finish.

## Not built yet

- Badges and a review streak ([#61](https://github.com/pskillen/shtf-planner/issues/61)).
- Shopping rows that deep-link to the equipment and its fuel
  ([#28](https://github.com/pskillen/shtf-planner/issues/28)); impractical suggestions on very
  large shortfalls ([#49](https://github.com/pskillen/shtf-planner/issues/49)).

## Tests

`test/gaps-view.test.ts`, `test/gaps-screen.test.tsx`, `test/score-screen.test.tsx`, `src/engine/gaps.test.ts`,
Playwright `e2e/inventory.spec.ts`, `e2e/products.spec.ts`.

Fuel suggestions name the exact confirmed fuel for owned equipment. Missing facts become equipment
checks; without a heater, the shopping list asks for a heating plan instead of pairing a generic
heater and bottle. The heat score currently represents assumed burner hours, not safe warmth.
