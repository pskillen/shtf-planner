# Planned features

**Status:** Planned. Decided in the design but not built in 0.1.0. Each points at its GitHub epic;
the rule here is what was agreed, the epic is where the work is shaped.

**Review queue.** The engine derives one list sorted by urgency: stock expiring, equipment maintenance due, age
rollovers coming (nappy size, formula to solids), places not recounted for a while, plans to
re-confirm. The planned screen will offer actions appropriate to each item; the cadence is 3 or 6 months (the
setting exists already); a review ends with a summary and the score change. Recounts would feed
suggested minimums. [#20](https://github.com/pskillen/shtf-planner/issues/20). [D7, D16, D26]

**Reminders without push.** An in-app review queue with a badge, plus an `.ics` calendar export of
due dates; no push notifications in v1.
[#20](https://github.com/pskillen/shtf-planner/issues/20). [D21]

**Equipment maintenance and fuel.** Maintenance schedules come from the assets pack and feed the review queue; linking equipment to
the exact fuel it needs is planned.
[#28](https://github.com/pskillen/shtf-planner/issues/28). [D24]

**Scenario checklists.** Tracked runs (each tick timestamped) with a printable export for the grab
bag; checklist packs by scenario and phase, additive across scenarios, plus a personal section.
[#40](https://github.com/pskillen/shtf-planner/issues/40). [D14, D31]

**Contacts and the ICE sheet.** A household contact list, picked from the phone's contacts (Contact
Picker API where available), imported from vCard or CSV, or typed; one printable sheet of contacts
and in-case-of-emergency details, a copy per grab bag and one at home.
[#45](https://github.com/pskillen/shtf-planner/issues/45). [D15, D27]

**Gamification for adults.** Badges and a review streak that reward upkeep, not buying; per-member
tasks so children's tasks can be added later; no leaderboard in v1.
[#61](https://github.com/pskillen/shtf-planner/issues/61). [D22, D32]

**"Review my plan".** An AI review through a small proxy with a redacted payload (see
[privacy](privacy.md)). [#65](https://github.com/pskillen/shtf-planner/issues/65). [D23]

**Sharing between Google accounts.** Designed for, but only promised once proven.
[#68](https://github.com/pskillen/shtf-planner/issues/68). [D20]

**Several households in one Drive.**
[#85](https://github.com/pskillen/shtf-planner/issues/85). [D193]

**Per-region risk lookup.** [#80](https://github.com/pskillen/shtf-planner/issues/80). [D10]
