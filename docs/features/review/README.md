# Review

**Status:** In progress · **Tracking:** [#20](https://github.com/pskillen/shtf-planner/issues/20)

Equipment maintenance helps a household keep its equipment ready. Each type's pack supplies its
jobs and intervals. Home → Equipment shows a due badge and lets the household record the last
completion date. The dates are stored on the equipment and do not affect the preparedness score.

The review reminder helps a household keep its plan current. Settings offers a cadence of three or
six months (six by default). The engine calculates the next date from the calendar date of the
latest finished review (ordered by timestamp), or the household's creation date when there is none. Calendar months clamp
to the last day of a shorter month. Unfinished reviews do not move the date.

Home displays a Review card with the number to check and the next date, or “Review due” on and after that date, with a badge on the Home tab. The card opens `/app/review`.
Settings shows the next date and updates it immediately when the cadence changes. These reminders
are in the app; there are no push notifications.

The screen shows a single engine-ordered list with an urgency word and colour on every row. Rows open
the stock batch, equipment, person, filtered place in Stores or selected plan in Gaps. A read-only
document keeps navigation available while the existing edit sheets disable changes. An empty list
shows the end of the current look-ahead window.

The engine builds a dated queue of stock expiry, maintenance, age transitions, places to
recount and applicable plans to reconfirm. It excludes items resolved in any unfinished review.
The scheduled reminder remains overdue until a review finishes, while the queue looks ahead one
cadence from today. Maintenance remains unscored.

## Documentation map

- [Equipment form](../setup/README.md)
- [Maintenance calculation](../engine/README.md#maintenance)
- [Review queue calculation](../engine/README.md#review-queue)

## Known gaps

- Review answers, finish and summary, and calendar export are planned. Opening a row does not resolve it.

The person and stock destinations follow changes to their query IDs, including browser back and
forward. Changing the destination discards the previous sheet's draft; a missing or deleted record
closes the sheet. The place filter falls back to all places when its query ID is missing or invalid.
Closing a linked sheet removes its own query parameter and retains unrelated parameters.
