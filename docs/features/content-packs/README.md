# Content packs

**Status:** Done
**Tracking:** none

What to have, and how much, ships as versioned JSON packs validated with Zod. They are bundled
(imported as JSON modules), so they work offline.

## Map

| Piece   | Where                                     | What                                                              |
| ------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Schemas | `src/model/packs.ts`                      | `Pack`, `Packs`, `ItemType`, `AssetType`, `Rule`, `PlanDef`, ids. |
| Loader  | `src/packs/loader.ts`                     | `loadPacks`, `parsePack`, `enabledPacks`, `PackError`.            |
| Bundled | `src/packs/bundled.ts`, `src/packs/data/` | `bundledPacks()` loads the shipped packs once.                    |

## The packs

| Pack file                  | Kind       | Holds                                                                                                                                                               |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items-base.json`          | `items`    | The game's 82 item types plus nappies by size, formula, baby food, pet food, toilet and hygiene supplies, lumen-rated lights, cells, power banks, water containers. |
| `assets-base.json`         | `assets`   | Heaters, stoves, power sources (solar, home battery, EV, generator), water butt, alarms, radios, with questions, contributions and maintenance.                     |
| `guidance-uk-prepare.json` | `guidance` | UK Government "Be Ready": 3 days, 3 litres of water per person per day.                                                                                             |
| `guidance-us-ready.json`   | `guidance` | Ready.gov: one gallon of water per person per day.                                                                                                                  |
| `guidance-grid-free.json`  | `guidance` | Region-less rules: heat, cooking, light, phone power, sanitation, medication, mobility, babies, pets.                                                               |
| `plans-base.json`          | `plans`    | Meeting point, shut-offs, documents, grab bags, first aid course, EPS, neighbours, pets.                                                                            |
| `regions.json`             | `regions`  | UK and US units, currency, risk links (flood, weather), suggested packs.                                                                                            |

## Format

Every pack is `{ format: 1, id, kind, version, name, region?, sources? }` plus its body. Pack schemas
are strict: an unknown key is an error. Ids inside a pack are written in full as
`"<packId>:<localId>"` (lower-case kebab-case); the loader checks the prefix and uniqueness.
Questions and maintenance items have ids local to their asset type (`answers` and `maintenance` in
the document are keyed by them).

- **`items`**: `ItemType { id, name, category, unit, gives: [{ store, amount }], suitability,
shelfLife, ageBand?, typicalPricePence?, tags, barcodes?, assetTypeId?, source? }`. `gives` may not name
  `medicationDays` (computed from the document). Tags the engine reads: `needs-cooking` (counts
  only while cooking is covered), `radio-rx` (receives broadcasts: meets the comms radio and is suggested for it; PMR446
  walkie-talkies are `radio-tx` only),
  `treatment` (makes raw water safe) and `no-suggest` (never a first suggestion: the engine offers
  it only when nothing else gives the store). `phone` marks the power banks the horizon preview
  names for phone power, and `portable-power` the power station it falls back to for a month.
  **One home per thing.** An item type that is really equipment has `assetTypeId` (an asset type
  of the assets pack; the loader checks it exists). It is a buy-only entry: it keeps its price and
  what one unit gives so the shopping list can suggest it, but it is never stock. Quick add does
  not offer it (it offers the equipment form for that asset type instead), the shopping list's
  tick opens the equipment form, and a stock row of such a type (a document made before the split)
  counts nothing, with a note saying so. The linked entries are the camping, rocket, paraffin,
  catalytic and cabinet gas stoves and heaters, the power station, leisure battery, generators,
  solar panel and kit, wind-up radios, handheld radios (2 m/70 cm and CB: the `handheld-radio` asset; PMR446 walkie-talkies
  are their own `pmr446-radio` asset, which gives no comms because they cannot receive broadcasts), mobile and HF stations (the `radio-station` asset), water butt, CO alarm and fire
  extinguisher. Power banks,
  fuels, gas bottles, cells, candles, food, water and hygiene are stock. `source` is where the
  numbers on a type come from: an `https` URL listed in the pack's `sources`, or `"assumption"`.
  The sizes added for everyday shopping (bottled water, pasta, rice, oats, peanut butter, tins, toilet
  bags) are all marked `"assumption"`: the staples reuse the kcal per 100 g of the bulk entries
  (pasta 350, rice 360, oats 380, peanut butter 600), the tin's 400 kcal and every price are
  estimates. They have not been checked against the UK Government's Composition of Foods
  Integrated Dataset (CoFID); doing so, and citing it, is open.
- **`assets`**: `AssetType { id, name, category, questions, contributes, maintenance }`. A
  `Contribution` says what the asset adds to a capability, optionally only `when` a question has an
  answer: `converts` (burns a store per running hour), `outputPerHour`, `providesPerDay` or
  `providesPerDayFrom` (fuel-free supply, e.g. solar), `storesWh` (a battery), `holds` (a stock,
  e.g. a water butt). Solar and a home battery contribute power **only** when `hasEps` is true; an
  EV only when `v2l`. A contribution with a number carries a `source` (an `https` URL listed in
  the pack's `sources`, or `"assumption"`), as a rule does; the loader requires it.
- **`guidance`**: `horizonBands` and `rules`. A `Rule` states a quantity (`perPersonDay`,
  `perPetDay`, `perHouseholdDay`, `perHousehold`, `hoursPerDay`, `mealsPerPersonDay` or `rangeKm`), optional
  `appliesTo`, `requires`, `multipliers`, `minHorizonDays`, and a `source`. With `ageBands`, a
  person in no band needs none.
- **`plans`**: `items: PlanDef[]`; `requires` may name a risk, asset types (any of) or `pets`.
- **`regions`**: units, currency, `riskLinks`, `subregions`, `suggestedPacks`.

`CapabilityId`: `water food heat cooking light power comms sanitation medical mobility plans`.
`StoreId`: the game's thirteen stores plus `nappies formulaG petFoodKcal sanitationUses hygieneUses
medicationDays lumenHours` (`STORE_INFO` has names and units).

## How the engine reads these

The numbers mean exactly this; the schema comments in `src/model/packs.ts` say the same.

- **Age bands are half-open: `[fromMonths, toMonths)`.** A child of exactly `toMonths` is in the
  next band. A rule's `ageBands` are a partition (the schema refuses empty or overlapping bands):
  `0-6, 6-12, 12-36` puts a 6-month-old in the second band, and an age in no band needs none. An
  item's `ageBand` says which ages it suits and may overlap its neighbours', because sizes overlap
  (nappy sizes 2 and 3 both fit a five-month-old).
- **`storesWh.perUnitWh` has no default.** It is what one unit of the answer is worth in Wh:
  `1` for an answer in Wh (power station), `12` for Ah at 12 V (leisure battery), `1000` for kWh
  (home battery, EV). Stored Wh = answer x `perUnitWh` x `usableFraction`.
- **Multipliers multiply.** Every multiplier that matches the household applies, so poor
  insulation (x1.5) and a snow risk (x1.5) make a heat rule x2.25. A `tag` multiplier matches a
  person with that tag, a `risk` one a household with that risk.
- **`minHorizonDays` is a floor on the chosen horizon.** A rule with it applies only when the
  household's horizon is at least that many days (`>=`).
- **`perHousehold` is a fixed amount**, the same at every horizon (one first aid kit, 3 uses). The
  `perXDay` quantities are multiplied by the horizon in days.
- **One rule owns each need.** Phone power is `guidance-grid-free:phone-power` for every region;
  a regional pack must not add a second rule for the same quantity, or an enabled pair counts it
  twice. A test enforces this for phone power.

## The loader

`loadPacks` validates every pack, then checks that references resolve: ids are unique and carry
their pack's prefix, a contribution names a real question, a rule's URL source is listed in the
pack's `sources` with the date checked, plan items name real asset types, regions name real packs.
It throws `PackError` whose message names the pack and the field of each problem.
`enabledPacks(settings)` returns the packs listed in `settings.packs`, in order, minus those whose
`region` is not `settings.region`; unknown ids are skipped. `recordPackVersions` and
`packVersionReport` keep `meta.packVersions` honest: a mismatch is reported, not fatal.

## Adding or changing a pack

1. Edit or add `src/packs/data/<name>.json`; a new file is imported in `src/packs/bundled.ts` and,
   to be on by default, listed in `DEFAULT_PACKS` (`src/model/document.ts`).
2. Bump the pack's `version` when its content changes.
3. `npm test`: the bundled-pack tests validate everything and check every rule has a source.

## The "no invented official numbers" rule

Every `guidance` rule, and every asset contribution that carries a number, has `source`: an `https`
URL that is also listed in the pack's `sources` with the date it was checked, **or** the word
`"assumption"`. Never present a number as official
when the source does not give it. Where guidance is silent (heat hours, lumen-hours, Wh per day,
calories, pet quantities) write a stated, reasonable assumption and mark it `"assumption"`, so the
owner can sanity-check every one with `grep '"assumption"'`.

Checked on 2026-11-04: the UK Be Ready site gives 3 days and 3 litres per person per day for water,
and no other quantity; Ready.gov gives one gallon per person per day and says "several days", with
no number of days. The 14-day US band is therefore this planner's choice, not Ready.gov's.

## Known gaps

- No screens read the packs yet; the engine (`docs/features/engine`) does.
- `perHousehold` expresses a one-off amount of a store (the first aid kit). A one-off that has no
  store (a radio, a torch as a thing rather than as light) cannot be a rule: the radio is the
  engine's own comms target, and torches count as light.
- No diesel store: diesel generators and oil heating are not modelled.
