# Setup screens

**Status:** Done
**Tracking:** none (no tickets yet)

Where a household describes itself: people, home, locations, equipment, risks, how long to plan
for, and the settings. Home, Risks, Settings and How long to plan for save as you type or tap, with
a quiet "Saved" note; people, places and equipment are edited in a sheet and saved with its Save
button. Either way it goes straight into the household document
(`docs/features/data-model/README.md`); there is no Save-everything step and nothing to lose by
leaving half-way.

## Map

| Piece                | Where                                   | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding           | `/app/setup/:step`, `Onboarding.tsx`    | Four steps, People, Home, Risks, How long to plan for. Each is the same component as its editing screen. Next and Back with a progress line; Next on People waits for one person, and on Home waits for the four questions in "Onboarding asks". Finish lands on the Score tab (the Home tab is the hub). No bottom nav.                                                                                                         |
| Home hub             | `/app`, `HomeHub.tsx`                   | A card per part (people, home, locations, equipment, risks, horizon), each opening its screen. A household with nobody in it is sent to the first onboarding step.                                                                                                                                                                                                                                                               |
| People               | `/app/people`, `PeopleScreen.tsx`       | Members and pets. A sheet per person: name, date of birth (age shown as "2 y 5 m" or "3 months"), risk chips, dietary note, medication with days of supply. Pets: name, species, size.                                                                                                                                                                                                                                           |
| Home                 | `/app/home`, `HomeScreen.tsx`           | Every home field in plain language. Region and, for the UK, the part of the UK.                                                                                                                                                                                                                                                                                                                                                  |
| Locations            | `/app/locations`, `LocationsScreen.tsx` | Places with a kind (rotating or stored), conditions, size and optional litres. Pantry, Garage, Loft, Shed and Grab bags are suggestions: tapping one opens the form filled in, and nothing exists until Save.                                                                                                                                                                                                                    |
| Equipment            | `/app/assets`, `AssetsScreen.tsx`       | Grouped by category. Add: search the asset types of the enabled packs (category chips narrow the list: All, Heat, Power, Water and so on, only those with a type), answer the type's questions, say where it is and when it was bought. The form says in words what it gives with the answers applied. Maintenance jobs show their last and next dates; recording a job saves immediately, and due jobs are flagged in the list. |
| Risks                | `/app/risks`, `RisksScreen.tsx`         | The local-risk chips, and for each chosen risk the region's "check" links (open in a new tab).                                                                                                                                                                                                                                                                                                                                   |
| How long to plan for | `/app/horizon`, `HorizonScreen.tsx`     | Pick 3, 7, 14 or 28 days (a sentence says what each means). Below it the table of what that is for this household at every horizon.                                                                                                                                                                                                                                                                                              |
| More, Settings       | `/app/more`, `/app/more/settings`       | Region, content packs (name, version, on or off), review reminder (3 or 6 months), expiry colours (how soon counts as "Expires soon" and how far ahead is "Before next check"), anonymise names, the date reader (downloaded or not, Download now). The data section (`settings/DataSection.tsx`) links to the Data screen (see [Drive sync](../drive-sync/README.md)).                                                          |
| Read-only notice     | `StoreBanner.tsx`, `Shell.tsx`          | A document saved by a newer version shows a banner and the controls that write are disabled; an unreadable one points to More, Settings, data. See "Read-only".                                                                                                                                                                                                                                                                  |
| Shared controls      | `src/app/components/`                   | `Sheet` (bottom sheet), `controls.tsx` (chips, segmented buttons, switch, number box, field), `ScreenHeader`, `useDeferredDelete` (delete with undo), `EditArea` (read-only), `useSavedChange` ("Saved").                                                                                                                                                                                                                        |
| Pure helpers         | `src/util/`, `src/app/screens/**`       | `age.ts`, `medication.ts`, `units.ts`; `assets/questionnaire.ts` (answers and the in-words description); `region.ts` (risk links, region, all-electric); `memberTags.ts` (medication and dietary tags); `locations.ts` (delete cascade); `settings/packs.ts` (pack switches); `horizon/previewSource.ts`.                                                                                                                        |

## Behaviour worth knowing

- **Screens never compute targets.** How much water or food a household needs is the engine's job
  (`src/engine`). The setup screens collect facts and show what the engine says. The horizon table
  reads `previewFor` in `screens/horizon/previewSource.ts`, which calls the engine's `preview`.
- **Age tags follow the date of birth, until you edit the tags.** Under 24 months suggests
  `infant`, 24 months to under 18 years `child`, 65 and over `elderly`. Editing the chips by hand
  stops the date from changing them; for someone already saved the date never rewrites their tags.
  `takes-medication` follows the medicines that have a name (on with the first, off when the last
  goes) unless the chip was set by hand; a medicine row needs a name before the person can be
  saved. A dietary note adds `dietary` on Save.
- **Days of supply** is units on hand divided by units per day, rounded down. With no dose set it
  says so instead of dividing by zero.
- **Rotating means "the level you never go below".** A rotating location (a pantry you eat from and
  restock) counts the lowest stock it holds, not what is in it today; a stored one counts what is
  there. The location form says this in one line.
- **All-electric homes get a plain warning** when heating and cooking are electric (or a heat pump,
  or induction) and there is no mains gas: "In a power cut this home has no heat or cooking; the
  score will show that."
- **One home per thing.** Equipment is kept here and nowhere else; Stores holds stock (food, water,
  fuels, cells, power banks). `/app/assets?add=<asset type id>` opens the add form with the type
  chosen (Quick add's "Equipment: add to your home" and the shopping list's tick use it) and
  `?edit=<asset id>` the edit form (a place's equipment rows in Stores use it); an unknown id is
  ignored.
- **Equipment questions.** A yes/no is a switch, a number is a box with its unit, a choice is a row
  of buttons. A new asset starts with every yes/no off and every choice on its first option;
  numbers start empty, because an invented capacity would be counted as real. The description
  folds contributions to one capability into one line ("Gives power in an outage: no, answer yes to
  ..."). A solar array without an emergency power supply gives nothing in a power cut.
- **Risk links.** The region's links are shown for the chosen risks. A UK part with links of its own
  replaces the region's for the same risk (Scotland: SEPA flood maps instead of the Environment
  Agency's). The Environment Agency flood and coastal links belong to England only; Wales, Northern
  Ireland and "Not set" show no flood or coastal link until they have their own, and none is
  invented.
- **Region lives in two places** (`home.region`, `settings.region`). The Home and Settings screens
  both set the two together; leaving the UK drops the part-of-the-UK choice.
- **Delete with undo.** Deleting a person, pet, place or piece of equipment hides it at once and
  shows "... deleted. Undo" for five seconds; the real change is written when the time runs out or
  when you leave the screen. A place that still holds stock cannot be deleted; deleting one clears
  it from any equipment kept there.
- **Read-only.** When the store reports `too-new` or `invalid`, only the controls that write are
  disabled: the Add buttons, the form screens, and the body and actions of a sheet (`EditArea`, a
  disabled `<fieldset>`). Rows still open their sheet to be read, links and Back work, and nothing
  is dimmed, so it stays readable in dark mode.
- **Sheets ask before dropping edits.** With unsaved edits, a tap on the backdrop, Escape or
  Android Back shows "Discard your changes?" with Keep editing and Discard; the close button
  closes at once. An open sheet holds one history entry, so Back closes the sheet before it leaves
  the screen.
- **Onboarding asks.** The type of home, heating and cooking start on a "Choose" placeholder and
  mains gas is a Yes/No with neither picked; Next waits for all four. Which were answered is kept
  while moving between steps (and Back) but not saved, so a reload in the middle of setup asks again.
- **Postcode area** saves a moment after typing stops, on blur and when the screen is left.
- **Unknown values.** A value in the document the app does not know (a hand-edited file, another
  version) shows as "Unknown" through `labelOf`, and a screen that still fails to draw is caught by
  `ScreenBoundary`, which keeps the banner above it and offers a Go to settings link.
- **Phone horizon table.** Under 40 rem only the Need column and one horizon show: the picked one,
  or the one chosen with the "Show amounts for" control above the table. Wide screens show all four.
- **Tabs.** Home is the current tab on the hub and every screen reached from it; More owns Settings.
- **Writes survive closing the app.** `DocumentProvider` flushes the store when the page is hidden
  or goes away. A write is queued in IndexedDB when the change is made, so this only matters in
  the few milliseconds before it commits; a reload issued in the same millisecond as a tap can
  still beat it (a person cannot).
- **Phones.** Tap targets are 44 px or more; inputs are 16 px or more so Chrome on Android does not
  zoom the page on focus; colours come from the theme variables, so dark mode follows the system.
- **Units.** `formatVolume` shows litres in the UK and US gallons in the US; `formatTemp` shows
  Celsius or Fahrenheit. Amounts shown to a person go through them.

- **The horizon is a choice, not a ladder.** A household can go straight to 28 days without passing
  through 3, 7 and 14; 3 days (72 hours) is the default for a new household. Each horizon has one
  sentence saying what it means (`HORIZON_SENTENCE` in `src/app/labels.ts`) and the table shows what
  it asks of this household, so people can set their expectations up or down.
- **Where the home is, roughly.** Region, part of the UK and a postcode area, plus a typed home
  profile (type, heating, cooking, insulation…). No address, no map, no building pick: less
  location means less to protect.
- **Risks are self-declared** from a checklist, with links to the official checkers. Nothing is
  looked up, because a lookup would send the location out of the browser.
- **Review reminder.** Choose every 3 or 6 months and see the next date immediately. Home shows
  when a review is due; Add to calendar opens a selection preview for a local snapshot. See [review](../review/README.md).
- **Equipment runtime.** Each piece of equipment that burns fuel says, in a line under its name on
  the Equipment list, in its form, and on its row in Stores, what its fuel gives it: "Cooking: 3 days at your plan's
  use · 7.5 of 43 hours available · on 1 × Propane 13 kg". The numbers are the engine's
  `equipmentRuntime` as is; the screens only pick, name and round them down. Three different things
  are never mixed up: _available_ hours are what the fuel left after higher-priority claims could
  run it, _allocated_ hours are the part counted against the horizon, and _days_ are the allocated
  hours at the plan's daily use (left out when no daily target applies, which gives hours only).
  When two pieces share one bottle the line says so and which claims first (cooking, then heat, then
  power). A second converter on the same fuel says it could use that fuel instead and is not
  counted on top. With no fuel in stock the line says so and a **Quick add** button opens Quick add
  on that fuel. Unconfirmed or blocked equipment says "not counted until its checks are done" (the
  Blocked badge and Why? give the check). The form previews the line for the answers as they stand
  and says "With these answers:" until they are saved. Heat is assumed burner hours at the plan's
  use, never a claim of warmth.
- **Stored, not yet read.** Anonymise names is saved for a future feature that sends household text
  out (there is none).

## Known gaps

- Wales and Northern Ireland have no flood links of their own.

## Not built yet

- Natural Resources Wales and DfI flood links, diesel, vehicles as assets:
  [#49](https://github.com/pskillen/shtf-planner/issues/49).
- Scenario checklists (power cut, flood, storm, heatwave, evacuate), tracked and printable:
  [#40](https://github.com/pskillen/shtf-planner/issues/40).
- Household contacts and a printable in-case-of-emergency sheet:
  [#45](https://github.com/pskillen/shtf-planner/issues/45).

## Tests

`test/setup-helpers.test.ts` (age, supply, units, questionnaire, links, preview helpers),
`test/member-tags.test.ts`, `test/locations.test.ts`, `test/settings-packs.test.ts`,
`test/deferred-delete.test.tsx`, `test/sheet.test.tsx`, `test/tabs.test.ts`,
`test/autosave.test.tsx`, `test/home-questions.test.tsx`, `test/accessible-names.test.tsx`,
`test/read-only.test.tsx`, `test/equipment-runtime-view.test.ts` and `test/equipment-runtime.test.tsx`
(the runtime lines), `test/store-banner.test.tsx` (read-only), `test/screen-boundary.test.tsx`
(unknown values), and Playwright: `e2e/setup.spec.ts` (onboarding by hand with two people, three
places, a solar array and 14 days, then a reload; the fixture household with a medication edit and
delete with undo), `e2e/document.spec.ts` (an edit then a reload, ten times) and `e2e/phone.spec.ts`
(375 px: horizon table, Back and discard, long names, the unreadable banner).

Equipment fuel selection starts unanswered. Check the chosen fuel and connection against the manual;
indoor heating also needs the manual and any high-rise check. Changing the fuel clears confirmation.
The manual fuel rate may override a pack assumption.
