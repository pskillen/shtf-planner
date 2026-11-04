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
shelfLife, ageBand?, typicalPricePence?, tags, barcodes? }`. `gives` may not name
  `medicationDays` (computed from the document).
- **`assets`**: `AssetType { id, name, category, questions, contributes, maintenance }`. A
  `Contribution` says what the asset adds to a capability, optionally only `when` a question has an
  answer: `converts` (burns a store per running hour), `outputPerHour`, `providesPerDay` or
  `providesPerDayFrom` (fuel-free supply, e.g. solar), `storesWh` (a battery), `holds` (a stock,
  e.g. a water butt). Solar and a home battery contribute power **only** when `hasEps` is true; an
  EV only when `v2l`. A contribution with a number carries a `source` (an `https` URL listed in
  the pack's `sources`, or `"assumption"`), as a rule does; the loader requires it.
- **`guidance`**: `horizonBands` and `rules`. A `Rule` states a quantity (`perPersonDay`,
  `perPetDay`, `perHouseholdDay`, `hoursPerDay`, `mealsPerPersonDay` or `rangeKm`), optional
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

- No screens read the packs yet.
- A rule cannot express a one-off item (one torch, one radio, one first aid kit): those are
  approximated per day or left to the plans pack.
- No diesel store: diesel generators and oil heating are not modelled.
