# Helios Intake — the first-pass checklist, from the editor

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Helios Energy Advisors (the capital partner `heliosnrgy.com`, slug `helios`)
asks a developer to complete a *Large Land Deal First Pass Checklist* before
it looks at a deal: eighteen questions in four sections, a twelve-item
attachment list and a four-line status block, as a fillable PDF. This is
the Output tab's **Helios Intake** (2026-09-30, Tommy: "help the client fill
this out and autofill as much as possible and then send to the email address
for helios").

## What it does

1. **Gathers** what the editor session knows. `omega-helios-intake.js`
   `collect()` reads, never computes: the project name and address (a city
   and state only where the ADDRESS says them), the drawing
   (`mktDrawingSummary`, `omegaBessFleet`, the first battery's chemistry,
   solar arrays counted as a layout), the drawn property line's own acreage
   (`_siteBoundaryInfo`, never the largest shape standing in for one), the
   typed exclusions (wetland, floodplain, easement, right-of-way) with their
   acres, the parcel lookup (`_SITE_DATA.parcel*`), the geocoded county,
   Grid Atlas, the substation lookup, the terrain sample and its average
   grade, the project mode (`_wizMode`, and **only when somebody chose it**:
   the editor starts every project on BTM, so an unconfirmed BTM is not
   sent), the POI setting (`S.poi`, `S.poiFt`), the offtaker (a guided-build
   class carries an id; a typed name is a named buyer), the imported bill's
   utility, the jurisdiction table only when it `known`s the state, the
   captured Run (`S.costRollup`, and only while the drawing has not moved
   since: the live cost panel is no Run), and the **Viability Workflow's
   answers** read straight off `localStorage` so nothing is created: owner,
   site control, utility and the TSP with its ownership type (`TX_TSP`),
   flood, path decision, export mode, application type and status,
   interconnection entity, market, ERCOT status, queue number and risk,
   timeline, POI, gen-tie, BESS size, the site-screen showstoppers, the
   permit checklist, notes, COD, and the address research (`sc.research`,
   which the workflow now keeps with its scenario). `today` is the
   browser's own date.
2. **Drafts** the answers on the server. `POST /api/helios-intake
   {action:'draft'}` merges those facts with the project record (`capex`,
   `bessKw`, `bessKwh`, `bessSizing`, `siteScopes`, `type`, `wizMode`,
   the saved drawing's substation lookup and drawn POI) and the workspace's
   own Apply for Financing request for the project (`fin_applications`,
   own org only, as the rules say: construction start from its NTP, COD,
   the amount and type asked), and `api/_lib/helios-intake.js` `compose()`
   writes what it honestly can, with the source under every answer. A
   question the platform cannot answer is left **blank** for the person;
   the platform never writes "Unknown" on its own say-so. Screening figures
   carry their caveat in the sentence. The workflow's flood answer is
   `'1'` minimal risk and `'0'` a mapped floodplain; the state utility table
   never asserts an ownership type (Tennessee's TVA distributors are
   municipal and co-op); "Not screened by OMEGA" lists only what nobody
   flagged.
3. **Lets the person finish.** The dialog shows every question in the form's
   own words, the draft answer, its source, the attachment list (pre-ticked
   only where OMEGA can supply the item), the status block and a message to
   Helios. Everything is editable. A text selection dragged out of a box no
   longer closes it, and closing with typed changes asks first.
4. **Previews** Helios's own PDF. `{action:'preview'}` fills the form's
   AcroForm fields by name (pdf-lib, server side, self-hosted under
   `vendor/pdf-lib/`; the same mechanism the EV cost workbook uses for
   United Illuminating's application). The form's font is Helvetica, which
   prints Windows-1252 only, so every text is transliterated first
   (`toWinAnsi`: Kāneʻohe → Kane'ohe, ≥ → >=, invisible characters out),
   never a 500. Lines are measured as the viewer DRAWS them (unkerned, per
   printed line); a long answer wraps across its lines and shrinks a step;
   a token longer than a line breaks after a comma, a slash, then a hyphen;
   a status box shrinks, then wraps to two lines; a cover box keeps every
   line the person wrote and shrinks to fit. What still does not fit is cut
   with an ellipsis, and `issues` says so in words, with any box whose
   characters changed and a date the form's `m/d/yy` field cannot read
   (left blank). The person sees all of it before anyone else does.
5. **Sends** it. Send runs the same fill first and puts its issues in the
   one confirmation (and says when the project was sent before). `{action:
   'send', sendId}` fills again from the edited draft, keeps the PDF on the
   project (Storage `projects/{id}/helios-first-pass-<stamp>-<sendId>.pdf`,
   the roster's own folder, one file per send), emails it to Helios with the
   sender and ClearSky in copy and Reply-To the sender, attaches a JPEG
   snapshot of the site map when asked, and records the send on
   `projects/{id}.heliosIntake` and `projects/{id}/intakes/{sendId}`.

## Who

**Draft and preview**: whoever the projects READ rule lets see the project
(its org, its creator, an org on its JDA roster, staff), and no wider: a
cross-org `org_members` grant contributes, it does not browse. The
caller's own plan must carry the button: a package holds Omega Capital
(`finance`; a read-only package may draft, not preview); a legacy plan opens
the editor and its `export` capability or has the Omega Capital add-on live
(`addons.judge`, the ONE legacy ladder). A member the workspace disabled is
refused. The financing request is read only for the project's own workspace.

**Send** puts a workspace's name in front of a third party from ClearSky's
mailbox: a member of the project's OWN workspace (or staff), not a viewer,
a workspace with a record that is not pending, suspended or cancelled, never
a personal email domain (`public-domains.js`), and a verified email or an
owner/administrator of an active client (`admin.clientAdmin`). At most five
sends a project and twenty-five a workspace each UTC day (staff aside),
counted in a transaction on `projects/{id}/intake_counters` and
`omega_orgs/{org}/intake_counters`, which no rule opens. The `sendId` is
claimed in the same transaction before anything is mailed: the same id again
answers with the first send; one in flight is 409; a failed or ten-minute
stale one may be retried with the same id. After the mail goes, a failure to
record it is a warning, never an error that invites a second send.

## Where it goes

Configuration, never a constant: `HELIOS_INTAKE_EMAIL` (one or more
addresses) wins; else the deal room's own recipient list for Helios,
`fin_settings/dealroom.orgs.helios`, which an administrator edits on the
deal room page. With neither set the dialog says so, the send button is off
and the server refuses to send. ClearSky's copy goes to `MAIL_NOTIFY`
(default `dev@clearsky-usa.com`, as in `mail.js`).

## Files

- `forms/helios-first-pass.pdf` — Helios's blank form. Served statically and
  read by the function from disk (with a fetch of the served copy as the
  fallback). `scripts/tests/thelios.js` pins its 67 field names, so a new
  revision of the form fails the test instead of producing a blank page.
- `api/_lib/helios-intake.js` — the one place that knows the form: the field
  map, `compose()`, `fill()`, `recipients()`, the email body.
- `api/helios-intake.js` — the door (draft, preview, send).
- `omega-helios-intake.js` — the dialog and the collector (ES5).
- `editor.html` — the button in the Output tab's Marketplace panel, on the
  `export` cap beside Apply for Financing; under a package it belongs to
  Omega Capital (`finance` in `api/_lib/modules.js`), as Apply for Financing
  does; `omega-ribbon-icons.js` has its icon.
- `api/_lib/mail.js` `send()` now passes `cc`, `bcc` and `attachments`
  through to nodemailer.
- `vendor/pdf-lib/1.17.1/` — pdf-lib's single-file build and its MIT licence.
  One copy, required by a literal path, so the function bundle carries it and
  the CI unit job, which installs nothing, runs the test.

## What is not built (honest list)

- The parcel, Grid Atlas and terrain facts still live only in the editor
  session; they are not saved on `projects/{id}` (the substation lookup and
  the drawn POI are, on the drawing, and are read from there). A draft made
  from a fresh page load before those lookups have run answers less. The
  Viability Workflow's answers are `localStorage` only, so a draft from
  another browser has none of them.
- Wetlands, protected species, farmland and airport screens are not run by
  OMEGA; they are reported only where the developer flagged or traced them.
  An ownership type is stated only where the workflow's TSP table or its
  utility list records one.
- Only the PDF and the site-map snapshot travel. The boundary KMZ, plot plan
  and one-line are ticked as attachments the developer will send; they are
  not generated server side.
- An edited draft is not kept when the dialog closes (it asks first).
- One form, one partner. A second lender's checklist means a second field
  map in the library, not a second copy of the door.
