# Scenario checklists

**Status:** Format only; no scenarios or screen yet
**Tracking:** [#40](https://github.com/pskillen/shtf-planner/issues/40)

Step-by-step checklists for things that happen (a power cut, a flood warning), grouped by when a
step matters. Today only the content-pack format and its validation exist: no bundled pack, no
engine, no route.

## Map

| Piece   | Where                 | What                                                                                          |
| ------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Schemas | `src/model/packs.ts`  | `ChecklistsPack`, `ChecklistScenario`, `ChecklistStep`, `ChecklistPhase`, `CHECKLIST_PHASES`. |
| Loader  | `src/packs/loader.ts` | Validation, and the `checklistScenarios` and `checklistSteps` indexes on `Packs`.             |

## The `checklists` pack

`{ kind: 'checklists', scenarios, steps }`, ids namespaced `"<packId>:<local>"`.

- A **scenario** has an `id`, a `name` and optional `risks` (local risks that make it relevant).
- A **step** has `id`, `text`, `scenarios` (at least one, no repeats, all in the same pack),
  `phase`, an integer `order`, optional `requires` and a `source`.
- **Phases**, in this fixed order: `coming`, `immediate`, `first-days`, `first-week`,
  `longer-term`.
- `requires` may name a `risk`, `asset` types (any of), `pets`, or a `memberTag` (a person's risk
  tag).
- `source` is an `https` URL listed in the pack's `sources` (with the date checked), or
  `"assumption"`, as for guidance rules.

The loader rejects, naming the field: an id outside the pack's namespace or duplicated, empty or
repeated `scenarios`, a scenario not in the same pack, an unknown phase, a non-integer `order`, an
unlisted source, and a `requires.asset` that is not a real asset type.

## Not built yet

Bundled scenarios and steps, choosing which steps apply to a household, and the screen. See
[#40](https://github.com/pskillen/shtf-planner/issues/40).
