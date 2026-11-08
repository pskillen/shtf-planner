# Glossary

The words SHTF Planner uses, on screens, in docs and in code. Where the code's name differs from
the screen's, both are given. Examples use the invented Biggar household. Decisions behind the
words are in [docs/decisions/](docs/decisions/README.md).

## The stock model

Six levels, top to bottom: **Capability › Resource › Category › Item › Product › Stock**.

| Word           | Meaning                                                                                                                                                                                                  | In code                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Capability** | Something the household can do without the grid for the whole horizon: water, food, heat, cooking, light, power, comms, sanitation, medical, mobility, plans. The score is built from capabilities.      | `CapabilityId`, `CAPABILITIES` (`src/model/packs.ts`) |
| **Resource**   | A named quantity that targets ask for and stock or equipment provides: water litres, food kcal, bottled gas kg, battery Wh, nappies… Never "store".                                                      | `ResourceId`, `RESOURCE_INFO`                         |
| **Category**   | The pack's grouping above items: Food, Water, Fuel, Medical, Baby, Pets… Inside a category, items may sit under a **heading** (Tins, Dried, Drinks…) in rough supermarket-aisle order.                   | `Category`, `Item.heading`                            |
| **Item**       | The generic thing, from the pack only ("Baked beans"): what one unit of size counts towards, its quick sizes, suitability and shelf life. There are no custom items. Was "item type" and briefly "kind". | `Item` (`items-base.json`)                            |
| **Product**    | The household's specific thing ("Heinz Beanz 415 g"): a name, a size, barcodes, and the item it **counts as**, or nothing (kept, listed, scores nothing).                                                | `Product`, `doc.products`                             |
| **Stock**      | A quantity of one product in one place, with an optional best-before month: whole packs or quarters. Rows with the same product, place and month merge. On screens, a **batch**.                         | `Stock`, `doc.stock`                                  |

**Stores** (the tab) keeps its name: the household's physical stores, grouped by item, then
product, then batches. **`src/store`** in code is the document store, not a resource.

## Checklists

- **Scenario.** Something that can happen to the household ("Power cut"); the thing a checklist is
  for. `ChecklistScenario` in a `checklists` pack.
- **Checklist step.** One action in a scenario, with a phase, an order, optional conditions
  (`requires`) and a source. A step can belong to several scenarios. `ChecklistStep`.
- **Checklist phase.** The heading a step sits under, in order: coming, immediate, first days,
  first week, longer term. Unrelated to delivery phases. `ChecklistPhase`.

## Inventory

- **Counts as.** The item a product counts through; also the one line an item shows about what it
  counts towards ("Wet wipes: 1 wipe = 1 hand clean (hygiene)"). `Item.countsAs`.
- **Size.** Amount and unit on a product (g, kg, ml, L, pieces); a multipack is count × size
  ("24 × 500 ml") and its total counts. `Size`.
- **Label kcal.** The kcal per 100 g or ml from a product's label (Open Food Facts); replaces the
  item's typical figure. `Product.labelKcalPer100`.
- **Usual product.** The household's product of an item whose stock was added most recently;
  suggestions name it and use its size.
- **Place.** A named location (Pantry, Garage, Shed). `Location` in code.
- **Rotating place / stored place.** A rotating place (pantry, fridge, freezer) runs up and down
  with weekly use, so it counts at most the minimum of each item; a stored place counts everything.
  `Location.kind`.
- **Minimum.** The least kept of an item in a rotating place, in packs of any of its products
  ("min 6", "Always keep at least"). Was "floor". `doc.minimums`, keyed by `minimumKey`.
- **Pantry.** The everyday rotating store; the reason minimums exist.
- **Location condition.** What a place is like: frost, heat, damp or indoor-stable. `Condition`.
- **Suitability.** The conditions an item tolerates; a mismatch with its place warns.
- **Expiry level.** Expired, expires soon (default within 1 month), before the next check (default
  3 months), or fine; shown by colour and word. `ExpiryLevel`.
- **Use first.** Per item, the batch with the earliest best-before that has not passed, across all
  its products. `useFirst`.
- **Equipment.** Things that convert fuel into heat, cooking or power, or need maintenance (stoves,
  heaters, generators, power stations, solar, radios). Kept under Home → Equipment, never as stock.
  `Asset`, from an asset type in the assets pack, with **answers** to its questions.
- **Quick add.** Adding stock by hand: pick the item, a size chip or typed size, a place and a
  best-before month; it can scan a barcode too.
- **Stocktake.** Scanning a pile of things one by one: barcode, best-before date, OK, next.
- **Scans to sort.** Barcodes saved for later (offline, or "Decide later"), waiting to become
  stock. `doc.scans`.
- **Barcode memory.** Which product each barcode the household has met is. `doc.barcodes`.

## The household

- **Member.** A person, with a date of birth, **risk tags** and medication.
- **Risk tag.** What changes a person's needs: infant, child, pregnant, elderly, reduced mobility,
  hearing or sight, dietary, powered equipment, takes medication. Age tags follow the date of birth
  until edited. `RiskTag`.
- **Pet.** A household animal by species and size; counts towards water and pet food.
- **Home.** The typed profile: type, floors, insulation, heating, cooking, mains gas, solar, home
  battery, EV charger, growing space, a rough **area**, region and subregion.
- **Local risk.** A risk the household declares for where it lives: flood, storm, snow, heat,
  wildfire, grid, water supply, remote, unrest… `LocalRisk`.
- **Region / subregion.** UK or US; the UK's nations as subregions, which pick the risk-checker
  links.

## The engine

- **Horizon.** How long the household plans to cope without help: 3, 7, 14 or 28 days, a choice,
  not a ladder. `settings.horizonDays`.
- **Horizon preview.** The table of what each horizon means for this household.
- **Target.** How much of a resource (or hours, range, a device, a plan) the household needs for
  the horizon, on a given date. `Target`.
- **Coverage.** What the household has against a target, from stock, minimums and equipment.
- **Gap.** Target minus coverage: **acquire** (buy), **replenish** (back to a minimum), **task**
  (fix something, such as fitting an EPS) or **plan**. `Gap.kind`.
- **Converter.** Equipment that turns a fuel resource into hours of heat or cooking, or Wh.
- **Blocked.** Equipment whose answers stop it counting (solar with no EPS, an EV without V2L).
- **Score.** Per capability 0–100, the product of its targets' cover ratios; plans
  (done ÷ total)^1.5; the headline is the mean, with the **weakest** capability named.
- **Enough.** A covered capability: over-stock adds nothing.

## Content

- **Pack.** Versioned JSON content shipped in the app: items, assets, guidance, plans, regions.
- **Guidance rule.** One rule in a guidance pack: a resource per person, pet or household per day
  (or a fixed amount), with multipliers and a source. `Rule`.
- **Source.** An https URL, listed with the date checked, or `"assumption"`; every number has one.
- **Plan item.** A thing to do or know that scores under plans (meeting point agreed, shut-offs
  known, documents copied); from the plans pack, done or not, some expiring. `PlanDef` in the pack,
  `doc.plans` in the document.

## Data and sync

- **Household document.** Everything one household owns, in a Yjs CRDT in IndexedDB.
- **Schema version.** The document's shape number; 4 today. Older documents are refused; newer
  ones are left alone.
- **Env.** The build that last wrote the document: local, preview, dev, next, staging or prod.
- **Which copy?** The question sync asks when the same field changed on two devices.

## Retired words

- **Floor**: now **minimum**.
- **Item type**, **kind**: now **item** (generic) plus **product** (specific).
- **Custom item type**: removed in schema 4; there are no custom items, and a product may count
  towards nothing instead.
- **Store** (a quantity): now **resource**.
- **Asset**: still the code's name; screens say **equipment**.

- **Review.** A household check of items needing attention, finished deliberately with a summary.
- **Review queue.** The engine-ordered items to check within the current look-ahead window.
- **Review cadence.** The three- or six-month interval used for the scheduled review and look-ahead.
