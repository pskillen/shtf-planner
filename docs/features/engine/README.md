# Engine

**Status:** Done
**Tracking:** none

Pure functions over the household document and the content packs: what the household needs for a
horizon, what it has, what is missing, and a score. No React, no IndexedDB, no Drive (the lint
fence enforces it). Everything is computed **for a date**, so previewing six months ahead is the
same call with a later `asOf`.

## Map

| Piece          | Where                               | What                                                                          |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Targets        | `src/engine/targets.ts`             | `targets(doc, packs, asOf, horizonDays)` returns `Target[]`.                  |
| Coverage       | `src/engine/coverage.ts`            | `coverage(...)` returns `Coverage[]`; `analyse(...)` adds what `gaps` needs.  |
| Gaps           | `src/engine/gaps.ts`                | `gaps(...)` returns `Gap[]` with suggestions.                                 |
| Suggestions    | `src/engine/suggest.ts`             | The cheapest sensible whole-unit way to close a shortfall.                    |
| Score, preview | `src/engine/score.ts`, `preview.ts` | `score(...)` and `preview(doc, packs, asOf)` for 3, 7, 14 and 28 days.        |
| Assumptions    | `src/engine/assumptions.ts`         | The few numbers the engine itself uses (the rest are in the packs).           |
| Debug          | `src/app/state/debugEngine.ts`      | With `?debug=1`: `window.__shtf.engine.{targets,coverage,gaps,score,preview}` |

Every function takes `(doc, packs, asOf, horizonDays)`; `asOf` is `YYYY-MM-DD` and the engine never
reads the clock. `horizonDays` defaults to `doc.settings.horizonDays`. `packs` is the `Packs` the
loader returns (`bundledPacks()`); the engine reads only the packs enabled in `doc.settings`.

## The loop

1. **Targets.** Each enabled guidance rule becomes an amount for the household, summed per
   capability and store: people x days x amount (by age band on `asOf`), pets by size, the household
   per day, or a fixed `perHousehold` amount. Every matching multiplier multiplies. A rule applies
   if its pack's lowest horizon band is at most the horizon (a 3-day pack still applies at 14
   days); if every banded pack is above the horizon, the lowest-banded one applies anyway.
2. **Coverage.** What the household has against each target, from items, floors and assets (below).
3. **Gaps.** Target minus coverage where positive, with suggestions.
4. **Score.** Per capability the cover ratio of its weakest target; overall the mean.

A `Target` has a stable `id` (`water:waterL`, `heat:hours`, `medical:medication:<id>`,
`plan:<planItemId>`), its `kind` (`store`, `hours`, `medication`, `range`, `device`, `plan`), the
`rules` that produced it with their sources and contributions, and `fixed` for a one-off amount.
A `Coverage` row has the same `targetId`, the `amount`, and `from`: where each part came from,
including things listed but not counted (expired, below the floor, gated) with a `note`.

## What meets each capability

| Capability   | Target                                           | Met by                                                                                |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `water`      | litres for people and pets                       | water items; raw water from a butt once there is a way to treat it                    |
| `food`       | kcal, infant formula (g), pet food kcal          | food items; those tagged `needs-cooking` count only while cooking is covered          |
| `heat`       | running hours of a heater                        | a heater asset that converts a fuel store held as items                               |
| `cooking`    | burner hours (meals x people x a quarter hour)   | a stove or BBQ asset that converts a fuel store                                       |
| `light`      | lumen-hours                                      | items that give `lumenHours` (torches, lanterns)                                      |
| `power`      | Wh for phones and powered equipment              | cells and power banks, batteries and EVs holding Wh, an array's Wh a day, a generator |
| `comms`      | one radio that needs no mains power              | an item tagged `radio-rx`, or a radio asset                                           |
| `sanitation` | toilet uses, hygiene uses, nappies by age        | those stores; nappies only while the size fits someone                                |
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

## Floors and rotating locations

A `rotating` location (a pantry) counts a type at most at its **floor**: `min(held, floor)`. With
no floor for that type it counts nothing, and says so in `from`. A `stored` location counts what is
there. A type below its floor also yields a `replenish` gap, which is part of the same shortfall,
not on top of it. Items past their best-before month (`bestBefore` before `asOf`'s month) count
zero and are listed with `expired: true`. An item with an `ageBand` (nappies, formula, baby food)
counts only while someone in the household is in the band (half-open, in months, on `asOf`).

## Blocked assets

An asset whose contributions to a capability all depend on an answer, and none holds, gives
nothing, and the coverage row says so in `blocked` / `blockedAssets`: solar or a home battery
without an EPS, an EV without vehicle-to-load, a heater whose setting is unanswered. Each also
becomes a `task` gap ("Fit an EPS so Roof solar keeps working in a power cut").

## Converters share fuel

A heater, stove or generator turns a fuel store (held as items) into running hours (or Wh): the
store divided by the burn rate. Fuel is shared: **cooking** takes what its target needs first, then
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

Whole units of one item type that give the store, cheapest per unit first, not overshooting the
shortfall by more than 3 times (unless nothing else is left), at most three. `pricePence` is the
whole suggestion's price. Items that need cooking are skipped while cooking is not covered, and
items whose age band fits nobody are skipped. An item type tagged `no-suggest` (the bath water
bladder, loose D, AA and AAA cells) is cheap per unit but an odd first answer, so it is suggested
only when no other type gives the store.

## Score

Per capability: the lowest cover ratio among its targets, capped at 100 (`raw` is uncapped), so one
empty medication cannot hide behind a full first aid kit. Overall is the mean over capabilities that
have targets. `weakest` is the lowest; a tie goes to the lower mean ratio across the capability's
targets, then to the earlier capability in the list. On the Biggar fixture heat and comms both have
one empty target (mean 0), so heat wins on capability order alone. `nextHorizonPreview` is the overall score at
the next horizon (3, 7, 14, 28).

## Preview

`preview(doc, packs, asOf)` returns one `PreviewHorizon` per offered horizon (`horizonDays` is typed
`(typeof HORIZONS)[number]`, so it drops into code keyed by the horizons). Each `PreviewRow` has the
target's `capability`, a lower-case `label` ("water"), a sentence-case `title` for screens
("Drinking water", "Power for phones", "Radio"; a medication shows its own name), the `amount` and
`unit`, and an `example` from the item catalogue.

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

## Out of scope

No screens (they call these functions). No review queue (expiry windows, maintenance due), no
budgeting, no floor suggestions from recounts.

## Known gaps

- A rule's `requires` is not read; no bundled rule uses it (food that needs cooking is handled by
  the item tag).
- Candles (`candleHours`) and cells in torches are not counted towards light; only `lumenHours`.
- Driving range knows electric cars and petrol on hand, not a petrol or diesel car as an asset.
- Radios cannot be a pack rule (no store), so the comms target is the engine's own.
