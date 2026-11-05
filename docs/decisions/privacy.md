# Privacy

**Status:** Accepted. The document holds children's dates of birth, medical conditions and
medication, so these rules bind every feature.

**Nothing leaves the browser but the user's own document**, to the user's own Google Drive, and
the digits of a barcode the person scans, to Open Food Facts (only online, only for a barcode the
household has not met, asks to identify again, or is sorting from the queue). No server, no
analytics, no other runtime third-party calls. [D11, D64]

**One third-party script.** Google Identity Services, loaded when the user connects Drive and at
start-up once connected. Fonts are self-hosted and precached; no request to Google Fonts or any
other host. [D100]

**Camera frames and date photos never leave the phone** and are never stored. There is no cloud
OCR; a cloud fallback would need a backend the app does not have. [D125]

**Open Food Facts identifies the app, not the person.** The user agent is
`SHTF-Planner/<version> (<app URL>)`, with no email in the code. Open Food Facts allows about 15
reads a minute per IP. [D64, D155]

**Location is a rough area only.** No map, no building, never a full address. [D9]

**The changelog is baked at build time** from GitHub Releases, never fetched at runtime, so the
landing page works offline. [D47, D50]

**Real data stays out of the repo.** Tests and examples use an invented family in Biggar. [D41]

**Planned: AI review with a redacted payload.** If "review my plan" arrives, its payload carries no
names (placeholders), ages as bands, no location, no contacts and no medication names unless the
user turns that on, through a small proxy
([#65](https://github.com/pskillen/shtf-planner/issues/65)). The `anonymise` setting is already in
the document. [D23]
