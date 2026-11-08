# Features

One hub per feature, with a status line and a map. Docs ship in the same PR as the behaviour.

## Words

The stock model names six levels, then a few everyday words the screens use beside them.

| Word           | Meaning                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Category**   | The pack's grouping above items: Food, Water, Fuel, Medical…                                                                      |
| **Item**       | The generic thing from the pack ("Baked beans"): what one pack counts towards, per unit of size. Items come only from the pack.   |
| **Product**    | The household's specific thing: a name, a size, barcodes, and which item it counts as (or nothing).                               |
| **Stock**      | A quantity of one product in one **place**, with an optional best-before month; whole packs or quarters.                          |
| **Resource**   | A named quantity the engine targets and counts (water litres, food kcal, nappies…). Say "resource", not "store".                  |
| **Capability** | What the preparedness score is built from: water, food, heat, cooking, light, power, comms, sanitation, medical, mobility, plans. |

**Place** is a named location (Pantry, Garage…), either **rotating** (a pantry: the engine counts at most the **minimum** kept there) or **stored** (everything there counts). **Minimum** is the least kept of an **item** in a rotating place, in packs of any of its products (`minimums` in the document). **Equipment** (stoves, batteries, radios…) lives under Home → Equipment, never as stock.

**`src/store`** is the document store (Yjs, IndexedDB, Drive sync), not a resource.

| Feature                                     | What                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| [App shell](app-shell/README.md)            | Installable PWA shell, landing page with changelog, footer                             |
| [Data model](data-model/README.md)          | The household document, its store, migrations and the test household                   |
| [Content packs](content-packs/README.md)    | Versioned JSON packs: items, assets, guidance, plans, regions                          |
| [Engine](engine/README.md)                  | Targets, coverage, gaps, score and horizon preview as pure functions                   |
| [Review](review/README.md)                  | Review queue, equipment maintenance and reminders                                      |
| [Setup screens](setup/README.md)            | Onboarding, the home hub, people, home, locations, equipment, risks, horizon, settings |
| [Inventory](inventory/README.md)            | Stores tab, Quick add, minimums, suitability warnings                                  |
| [Scanning](scanning/README.md)              | Barcode scanning, stocktake mode, camera date reading, scans to sort, Open Food Facts  |
| [Gaps and score](gaps-and-score/README.md)  | Shopping and to-do lists, the preparedness score                                       |
| [Scenario checklists](checklists/README.md) | Checklist pack format and validation (no scenarios or screen yet)                      |
| [Drive sync](drive-sync/README.md)          | Household kept in step across devices through Google Drive                             |

Not built yet, so no hub: contacts and the ICE sheet
([#45](https://github.com/pskillen/shtf-planner/issues/45)). Each hub's "Not built yet" section
links the work that extends it.
