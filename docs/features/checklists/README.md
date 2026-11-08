# Scenario checklists

**Status:** Format, selection engine and the UK power-cut, storm, flood and heatwave scenarios; no screen yet
**Tracking:** [#40](https://github.com/pskillen/shtf-planner/issues/40)

Step-by-step checklists for things that happen (a power cut, a flood warning), grouped by when a
step matters. The content-pack format, its validation, the selection engine and four bundled scenarios (power
cut, storm, flood and heatwave, UK) exist; there is no route yet.

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

`src/packs/data/checklists-uk.json` (`checklists-uk`, region `UK`) holds the **Power cut**
(`risks: ["grid"]`), **Storm** (`risks: ["storm"]`), **Flood** (`risks: ["flood", "coastal"]`) and **Heatwave** (`risks: ["heat"]`) scenarios. It is offered by region and is not in `DEFAULT_PACKS`: a US household gets no
checklist pack, and Settings lists the UK pack as "Included for your region" with no switch.

- Steps are short and imperative. Power cut uses `coming` and `immediate`; storm adds
  `first-days` for after the storm. A phase with nothing to say is omitted.
- Every step's `source` is a URL listed in the pack's `sources` with the date it was checked: UK
  Government Be Ready (power cuts), the NHS carbon monoxide page and the UK CMOs' cold-weather
  advice. The CMO page is a set of broadcast scripts for a national power outage, so it sources
  only the unattended-heating step. Storm steps cite UK Government Be Ready (storms) and three Met
  Office pages (stay safe in a storm, stay safe in strong wind, driving in storms, rain and strong
  wind); none of those pages gives nation-specific procedure.
- Flood uses `coming`, `immediate`, `first-days` and `longer-term`. Its steps cite UK Government
  Be Ready (flooding), GOV.UK (get flood warnings), Ready Scotland, two Natural Resources Wales
  pages, two nidirect pages, mygov.scot and a UKHSA page. Each step cites a page that says it. A
  generic step is sourced to one nation's page where the other pages fetched agree; a step that
  names a nation cites that nation's page. Gas and water restart rests on the Natural Resources
  Wales and UKHSA (England) pages, and the sea-defence warning on Natural Resources Wales.
- Heatwave uses `coming` and `immediate`. Its steps cite Ready Scotland (hot weather), NHS inform
  (hot weather; heatstroke and heat illness), Public Health Wales (keeping cool), UK Government
  Be Ready (hot weather and heatwaves) and two RSPCA pages. Each step cites a page that says it, and every number (35°C for fans,
  25°C for medicine storage, 11am to 3pm, 30 minutes, 6 months, five seconds on the ground) is in
  its source. The UKHSA guidance and heat-health alerts cover England only, so no step depends on an
  alert: the forecast step says to check the forecast and Met Office warnings, and the steps apply
  whenever it is hot. Heatstroke and heat exhaustion steps are ungated, as are the steps for
  babies, older people and checking on others, because a visitor or neighbour can need them. Only
  the three pet steps need a pet (`requires.pets`). No heatwave step is shared with another
  scenario.
  The clinical signs and actions in the heatstroke and heat exhaustion steps were cross-checked
  against the NHS England page (nhs.uk). The heatstroke step says skin can feel hot or cold because
  the pages disagree (NHS inform says cold, nhs.uk says hot), and "if they are awake and can
  swallow" before giving water is an editorial hedge. The steps send people to 999 only, never
  111, because Northern Ireland has no 111 service. No Northern Ireland page is cited: the nidirect
  hot weather page was read and agrees on never leaving children or animals in cars, water for
  pets, contacting a vet, and 999 for suspected heatstroke. It differs in resting for a few hours
  with no 30-minute rule, "hot, red and dry skin" as a heatstroke sign, and advice not to give
  aspirin or paracetamol, which no second source confirms, so those are not used.
- One step is shared: `storm-floodwater` ("Never drive through floodwater. Turn around and find
  another route.") serves storm and flood, and is listed once when both are chosen. Elsewhere the
  storm wording differs from the power-cut and flood wording even where the topic overlaps
  (power lines, checking on neighbours), so each scenario has its own step. A step is shared only
  when the instruction is identical.
- Flood is where nations differ most. The core actions (turn supplies off if safe, move up, never
  walk or drive through flood water, leave when told, call 999) agree across the four nations. The
  agencies, numbers and routes differ, so they are written with the nation in the text: the
  risk-check services for all four, flood warning sign-up and Floodline (England, Scotland, Wales),
  and one reporting step per nation (England, Wales, Scotland, Northern Ireland), plus the Northern
  Ireland council emergency payment. Hardship grants and council accommodation are cited from
  England and Wales pages. No service is implied for a nation whose page was not found
  to offer it (no Northern Ireland warning sign-up is listed). Nothing is filtered by nation, and
  flood steps never use `requires.risk`, so choosing Flood on a home that has not declared flood
  still shows every general step.
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

Further scenarios, and the screen. See [#40](https://github.com/pskillen/shtf-planner/issues/40).
