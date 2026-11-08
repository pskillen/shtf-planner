# Scenario checklists

**Status:** Format and selection engine; no scenarios or screen yet
**Tracking:** [#40](https://github.com/pskillen/shtf-planner/issues/40)

Step-by-step checklists for things that happen (a power cut, a flood warning), grouped by when a
step matters. Today the content-pack format, its validation and the selection engine exist: no bundled pack
and no route.

## Map

| Piece   | Where                 | What                                                                                          |
| ------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Schemas | `src/model/packs.ts`  | `ChecklistsPack`, `ChecklistScenario`, `ChecklistStep`, `ChecklistPhase`, `CHECKLIST_PHASES`. |
| Loader  | `src/packs/loader.ts` | Validation, and the `checklistScenarios` and `checklistSteps` indexes on `Packs`.             |

| Engine | `src/engine/checklists.ts` | `checklistPacks`, `checklistScenarios`, `isStepApplicable`, `checklist`. |

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

## Choosing steps (engine)

`src/engine/checklists.ts`, pure and without any screen yet.

- **Packs.** `checklistPacks(packs, region)` returns the bundled checklist packs whose `region`
  is the household's (or unset), in load order. It ignores `settings.packs`: checklists are not
  switched on per household, and nothing here touches targets or the score.
- **Scenarios.** `checklistScenarios(doc, packs)` lists every scenario on offer. Those whose
  `risks` include a risk declared on the home come first (`riskMatch`), then pack order, then
  name. Nothing is picked automatically; the household chooses.
- **Applicability.** `isStepApplicable(step, doc, asOf)`: `requires` fields combine with AND.
  `risk` needs that risk declared on the home; `asset` needs any owned asset of a listed type;
  `pets` needs at least one pet; `memberTag` needs a member already born on `asOf` with the tag.
  A step without `requires.risk` is never hidden by the home's risks, so choosing Flood on a
  home that has not declared flood still shows the general flood steps.
- **Combined list.** `checklist(doc, packs, scenarioIds, asOf)` returns the union of the chosen
  scenarios' applicable steps. A step shared by several chosen scenarios appears once, its
  `scenarioIds` naming only the chosen scenarios that supplied it. Steps are grouped by phase
  (empty phases omitted) and ordered by pack, then `order`, then step id, whatever order the
  scenarios were chosen in. Unknown scenario ids contribute nothing. Each step carries its
  source, with the title and date checked when the pack lists it.

## Not built yet

Bundled scenarios and steps, and the screen. See
[#40](https://github.com/pskillen/shtf-planner/issues/40).
