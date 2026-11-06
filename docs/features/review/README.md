# Review

**Status:** Done · **Tracking:** [#20](https://github.com/pskillen/shtf-planner/issues/20)

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
document keeps navigation available while answer buttons and edit sheets disable changes. An empty list
shows the end of the current look-ahead window.

The engine builds a dated queue of stock expiry, maintenance, age transitions, places to
recount and applicable plans to reconfirm. It excludes items resolved in any unfinished review.
The scheduled reminder remains overdue until a review finishes, while the queue looks ahead one
cadence from today. Maintenance remains unscored.

## Calendar export

Review and Settings offer Add to calendar. The preview selects the next household stock review by
default; equipment maintenance jobs due within the review window are optional, one next occurrence
per job. Each reminder has a separate touch-friendly checkbox row, and overdue dates remain visible. Selecting reminders and downloading produces one local
`shtf-planner.ics` file. It is a snapshot, not a subscription; repeat-import handling varies by
calendar. There are no automatic downloads, push notifications or calendar service calls.

Event titles use the equipment type and job from the pack, never household names or places. Opaque
stable identifiers help calendars match repeat imports, where supported. The local preview can show
custom equipment names to distinguish jobs.

## Answers and Undo

Each row has named buttons; swiping right chooses the first answer and swiping left the last.
Stock can be kept, used, marked for replacement or binned. The latter three remove the entire
batch. Replace opens Quick add with the same product and place, including unclassified products.
Cancelling keeps the removal and replacement choice; adding new stock is a separate action.

Maintenance Done updates that job's date; Not now defers it. Age Noted acknowledges a transition;
Open person only navigates. Open place leads to Stores for a recount, and Recounted confirms the
check; Not now does not advance recount history. Still true refreshes the plan completion and
expiry, using the pack interval where available; No longer clears both dates and preserves the note.

The first answer creates an unfinished review and captures the score before its change. Answers
are versioned tokens in its resolved list. All unfinished records form one logical session after
sync; their resolved keys are combined. Additions to the same resolved list merge without a
conflict prompt, while removals and other conflicting changes retain the normal copy choice.

Undo is available locally for five seconds. Each receipt identifies the answer and review item, including its batch or maintenance details and equipment place when available, in the toast and button name. Identical outstanding receipts are numbered in answer order. Outstanding Undo buttons appear in Quick add, and their remaining time pauses until Quick add closes, including while a nested sheet is open. Reload keeps the
answer but not the toast. Undo checks that the review is unfinished, its token remains, and touched
fields have not changed. It restores only those fields. A removed batch is restored exactly only
if its product and place still exist and no matching batch has appeared. If the check fails, Undo
leaves everything as it is and asks the person to check Stores. These checks use the current local
document; later unseen edits follow normal sync conflict handling. Review answers and camera-free
stock details remain in the household document and its own Drive sync.

## Finish and summary

Finish is available even with items remaining, or with no answers. It finishes all known open
records together, stores the score at finish, clears local Undo and requests a Drive sync. The
summary counts distinct checked items and actions, including deferrals and differing answers, and
shows the score snapshots, current weakest capability and next review date. Start another review
is deliberate; the latest summary can be reopened. An unfinished session arriving later is shown as
“Review in progress”, even when its answers have resolved the queue. Late synced answers can change the counts but
never rewrite the stored score. An unseen open review remains in progress.

## Documentation map

- [Equipment form](../setup/README.md)
- [Maintenance calculation](../engine/README.md#maintenance)
- [Review queue calculation](../engine/README.md#review-queue)

## Known gaps

- Opening a row does not resolve it. Suggested minimums from recounts remain future work.

The person and stock destinations follow changes to their query IDs, including browser back and
forward. Changing the destination discards the previous sheet's draft; a missing or deleted record
closes the sheet. The place filter falls back to all places when its query ID is missing or invalid.
Closing a linked sheet removes its own query parameter and retains unrelated parameters.

Each answer has its own five-second Undo window, including when answers are made in quick succession. If a stock batch, maintenance job or plan has changed since its row was shown, the answer is rejected and the person is asked to check the refreshed review. Replacement opens Quick add only after the batch has been checked and removed.
