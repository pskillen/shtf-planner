# Drive sync

**Status:** Accepted. See the [Drive sync hub](../features/drive-sync/README.md).

**Drive is in from the start.** The household syncs through the user's own Google Drive. Why: the
owner runs several environments across browsers and devices, and testing without sync would be a
nightmare. [D34]

**Client-side OAuth, `drive.file` only, no backend.** The browser talks to Google directly with
Google Identity Services; the only scope is `drive.file` (files the app created). [D11]

**What is on Drive.** An app folder found by name on every device holds the Yjs binary
(`household.yjs`) and a human-readable JSON export written beside it on every push. If several
folders of that name exist, the oldest wins. A second browser on the same account finds the same
folder and file under `drive.file`. [D49, D70, D84, D94]

**When it syncs.** Push once per debounced burst of edits; pull on open, on focus and on demand.
Before every push, merge Drive's newer copy first, re-reading Drive's `modifiedTime` just before
the write. [D49, D93, D96]

**Conflicts are field-level, and the user chooses.** A record conflicts only when one field changed
on both sides to different values, or was deleted on one side and edited on the other; the app
keeps the last-synced state itself and asks "which copy?" per record. Nothing pushes while a
question is pending. [D34, D84, D93]

**Offline and errors.** Network errors, 5xx included, show as offline and retry from 30 s,
doubling to 5 min. A closed Google window on Connect is a quiet, retryable failure. Disconnect
keeps the last-synced state. [D71, D94, D96]

**Env warnings at the file moments, not a banner.** Every environment shares one Drive file. The
first-connect dialog, the import preview and any pull of a file last written by another env show
the file's env beside the app's (whenever they are not both prod), and a pull from another env asks
continue or don't sync. There is no standing banner. [D44, D106]

**Renewing the token always needs a tap.** Google's token model has no refresh tokens and opens a
window that browsers block without a user gesture, so there is no timer-based silent refresh. One
tap makes one Google window; no Google window opens without a tap. Inside a tap, a token in its last
15 minutes is renewed early. A failed renewal latches "Reconnect Google Drive" with pending edits
kept until the user reconnects. Non-prod builds have a test-only "drop the token" control. [D96,
D110 → D141, D145, D158]

**One Google account.** v1 syncs one Google account across devices. Planned: sharing one household
between accounts ([#69](https://github.com/pskillen/shtf-planner/issues/69)) and several
households in one Drive ([#85](https://github.com/pskillen/shtf-planner/issues/85)). [D20, D193]

**Export and import.** JSON (the same shape as the Drive sidecar) and YAML, from the data screen.
[D11]
