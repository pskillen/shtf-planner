# Engine

**Status:** Done
**Tracking:** none

Pure functions over the household document and the content packs: what the household needs for a
horizon, what it has, what is missing, and a score. No React, no IndexedDB, no Drive (the lint
fence enforces it). Everything is computed **for a date**, so previewing six months ahead is the
same call with a later `asOf`.

## Map

| Piece          | Where                                           | What                                                                                 |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Targets        | `src/engine/targets.ts`                         | `targets(doc, packs, asOf, horizonDays)` returns `Target[]`.                         |
| Coverage       | `src/engine/coverage.ts`                        | `coverage(...)` returns `Coverage[]`; `analyse(...)` adds what `gaps` needs.         |
| Gaps           | `src/engine/gaps.ts`                            | `gaps(...)` returns `Gap[]` with suggestions.                                        |
| Suggestions    | `src/engine/suggest.ts`                         | The cheapest sensible whole-unit way to close a shortfall.                           |
| Score, preview | `src/engine/score.ts`, `preview.ts`             | `score(...)` and `preview(doc, packs, asOf)` for 3, 7, 14 and 28 days.               |
| Assumptions    | `src/engine/assumptions.ts`                     | The few numbers the engine itself uses (the rest are in the packs).                  |
| Review         | `src/engine/reviewItems.ts`, `reviewSession.ts` | `reviewItems(...)` and shared answer/session helpers.                                |
| Debug          | `src/app/state/debugEngine.ts`                  | With `?debug=1`: `window.__shtf.engine.{targets,coverage,gaps,score,preview,review}` |

The target, coverage, gaps and score functions take `(doc, packs, asOf, horizonDays)`; `asOf` is `YYYY-MM-DD` and the engine never
reads the clock. `horizonDays` defaults to `doc.settings.horizonDays`. `packs` is the `Packs` the
loader returns (`bundledPacks()`); the engine reads only the packs enabled in `doc.settings`.

## The loop

1. **Targets.** Each enabled guidance rule becomes an amount for the household, summed per
   capability and resource: people x days x amount (by age band on `asOf`), pets by size, the
   household per day, or a fixed `perHousehold` amount. Every matching multiplier multiplies. A
   rule applies if its pack's lowest horizon band is at most the horizon (a 3-day pack still applies
   at 14 days); if every banded pack is above the horizon, the lowest-banded one applies anyway.
2. **Coverage.** What the household has against each target, from stock (through products), minimums
   and assets (below).
3. **Gaps.** Target minus coverage where positive, with suggestions.
4. **Score.** Per capability the product of its targets' cover ratios; plans (done / total) to the power 1.5; overall the mean.

A `Target` has a stable `id` (`water:waterL`, `heat:hours`, `medical:medication:<id>`,
`plan:<planItemId>`), its `kind` (`resource`, `hours`, `medication`, `range`, `device`, `plan`), the
`rules` that produced it with their sources and contributions, and `fixed` for a one-off amount.
A `Coverage` row has the same `targetId`, the `amount`, and `from`: where each part came from,
including things listed but not counted (expired, below the minimum, gated) with a `note`.

## What meets each capability

| Capability   | Target                                           | Met by                                                                                |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `water`      | litres for people and pets                       | water items; raw water from a butt once there is a way to treat it                    |
| `food`       | kcal, infant formula (g), pet food kcal          | food items; those tagged `needs-cooking` count only while cooking is covered          |
| `heat`       | running hours of a heater                        | a heater asset that converts a fuel resource held as stock                            |
| `cooking`    | burner hours (meals x people x a quarter hour)   | a stove or BBQ asset that converts a fuel resource                                    |
| `light`      | lumen-hours                                      | items that give `lumenHours` (torches, lanterns)                                      |
| `power`      | Wh for phones and powered equipment              | cells and power banks, batteries and EVs holding Wh, an array's Wh a day, a generator |
| `comms`      | one radio that needs no mains power              | an item tagged `radio-rx`, or a radio asset                                           |
| `sanitation` | toilet uses, hygiene uses, nappies by age        | those resources; nappies only while the size fits someone                             |
| `medical`    | doses per medication; one first aid kit          | `unitsOnHand` per medication; first aid items                                         |
| `mobility`   | a driving range                                  | the best single EV (kWh x 4 km x half charge) or petrol on hand (12 km a litre)       |
| `plans`      | every applicable plan item, done and not expired | `doc.plans[id].doneAt` (and `expires`, or the plan's `expiresMonths`)                 |

Plan items are scored together under `plans`, but each `Target` keeps its own `capability`
(the EPS plan is `power`), so a screen can show it with its capability without it zeroing that
capability's score. A plan item an owned asset already answers is left out: the EPS plan item
disappears once every solar array and home battery in the household has `hasEps` answered yes.

## Infants

The food rule asks 2,000 kcal of every person, but an infant under the formula rule's age band
(under 12 months) is fed by the formula target, so the engine counts **no kcal** for them: formula
and kcal do not double count. At 12 months they join the kcal target. (Fixture: five people, so
food is 4 x 2,000 kcal a day while Jo is on formula.)

## Counting stock through products

Stock rows point at a **product**; the engine resolves the pack **item** through `product.itemId`
(`itemOfStock`, `packGives` in `src/engine/products.ts`). A product with no item counts towards
nothing. For food on a mass or volume item, **`labelKcalPer100`** on the product (from Open Food
Facts when known) replaces the item's typical kcal in `gives`; a diet drink with label 0 gives 0 kcal.
`kcalSource` says `label`, `typical` or nothing for display.

## Minimums and rotating places

A **minimum** is on the **item**, per rotating place (`minimums`, keyed by place and item). Any
product of that item in that place counts towards the minimum's pack count. A rotating place counts
at most **`min(live packs, minimum)`** packs worth of the item: what those counted packs **give** is
the **average** of what the live (in-date) packs give, scaled to the counted number (mixed sizes in
one pantry average out). With no minimum, a rotating place counts nothing and says so. A stored
place counts each stock row. Below minimum yields a `replenish` gap naming the item and place. Stock
past its best-before month counts zero with `expired: true`. An item's `ageBand` (nappies, formula)
counts only while someone fits the band (half-open, in months, on `asOf`). **`useFirst`**
(`src/engine/rotation.ts`) picks the oldest in-date batch across all products of an item for
rotation hints.

## Item matching for scans

`suggestItems` (`src/engine/itemMatch.ts`) ranks pack items for a scanned product from Open Food
Facts **`categories`** and size: `offCategories` matches, catch-alls (`other-…`) after specific
items, equipment never offered, wrong measure dropped (a weight for a drink).

## Blocked assets

An asset whose contributions to a capability all depend on an answer, and none holds, gives
nothing, and the coverage row says so in `blocked` / `blockedAssets`: solar or a home battery
without an EPS, an EV without vehicle-to-load, a heater whose setting is unanswered. Each also
becomes a `task` gap ("Fit an EPS so Roof solar keeps working in a power cut").

## Converters share fuel

A heater, stove or generator turns a fuel resource (held as stock) into running hours (or Wh): the
held amount divided by the burn rate. Fuel is shared: **cooking** takes what its target needs first, then
**heat**, then **power**, and what is left is available to the next. Where two assets burn the same
fuel in one capability, the most efficient counts (they are alternatives, not additions). A
converter that is missing becomes an asset plus its fuel in the suggestions.

The per-capability coverage row of a converter shows its **full hours** from the fuel left when its
turn comes, so the BBQ's cooking row can read 43.3 h even though heat shares the bottle afterwards.
What heat gets is its own row, computed from what cooking left. The sharing affects the later
capabilities' rows and the score, not the earlier row's display.

## Dependent capabilities

- Food tagged `needs-cooking` counts only if cooking hours meet their target.
- Raw water counts only with tablets, bleach, a filter, or cooking (to boil).
- Phone charging is the `power` target itself; there is no separate phone asset, so comms does not
  wait on power beyond that.

## Suggestions

Whole packs of one **item** that give the resource, at most three, not overshooting the shortfall
by more than 3 times (unless nothing else is left). Each suggestion uses the household's **usual
product** of that item (most recently stocked, else newest product) for size and label kcal, or the
item's first **`sizes`** chip when there is no product yet. Ranking: the best price per unit of the
resource among the candidates sets the bar; every candidate within `NEAR_PRICE` (20 %, an
assumption in `suggest.ts`) of it is **on a par**, and of those the one that costs least _in total_
leads, then the one that overshoots least. Only one item appears per suggestion line (not every
size chip). `pricePence` is the whole suggestion's price. **`replenish`** gaps name the item, the
place, and how many packs below the minimum ("3 below its minimum of 6"). Items that need cooking
are skipped while cooking is not covered; age bands filter nappies and formula. Items tagged
`no-suggest` are used only when nothing else gives the resource. An empty container is still
suggested but labelled ", to fill from the tap".

## Score

Per capability, the **product of its targets' cover ratios**, each ratio capped at 1, so a part of
the household that is forgotten cannot hide behind the rest. A capability with one target is just
that target's ratio. Examples: a baby at 0.5 and adults at 0.9 score 0.5 x 0.9 = **45 %**; 0.8 and
0.9 score **72 %**; a forgotten dog or baby (0) scores the whole capability **0**. `raw` is the
lowest target's ratio uncapped (250 is two and a half times enough).

**Plans** are different: (done / total) to the power 1.5 (`PLANS_EXPONENT` in `score.ts`, one named
constant), so a few done items do not look like progress. With nine items, 1 to 8 done score 4, 10,
19, 30, 41, 54, 69 and 84 %; only all done is 100 %.

Overall is the mean over capabilities that have targets. `weakest` is the lowest percent; a tie goes
to the lower mean ratio across the capability's targets, then to the earlier capability in the list.
On the Biggar fixture heat and comms both have one empty target (mean 0), so heat wins on capability
order alone. `nextHorizonPreview` is the overall score at the next horizon (3, 7, 14, 28).

## Preview

`preview(doc, packs, asOf)` returns one `PreviewHorizon` per offered horizon (`horizonDays` is typed
`(typeof HORIZONS)[number]`, so it drops into code keyed by the horizons). Each `PreviewRow` has the
target's `capability`, a lower-case `label` ("water"), a sentence-case `title` for screens
("Drinking water", "Power for phones", "Radio"; a medication shows its own name), the `amount` and
`unit`, and an `example`: worded as an example ("e.g. 4 × Bottled water (6 × 2 L)"), never an
instruction, and always an illustration, not advice. `src/engine/examples.ts` builds them, pure
and over the packs it is given:

- **Resources** use everyday stock only (no equipment, `no-suggest` items, loose cells or empty
  containers): the cheapest size per unit whose count is 12 or fewer, else the biggest pack. So water
  at 3 days is "4 × Bottled water (6 × 2 L)", not "37 × 500 ml cases".
- **Food** is never one item for all the calories: a fixed split of the kcal across staples,
  `FOOD_MIX` in `examples.ts` (25 % tins, 20 % pasta, 20 % rice, 15 % porridge oats, 20 % peanut
  butter), each in the smallest pack size that gives a sane count (tins up to 70; the weekly tinned pack reads "N packs of tinned food (each one person's week)"), shown as "e.g.
  15 tins, 4 kg of pasta and rice, 1 kg of porridge oats and 3 jars of peanut butter". The shares
  are an assumption chosen for variety, not a diet.
- **Power for phones** is power banks, never a leisure battery. Up to a dozen banks that is the
  example; for more (a month of charging) the banks are still named and a portable power station is
  added in words ("or 5 × Portable power station (500 Wh)"), because a station costs two to two and
  a half times as much for the same Wh and is never swapped in silently.
- **Heat and cooking** keep "a heater and its fuel to run it" (or the fuel for the one you own).
- A radio is "e.g. a wind-up or battery-powered radio"; driving range is "about the same as a
  vehicle charged or fuelled to drive N km".

The horizon table's exact examples for the invented Biggar household are tested in
`src/engine/preview.test.ts`.

## Where the numbers come from

Almost none come from official guidance. The UK Be Ready site gives 3 days, 3 litres of water per
person per day and medication for the horizon; Ready.gov gives a gallon of water. Everything else
is a stated assumption, marked `"assumption"` in the pack (read them with `grep '"assumption"'
src/packs/data/*.json`) or in `src/engine/assumptions.ts`.

## Owner sanity check

Numbers worth a look, none of them official:

| Number                                     | Value                                                                                                                                                              | Where                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Heat per day, average home                 | 8 h; x0.5 excellent, x0.75 good, x1.5 poor, x1.5 snow                                                                                                              | `guidance-grid-free:heat`                   |
| Hot meals                                  | 2 per person per day                                                                                                                                               | `guidance-grid-free:cooking`                |
| Burner time per person per hot meal        | 0.25 h                                                                                                                                                             | `assumptions.ts`                            |
| Light                                      | 1,000 lumen-hours a day                                                                                                                                            | `guidance-grid-free:light`                  |
| Phone power                                | 15 Wh per person per day; x8 for powered equipment                                                                                                                 | `guidance-grid-free:phone-power`            |
| Toilet and hygiene                         | 5 and 3 uses per person per day                                                                                                                                    | `guidance-grid-free:sanitation`, `:hygiene` |
| Nappies                                    | 10 a day to 6 months, 8 to 12, 6 to 36                                                                                                                             | `guidance-grid-free:nappies`                |
| Infant formula                             | 100 g a day under 12 months                                                                                                                                        | `guidance-grid-free:formula`                |
| Pet food (kcal) and water (L) a day, S/M/L | 300/700/1,200 kcal; 0.25/0.75/1.5 L                                                                                                                                | `:pet-food`, `:pet-water`                   |
| Food                                       | 2,000 kcal per person per day                                                                                                                                      | `guidance-uk-prepare:food`                  |
| First aid                                  | one kit, counted as 3 uses                                                                                                                                         | `guidance-grid-free:first-aid`              |
| Driving range                              | 100 km                                                                                                                                                             | `guidance-grid-free:mobility`               |
| EV driving range                           | 4 km per kWh, half charged                                                                                                                                         | `assumptions.ts`                            |
| Petrol range                               | 12 km a litre                                                                                                                                                      | `assumptions.ts`                            |
| Solar                                      | 800 Wh per kWp on a winter day                                                                                                                                     | `assets-base:solar-pv`                      |
| Usable battery fraction                    | EV 50%, home battery 90%, power station 85%, lead-acid 50%                                                                                                         | `assets-base`                               |
| Burn rates                                 | butane heater 0.095 kg/h at 1.3 kW, 0.3 at 4.2 kW; catalytic 0.1; wood burner 1.5 kg/h; paraffin 0.25 L/h; stove 0.4 canister/h; BBQ 0.3 kg/h; rocket stove 1 kg/h | `assets-base`                               |

## Maintenance

`maintenanceDue(doc, packs, asOf)` returns every known equipment job, including future dates.
The pack defines the jobs and intervals. The last recorded date, or the purchase date when no
completion is recorded, anchors the next date; without either it is due on `asOf`. Month ends are
clamped. Unknown types and obsolete job IDs are ignored. `overdue` is true only after the due date; a job due on `asOf` is due today.
Maintenance does not affect the score.

## Review queue

`reviewItems(doc, packs, asOf, until)` returns stock expiry, maintenance, age-band transitions,
recounts and applicable expiring plans due through the inclusive `until` date. Stock is due on the
last day of its best-before month. Age edges include today and future transitions only, calculated
on the first calendar date the age predicate reaches the boundary. Separate item and guidance
edges retain stable identities, including overlapping age bands.

Overdue items come first, followed by date, capability order and key. All unfinished reviews form
one session and their resolved keys are omitted. Versioned answer tokens and legacy bare keys are
read for suppression; only an explicit Recounted action in a finished review advances a place's
recount date. `reviewPeriod` preserves an overdue scheduled date while looking ahead one cadence
from today for queue items. These calculations do not change the preparedness score.

## Out of scope

No screens (they call these functions), budgeting or minimum suggestions from recounts.

## Known gaps

- A rule's `requires` is not read; no bundled rule uses it (food that needs cooking is handled by
  the item tag).
- Candles (`candleHours`) and cells in torches are not counted towards light; only `lumenHours`.
- Driving range knows electric cars and petrol on hand, not a petrol or diesel car as an asset.
- Radios cannot be a pack rule (no resource), so the comms target is the engine's own.

## Not built yet

- Equipment linked to its exact fuel, with what is left per piece of equipment ("BBQ: 3 days of
  cooking on 1 x 13 kg propane"): [#28](https://github.com/pskillen/shtf-planner/issues/28).
- Diesel, vehicles as assets, candles and torch cells as light, no impractical suggestions on big
  shortfalls, the preview's food-mix overshoot:
  [#49](https://github.com/pskillen/shtf-planner/issues/49).

## Background

The engine is the original design's one loop: household, home, risks and horizon give **targets**;
stock and equipment give **coverage**; targets minus coverage are the **gaps** (the shopping and
to-do lists); coverage over targets is the **score**. Targets are **capabilities without the grid**
(heat a room, cook, light, charge a phone, safe water…) rather than categories of stuff, so an
all-electric home starts from "no heat or cooking at all" and the score says so. Everything is
computed for a date so that "preview in six months" (a baby's nappy size, a child turning 18) is
the same call with a later `asOf`.
