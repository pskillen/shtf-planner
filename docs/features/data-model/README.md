# Data model

**Status:** Done
**Tracking:** none

The household document, the store that holds it in the browser, its migrations and the test
household. Nothing here is visible in the app yet: the shell still shows placeholders.

## Map

| Piece          | Where                                                 | What                                                                                                  |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The document   | `src/model/document.ts`                               | Zod schemas and types: `Document`, `Meta`, `Member`, `Home`, `Location`, `Asset`, `ItemInstance`, ... |
| Migrations     | `src/model/migrate.ts`                                | `migrate`, `reconcile`, `SchemaTooNewError`, the step list `MIGRATIONS`.                              |
| The store      | `src/store/documentStore.ts`                          | `openStore()` returns a `DocumentStore`.                                                              |
| Open and sync  | `src/store/migrateOnOpen.ts`, `src/store/yconvert.ts` | Bring-forward on open, device id and env stamp; plain JSON to and from the CRDT.                      |
| React side     | `src/app/state/`                                      | `DocumentProvider`, `useDocument()`, `useChange()`, `useStoreStatus()`.                               |
| Test household | `src/fixtures/household-biggar.{ts,json}`             | The invented family in Biggar, also the e2e seed.                                                     |

## The document

One `Document` per browser profile: `meta`, `household` (members and pets), `home`, and the keyed
records `locations`, `assets`, `items`, `customTypes`, `floors`, `plans`, `reviews`, then `settings`. Ids are
strings (`crypto.randomUUID()` for things the user makes, `"<packId>:<localId>"` for things a pack
defines). Dates are `YYYY-MM-DD`, best-before dates `YYYY-MM`, timestamps ISO.

Records that devices add at the same time are **keyed objects**, not arrays, so merges never fight
over an index. `household.members`, `household.pets` and a member's `medication` are small arrays
of records with ids. `meta.packVersions` records the version of each pack when the document first
used it; a later mismatch is reported (`packVersionReport`), not fatal.

`customTypes` (schema 2) holds the item types the household made itself, keyed `custom:<uuid>`, in
the same shape as a pack's item type. `withCustomTypes` / `packsFor` (`src/packs/custom.ts`) merge
them into the packs as a pseudo-pack `custom`, so the engine and the screens find them like any
other item type. The pseudo-pack is not in `packs.all` and not a Settings toggle.

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

## Migrations and old clients

`SCHEMA_VERSION` is 2 (schema 2 added `customTypes`: the step `custom item types` creates the empty
container). A change to the document's shape adds a `v(n)` to `v(n+1)` step to
`MIGRATIONS` and bumps `SCHEMA_VERSION`. Rules:

- **Steps are idempotent per record**: running one on a record already in the new shape changes
  nothing. A device on an older build can keep editing offline after another device migrated the
  document, and its old-shaped records then merge in. After every merge and every tab update the
  store re-runs the steps (`reconcile`) and writes the brought-forward records back.
- **Every step must tolerate every later shape.** `reconcile` replays _all_ steps from the oldest
  on every merge and tab update, not just the ones a document is missing, so step 2 runs on a
  document that is already at schema 5. Write each step to test for the old shape and leave
  anything already in a newer shape alone (a field that was renamed, a record that was split).
- **A step that creates a container gets each one written under its own fixed client id.** Two
  replicas that both run a step adding `contacts: {}` and then each add a record would otherwise
  create rival `contacts` maps, and after the merge only one map, and one record, would survive. The
  store finds the containers a step creates (the paths in its output that its input lacked) and
  writes each empty container in its own transaction under a client id hashed from the step's name
  and versions plus that container's path and initial shape (`src/store/stepContainers.ts`); the
  records inside are written normally. Because the id depends on nothing else the replica holds,
  replicas with different record sets still agree on a container they share, including one inside
  a record (`assets.<id>.maintenance`). So a step names and versions itself once and never changes afterwards, and it creates containers
  empty: put default records in under a key the user can edit, not as the container's content.
- **A newer schema makes the store read-only**: if a merge brings `meta.schemaVersion` above this
  build's, `change` throws `SchemaTooNewError` and subscribers get the `too-new` status, so the app
  can say "update this device". Nothing is written until the app is updated.
- **The content of a new document is frozen** (`src/store/init.ts`). Yjs breaks ties between
  concurrent sets of one key by client id, not by time, so two devices that start from nothing must
  not write rival copies. Every first-run device writes the containers and every default value
  (`home.type`, `settings.horizonDays`, `home.risks`, ...) as identical operations under one fixed
  client id, a hash of that content. They merge as one, and a real edit on either device descends
  from those shared items, so it always wins over a default. Only what legitimately differs per
  device (`meta.createdAt`, `meta.env`, `meta.devices`) is written under the device's own id.
  The content is a literal in `initContent()` (the schema-1 shape; it no longer follows
  `emptyDocument`, which is the current schema's). Editing it, or the pack list it names, changes
  the hash: a golden test fails and says so. Schemas after 1 add containers in their migration
  step instead, so a fresh schema-2 device writes the schema-1 content, then runs the step that
  adds `customTypes` and shares that container with every other device.
- A first-run device opens and writes its defaults before Drive's copy arrives. That is safe
  because of the rule above: when the copy is merged in, edits made on either side win over
  defaults, and two devices' records and list entries union.

## The fixture rule

`src/fixtures/household-biggar.ts` builds the test household (area ML12, detached, heat pump, solar
and battery without an EPS, two V2L cars, a baby, a child, an elderly person on a critical
medication, a dog); `household-biggar.json` is its export. They are **invented**: never put the
owner's real data in a fixture. Regenerate the JSON with
`WRITE_FIXTURE=1 npx vitest run test/fixtures.test.ts`. Fixture ids are fixed so tests can name
them. With `?debug=1`, `window.__shtf.loadFixture()` replaces the document with it. The fixture
lives under `src/` because the debug hook loads it (as its own lazily fetched chunk); nothing in
`src/` imports from `test/`, and a test enforces that.

Its dates assume "today" is 2026-11-04: the document is created and items are added from
2026-09-01, best-before dates are in the future except one deliberately expired item (UHT milk),
and it is set in Scotland (`home.subregion: 'scotland'`). The fixture never reads the clock; a test
that depends on dates passes `now` in.

`home.subregion` is optional and picks the regional risk links; it must be one of the `subregions`
the home's region lists in `regions.json` (for the UK: `scotland`, `england`, `wales`,
`northern-ireland`). `subregionIssue` in `src/packs/loader.ts` checks it.

## Debug hook

With `?debug=1`: `window.__shtf.doc()`, `.change(fn)` and `.loadFixture()` (all async).

## Known gaps

- No screens read or write the document yet.
- No Drive sync yet: `bytes`, `mergeBytes` and `heads` are the whole contract.
- No diesel store, so a diesel generator cannot be modelled.
