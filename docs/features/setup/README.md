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

| Piece                | Where                                   | Behaviour                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding           | `/app/setup/:step`, `Onboarding.tsx`    | Four steps, People, Home, Risks, How long to plan for. Each is the same component as its editing screen. Next and Back with a progress line; Next on People waits for one person, and on Home waits for the four questions in "Onboarding asks". Finish lands on the Score tab (the Home tab is the hub). No bottom nav. |
| Home hub             | `/app`, `HomeHub.tsx`                   | A card per part (people, home, locations, equipment, risks, horizon), each opening its screen. A household with nobody in it is sent to the first onboarding step.                                                                                                                                                       |
| People               | `/app/people`, `PeopleScreen.tsx`       | Members and pets. A sheet per person: name, date of birth (age shown as "2 y 5 m" or "3 months"), risk chips, dietary note, medication with days of supply. Pets: name, species, size.                                                                                                                                   |
| Home                 | `/app/home`, `HomeScreen.tsx`           | Every home field in plain language. Region and, for the UK, the part of the UK.                                                                                                                                                                                                                                          |
| Locations            | `/app/locations`, `LocationsScreen.tsx` | Places with a kind (rotating or stored), conditions, size and optional litres. Pantry, Garage, Loft, Shed and Grab bags are suggestions: tapping one opens the form filled in, and nothing exists until Save.                                                                                                            |
| Equipment            | `/app/assets`, `AssetsScreen.tsx`       | Grouped by category. Add: search the asset types of the enabled packs, answer the type's questions, say where it is and when it was bought. The form says in words what it gives with the answers applied.                                                                                                               |
| Risks                | `/app/risks`, `RisksScreen.tsx`         | The local-risk chips, and for each chosen risk the region's "check" links (open in a new tab).                                                                                                                                                                                                                           |
| How long to plan for | `/app/horizon`, `HorizonScreen.tsx`     | Pick 3, 7, 14 or 28 days (a sentence says what each means). Below it the table of what that is for this household at every horizon.                                                                                                                                                                                      |
| More, Settings       | `/app/more`, `/app/more/settings`       | Region, content packs (name, version, on or off), review reminder (3 or 6 months), anonymise names. The data section (`settings/DataSection.tsx`) is a placeholder: export, import and Google Drive are separate work.                                                                                                   |
| Read-only notice     | `StoreBanner.tsx`, `Shell.tsx`          | A document saved by a newer version shows a banner and the controls that write are disabled; an unreadable one points to More, Settings, data. See "Read-only".                                                                                                                                                          |
| Shared controls      | `src/app/components/`                   | `Sheet` (bottom sheet), `controls.tsx` (chips, segmented buttons, switch, number box, field), `ScreenHeader`, `useDeferredDelete` (delete with undo), `EditArea` (read-only), `useSavedChange` ("Saved").                                                                                                                |
| Pure helpers         | `src/util/`, `src/app/screens/**`       | `age.ts`, `medication.ts`, `units.ts`; `assets/questionnaire.ts` (answers and the in-words description); `region.ts` (risk links, region, all-electric); `memberTags.ts` (medication and dietary tags); `locations.ts` (delete cascade); `settings/packs.ts` (pack switches); `horizon/previewSource.ts`.                |

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

## Known gaps

- No maintenance dates on equipment.
- Wales and Northern Ireland have no flood links of their own.
- The Settings data section is a placeholder.

## Tests

`test/setup-helpers.test.ts` (age, supply, units, questionnaire, links, preview helpers),
`test/member-tags.test.ts`, `test/locations.test.ts`, `test/settings-packs.test.ts`,
`test/deferred-delete.test.tsx`, `test/sheet.test.tsx`, `test/tabs.test.ts`,
`test/autosave.test.tsx`, `test/home-questions.test.tsx`, `test/accessible-names.test.tsx`,
`test/read-only.test.tsx`, `test/store-banner.test.tsx` (read-only), `test/screen-boundary.test.tsx`
(unknown values), and Playwright: `e2e/setup.spec.ts` (onboarding by hand with two people, three
places, a solar array and 14 days, then a reload; the fixture household with a medication edit and
delete with undo), `e2e/document.spec.ts` (an edit then a reload, ten times) and `e2e/phone.spec.ts`
(375 px: horizon table, Back and discard, long names, the unreadable banner).
