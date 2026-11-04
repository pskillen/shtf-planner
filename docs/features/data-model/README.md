# Data model

**Status:** Done (model, store and fixture; no screens yet)
**Tracking:** none (no tickets yet)

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
| Test household | `test/fixtures/household-biggar.{ts,json}`            | The invented family in Biggar, also the e2e seed.                                                     |

## The document

One `Document` per browser profile: `meta`, `household` (members and pets), `home`, and the keyed
records `locations`, `assets`, `items`, `floors`, `plans`, `reviews`, then `settings`. Ids are
strings (`crypto.randomUUID()` for things the user makes, `"<packId>:<localId>"` for things a pack
defines). Dates are `YYYY-MM-DD`, best-before dates `YYYY-MM`, timestamps ISO.

Records that devices add at the same time are **keyed objects**, not arrays, so merges never fight
over an index. `household.members`, `household.pets` and a member's `medication` are small arrays
of records with ids. `meta.packVersions` records the version of each pack when the document first
used it; a later mismatch is reported (`packVersionReport`), not fatal.

`Env` has six values (`local`, `preview`, `dev`, `next`, `staging`, `prod`) and lives in
`src/model/document.ts`; `src/util/build-env.ts` re-exports the type, so there is one source.

## The store

The CRDT is **Yjs** with `y-indexeddb`; tabs of one browser stay in step through a
`BroadcastChannel` relay. `get()` returns a plain, deeply frozen snapshot; `change(label, fn)`
runs `fn` on a draft and writes only the difference, in one transaction labelled `label`
(validated against the schema in dev builds). Objects are `Y.Map`s, so concurrent edits to
different records or fields never conflict; arrays of records with ids are diffed by id, so editing
one member never clobbers another.

| Method                         | For                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `get`, `status`                | The snapshot; `ok`, or why the store is read-only.                                     |
| `change`, `subscribe`          | Edit; hear about every change, local or merged (the listener also gets the status).    |
| `export`, `importJson`         | JSON with sorted keys (byte-identical for equal documents); replace from an export.    |
| `heads`, `bytes`, `mergeBytes` | Drive sync (P6): an opaque sync point, the CRDT binary, merge another device's binary. |
| `flush`, `close`               | Wait for IndexedDB; release it.                                                        |

`src/app` reaches the store only through `DocumentProvider`.

## Migrations and old clients

`SCHEMA_VERSION` is 1. A change to the document's shape adds a `v(n)` to `v(n+1)` step to
`MIGRATIONS` and bumps `SCHEMA_VERSION`. Rules:

- **Steps are idempotent per record**: running one on a record already in the new shape changes
  nothing. A device on an older build can keep editing offline after another device migrated the
  document, and its old-shaped records then merge in. After every merge and every tab update the
  store re-runs the steps (`reconcile`) and writes the brought-forward records back.
- **A newer schema makes the store read-only**: if a merge brings `meta.schemaVersion` above this
  build's, `change` throws `SchemaTooNewError` and subscribers get the `too-new` status, so the app
  can say "update this device". Nothing is written until the app is updated.
- **The container layout of a new document is frozen per schema** (`SKELETON_V1` in the store). Two
  devices that both start from nothing write the same maps and arrays under a fixed client id, so
  they merge as one instead of one device's `items` map replacing the other's. Later schemas add
  containers in their migration step.
- A first-run device should still merge Drive's copy before it writes anything of its own (P6).

## The fixture rule

`test/fixtures/household-biggar.ts` builds the test household (area ML12, detached, heat pump, solar
and battery without an EPS, two V2L cars, a baby, a child, an elderly person on a critical
medication, a dog); `household-biggar.json` is its export. They are **invented**: never put the
owner's real data in a fixture. Regenerate the JSON with
`WRITE_FIXTURE=1 npx vitest run test/fixtures.test.ts`. Fixture ids are fixed so tests can name
them. With `?debug=1`, `window.__shtf.loadFixture()` replaces the document with it.

## Debug hook

With `?debug=1`: `window.__shtf.doc()`, `.change(fn)` and `.loadFixture()` (all async).

## Known gaps

- No screens read or write the document yet (P4 onwards).
- No Drive sync (P6): `bytes`, `mergeBytes` and `heads` are the whole contract.
- No diesel store, so a diesel generator cannot be modelled.
