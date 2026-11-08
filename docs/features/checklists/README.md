# Scenario checklists

**Status:** Format, selection engine and the UK power-cut scenario; no screen yet
**Tracking:** [#40](https://github.com/pskillen/shtf-planner/issues/40)

Step-by-step checklists for things that happen (a power cut, a flood warning), grouped by when a
step matters. The content-pack format, its validation, the selection engine and one bundled scenario (power
cut, UK) exist; there is no route yet.

## Map

| Piece   | Where                      | What                                                                                          |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Schemas | `src/model/packs.ts`       | `ChecklistsPack`, `ChecklistScenario`, `ChecklistStep`, `ChecklistPhase`, `CHECKLIST_PHASES`. |
| Loader  | `src/packs/loader.ts`      | Validation, and the `checklistScenarios` and `checklistSteps` indexes on `Packs`.             |
| Engine  | `src/engine/checklists.ts` | `checklistPacks`, `checklistScenarios`, `isStepApplicable`, `checklist`.                      |

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
  is exactly the household's, in load order. A pack with no `region` is offered to nobody, so a
  missing region never sends one region's advice (emergency numbers, agencies) to another. It ignores `settings.packs`: checklists are not
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

## Bundled content

`src/packs/data/checklists-uk.json` (`checklists-uk`, region `UK`) holds the **Power cut** scenario
(`risks: ["grid"]`). It is offered by region and is not in `DEFAULT_PACKS`: a US household gets no
checklist pack, and Settings lists the UK pack as "Included for your region" with no switch.

- Steps are short and imperative, in the `coming` and `immediate` phases; a phase with nothing to
  say is omitted.
- Every step's `source` is a URL listed in the pack's `sources` with the date it was checked: UK
  Government Be Ready (power cuts), the NHS carbon monoxide page and the UK CMOs' cold-weather
  advice. The CMO page is a set of broadcast scripts for a national power outage, so it sources
  only the unattended-heating step.
- Steps must hold across the UK. The reporting number (105, or 03457 643643 in Northern Ireland) and
  the Priority Services Register (England, Scotland, Wales; Customer Care Register in Northern
  Ireland) are labelled by nation in the text. Nothing is filtered by nation.
- Conditional steps use `requires`: the solar and battery step needs solar PV or a home battery,
  and the formula step a member tagged `infant`. Safety warnings (carbon monoxide, generators) are
  never gated on recorded assets or household facts, because a household can meet the hazard
  without having recorded anything; where the source's advice is conditional ("if you use a
  generator"), the condition stays in the step text.
- Step ids are stable and never reused for different advice; bump the pack `version` when content
  changes.

## Not built yet

Other scenarios, and the screen. See [#40](https://github.com/pskillen/shtf-planner/issues/40).
