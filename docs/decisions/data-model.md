# The household document

**Status:** Accepted. See the [data model hub](../features/data-model/README.md).

**One document per household.** Everything the household owns is one document in the browser
(IndexedDB), validated by Zod, exportable as a file. [D11]

**A Yjs CRDT.** The document lives in Yjs (`yjs`, `y-indexeddb`, an own `BroadcastChannel` relay
between tabs), not Automerge 3. Why: Automerge added about 1.2 MB gzipped of WASM, more than twice
the bundle budget; Yjs about 29 kB, and it loaded, merged and edited 4–40× faster in the spike.
[D49, D61]

**A frozen start under a fixed client id.** A new document's containers, schema version and every
default value are written under a fixed Yjs client id, derived from a hash of the skeleton,
defaults and schema version, so two fresh devices merge as one and a fresh device's defaults never
beat a real answer. A golden test pins the encoded init update. Per-device fields (`createdAt`,
`env`, `devices`) are written under the real client id. The layout is frozen per schema; a later
schema adds containers in migration steps under the same rule. Why: a real answer survived only 25
of 60 merges with a fresh device before this. [D74, D77, D78]

**Merge rules.** Arrays of plain values merge as sets; records merge by id; `meta.env` is the last
writer's env, stamped at open. [D75]

**The schema is versioned and guarded.** Changing the document's shape means a `SCHEMA_VERSION`
bump and an idempotent migration step. The app never downgrades: a document newer than it knows is
left untouched, nothing is merged, and the device is told to update. The document records the env
that last wrote it. [D44, D62, D146]

**Schema 4 started afresh.** The item/product/stock model replaced the earlier item types and
custom types with no migration: documents older than schema 4, and old exports, are refused, not
migrated. Why: nobody but the owner had data, and the owner chose to start a new household. [D171,
D190]

**An old household on Drive is replaced after one question.** When Drive holds a pre-schema-4
household, the app asks once, "Replace it?", then overwrites. Planned: a non-destructive choice
instead ([#90](https://github.com/pskillen/shtf-planner/issues/90)). [D193]

**Barcode memory and the scan queue are in the document**, so they sync between devices. [D146]

**Flush on hide.** The app flushes the store to IndexedDB when the page is hidden or closed. Why:
an edit followed by a reload lost the write in 13 of 20 tries. [D95]

**Per-device choices stay on the device.** Quick add's last place and recent items, and similar
screen conveniences, live in `localStorage`, never the document. [D103]

**The test household is invented.** Fixtures and examples use an invented family in Biggar; the
owner's real data or export never enters the repo. [D41]
