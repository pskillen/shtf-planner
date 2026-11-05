# Drive sync

**Status:** Done
**Tracking:** none

The household document, kept in step across devices through the user's own Google Drive. No server:
the browser talks to Google directly. One Google account in v1; sharing a household between
accounts is not built.

## Map

| Piece               | Where                                                                                             | What                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| The engine          | `src/store/sync.ts`                                                                               | `createSync()`: push, pull, the status, the questions. The contract is `SyncStatus` and the files |
| Which copy?         | `src/store/syncRecords.ts`                                                                        | Compares base, local and remote per record; applies a choice                                      |
| What sync remembers | `src/store/syncPersistence.ts`                                                                    | IndexedDB `shtf-planner-sync`: Drive ids, dirty flag, pending questions, the last-synced bytes    |
| Drive and Google    | `src/store/drive/`                                                                                | API client, token flow, prefs, and `DrivePort` (what the engine uses)                             |
| Forget this device  | `src/store/forget.ts`                                                                             | Deletes the household and the sync state locally                                                  |
| Test support        | `src/store/fakeDrive.ts`, `e2e/fakeGoogle.ts`                                                     | An in-memory Drive for unit tests; a faked Google at the network layer for e2e                    |
| Status pill         | `src/app/sync/SyncPill.tsx`                                                                       | In the top bar on every app screen; tapping it opens Data                                         |
| Banners and dialogs | `src/app/sync/SyncChrome.tsx`                                                                     | Newer-version banner, other-build dialog, which-copy dialog, first-connect dialog, toast          |
| Data screen         | `/app/more/data` (`src/app/screens/data/DataScreen.tsx`; linked from More > Settings > Your data) | Connect, Check Drive, Push now, Disconnect; export; import; forget this device                    |
| Owner setup         | `scripts/setup-google-drive.sh`                                                                   | The Google Cloud project, consent screen and OAuth client                                         |

## What is on Drive

An app-owned folder **SHTF Planner** in My Drive, with two files:

| File             | Content                                                            | Written                     |
| ---------------- | ------------------------------------------------------------------ | --------------------------- |
| `household.yjs`  | The CRDT's full binary state (about 220 kB for 1,000 items)        | Every push, in place        |
| `household.json` | `store.export()`: the readable document, with `meta.schemaVersion` | Every push, after the above |

The app asks for the `drive.file` scope only: it can see files and folders **it created**, and
nothing else in the Drive. That grant belongs to the Google account and the OAuth client, not to one
browser, so a second device finds the same folder by name (checked on real Google with two
browsers). If two devices race to create it, the oldest folder wins.

## How it syncs

Automatic. The pill says where things stand.

- **Push** once per burst: 5 seconds after the last edit, immediately when the page is hidden, and
  on `flush()` (which later features call at the end of a review). Both files are uploaded together.
  Just before writing `household.yjs` it reads the file's `modifiedTime` again; if it moved since
  this device last looked, someone wrote in the meantime, so it pulls and merges first and then
  writes. After five moves in a row the push stops, the edits stay marked to send, and it retries
  after the idle delay. Which edits are unsent is worked out from the document against the last state both sides
  had, deletions included, not from a flag alone: a deletion adds no new clock, and a flag can be
  lost with the page, so neither can leave Drive without something we have.
- **Pull** on open, when the page becomes visible, every 10 minutes while it is visible, when the
  network returns, and on **Check Drive**. It reads Drive's `modifiedTime` for `household.yjs` and
  downloads only if that changed since the last look.
- **Merge** is the CRDT's: concurrent edits to different records, or different fields of one
  record, never conflict. The app keeps the bytes of the document **as of the last successful
  push or pull** and compares base to local and base to remote record by record. A record is an
  stock row, product, location, asset, plan item, review, member, pet, the home or the settings.
  - The last-synced state, the Drive ids and the pending questions are shared by the tabs of one
    browser: every pass reloads them first, so a question answered in one tab is not asked again
    in another.
  - Records only the other device changed are applied silently, with a toast ("3 changes from your
    other device").
  - A field both devices set to different values, or a record one deleted while the other edited
    it, opens the **which-copy dialog**: a card per record with both values side by side, "Keep
    mine" or "Take theirs", and "Keep all mine" / "Take all theirs". The choice is written as a
    new change on top of the merge, so history stays consistent, then pushed. Nothing is pushed
    while questions are waiting, and they survive a reload.
- **First connect**: a device with no answers yet takes Drive's household without asking ("Loaded
  your household from Google Drive"). A device with data meeting a household on Drive asks first
  ("Merge them" or "Not now"), then merges both and shows what it changed. With nothing on Drive,
  the first push creates the files.

Drive moving things under us is handled quietly: files are listed oldest first, so if two devices
raced to create `household.yjs` the oldest one is used by everyone; and when the remembered folder
or a file has been deleted or trashed (a 404, which is not "offline") the ids are forgotten, the
folder is found by name again (or made), and the pass runs once more.

## The status

`SyncStatus` is the contract (the acceptance checklist and later features rely on it):

| Status               | Meaning                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- |
| `disconnected`       | Not connected to Drive on this device                                                  |
| `synced`             | Up to date as of `at`                                                                  |
| `pending`            | `edits` edits not sent yet, since `since`                                              |
| `pushing`, `pulling` | A transfer is in progress                                                              |
| `remoteNewer`        | Drive has changes waiting on an answer (which-copy, other-build dialog, first connect) |
| `offline`            | The network is down; `edits` waiting, since `since`                                    |
| `error`              | `message` says what; `reconnect` means the fix is the Connect button                   |

Edits made offline stay marked as unsent across reloads and are sent when the network returns.
A Drive network failure, a 5xx included, reads as `offline`, not `error`, and is retried after 30
seconds, doubling each time up to 5 minutes; success resets the delay.

## Guards

- **Newer schema.** If `meta.schemaVersion` on Drive (read from the small `household.json` first,
  then from the CRDT itself) is newer than this build, nothing is merged and the status is `error`:
  "Your other device runs a newer version; update this one".
- **Older household (before schema 4).** If Drive's file has `meta.schemaVersion` below
  `OLDEST_SCHEMA_VERSION` (4), nothing is merged. Sync records that an **older remote** is waiting
  and shows a dialog: "Google Drive has a household from an older version of the app, which this
  version cannot open. Replace it with the household on this device?" **Replace it** pushes this
  device's schema-4 household over Drive's file; **Not now** leaves sync off until the app is
  reopened (same pattern as the other-build dialog). A device that still has a schema-1–3 household
  locally hits the full-screen **too-old** gate instead (`TooOld.tsx`): start a new household there
  (Drive sign-in kept) or download a copy first. Import refuses an older export with the same rule.
- **Another build's file.** Each push stamps `meta.env`. There is no standing banner: the file's
  environment is shown where files come in or go out. "This household file was last written by
  {env}; you are on {env}" appears in the **first-connect dialog**, in the **import preview**, and
  in the dialog a **pull** raises when the file's `meta.env` differs from this build, with
  **Continue** (merge) and **Don't sync** (leave sync off until the page reloads). The line is shown
  whenever the two are not both `prod`; the pull dialog only when they differ. Export names the file
  with the environment unless it is `prod` (`household-next-YYYY-MM-DD.json`).
  After Don't sync the dialog goes and the pill keeps saying "Sync is off: ..." (Check Drive and
  the network coming back do not clear it); edits made meanwhile are counted as unsent and go out
  once sync is on again.

## Signing in

Google Identity Services' token flow, loaded when the person connects (and again at start-up once
Drive is connected, so a later tap has nothing slow before Google's window). The access token (an
hour) is kept in localStorage; there is no refresh token. Google's window is a popup, and a browser
only opens a popup for a tap, so **nothing asks Google unless a tap is behind it**:

- **Connect** is a button. If the popup is closed (Firefox does this after a few seconds) the app
  goes quietly back to "Connect Google Drive"; no error is shown, and pressing it again works.
- On expiry or a 401 the app asks Google for a new token **only if the page has a live user
  activation** (`navigator.userActivation.isActive`, the few seconds after a tap; where the API is
  missing the answer is no). That happens when a tap starts the sync, such as **Push now**, **Check
  Drive** or the end of a review. A sync that starts on its own (page open, focus, the poll, an edit's
  5 second timer, the network returning) has no tap, so it does not ask: the status goes straight to
  `error` "Reconnect Google Drive", and the browser's "Allow this site to open?" dialog never
  appears. Pending edits are kept. The failure is remembered: no focus, poll, edit, network-return
  or Check Drive asks Google again, and sync does no Drive work, until the person reconnects.
- **Reconnect is one tap, one Google window.** The pill in the top bar ("! Reconnect Drive") is the
  Reconnect button itself (it no longer links to Data), and so is the button on the Data screen.
  `connect()` makes a single token request with the saved account as `login_hint`, straight from the
  tap; a second request would find the tap's activation spent and be blocked. Google's window still
  flashes open and shut on its own (renewal is never fully invisible), but there is nothing to
  choose or type. If the browser blocks the window anyway, a toast and the Data screen say "Your
  browser blocked Google's window. Tap Reconnect.".
- **Why there is no silent renewal on a timer.** Google Identity Services' token model has no
  refresh token, and Google says to ask for a new token from a user-driven event; a browser blocks
  its window without a tap anyway. Measured on real Google two hours after a grant, a renewal with
  no input did work (3.7 s), but Google's window still flashed open and shut. Only the code model
  with a backend could renew invisibly, and there is no backend.
- **Renewing early.** Inside a tap, a token with under 15 minutes left is renewed before it runs
  out; the sync does not wait for Google's window and carries on with the token that still works. If the window cannot open or is closed, the token that still works is kept and the next
  tap does not try again for it.
- **Test control.** Outside `prod` builds, Data shows **Drop the Drive token (test)**: it forgets the
  token as if it had expired (still connected). A sync within about 5 seconds of that tap still
  counts as inside a tap, so wait about 10 seconds or switch to another app first. Then come back, and the pill reads
  "Reconnect Drive" without a Google window; tapping it reconnects.
- **Disconnect** revokes the token and forgets the connection; the household here, the files on
  Drive, and what sync remembers (the folder and file ids, the last state both sides had, and any
  which-copy questions still open) are kept. An open question is still open after Connect, and
  nothing is pushed until it is answered. Connecting again with the same Google account compares against
  that state, so edits made here and on the other device meanwhile merge without asking the
  first-connect question again. A different account, or one whose email cannot be read, starts afresh and asks first.
- **Forget this device's data** revokes the token (best effort, a few seconds at most) and deletes
  the household and the sync state from this browser too; Drive is untouched, and connecting again
  brings it back.

## Export and import

The Data screen downloads `household-[env-]YYYY-MM-DD.json` (the same text as `household.json`) or `.yaml`.
Import takes either, shows counts, and on confirmation replaces the household
(`importJson(..., 'replace')`, which migrates and validates) and pushes. A file from a newer
version is refused.

## Owner setup

Run `scripts/setup-google-drive.sh`. It walks through a Google Cloud project "SHTF Planner", the
Drive API, the consent screen (external, `drive.file` only, **published to production**: testing
mode expires tokens after 7 days), and an OAuth web client whose JavaScript origins are the local
and deployed hostnames (see [Build and deploy](../../build/README.md)). The client id goes in
`.env.local` as `VITE_GOOGLE_CLIENT_ID` and in the repository variable of the same name for CI
builds. A client id is not a secret but is never committed. A build without one runs with Drive
sync switched off. For tests and local development, a client id kept in localStorage under
`shtf-planner:drive:clientId` is used when the build has none; a `prod` build ignores it.

## Manual checklist (two Android phones, once a real client id exists)

1. Connect on both phones with the same Google account. The pill reads "Synced" on each.
2. Add an item on one; bring the other to the foreground. The item appears and a toast says so.
3. Airplane mode on one phone, edit, back online: the pill shows "Offline" with the edit count,
   then "Synced", and the other phone gets the edit.
4. Edit the same record on both while one is offline, then reconnect it: the which-copy dialog
   lists both values; either choice ends up on both phones.
5. Open a household file written by a `dev` build on a `next` build: the other-build dialog appears and
   nothing merges until you choose.
6. Leave a phone for over an hour, open the app: it either syncs quietly or asks you to reconnect;
   no popup and no "Allow this site to open?" dialog appears by itself. Tapping the pill reconnects in
   one tap. (On a non-prod build, **Drop the Drive token (test)** on Data does the same in a second.)

## Not done / rejected

- Sharing a household between two Google accounts (the file-by-id path exists in Drive's API; the
  second-account behaviour has not been tested).
- A refresh token or a server to hold one: the token flow is client-only by design.
- Per-tab leadership (Web Locks): two tabs of one browser each run their own sync loop, sharing the
  saved sync state; the CRDT makes the occasional duplicate push harmless.

## Not built yet

- Sharing, sync and multi-device ([#68](https://github.com/pskillen/shtf-planner/issues/68)): one
  household shared between two Google accounts, one sync loop across several open tabs, and keeping
  a late early-renewal token instead of ending in Reconnect.
- Several households in one Drive ([#85](https://github.com/pskillen/shtf-planner/issues/85)),
  which also replaces the "Replace it?" overwrite of an older household with a non-destructive
  choice.

## Background

- **Why automatic sync.** The owner runs `dev`, `next`, `staging` and `prod` across browsers and
  devices; testing without Drive would be a nightmare, so sync was in the first release. Why a CRDT
  and why Yjs: see [Data model](../data-model/README.md#background-why-a-crdt-and-why-yjs).
- **Lifted from Codeplug Studio**, a sister project that already syncs through Drive: the
  `drive.file` scope (the full `drive` scope is restricted and needs a yearly security assessment),
  an app-owned folder found again by name on other devices, the token flow with the token in
  localStorage, and the which-copy dialog (cards, both values, an explicit choice). Studio's code
  was copied, not shared as a package. Studio syncs by buttons and per-project YAML files; this app
  has one document, so it syncs by itself and asks only when the same field changed on both sides.
- **One file across environments.** Rather than a file per environment, there is one household
  file, a schema version the app refuses to go backwards on, and the environment of the last
  writer recorded in the file and shown whenever files move in or out.
- **Measured on real Google** (desktop, two browsers, one account): a second browser found the
  same folder with no duplicate and each read the other's writes; a 220 kB write took about 1.7 s
  and a read about 0.85 s. Firefox closed Google's first window after five seconds
  (`popup_closed`); a second tap worked, hence the quiet retry on Connect.
