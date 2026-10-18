# Funding marketplace v2 — preview

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Prepared 2026-10-18 so the funding marketplace is ready when the site editor
(editor-v2, PR #339) and the pricing work land. The order Thomas set is the
editor and pricing first, then the marketplace. What customers value is a
short path: build a site, see the IRR, see bankability, see the value stack,
and push the package to funding.

This preview does not replace `/finance`. Nothing here writes `fin_projects`.
Publishing stays off until Thomas turns it on.

## Where it lives

| Piece | Role |
|---|---|
| `/funding-v2` | Preview page. `vercel.json` rewrites it to `/funding-v2.html`. The `/finance` rewrite is still `/portals/finance`. |
| `api/_lib/bankability.js` | The one readiness score. Pure. No tariff lookup, no price, no credit. |
| `POST /api/funding-v2` | Score, board, list, interest, request-info, data-room plan, data-room sync, publish. |
| `omega-bankability.js` | Draws the ring, the bars, the checklist, the summary, and the comparison. It does not score. Editor-v2 uses this. |
| `api/_lib/vdr.js` | One folder plan. Connectors copy it into a room the financier already uses. |
| `funding_v2_packages` | Written only when `FUNDING_V2_PUBLISH` is the literal `true`. Admin SDK only. Browsers have no rule for this collection, so the default deny holds. |
| `scripts/tests/tfundingv2.js` | The score, the gates, the board, the flag, and the connectors. |

The illustrative packages on the preview are labeled Preview. They are inputs
so a reviewer can see a complete package, a listed package with gaps, a
package under the line, and a package a hard gate blocks. They are not deals
and they are not market data.

## The live marketplace, as it stands

`portals/finance/index.html` is the app. `portals/finance/app.js` is an
earlier build that nothing loads (`portals/finance/README.md`). `/finance`
rewrites to `/portals/finance`. `financing.csebuilders.com` and
`finance.csebuilders.com` redirect to `/finance`.

The deal record is `fin_projects/{id}`. The statuses the portal uses are
`draft`, `review`, `exclusive`, `open`, and `awarded`. A first look is
`firstLookUids` plus `firstLookUntil`. Partners read a deal whose status is
`open`. The rules are the `match /fin_projects` block in `firestore.rules`.

### How a developer submits today

Three doors write a marketplace deal, and they do not write the same shape.

1. **Site Map.** Output → marketplace push. `mktPush` in `editor.html`
   builds the document in the browser and writes `fin_projects` with
   `status: 'open'`. Site control, interconnection, and permits are the
   free-text fields on the form (`siteControl`, `interconnect`, `permits`).
   Offtake defaults to the sentence "Speculative — no signed offtake". The
   cost basis on the drawing is the flag `contracted` or `benchmark`. The
   push does not require an IRR, an NPV, a payback, a document index, or a
   named source for the tariff.
2. **Portfolio.** `send-to-finance` in `api/site-crm.js` writes one
   `fin_projects` deal per site through the Admin SDK. The deal is `open`
   when `askOf()` has an amount, and `draft` otherwise. The ask, the cost
   basis, the pro forma line, and `capitalRequest` ride along. Site control,
   interconnection evidence, the tariff's source and date, the BOM, the
   one-line, and the plot plan are not required before partners can see it.
3. **Omega Prime** creates `projects/{id}` and opens Site Map. It does not
   write `fin_projects`. A Prime design reaches the marketplace only if
   someone later pushes it from the editor or the portfolio.

Two other paths look like funding and are not this marketplace.

- **Apply for Financing** opens `/financing.html?project=`. Staff then send
  the credit package with `POST /api/financing-send`. The recipient is
  `DLL_CONTACT_EMAIL`, and the code's fallback is `rgisolfi@leasedirect.com`.
  That mail is a lender package, not a `fin_projects` listing.
- **Helios Intake** (`POST /api/helios-intake`) fills Helios's checklist and
  mails it. It is a partner checklist, not a listing. See
  `docs/HELIOS-INTAKE.md`.
- **Deal-room delivery** (`POST /api/dealroom-send`) is staff-only. It refuses
  to mail until `room.dataRoomUrl` is an `https` link someone pasted. The
  mail carries the link. It does not copy documents into a room.

### How a finance user reviews today

A partner signs in to `/finance`, sees deals with `status == 'open'` (and a
first-look hold when `firstLookUids` names them), and opens a deal across
the portal's tabs. Unlock allowances live on `fin_orgs/{orgKey}`. Offers are
written on the deal. There is no comparison of two or three deals on one
page, and there is no action whose job is "ask the sponsor for this
document." The "open questions" on a data-centre deal are diligence blanks
on the record, not a request the financier sends.

First-look expiry is a sweep the open page runs (`portals/finance/index.html`,
the comment above `firstLookDays`). It is not a scheduled job. A clock that
runs only while someone has the page open can leave a hold in place after
`firstLookUntil`.

### Friction, and the data a financier does not get

- A Site Map push can list a deal the moment someone submits the form. The
  evidence gates below are not in that write.
- Site control, interconnection, and permits accept any sentence. A blank
  interconnection is still a listed deal.
- IRR, NPV, and payback are display fields when a model happened to produce
  them. They are not a condition of `status: 'open'`.
- The portfolio opens a deal on "there is an ask." The ask can be the model
  total with no document behind the lines.
- The data room is a URL. There is no folder plan and no sync.
- The financier's screen is the full portal: intake, fees, unlocks, first
  look, offers, and the deal tabs. Reviewing one package takes a tour of
  that product.
- Sponsors query colleagues' deals with `where('orgKey', '==', …)`. The
  rules do not grant that read, `watchDeals()` swallows the error, and a
  colleague sees only their own deals (`portals/finance/README.md`). This
  preview does not change that query.
- `seedSamples()` writes `sample: true` deals from `SAMPLE_TEMPLATES` for a
  partner or an admin. `makeBill()` builds a twelve-month bill from the
  state and the megawatts. A non-PDF upload is labeled extracted from that
  synthesis (`portals/finance/index.html`). Version 2 never invents a bill.
  Those functions stay as they are until Thomas asks for that pass.

## The two journeys in this preview

### The developer, submitting

1. The package is the drawing (`from: 'drawing'`), the portfolio site
   (`from: 'portfolio'`), or a package that already carries the evidence
   fields. `POST /api/funding-v2` with `action: 'score'`.
2. The page draws the score, one bar per category, and a checklist in plain
   language. Each missing line says what to add.
3. A hard gate that fails, or a score under the line, sets `visible: false`.
   The financier list does not include it. The checklist starts with
   "Financiers cannot see this yet."
4. `fromDrawing` records the editor's free text and leaves the gate closed.
   A grid verdict opens interconnection only when the caller already has the
   utility, the source, and an ISO date. This module does not look those up.
   A cost flag of `benchmark` or `contracted`, with no document, does not
   count as a source.
5. `fromPortfolio` reads `latestModel` only: the total project cost, the
   after-tax IRR `summaryOf` stores, NPV, payback, term, a host-storage or
   PPA production basis when those fields exist, value-stack streams that
   already carry a name, and a PPA counterparty when the model stored one.
   Design documents and the document index stay empty, because the site
   record does not hold them. The checklist then asks for them.
6. Publishing is a separate staff action, and only while
   `FUNDING_V2_PUBLISH=true`. An id that starts with `preview-` is refused.
   The write is `funding_v2_packages/{id}`. `fin_projects` is not written.

Editor-v2 should `POST` `action: 'score'` and draw the answer with
`OmegaBankability`. This pull request does not edit `editor.html`. The
editor-v2 branch is PR #339 and is not in this tree.

### The financier, reviewing

1. Open **Reviewing**. Set minimums: megawatts, IRR (a percent from 0 to
   100), readiness score, technology, state, and development stage. The
   stage list is the live portal's `DEV_STAGES`, in that order. A deal
   matches when its stage index is at least the minimum.
2. The list is packages that are `visible` and inside those minimums. A
   package under the line is absent. A package that clears the line and
   misses a minimum is held with "Outside your minimums."
3. One package opens as one page: ROM (the cost amount on the package),
   IRR, NPV, payback, term, basis, offtake, the value-stack streams with
   the assumption and the source, and the risks the score already recorded
   (a screening rather than an agreement, merchant offtake, permits applied
   and not approved, and the same class of partial pass).
4. Two or three visible packages compare on one table: ROM, IRR, NPV,
   payback, readiness, size, technology, place, stage, offtake, basis, and
   the risks.
5. **Express interest** and **Request info** return immediately. The note
   on a request is at least five characters. While publishing is off, the
   answer is `stored: false` and the page says nothing was written to the
   live marketplace. With the flag on, the event is stored under
   `funding_v2_packages/{id}/events` and only if that package exists and is
   visible. This preview does not send email.

## The readiness model

The score is how complete the evidence is, from 0 to 100. It is not a credit
rating and it is not a market hurdle. The line a package must clear before
a financier can see it is a ClearSky product rule: **80**. A hard gate that
fails blocks the list even when the number would otherwise clear 80.

`score` is the sum of points earned. The category maximums sum to 100. A
partial pass can earn points and still fail its hard gate. The `missing`
sentence on a pass is a risk the summary prints; the `missing` sentence on
a fail is a checklist line.

IRR is the decimal the pro forma already uses (`0.12` is 12%). A value
whose absolute value is above 1.5 is refused, so a 12 that was meant as
12% is not read as 1,200%. A negative IRR can pass the returns gate and is
named on the summary.

### Categories

| Id | Points | What passes the hard gate | What raises the points | Why it is on the list |
|---|---:|---|---|---|
| `siteControl` | 8 | Lease, option, ownership, or purchase agreement, with an ISO date, and a party or a document id. | 6 with the party or the document named; 8 when `documentId` is set. A date without a party stops at 4 and fails. | FERC Order No. 2023-A describes site control as the right to develop the land, "such as a purchase or lease agreement," and requires evidence of 90% site control with the interconnection request and 100% at the facilities study agreement. [FERC 2023-A explainer, Site Control](https://www.ferc.gov/explainer-interconnection-final-rule-2023-A) (page updated 30 January 2025). A letter of intent scores 2 and fails. The Community Power Accelerator checklist accepts an LOI; this gate follows the FERC description. See decisions. |
| `interconnection` | 12 | A kind of screening, application, agreement, or will-serve, plus the utility, a source, and an ISO date. | Screening 8, application 10, agreement or will-serve 12. Declined is 0 and fails. | Order No. 2023 tightened readiness so a request that reaches study has shown it can be studied. [FERC Order No. 2023 explainer](https://www.ferc.gov/explainer-interconnection-final-rule). The final rule is [88 FR 61014](https://www.federalregister.gov/documents/2023/09/06/2023-16628/improvements-to-generator-interconnection-procedures-and-agreements). A screening passes and is labeled "a screening, not an agreement." The Community Power Accelerator accepts either a written account of the path to an agreement or a submitted Phase 1 application. [Credit-ready checklist](https://communitypower.helpscoutdocs.com/article/17-credit-ready-checklist-reference-guide) (updated 30 July 2025). |
| `tariff` | 8 | Utility, rate schedule, source, and ISO date, together. | All 8, or 0. | The model is using a rate. The package has to say which schedule, who published it, and when. This gate does not look up a tariff. |
| `incentives` | 6 | `claimed: false` passes at 3. `claimed: true` passes at 6 when every program has a name and a source. | Silence fails at 0. | The Community Power Accelerator asks for each incentive's jurisdiction and for the credit to be reflected in the pro forma. This gate records the claim and the source. It does not compute a credit and it does not apply a §48E rate. |
| `design` | 9 | BOM, one-line, and plot plan each present as an artifact (`name` or `id`). | 3 points each. Any gap fails the gate. | The same checklist asks for a single-line diagram and an equipment list with make and model. A sentence that the design exists does not stand in for the three artifacts. NREL's SROPTTC technology element is the engineering design, the equipment, and the procurement, not a placeholder. [NREL Project Development Model](https://www.nrel.gov/energy-solutions/project-development-model); the underlying report is [NREL/TP-7A40-57963](https://doi.org/10.2172/1064514). |
| `cost` | 10 | An amount above zero and at least one line with an amount and a source that is not the bare flag `benchmark` or `contracted`. | One sourced line is 6. Two sourced lines, or a source that names a quote, invoice, datasheet, or price book, or a contract source longer than 16 characters, is 10. | The figure has to name where it came from. [NREL's Annual Technology Baseline](https://atb.nrel.gov/) is an example of a named public cost source. This gate does not read the ATB and does not apply a dollar per watt. |
| `production` | 8 | A method, a source, and a quantity (`annualKwh`, `annualMwh`, or `hours: 8760`). | An explicit assumption (`assumed: true`) is 5 and passes. A method and source with no as-of date is 5 and passes. Method, source, quantity, as-of date, and `assumed` not true is 8. | NREL's resource element asks for a characterization whose confidence matches the stage, from a general assessment up to hourly data for an investment-grade study (same report). An assumption is allowed when the package says it is an assumption. |
| `valueStack` | 8 | At least one stream with a name, an assumption, and a source. | One stream is 4. Two or more are 8. | Each stream has to carry the assumption it was built on. This gate does not add a stream and does not price one. |
| `returns` | 10 | IRR as a decimal with absolute value at most 1.5, NPV, payback of zero or more, a basis (for example `after-tax`), and `termYears` above zero. | All 10, or 0. | The Community Power Accelerator asks for one pro forma with the costs, the funding, and the ongoing cash flows. IRR, NPV, and payback are read off the package. This gate does not calculate them. `fromPortfolio` may set `basis: 'after-tax'` only because `summaryOf` stores the after-tax IRR in `irr`. |
| `offtake` | 6 | `merchant` passes at 2. `named` with a party passes at 4. `signed` with a party and a source passes at 6. | Silence fails. | NREL's offtake element is a contracted buyer of the energy and the other attributes. Merchant is an explicit position, so the financier sees "Merchant" and the risk line "There is no contracted customer." Saying nothing is not a position. |
| `permitting` | 5 | `not-started` passes at 1. `applied` with an ISO date passes at 3. `approved` with an ISO date passes at 5. | Applied or approved with no date fails at 0. | SROPTTC's permits element is identifying and obtaining the permits. "Not started" is a status a financier can read. A status of applied or approved without a date is not. |
| `documents` | 10 | All six slots present, each with a name or an id: `site-control`, `interconnection`, `bom`, `one-line`, `plot`, `cost`. | `floor(10 × n / 6)` while any slot is missing, and the gate fails. | The index is what the data room is built from. A category that passed on structured fields still needs its instrument in the index. |

### Illustrative scores

These four packages are in `api/_lib/funding-v2-examples.js`. The figures
are round inputs (IRR `0.12`, `0.09`, `0.07`). They are not quotes.

| Package | Score | Listed? | What a reviewer is meant to see |
|---|---:|---|---|
| `preview-complete` | 100 | Yes | Every gate full, including an interconnection agreement and a signed offtake. |
| `preview-ready` | 94 | Yes | Application rather than an agreement, a named customer, permits applied. Those three are risks on the summary. |
| `preview-thin` | 74 | No | Every hard gate passes. The line is 80, and the checklist says "The score is 74." |
| `preview-blocked` | 38 | No | Design, cost, production, value stack, returns, and documents fail. Screening interconnection still passes and is disclosed. |

### Financier minimums

`criteria()` accepts `minMw`, `maxMw`, `minMwh`, `minIrr` (percent, 0–100),
`technologies` (the editor's ids: `solar`, `storage`, `solar_bess`, `ev`,
`datacenter`, `land`, `efficiency`), `states` (two letters), `minStage`
(one of `DEV_STAGES`), and `minScore` (0–100). `matches()` requires
`result.visible` first, then each minimum the financier set. An unknown
technology, a state that is not two letters, or a stage outside the list
is a 400.

## Data rooms

The folder plan is ours. A connector copies that plan into a room. The
index file `00 Index/index.json` is always part of the plan. A document is
uploaded only when the caller passes `text` or `base64`. The connector
never fetches a URL on the package, so a document id cannot become a
server-side request. Each file is capped at 256 KB. Credentials are read
from the environment at call time, scrubbed out of the result and out of
error bodies, and are not in this repo.

`vdr-sync` requires `confirm: true` and `caller.staff === true`. Any other
caller gets 403.

### What finance teams use, and what this code calls

| Room | Public API | This preview |
|---|---|---|
| Google Drive | [files.create](https://developers.google.com/drive/api/reference/rest/v3/files/create) and [multipart upload](https://developers.google.com/drive/api/guides/manage-uploads). A folder is `mimeType: application/vnd.google-apps.folder`. | Implemented. `VDR_GOOGLE_ACCESS_TOKEN`. Optional parent `VDR_GOOGLE_PARENT_ID`. |
| Box | [POST /2.0/folders](https://developer.box.com/reference/post-folders) and the [direct upload](https://developer.box.com/guides/uploads/direct/) at `https://upload.box.com/api/2.0/files/content` (`attributes` before `file`). Box documents a 50 MB direct-upload cap; this connector stays at 256 KB. | Implemented. `VDR_BOX_ACCESS_TOKEN`. Optional parent `VDR_BOX_PARENT_ID` (default `"0"`). |
| SharePoint | [Microsoft Graph create child](https://learn.microsoft.com/en-us/graph/api/driveitem-post-children?view=graph-rest-1.0) with `folder: {}` and `@microsoft.graph.conflictBehavior: fail`, then [PUT content](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0). | Implemented. `VDR_GRAPH_ACCESS_TOKEN` and `VDR_GRAPH_DRIVE_ID`. |
| Datasite | [Datasite APIs](https://www.datasite.com/en/resources/datasite-apis) describe document upload, membership, project metadata, and Q&A, with a sandbox at `developer.datasite.com`. The request shapes sit behind that login. | Catalogued. `sync` returns 409 and does not call out. |
| Intralinks | [Getting access to Intralinks APIs](https://support.intralinks.com/hc/en-us/articles/16949786103963-Getting-access-to-Intralinks-APIs-VDRPro-VIA-Pro-FundCentre-Reporting) says VDRPro has a REST API and that access is requested. | Catalogued. 409. No request is pinned here. |
| Ansarada | [ansarada.dev](https://ansarada.dev/) publishes GraphQL at `https://api.ansarada.com/v1/graphql`. The mutation fields are not pinned in this repo. | Catalogued. 409. |
| DealRoom | [dealroom.net](https://dealroom.net/) describes API access for rooms and uploads. No public request reference is pinned here. | Catalogued. 409. |

DealRoom the data room is `dealroom.net`. `dealroom.co` is a company
database (`https://api.dealroom.co/api/v1`). This connector does not call it.

Three connectors are implemented because Drive, Box, and SharePoint each
publish the request this code sends. Thomas asked for the first one or two
where a public API allows it. The third is in the same interface and is
called out in the decisions so it can be dropped without a redesign.

### Folder plan

```
{package name} — data room
  00 Index                  index.json
  01 Site control           slot site-control
  02 Interconnection        slot interconnection
  03 Utility and tariff     slot tariff
  04 Incentives             slot incentives
  05 Engineering            slots bom, one-line, plot
  06 Cost                   slot cost
  07 Production and offtake slots production, offtake
  08 Value stack and returns slots value-stack, returns
  09 Permits                slot permitting
  10 Other                  anything else
```

## What is not built

- Email on interest or on a request for information.
- A browser rule for `funding_v2_packages`. The collection is Admin SDK
  only until a rules deploy Thomas approves.
- A billing check. Other product endpoints consult `billing/current` before
  they do paid work. This preview does not. See decisions.
- Datasite, Intralinks, Ansarada, and DealRoom calls.
- A cutover of Site Map push, portfolio `send-to-finance`, or `/finance`.
- First look, unlock tokens, and fees. Those stay on the live portal.
- Any edit to `editor.html`, `portals/finance/index.html`, or
  `firestore.rules`.

## Decisions for Thomas

1. **The list line is 80.** Hard gates are separate: a package at 90 with a
   failed gate stays off the list, and a package at 74 with every gate
   passed stays off the list. Confirm the 80, or name another line.
2. **A letter of intent is not site control here.** FERC Order No. 2023-A
   describes a purchase or a lease (90% at the request, 100% at the
   facilities study agreement). The Community Power Accelerator checklist
   accepts an LOI. This gate follows FERC. Confirm, or allow an LOI as a
   passing instrument at fewer points.
3. **A screening passes interconnection at 8 points** and is shown as a
   risk, not as an agreement. An application is 10. An agreement or a
   will-serve is 12. A decline fails. Confirm.
4. **Merchant offtake passes at 2 points** when the package says merchant.
   Silence fails. A named party is 4. A signed contract with a source is 6.
   Confirm that merchant may be listed.
5. **Publishing stays off.** The flag is `FUNDING_V2_PUBLISH=true`. The
   collection is `funding_v2_packages`. No browser rule until you approve
   a rules deploy. Confirm the collection name and that staff remain the
   only publishers.
6. **Drive, Box, and SharePoint are all implemented.** You asked for the
   first one or two with a public API. All three have a public request, so
   all three are behind the same interface. Say which to keep. Datasite,
   Intralinks, Ansarada, and DealRoom wait until a contract pins the
   request. Credentials live only in the deployment environment:
   `VDR_GOOGLE_ACCESS_TOKEN`, `VDR_GOOGLE_PARENT_ID`,
   `VDR_BOX_ACCESS_TOKEN`, `VDR_BOX_PARENT_ID`, `VDR_GRAPH_ACCESS_TOKEN`,
   `VDR_GRAPH_DRIVE_ID`.
7. **This preview does not check `billing/current`.** The house rule is
   that a product endpoint checks the plan before it does the work. Scoring
   a package is not sold as a module yet. Say whether the score should
   follow Omega Capital, the finance add-on, or stay open to any signed-in
   member of an active workspace.
8. **Interest and request-info are stored, not mailed,** and only after the
   publish flag is on. Say who should receive them.
9. **The live portal's sample deals and `makeBill()` are unchanged.** A
   later pass should stop a synthesized bill from being labeled extracted.
   This pull request leaves that alone.
10. **Editor-v2 should post `action: 'score'` and render with
    `omega-bankability.js`.** This pull request does not edit the editor.
11. **First look, unlock tokens, and fees stay on `/finance`.** Say whether
    version 2 grows its own, or the cutover keeps the live portal's.
12. **The colleague `orgKey` read on the live portal is documented, not
    fixed.** Sponsors' `where('orgKey', '==', …)` is refused and swallowed,
    so colleagues see only their own deals. Decide whether they should, and
    that fix belongs on the live rules, not in this preview.
13. **The four preview packages use fictional round inputs** (IRR 0.12,
    0.09, and 0.07; city Preview; state IL). They are not deals and not
    market quotes. Confirm they can ship on the preview route.

## How to try it

Open `/funding-v2` on a deployment, or serve the file locally. On
`localhost` and `127.0.0.1` the page calls `POST /api/funding-v2` without a
Firebase token so the render script can walk it. Anywhere else it uses the
existing Firebase session and, on 401, asks the viewer to sign in. It does
not load `omega-tenant.js`, so it does not take the hostname lock.

`node scripts/render-funding-v2.js` serves the page on `127.0.0.1`, posts
to the real `handle()`, and walks both journeys. The shots land in
`docs/screenshots/funding-v2/`.

`node scripts/tests/tfundingv2.js` is in `npm test`, immediately after
`tfinancelink.js`.
