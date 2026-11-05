# Engine and scoring

**Status:** Accepted. Built in `src/engine/`; details in the
[engine hub](../features/engine/README.md) and [gaps and score](../features/gaps-and-score/README.md).

**One loop.** Household, home, risks and horizon give **targets** per capability, for a date;
stock and equipment roll up into **coverage**; targets minus coverage are **gaps** (a shopping list
and tasks); coverage over targets is the **score**. Screens never compute any of it. Planned:
expiry, maintenance and age rollovers feeding a review queue
([#20](https://github.com/pskillen/shtf-planner/issues/20)). [D7]

**A capability's score is the product of its targets' cover ratios**, each capped at 1, not the
weakest one: a baby at 0.5 and adults at 0.9 score 45 %; 0.8 and 0.9 score 72 %; a forgotten dog
or baby (0) zeroes the capability. Why: it is fair to penalise forgetting part of the household
entirely, and one well-stocked person must not hide another. Applies to every capability except
plans. [D104]

**Plans score (done ÷ total)^1.5.** Half done is penalised, each extra item is worth more, 8 of 9
is 84 % and only all done is 100 %. The exponent is one named constant. [D105]

**Headline and weakest.** The headline is a percentage (the mean over capabilities that have
targets) with the weakest capability named beside it, each capability 0–100. A tie for weakest goes
to the lower mean cover across its targets, then to capability order. Plan items score under
`plans` but keep their own capability for display, so an undone plan item never zeroes, say,
power. Planned, not built: badges and a review streak
([#61](https://github.com/pskillen/shtf-planner/issues/61)); no leaderboard. [D32, D91]

**Over-stock is neutral.** Cover is capped at 1; a covered capability shows "enough". The overall
score at the next horizon is shown so moving up is concrete. [D8]

**Horizon preview.** A side-by-side table for this household at 3, 7, 14 and 28 days with the
biggest asks highlighted, from the same engine call as the score. [D28]

**Fuel is shared in a fixed order.** Cooking takes what its target needs from a fuel first, then
heat, then power. Assets that burn the same fuel in one capability are alternatives (the most
efficient counts), not a sum. [D90]

**Which guidance applies.** A guidance pack applies when its lowest horizon band is at or below the
chosen horizon; if every banded pack is above it, the lowest-banded pack applies anyway. Comms is a
target of one radio that needs no mains power; first aid is one household kit. [D92]

**Pack arithmetic.** Age bands are half-open `[from, to)` in months; every matching multiplier
multiplies (poor insulation ×1.5 and a snow risk ×1.5 make ×2.25); `minHorizonDays` gates a rule on
the chosen horizon; phone power is owned by the grid-free rule in every region; Wh-per-unit is
always stated (1000 for a kWh answer), never defaulted. [D79]

**One-off kit.** A rule may ask for a fixed household amount independent of the horizon
(`perHousehold`), for a first aid kit, a radio, torches. [D81]

**Restock before buying.** Gaps list restocks under the household's minimums first, and a buy row
only for what restocking does not cover, so the two add up to the real need. [D113]

**Suggestions prefer fewer packs at a near price.** Unit prices within 20 % of the best count as a
tie, won by the lower total and then the smaller overshoot; one item per suggestion line. New
staples' figures stay marked `assumption` until checked. [D128]

**Calories.** A product's label kcal (from Open Food Facts) replaces its item's typical figure when
present; the product shows which one counts. [D169]

**Use first is per item.** Rotation hints pick the oldest in-date batch across all products of an
item; undated stock is never first. [D185, D190]

**Equipment and fuel are counted, maintenance is not yet scored.** Equipment comes from the assets
pack with a questionnaire (does the solar have an EPS? does the EV have vehicle-to-load?); an answer
can block a contribution, and a blocked one becomes a named fix task ("Fit an EPS"). Maintenance
schedules exist in the pack and the document, but nothing reminds or scores them yet. Planned:
[#20](https://github.com/pskillen/shtf-planner/issues/20) and
[#28](https://github.com/pskillen/shtf-planner/issues/28). [D24]
