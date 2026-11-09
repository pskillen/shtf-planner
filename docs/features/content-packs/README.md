# Content packs

**Status:** Done
**Tracking:** none

What to have, and how much, ships as versioned JSON packs validated with Zod. They are bundled
(imported as JSON modules), so they work offline.

## Map

| Piece   | Where                                     | What                                                          |
| ------- | ----------------------------------------- | ------------------------------------------------------------- |
| Schemas | `src/model/packs.ts`                      | `Pack`, `Packs`, `Item`, `AssetType`, `Rule`, `PlanDef`, ids. |
| Loader  | `src/packs/loader.ts`                     | `loadPacks`, `parsePack`, `enabledPacks`, `PackError`.        |
| Bundled | `src/packs/bundled.ts`, `src/packs/data/` | `bundledPacks()` loads the shipped packs once.                |

## The packs

| Pack file                  | Kind         | Holds                                                                                                                                                |
| -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items-base.json`          | `items`      | About 170 generic items (shopping-list level: baked beans, chopped tomatoes, soft drinks…), with headings, size chips, and what each counts towards. |
| `assets-base.json`         | `assets`     | Heaters, stoves, power sources (solar, home battery, EV, generator), water butt, alarms, radios, with questions, contributions and maintenance.      |
| `guidance-uk-prepare.json` | `guidance`   | UK Government "Be Ready": 3 days, 3 litres of water per person per day.                                                                              |
| `guidance-us-ready.json`   | `guidance`   | Ready.gov: one gallon of water per person per day.                                                                                                   |
| `guidance-grid-free.json`  | `guidance`   | Region-less rules: heat, cooking, light, phone power, sanitation, medication, mobility, babies, pets.                                                |
| `plans-base.json`          | `plans`      | Meeting point, shut-offs, documents, grab bags, first aid course, EPS, neighbours, pets.                                                             |
| `checklists-uk.json`       | `checklists` | UK scenario checklists: the power-cut, storm, flood, heatwave and evacuation steps, each sourced; offered by region, not switched.                   |
| `regions.json`             | `regions`    | UK and US units, currency, risk links (flood, weather), suggested packs.                                                                             |

## Format

Every pack is `{ format: 1, id, kind, version, name, region?, sources? }` plus its body. Pack schemas
are strict: an unknown key is an error. Ids inside a pack are written in full as
`"<packId>:<localId>"` (lower-case kebab-case); the loader checks the prefix and uniqueness.
Questions and maintenance items have ids local to their asset type (`answers` and `maintenance` in
the document are keyed by them).

- **`items`**: `Item { id, name, category, heading?, measure, unit, countsAs, gives: [{ resource,
amount, per }], sizes, suitability, shelfLife, ageBand?, typicalPricePence?, tags,
assetTypeId?, offCategories?, source? }`. **`measure`** is `mass`, `volume` or `count`; sizes use
  g, kg, ml, L or pieces, and a multipack is `count × size` ("24 × 500 ml"). **`gives`** says what
  one item gives per **`per`** base units of a product's size (g, ml or pieces); `amount` may be 0
  when only a label can say (soft drinks: water from the item, kcal from the product label).
  **`countsAs`** is the one line screens show ("Wet wipes: 1 wipe = 1 hand clean (hygiene)").
  **`heading`** groups items inside a category in rough supermarket-aisle order (Food: Tins, Dried…).
  **`sizes`** are quick-add chips, usual size first. **`offCategories`** lists Open Food Facts
  category tags that mean this item (each tag on one item only); the scan flow uses them to suggest
  "Counts as …". `gives` may not name `medicationDays` (computed from the document). Tags the
  engine reads: `needs-cooking`, `radio-rx`, `treatment`, `no-suggest`, `phone`, `portable-power`.
  **One home per thing.** An item that is really equipment has `assetTypeId`; it is buy-only (price
  and gives for suggestions), never stock. Quick add routes to the equipment form; a stock row of
  such an item counts nothing. Stoves, heaters, generators, radios, water butt, alarms and similar
  are equipment entries; food, water, fuels, cells and hygiene are stock items. **`source`** on an
  item is where its **`gives`** figures come from: an `https` URL listed in the pack's `sources`,
  or `"assumption"`. Figures are being checked against sources (including the UK Government's
  Composition of Foods Integrated Dataset, CoFID, where it applies); `"assumption"` marks what is
  still an estimate.
- **`assets`**: `AssetType { id, name, category, questions, contributes, maintenance }`. A
  `Contribution` says what the asset adds to a capability, optionally only `when` a question has an
  answer: `converts` (burns a resource per running hour), `outputPerHour`, `providesPerDay` or
  `providesPerDayFrom` (fuel-free supply, e.g. solar), `storesWh` (a battery), `holds` (held stock,
  e.g. a water butt). Solar and a home battery contribute power **only** when `hasEps` is true; an
  EV only when `v2l`. A contribution with a number carries a `source` (an `https` URL listed in
  the pack's `sources`, or `"assumption"`), as a rule does; the loader requires it. Each converter
  names exact fuel items, a confirmation question and, for multiple items, an unanswered selector
  whose values are item IDs. Its use context and sourced safety guidance are bundled; indoor heat
  requires the household's manual check. Rates marked assumption are not manufacturer claims.
- **`guidance`**: `horizonBands` and `rules`. A `Rule` states a quantity (`perPersonDay`,
  `perPetDay`, `perHouseholdDay`, `perHousehold`, `hoursPerDay`, `mealsPerPersonDay` or `rangeKm`), optional
  `appliesTo`, `requires`, `multipliers`, `minHorizonDays`, and a `source`. With `ageBands`, a
  person in no band needs none. Each quantity names a **`resource`** (`ResourceId`), not a "store".
- **`plans`**: `items: PlanDef[]`; `requires` may name a risk, asset types (any of) or `pets`.
- **`checklists`**: `scenarios` and `steps`; a step names its scenarios (in the same pack), a
  `phase`, an integer `order`, optional `requires` (risk, asset types, pets, member tag) and a
  `source` (an `https` URL listed in the pack's `sources`, or `"assumption"`, as a rule has). See
  [Scenario checklists](../checklists/README.md).
- **`regions`**: units, currency, `riskLinks`, `subregions`, `suggestedPacks`.

`CapabilityId`: `water food heat cooking light power comms sanitation medical mobility plans`.
`ResourceId`: the game's thirteen resources plus `nappies formulaG petFoodKcal sanitationUses
hygieneUses medicationDays lumenHours` (`RESOURCE_INFO` has names and units).

## How the engine reads these

The numbers mean exactly this; the schema comments in `src/model/packs.ts` say the same.

- **Age bands are half-open: `[fromMonths, toMonths)`.** A child of exactly `toMonths` is in the
  next band. A rule's `ageBands` are a partition (the schema refuses empty or overlapping bands):
  `0-6, 6-12, 12-36` puts a 6-month-old in the second band, and an age in no band needs none. An
  item's `ageBand` says which ages it suits and may overlap its neighbours', because sizes overlap
  (nappy sizes 2 and 3 both fit a five-month-old). The household's **products** carry sizes; the
  engine counts stock through them (label kcal when present).
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

## In Settings

Settings draws a switch for each pack except `checklists` packs. A checklist pack is not switched
on or off and is never written to `settings.packs` (nor to `DEFAULT_PACKS`): it is offered by
region alone (the pack's `region` must equal the household's; a pack with no region is offered to
nobody). Under the switches, a "Scenario checklists" group lists this region's checklist packs as
plain text ("Included for your region"), or says none are available for the region. The group is
not drawn while no checklist pack is bundled at all.

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

## Curated, not imported

Official guidance (UK Be Ready, Ready.gov) is prose, so a pack is authored from it by hand, with
the source URL and the date checked, and versioned. Nothing is scraped or fetched at run time:
fetching would break offline use and buy nothing, since the sources change rarely. A pack can be
re-checked against its sources at any time.

## Items: what the pack's choices mean

- **Shopping-list level.** Items are what a shopping list says (baked beans, chopped tomatoes,
  tinned soup), about 170 of them, grouped under headings, with an `other-…` catch-all per heading.
  The product's label kcal does the precise counting, so the item only needs a typical figure.
- **Drinks count as water.** Soft drinks and long-life fruit juice give 1 L of water per litre plus
  the label's kcal (diet drinks 0; juice falls back to a typical figure).
- **Hygiene "uses".** A use is one hand clean, and the target is three a person a day; a wipe is one
  use, a soap and sanitiser kit 30. Things that do not fit that measure (gloves, for one) are not
  given a special item; how hygiene is modelled is an open question
  ([#38](https://github.com/pskillen/shtf-planner/issues/38)).
- **Water containers** are stock "kept filled": they count the litres they hold, and a suggestion for
  one says to fill it from the tap.
- **Calories.** 24 kcal figures cite CoFID; checking them against the CoFID workbook is still to do
  ([#59](https://github.com/pskillen/shtf-planner/issues/59)). A product's label kcal replaces the
  typical figure whenever it has one.

## Known gaps

- `perHousehold` expresses a one-off amount of a resource (the first aid kit). A one-off that has no
  resource (a radio, a torch as a thing rather than as light) cannot be a rule: the radio is the
  engine's own comms target, and torches count as light.
- No diesel resource: diesel generators and oil heating are not modelled.

## Not built yet

- Content and engine breadth ([#49](https://github.com/pskillen/shtf-planner/issues/49)): diesel,
  vehicles, candles and torch cells as light, a wood burner and a gas BBQ as items to buy, Welsh and
  Northern Irish flood links, a check of the asset assumptions, the CoFID kcal check.
- Equipment that holds a resource up to a capacity (water containers): [#28](https://github.com/pskillen/shtf-planner/issues/28).
- A checklist pack by scenario and phase, with stable ids so packs merge without duplicates:
  [#40](https://github.com/pskillen/shtf-planner/issues/40).
