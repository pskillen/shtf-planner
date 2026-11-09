# Content packs

**Status:** Accepted. See the [content packs hub](../features/content-packs/README.md).

**Curated, versioned JSON.** Guidance, items, equipment, plans and regions are JSON packs in the
bundle, validated with Zod, each with a `version` bumped when its content changes. Nothing is
scraped or fetched. Why: works offline, and every number can be checked. [D3]

**Every number has a source.** A guidance rule's or equipment contribution's figure carries an
https `source` listed in the pack's `sources` with the date checked, or `"assumption"`. Never
invent an official number. [D80]

**Regions.** Values are stored metric and shown per region; guidance packs carry a region; UK
first, with the nations as subregions (Scotland, England, Wales, Northern Ireland) choosing the
risk-checker links. The region lives in both `home.region` and `settings.region`, always set
together. [D30, D80, D89]

**Regional risk links follow the subregion.** Environment Agency flood links show only for
England; Wales and Northern Ireland links are still to add
([#57](https://github.com/pskillen/shtf-planner/issues/57)). [D97]

**The US band is the app's choice.** The US guidance pack uses a 14-day band; Ready.gov itself
asks for "several days" and one gallon per person per day. [D76]

**Items sit at shopping-list level.** Baked beans, chopped tomatoes, tinned soup, tinned veg…, with
a catch-all per group; label kcal does the fine counting. About 170 items. Why: the household
thinks in what it buys and rotates, and preparedness counts through the same items. [D176]

**Items carry an optional heading** inside their category (Food: Tins, Dried, Jars & spreads,
Drinks, Long-life…) in rough supermarket-aisle order; pickers and the shopping list group by it.
[D186]

**Each item says what it counts towards** in one line ("Wet wipes: 1 wipe = 1 hand clean
(hygiene)"). [D188]

**Drinks count as water.** Soft drinks and fruit juice count 1 L of water per litre plus the label's
kcal (diet drinks give 0 kcal). [D183, D192]

**No one-off fixes for awkward items.** A box of 100 gloves is not a reason to special-case
gloves; the fix is to explain what hygiene "uses" mean or to rework hygiene. The countsAs line is
the partial answer; the rework is
[#38](https://github.com/pskillen/shtf-planner/issues/38). [D164]

**CoFID kcal figures ship as cited.** Checking the 24 CoFID-cited figures against the CoFID
workbook is a follow-up ([#59](https://github.com/pskillen/shtf-planner/issues/59)); label kcal replaces them whenever a product has one. [D205]

**Equipment packs carry questionnaires.** An asset type has questions, capability contributions
that may depend on an answer, and a maintenance schedule. V2L is real: an EV can be a battery.
[D24]

**Checklist packs.** Scenario checklists are a pack tagged by scenario and phase (something's
coming, immediate actions, first days, first week, longer term) with stable ids so packs merge
without duplicates, drafted with AI at build time and owner-reviewed
([#40](https://github.com/pskillen/shtf-planner/issues/40)). The personal section of household-written
steps is deferred ([#132](https://github.com/pskillen/shtf-planner/issues/132)), so D31 is only
partly delivered. [D31]

Converter packs name exact fuel item IDs and manual confirmation questions; multiple fuels need an
unanswered selector. Safety guidance is sourced and bundled, and assumptions remain labelled.
