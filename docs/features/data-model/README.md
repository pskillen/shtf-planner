# Data model

**Status:** Done
**Tracking:** none

The household document, the store that holds it in the browser, its migrations and the test
household. The screens read and write it through the store hooks.

## Map

| Piece          | Where                                                 | What                                                                                                      |
| -------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The document   | `src/model/document.ts`                               | Zod schemas and types: `Document`, `Meta`, `Member`, `Home`, `Location`, `Asset`, `Product`, `Stock`, ... |
| Migrations     | `src/model/migrate.ts`                                | `migrate`, `reconcile`, `SchemaTooNewError`, the step list `MIGRATIONS`.                                  |
| The store      | `src/store/documentStore.ts`                          | `openStore()` returns a `DocumentStore`.                                                                  |
| Open and sync  | `src/store/migrateOnOpen.ts`, `src/store/yconvert.ts` | Bring-forward on open, device id and env stamp; plain JSON to and from the CRDT.                          |
| React side     | `src/app/state/`                                      | `DocumentProvider`, `useDocument()`, `useChange()`, `useStoreStatus()`.                                   |
| Test household | `src/fixtures/household-biggar.{ts,json}`             | The invented family in Biggar, also the e2e seed.                                                         |

## The document

One `Document` per browser profile: `meta`, `household` (members and pets), `home`, and the keyed
records `locations`, `assets`, `products`, `barcodes`, `stock`, `scans`, `minimums`, `plans`,
`reviews`, `checklistRuns`, `checklistStepStates`, then `settings`. Ids are strings (`crypto.randomUUID()` for things the user makes,
`"<packId>:<localId>"` for pack-defined ids). Dates are `YYYY-MM-DD`, best-before dates `YYYY-MM`,
timestamps ISO.

Records that devices add at the same time are **keyed objects**, not arrays, so merges never fight
over an index. `household.members`, `household.pets` and a member's `medication` are small arrays
of records with ids. `meta.packVersions` records the version of each pack when the document first
used it; a later mismatch is reported (`packVersionReport`), not fatal.

**Schema 4** separates the generic **item** (from the pack) from the household's **products** and
**stock**. `products` holds each product's name, size, optional `itemId` (absent means it counts
towards nothing), optional label kcal per 100 g or 100 ml, and when it was added. `stock` is a
quantity of one product in one place: `qty` is a positive number of whole packs or quarters (½ and
¼ for part-used packs), with optional best-before month and `source` `manual` or `barcode`.
`minimums` is keyed `minimumKey(locationId, itemId)` (`"<place>|<pack-item-id>"`): the least kept
of that item in a rotating place, in packs of any of its products.

`barcodes` and `scans` belong to scanning (`docs/features/scanning/`). `barcodes` maps the
normalised GTIN (a UPC-A and its EAN-13 form are one key) to the **product** it is, with the date
first remembered (not updated on every scan). `scans` holds scans saved for later: a code, quantity,
place, optional best-before, and optional `off` (what Open Food Facts said once looked up: name,
size, kcal, categories…). A scan counts towards nothing until it is sorted into stock.
`settings.expirySoonMonths` (0 to 3) and `settings.expiryCheckMonths` (1 to 12) are optional: absent
means 1 and 3, so no step writes them.

Rules the screens rely on:

- **One stock row per batch.** Stock of the same product in the same place with the same
  best-before month is one row; adding more adds to its `qty` (`addStockWithUndo` in
  `src/app/screens/stores/stock.ts`).
- **A product's size** is an amount and a unit (g, kg, ml, L or pieces), with a count for a
  multipack ("24 × 500 ml"), whose total is what counts.
- **Lists of plain values** (`home.risks`, a member's `tags`, `settings.packs`, `meta.devices`)
  merge as sets: concurrent adds union, duplicates drop, and the order after a merge is not the
  order chosen, so sort them where order matters on screen.
- **`meta.env`** is the environment of the last build that wrote the document, stamped when the
  store opens; Drive sync shows it when files come in or go out.
- **Per-device choices** (last place used, recent items, the date reader's switches, dismissed
  hints) live in localStorage, never in the document, so they do not sync.

`Env` has six values (`local`, `preview`, `dev`, `next`, `staging`, `prod`) and lives in
`src/model/document.ts`; `src/util/build-env.ts` re-exports the type, so there is one source.

## The store

The CRDT is **Yjs** with `y-indexeddb`; tabs of one browser stay in step through a
`BroadcastChannel` relay. `get()` returns a plain, deeply frozen snapshot; `change(label, fn)`
runs `fn` on a draft and writes only the difference, in one transaction labelled `label`
(validated against the schema in dev builds). Objects are `Y.Map`s, so concurrent edits to
different records or fields never conflict; arrays of records with ids are diffed by id, so editing
one member never clobbers another.

| Method                         | For                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `get`, `status`                | The snapshot; `ok`, or why the store is read-only.                                  |
| `change`, `subscribe`          | Edit; hear about every change, local or merged (the listener also gets the status). |
| `export`, `importJson`         | JSON with sorted keys (byte-identical for equal documents); replace from an export. |
| `heads`, `bytes`, `mergeBytes` | Drive sync: an opaque sync point, the CRDT binary, merge another device's binary.   |
| `flush`, `close`               | Wait for IndexedDB; release it.                                                     |

`src/app` reaches the store only through `DocumentProvider`.

**Schema 5** adds scenario checklist **runs**. `checklistRuns` is keyed by run id: the scenarios
chosen, when the run started and finished, and a catalogue snapshot (the packs and their versions,
the scenarios available, and every household-applicable step, copied when the run starts and never
recomputed). `checklistStepStates` is keyed `runId|stepId` and holds a step's `doneAt` and `note`;
unticking removes `doneAt` and keeps the note. A run's `scenarios` is a merged array, so after a
merge it can hold duplicates or be empty; the schema accepts both and readers de-duplicate. Ticks
never touch `plans` or the score. Nothing creates a run yet.

## Migrations and old clients

`SCHEMA_VERSION` is **5**. Schema 4 was a deliberate break: there is **no migration** from older
households, and `OLDEST_SCHEMA_VERSION` is 4: anything with `meta.schemaVersion` below 4 is refused.
`MIGRATIONS` holds one step, `add-checklist-runs` (4 to 5), which adds the two empty containers
`checklistRuns` and `checklistStepStates` and replaces nothing that exists. Its name and versions
seed the fixed client id of each container, so they never change once shipped. A new document
still starts from the frozen schema-4 literal and gets the containers from this step.

- **Too old on this device.** Opening or importing a schema-1–3 document sets store status
  `too-old`. The app shows a full-screen gate (`TooOld.tsx`): download a copy, then **Start a new
  household**, which clears local data but **keeps the Google Drive sign-in** (`startFreshHousehold`,
  `forgetDeviceData` with `keepDrive: true`). Nothing is edited until the person starts fresh.
- **Too new on this device.** If a merge brings `meta.schemaVersion` above this build's,
  `change` throws `SchemaTooNewError` and subscribers get `too-new` ("update this device").
- **Future steps.** When a later schema adds a shape change, add a step to `MIGRATIONS` and bump
  `SCHEMA_VERSION`. Then the usual rules apply again:
  - **Steps are idempotent per record**: running one on a record already in the new shape changes
    nothing. After every merge and tab update the store re-runs the steps (`reconcile`) and writes
    the brought-forward records back.
  - **Every step must tolerate every later shape.** `reconcile` replays _all_ steps from the oldest
    on every merge and tab update, not just the ones a document is missing.
  - **A step that creates a container gets each one written under its own fixed client id**
    (`src/store/stepContainers.ts`).
- **The content of a new document is frozen** (`src/store/init.ts`). Yjs breaks ties between
  concurrent sets of one key by client id, not by time, so two devices that start from nothing must
  not write rival copies. Every first-run device writes the containers and every default value as
  identical operations under one fixed client id, a hash of that content. Schema 4 **replaced**
  `initContent()` on purpose (products, stock, minimums instead of items, customTypes, floors); the
  golden test in `init.test.ts` guards that literal. Later schemas add containers in a migration step
  instead of editing the init literal.
- A first-run device opens and writes its defaults before Drive's copy arrives. When the copy is
  merged in, edits made on either side win over defaults, and two devices' records union.

## The fixture rule

`src/fixtures/household-biggar.ts` builds the test household (area ML12, detached, heat pump, solar
and battery without an EPS, two V2L cars, a baby, a child, an elderly person on a critical
medication, a dog); `household-biggar.json` is its export. They are **invented**: never put the
owner's real data in a fixture. Regenerate the JSON with
`WRITE_FIXTURE=1 npx vitest run test/fixtures.test.ts`. Fixture ids are fixed so tests can name
them. With `?debug=1`, `window.__shtf.loadFixture()` replaces the document with it. The fixture
lives under `src/` because the debug hook loads it (as its own lazily fetched chunk); nothing in
`src/` imports from `test/`, and a test enforces that.

Its dates assume "today" is 2026-11-04: the document is created and stock is added from
2026-09-01, best-before dates are in the future except one deliberately expired batch (UHT milk on
`prod-uht`), and it is set in Scotland (`home.subregion: 'scotland'`). Stock goes through
**products** (beans, soup, pasta, rice, oats, UHT, peanut butter, bottled water, a water can, first
aid, torch, AA cells, nappies, propane, and `prod-twine` which counts towards nothing). Minimums sit
on baked beans, pasta, rice and UHT in the Pantry. One barcode remembers `prod-spread`. The fixture
never reads the clock; a test that depends on dates passes `now` in.

`home.subregion` is optional and picks the regional risk links; it must be one of the `subregions`
the home's region lists in `regions.json` (for the UK: `scotland`, `england`, `wales`,
`northern-ireland`). `subregionIssue` in `src/packs/loader.ts` checks it.

## Debug hook

With `?debug=1`: `window.__shtf.doc()`, `.change(fn)` and `.loadFixture()` (all async).

## Known gaps

- No diesel resource, so a diesel generator cannot be modelled.

## Not built yet

- Several households in one Google Drive, each chosen or created on connect, and a non-destructive
  answer when Drive holds an older household:
  [#85](https://github.com/pskillen/shtf-planner/issues/85). Today there is one document per
  browser profile and per Drive.

## Background: why a CRDT, and why Yjs

The household is one document that two or three devices edit, rarely at the same moment, with no
server: Drive is a file store, not a sync service. Writes come in bursts (a stocktake, a review),
so they land locally at once and go to Drive once per burst. Server-backed sync engines
(RxDB replication, PowerSync, ElectricSQL, Replicache, Dexie Cloud and similar) were out because they
need a server or a paid relay; a hand-rolled last-write-wins per record would have meant owning every
merge bug; a per-device operation log on Drive was the most machinery. A document CRDT merges the
whole document by design; nothing off the shelf pushes to Google Drive, so the Drive adapter is
ours either way.

Yjs was measured against Automerge 3 on a 1,000-record household in desktop Chrome:

|                                  | Automerge 3                      | Yjs                     |
| -------------------------------- | -------------------------------- | ----------------------- |
| Added to the bundle, gzipped     | about 1,215 kB (nearly all WASM) | about 29 kB             |
| Document bytes after 2,000 edits | about 115 kB                     | about 236 kB (64 kB gz) |
| Merging two devices' edits       | 106 to 138 ms                    | 21 to 35 ms             |
| Cold load from IndexedDB         | 270 to 380 ms plus WASM start-up | 53 to 89 ms             |
| 1,000 edits on one device        | 640 to 680 ms                    | 11 to 26 ms             |

Automerge was 2.4 times over the 500 kB bundle rule and its built-in diff saved no code: the
which-copy comparison took about 30 lines in either. Yjs costs a document about twice the size and a
last-synced copy of the state kept per device (which Drive sync keeps anyway). The 1 s phone load
rule was never measured on a phone; the desktop's under 0.1 s leaves ten times the headroom.
