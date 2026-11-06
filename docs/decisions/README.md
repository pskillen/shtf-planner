# Decisions

The design decisions that still bind, grouped by theme. Each paragraph gives the rule, the reason
where one was recorded, and the original decision number in brackets (`[D166]`) for searching the
planning history. `[D110 → D141]` means the later decision replaced the earlier one; only the
current rule is written. Rules that describe one screen's behaviour live in the
[feature hubs](../features/README.md); process decisions (merging, reviews, tooling) are not
carried over. Words are defined in [GLOSSARY.md](../../GLOSSARY.md); the overview is
[design.md](../design.md).

| File                                        | What                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| [Product principles](product-principles.md) | Capabilities, the horizon as a choice, honest score, audience, look      |
| [Engine and scoring](scoring.md)            | Targets, coverage, gaps, score formulas, fuel sharing, suggestions       |
| [Stock model](stock-model.md)               | Item, product, stock; minimums and rotating places; equipment vs stock   |
| [Content packs](content-packs.md)           | Curated sourced packs, regions, item granularity, drinks, checklists     |
| [The household document](data-model.md)     | Yjs, the frozen start, merge rules, schema guard, schema 4               |
| [Drive sync](drive-sync.md)                 | `drive.file`, when it syncs, conflicts, env warnings, token renewal      |
| [Privacy](privacy.md)                       | What may leave the browser, camera frames, Open Food Facts               |
| [Scanning and quick entry](scanning.md)     | Barcodes, Open Food Facts, the on-device date reader and its parser      |
| [Platform and build](platform.md)           | Stack, update prompt, environments, changelog, the lint fence            |
| [Planned features](planned-features.md)     | Agreed but not built: review follow-up, checklists, contacts, badges, AI |
