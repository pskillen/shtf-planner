# Scenario checklists

**Status:** Format, selection engine and the five UK scenarios (power cut, storm, flood, heatwave, evacuation), the run commands and read view, and screens to browse and preview scenarios, start or resume a run, tick its steps, keep a note on any step, finish a run, combine scenarios and read finished runs; print and household-written steps are not built yet
**Tracking:** [#40](https://github.com/pskillen/shtf-planner/issues/40)

Step-by-step checklists for things that happen (a power cut, a flood warning), grouped by when a
step matters. The content-pack format, its validation, the selection engine and five bundled scenarios (power
cut, storm, flood, heatwave and evacuation, UK) exist, with browse, preview, start and tick screens in the app.

## Using it

More has a "Scenario checklists" card. It opens `/app/more/checklists`, which lists the scenarios
the household's region offers (those matching a recorded risk first, marked as such). A region with
no checklist content, such as the US, sees a plain note and no scenarios; UK advice is never shown
under another region. Tapping a scenario opens `/app/more/checklists/preview/:scenarioId`: the
steps that apply to this household, under the headings "When it is coming", "Immediately", "First
days", "First week" and "Longer term" (empty ones omitted). Each step names its source as a link
(title and date checked) that opens in a new tab, or says it is our assumption. An unknown or
other-region scenario id shows a plain "not available" note. Links are ordinary navigation;
nothing is fetched while you read. The date checked is written as a calendar date (for example
"4 March 2026").

**Starting.** The preview has a "Start this checklist" button. Tapping it (once, however many
times it is hit) freezes the household's steps into a new run and opens it. If you already have an
open run that includes the scenario, the preview instead leads with a "Resume" link per open run
(progress and start time) and a deliberate, secondary "Start a new incident" button. The hub shows
"Your lists" above the scenarios when any run is open, newest first, each with its scenarios,
progress and start time.

**Combining.** On the hub, "Combine scenarios" shows a tick box per scenario; with two or more
ticked, "Preview N together" opens `/app/more/checklists/preview/:a+:b`, the scenario ids (each
percent-encoded) joined by `+`. The preview shows the union of their steps, each once, with a "For:"
line naming the selected scenarios that supplied it. "Start these checklists together" starts one
run with all of them. If an open run already includes every scenario selected, the preview leads
with "Resume" links to it instead. An id that is not offered for the region makes the whole
preview "not available".

**Changing a run's scenarios.** An open run with more than one scenario in its catalogue has
"Change scenarios", a tick box per scenario the run was started with (never a scenario added to the
packs since). Changes save at once. The last selected scenario cannot be unticked. Unticking hides
the steps only that scenario supplied; their ticks and notes are kept and return, with the note
the person wrote, when it is ticked again; the picker says so. A run left with no scenario (two
devices merged badly) opens the picker straight away, and choosing one brings its steps back. Such
a run can also be finished. A finished run has no picker.

**An open run** (`/app/more/checklists/:runId`) shows the scenario names, when it started, "n of m
done" with a bar, and the steps under the phase headings. Each step is a labelled checkbox; ticking
records the time and shows "Done 14:05" (with the date when it was not today). Unticking clears it.
Ticks are saved at once, so reloading keeps them. A run with no valid scenario selected (two
devices merged badly) says so, offers the picker and shows no steps until one is chosen. An unknown run id says the list was not found. When
the household document is read-only, or the run is finished, the boxes are disabled. Ticks never
touch the plans or the preparedness score.

**Notes.** Every step of an open run has a note box ("Add a note"), independent of the tick: a
step can carry a note whether or not it is done, and unticking keeps the note. Typing is kept on
the screen and saved a moment after you stop, when you leave the box, and when you leave the
screen, so one keystroke is never one write of the household document. A change arriving from
another device never replaces text you are typing; it replaces the box only while you have
nothing unsaved. A note is stored as typed; a note of only spaces counts as empty and removes it.
The note is also saved when the app is hidden or the page is left. A write begun while the page
unloads is not reliably kept, so each keystroke also leaves the text in this browser's storage
(never the household document) and the next visit saves it, but only if the saved note is still
the one it was typed over: a note changed on another device meanwhile is never overwritten or
deleted by an old draft, which is dropped. "Forget this device's data" removes any drafts. If the
list was finished elsewhere meanwhile, the typed text stays on screen (on the next visit too)
with a short note that it was not saved.

**Finishing.** "Finish this list" at the foot of an open run asks first ("Yes, finish" or "Keep
going"). Finishing saves every note still being typed and stamps the finish time in one
write. A finished run is a record: its boxes are disabled, the finish time shows beside the
start, and nothing reopens it. Its text is the steps as they were when the run started, so later
changes to the household or the packs do not alter it. The hub lists finished runs last, under
"Finished lists", newest first, each with its start and finish time; tapping one opens it
read-only, notes and tick times included.

**Not built.** Printing a run, reopening a finished run and household-written steps are not
built, so the scenario checklists are not yet the whole of the plan in [D31].

## Map

| Piece   | Where                                                                                                                                                                            | What                                                                                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schemas | `src/model/packs.ts`                                                                                                                                                             | `ChecklistsPack`, `ChecklistScenario`, `ChecklistStep`, `ChecklistPhase`, `CHECKLIST_PHASES`.                                                                                                                |
| Loader  | `src/packs/loader.ts`                                                                                                                                                            | Validation, and the `checklistScenarios` and `checklistSteps` indexes on `Packs`.                                                                                                                            |
| Engine  | `src/engine/checklists.ts`                                                                                                                                                       | `checklistPacks`, `checklistScenarios`, `isStepApplicable`, `checklist`.                                                                                                                                     |
| Screens | `src/app/screens/ChecklistsScreen.tsx`, `ChecklistPreviewScreen.tsx`, `ChecklistRunScreen.tsx`, `checklists/view.ts`, `checklists/StepNote.tsx`, `checklists/ScenarioPicker.tsx` | The hub (with combine), the preview with start and resume, the open or finished run, the debounced note box, the scenario picker, and headings, labels, date formats and the preview route form (`view.ts`). |
| Runs    | `src/engine/checklistRuns.ts`                                                                                                                                                    | `checklistStateKey`, `buildCatalogueSnapshot`, `startRun`, run commands, `checklistRunView`, `checklistRunLists`.                                                                                            |

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

## Starting a run (snapshot)

`src/engine/checklistRuns.ts`, pure.

- **Frozen advice.** `startRun(draft, packs, { runId, started, asOf, scenarioIds })` writes, in the
  caller's single `change`, the run and one empty step state (`checklistStepStates`, keyed
  `${runId}|${stepId}`) for every snapshotted step. Nothing recomputes the snapshot afterwards:
  changing members, assets, risks, region or pack content leaves a started run as it was.
- **What is snapshotted.** `buildCatalogueSnapshot(doc, packs, asOf)` covers every scenario the
  region offers, not only the selected ones, and every household-applicable step of them, in
  canonical order (phase, pack, `order`, step id). Each step keeps its text, phase, order,
  scenarios, source, source title, date checked and pack. The snapshot's `packs` list records the
  version of each checklist pack used.
- **Hidden scenarios.** Steps of unselected scenarios are snapshotted and have a state, so a later
  choice to show another scenario needs no recomputation.
- **Refusals.** `startRun` returns `undefined` and writes nothing when the run id already exists
  or no selected scenario is in the catalogue. Unknown and repeated ids are dropped.
- **Merged scenarios.** A run's `scenarios` is a merged array, so a merged document may hold
  duplicates or none. The schema accepts both; readers de-duplicate.

## Run commands and the read view

Same module, pure, called inside the caller's single `change`. Each command returns `true` only
when it wrote something; it returns `false` and changes nothing for an unknown run, a finished
run, a step with no state, or a value that is already there.

- `setStepDone(draft, runId, stepId, at)` ticks. A step already ticked keeps its first time.
- `clearStepDone(draft, runId, stepId)` unticks and keeps the note.
- `setStepNote(draft, runId, stepId, note)` stores the note exactly as given (nothing trimmed);
  an empty note deletes the field. A note needs no tick.
- `setRunScenarios(draft, runId, scenarioIds)` replaces the selection: catalogue ids only, each
  once, at least one. Steps of a scenario that is no longer selected are hidden, not deleted: their
  states stay, and selecting the scenario again brings them back.
- `finishRun(draft, runId, at)` finishes an open run; a finished time already there stands.

`checklistRunView(doc, runId)` is what screens and print read. It lists every catalogue scenario
(flagged when selected) and the **visible** steps grouped by phase (empty phases omitted): a step
is visible when a selected scenario supplies it, counted once however many do, and
`selectedScenarioIds` names only the selected suppliers. `done` and `total` count visible steps;
`hiddenWithState` counts hidden steps that still carry a tick or a note. It de-duplicates the
run's scenarios and ignores ids outside the catalogue; when none is left it returns
`needsScenario: true` with no groups. It reads the frozen catalogue and the states only, so late
edits merged into a finished run show as they are, and it never touches plans or the score.
`checklistRunLists(doc)` gives `open` and `finished` summaries, newest started first.

## Bundled content

`src/packs/data/checklists-uk.json` (`checklists-uk`, region `UK`) holds the **Power cut**
(`risks: ["grid"]`), **Storm** (`risks: ["storm"]`), **Flood** (`risks: ["flood", "coastal"]`), **Heatwave** (`risks: ["heat"]`) and **Evacuation** (no `risks`: any hazard can lead to leaving home) scenarios. It is offered by region and is not in `DEFAULT_PACKS`: a US household gets no
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
- Evacuation uses `coming`, `immediate` and `first-days`; `first-week` and `longer-term` are
  deliberately empty because no fetched page gives advice for them (no rest-centre or temporary
  accommodation page was found that holds across the UK). It cites UK Government Be Ready (be
  ready for emergencies, and its household emergency plan PDF) and two Ready Scotland pages
  (emergency plan, emergency kit), the Be Ready fires-in-the-home page and two gas-network pages; the kit list is Scotland's, and no other page fetched contradicts it.
  Leaving may be ordered or a household's own decision, so the steps do not
  depend on an order: "if the emergency is inside your home, get out" and "if you have to leave
  home" stand beside the shared "if the council or emergency services ask you to evacuate, go".
  Nothing is gated: the medication, equipment, baby, pet and assistance-animal steps say "if" in
  the text, so a household that has recorded nothing still sees them. Four flood steps are shared
  with it because the instruction is identical and their sources say it generally: the emergency
  plan, knowing how to turn off gas, electricity and water, leaving when asked, and returning
  only when the emergency services say it is safe. Gas must not be turned back on by the
  household; the plan PDF says water and electricity can be, which conflicts with the flood
  steps, so no evacuation step says it.
  The "turn off before you leave" step is scoped to leaving for a reason other than a fire or a
  smell of gas, because switching electricity off in a gas leak risks a spark and a fire evacuee
  should get out at once. A gas leak has its own step (no switches or flames, ventilate, turn off
  at the meter, leave, call). Its number, 0800 111 999, is shown by Cadent and National Gas, and
  neither page says which parts of the UK it covers, so the text says so. A separate step gives
  the Northern Ireland number from Gas Networks Ireland (not checked against firmus energy or
  other Northern Ireland networks). The fire-in-the-home page is the source for "do not stop to
  collect belongings".
- One step is shared between storm and flood: `storm-floodwater` ("Never drive through floodwater. Turn around and find
  another route."), listed once when both are chosen. Elsewhere the
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

Choosing more scenarios mid-run, printing, reopening a finished run and household-written steps.
See [#40](https://github.com/pskillen/shtf-planner/issues/40).
