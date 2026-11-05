# Product principles

**Status:** Accepted. These shape every feature; most are visible in the 0.1.0 build.

**Capabilities, not shopping.** Targets are things the household can do without the grid for the
whole horizon (keep a room warm, cook, light, charge a phone, drink safe water, hear the news),
met by equipment and stock together, and the score is by capability. The question is "can we keep
one room warm for two weeks", not "do we own a heater". [D18]

**The horizon is a choice, not a ladder.** People pick how long to cope without help (3, 7, 14 or
28 days) by means and risk appetite, and can go straight to four weeks; 3 days is the default. The
app shows what each horizon means for this household so they can set expectations up or down.
[D2]

**It's your household.** Targets come from the people (members with a date of birth and risk tags,
pets as members, medication per person with days of supply), the home and the horizon, and are
computed **for a date**, so "preview in six months" is the same call with a later date and a
baby's next nappy size shows up before it is needed. [D19]

**Honest score.** Over-stock is neutral: a capability that is covered says "enough" and stops
asking. Plans and skills count beside stuff. See [scoring](scoring.md). [D8]

**Guidance is curated, never scraped.** Official guidance is read by people and written into
versioned content packs with sources and dates; nothing is imported at runtime. See
[content packs](content-packs.md). [D3]

**Rough location only.** The home is a rough area (a postcode district or a coarse label) plus a
typed profile (type, floors, insulation, heating, cooking, solar, battery, EV charger). No map, no
building pick, never a full address. [D9]

**Risks are self-declared.** The household ticks its local risks from a list, with deep links to
the official checkers for its region. Planned: a lookup from public flood data ([#81](https://github.com/pskillen/shtf-planner/issues/81)).
[D10]

**No budgeting.** Items carry an optional typical price for rough totals and to rank suggestions;
there are no budgets or spending records. Planned, not built: sorting gaps by cost per unit of
coverage. [D29]

**AI only where it earns its place.** No AI runs in the app at runtime. Content may be drafted with
AI at build time and is reviewed by people. A "review my plan" feature is wanted but was never MVP;
vision entry and a planning wizard are out (too costly at runtime). Planned:
[#65](https://github.com/pskillen/shtf-planner/issues/65). [D23]

**Audience and access.** Family and friends, at an open URL with no access control or invite
codes, built so going public is configuration, not a rewrite. A landing page shows the beta status
and the changelog. [D6 → D37]

**Look.** Utilitarian: big tap targets, high contrast, dark mode, no illustration, with a nod to the
sister game only on the Score page (a handwritten font, self-hosted). [D36]

**Android first.** Phone-first layouts that widen for a laptop; PWA install on Android; end-to-end
tests on Chromium. iOS is not tested and gets no workarounds for now. [D35, D134]

**No bridge to the game.** The SHTF game is a sister project: design and research overlap, packs
may be copied, but there is no compatibility obligation and the projects diverge. [D13]
