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
   `collect()` reads, never computes: the project name and address, the
   drawing (`mktDrawingSummary`, `omegaBessFleet`, the first battery's
   chemistry), the parcel lookup (`_SITE_DATA.parcel*`), the geocoded county,
   Grid Atlas (`S.grid.substations`, `lines`, `_SITE_DATA.gridAtlas`), the
   substation lookup, the terrain sample, the project mode (`_wizMode`) and
   the drawn point of interconnection (`S.interconMode`), the imported bill's
   utility, the address-based jurisdiction table, the autopilot's parcel and
   the **Viability Workflow's answers** (owner, site control, utility, flood,
   BTM/FTM decision, application status, queue number, timeline, AHJ, zoning,
   COD), read straight off `localStorage` so nothing is created.
2. **Drafts** the answers on the server. `POST /api/helios-intake
   {action:'draft'}` merges those facts with the project record (`capex`,
   `bessKw`, `bessKwh`, `wizMode`, `interconMode`, `offtaker`) and
   `api/_lib/helios-intake.js` `compose()` writes what it honestly can, with
   the source under every answer. A question the platform cannot answer is
   left **blank** for the person; the platform never writes "Unknown" on its
   own say-so. Screening figures (Grid Atlas, the parcel service) carry their
   caveat in the sentence.
3. **Lets the person finish.** The dialog shows every question in the form's
   own words, the draft answer, its source, the attachment list (pre-ticked
   only where OMEGA can supply the item), the status block and a message to
   Helios. Everything is editable.
4. **Previews** Helios's own PDF. `{action:'preview'}` fills the form's
   AcroForm fields by name (pdf-lib, server side, self-hosted under
   `vendor/pdf-lib/`; the same mechanism the EV
   cost workbook uses for United Illuminating's application), wraps a long
   answer across the printed lines, shrinks the type a step when it must and
   reports an answer that still did not fit. The person sees the form before
   anyone else does.
5. **Sends** it. `{action:'send'}` fills again from the edited draft, keeps
   the PDF on the project (Storage `projects/{id}/helios-first-pass-<stamp>.pdf`,
   the roster's own folder), emails it to Helios with the sender and ClearSky
   in copy and Reply-To the sender, attaches a JPEG snapshot of the site map
   when asked, and records the send on `projects/{id}.heliosIntake` (last
   send, count) and `projects/{id}/intakes/`.

## Who

Anyone who may act in the project's workspace may draft and preview
(`A.canActInOrg`). **Sending** puts the workspace's name in front of a third
party: it needs a verified email, or an owner/administrator of an active
client (`admin.clientAdmin`, the plan-change rule), or staff. A pending,
suspended or cancelled workspace cannot send; a workspace with no record can
(the editor gate fails open the same way).

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

- The parcel, Grid Atlas and substation facts still live only in the editor
  session; they are not saved on `projects/{id}`. A draft made from a fresh
  page load before those lookups have run answers less. Saving them on the
  record (and the Viability Workflow's answers, which are `localStorage`
  only) is the next step and would let the workspace or Jarvis draft the same
  sheet.
- The utility's ownership type (investor-owned, municipal, co-op), wetlands,
  protected species, farmland and airport screens are not held anywhere;
  those lines wait for the person.
- Only the PDF and the site-map snapshot travel. The boundary KMZ, plot plan
  and one-line are ticked as attachments the developer will send; they are
  not generated server side.
- One form, one partner. A second lender's checklist means a second field
  map in the library, not a second copy of the door.
