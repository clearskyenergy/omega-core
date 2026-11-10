# Portfolio & Energy Asset Manager: plan and acceptance tests

**Status (2026-10-11): FOLDED INTO THE ONE PORTFOLIO.** The draft on the
`portfolio-asset-manager` branch (PR #286) kept its own `asset_*` collection
set, gateway (`api/portfolio-assets.js`) and page (`portfolio-assets.html`).
Those are gone. What stands:

- **One collection set:** `omega_orgs/{org}/sites/{siteId}` (the site CRM's
  record) carries the register's facts, flags, revision and lifecycle beside
  the flat fields the CRM reads (`api/_lib/portfolio/site-bridge.js` is the
  one bridge). Both doors keep the one record in step (2026-10-25): the site
  record's view carries the register's power evidence, flags, pipeline,
  lifecycle and portfolios; an edit of a mapped field there writes its fact
  (kind manual, so a later import is a conflict, never a silent overwrite);
  an archive or a restore through either door writes `archived` and
  `lifecycleStatus` together (`lifecycleOf`, `archiveState`) and no register
  write undoes it. The register's own records sit beside it as `site_imports`,
  `site_views`, `site_portfolios`, `site_analyses`, `site_envelopes`,
  `site_allocations`, `site_handoffs`, `site_results`, `site_bills`,
  `site_assumption_sets`, `site_packages`, `site_submissions`, `site_jobs`
  (all Admin SDK only, stated in `firestore.rules`).
- **One door:** `/api/site-crm` mounts `api/_lib/portfolio/register.js`
  (the draft's gateway) and `register-ext.js` (Phases 2–5, CRM, widget);
  every write lands in `omega_audit` (action `sitecrm-*`).
- **One page and one record:** `portfolio.html` and `site-crm.html`.
- **One EVCS importer:** the intake profile by header signature
  (`api/_lib/portfolio/evcs.js`) through `import-preview` / `import-commit`,
  and `scripts/seed-evcs-portfolio.js` (offline dry run; `--apply` refuses
  unless `omega_orgs/{org}` exists and `--confirm-org` repeats it). The
  `data.json` script is removed.
- **One cash-flow engine:** `economics.legacyPod` runs
  `api/_lib/proforma.js` `monthlyFlows` (parity pinned offline against the
  workbook figures; T26 on the private file); XIRR with no-root / multi-root
  disclosure and the aggregated portfolio IRR stay in `economics.js`; IQGEN
  is a separate assumption set that never alters the legacy numbers.
- **The widget** sits beside Pulse and the feed on `workspace.html` and reads
  `GET /api/site-crm?widget=1`.
- **The XLSX reader** strips `x:` element prefixes (the real model file).
- Tests: `scripts/tests/tportfolioassets.js` (T01, T03–T08, T19, T29, T30,
  T34 guard, T02/T09/T10 synthetic), `tportfolio-phases.js` (T11–T18,
  T20–T25, T26 pinned, T27, T28, T31, T32, T35, CRM, widget),
  `tportfolioassets-real.js` and `tportfolio-economics-real.js` (skip
  without the private workbooks), all on `npm run test:portfolio` in
  `npm test`. `tportfolioassets-ui.js` (T33) was the draft page's and is
  retired; the workspace render check covers the one page and record.
- Not folded: the draft's own page markup (the one page carries the
  register), the per-org flag on the hub (Portfolio is on the rail for every
  workspace; the off-switch still refuses the register's API).

Before go-live: deploy `firestore.rules` by hand (`firebase deploy --only
firestore:rules`, project `clearsky-portal`) BEFORE or WITH the API; verify
the `evcs.com` organization exists before seeding; the seed creates no user
accounts. Close PR #286 once this is merged.

---


**Status (original draft):** written for the `portfolio-asset-manager` branch; see the fold-in note above for what stands.
**Spec:** OMEGA Portfolio & Energy Asset Manager v1.0 (2026-10-09), confidential, not in the repo.
**Baseline:** `main` at `91762a6`. The spec's snapshot was `412b695`; I re-read the current branch, and the files the spec cites are unchanged in substance.
**Scope of this file:** what exists, how the logical model maps onto it, flags, rules, routes, rollback, and the gaps that remain.

---

## 1. What exists today (re-read on the current branch)

| Foundation | Where | What it really does | Reuse decision |
|---|---|---|---|
| Customer-portal portfolio intake | `api/customer-portfolio.js`, `portals/customer/portfolio.js`, `docs/PORTFOLIO-SCREENING.md` | A **supplier's customer** uploads a package (CSV/XLSX/ZIP). It's stored under `omega_orgs/{org}/customers/{cid}/portfolios/{pid}/sites/{siteId}`, then sized and screened in client-driven batches. Admin SDK only. | **Left untouched.** It is customer-scoped and must stay private. The workspace register is a separate, flag-gated surface that reuses the same parsing modules. |
| Parsing / safety modules | `api/_lib/portfolio/{csv,xlsx,zip,ingest,template,match,quality,size,screen,aggregate,report,run,finance,interval}.js` | Safe ZIP reader (traversal, size, ZIP64 refusals). XLSX reads **only the first sheet**, as strings, drops blank rows (so row numbers shift), and has no macro or external-link check. The template ingester assumes headers on row 1. | **Extended, not forked.** `xlsx.js` gains `inspect/assertSafe/sheetGrid/buildBook`. `sheetRows()` is unchanged. A new `evcs.js` profile and a new `assets.js` register reuse `csv`, `xlsx`, `zip`, `ingest.addressKey` and `ingest.siteList`. |
| Workspace Projects drawer | `omega-workspace-hub.js` (`AREAS.projects.pages`), `workspace.html` (`hubCtx`) | Projects lists **In flight** and **All projects**. Pages are shown unconditionally. | Added a **Portfolio** page entry, shown only when `ctx.flags['portfolio-assets']` is set. `workspace.html` fills `ctx.flags` from billing `toolOverrides`. |
| `/portfolio` and `/portfolio.html` | `vercel.json` | **Already rewritten to `/tenants/osa/portfolio` on the OSA host.** | The spec's proposed `/portfolio.html` would collide on `osa.clearskyomega.com`, so the route is **`/portfolio-assets.html`**. |
| `sites` (top level) | `firestore.rules` §SITES | A sales/prospect board (Site Finder): client-writable by any org member, with an editable `repEmail`. | **Not used for the register.** Client-writable rules would expose customer contracts and rent to every member's browser, and would mix prospects with owned assets. A later phase can link to it through an optional `linkedSiteDocId`. |
| `omega_orgs/{org}/sites/{siteId}` | custody (`api/my-sites.js`, `api/logic-custody.js`) | End sites for unit custody and warranty. Admin SDK only. | **Name collision avoided.** The register uses the `asset_*` prefix. A later phase can link custody sites to asset sites by ID. |
| `projects`, `project_tasks`, `fin_projects` | rules §projects (owner `orgId` + `orgsInvolved[]` JDA roster), §project_tasks | Project identity and collaboration roster | Unchanged. Asset sites carry an optional `projectId` link (used by undo's linked-work check). Phase 3 creates and links projects. |
| `capacityAllocations`, `circuitCapacity` | rules, `omega-capacity-ledger.js` | ComEd-circuit claim ledger, read by every org member. Feeder-level semantics. | **Not reused in Phase 1.** The semantics differ (feeder claims, not meter/transformer envelopes). Phase 2/3 must decide whether to extend it or add a scoped allocation ledger (spec §7.4). |
| Tool catalog | `omega-tools.js` (`gridatlas`, `valuestack`, `computeproforma`, `parcelscreening`, `bessscreening`, editor) | Catalog-driven launch and gating | Phase 3 handoffs. In Phase 1 the context-bar actions are **disabled with an explanation**. |
| Financing marketplace | `/portals/finance/` (own surface), `api/financing-send.js` | Separate product. **Not** `/marketplace.html` (the tools catalog). | Phase 4 only. Nothing in Phase 1 publishes, sends or submits. |
| Feature flags | — | **There is no generic feature-flag system.** The closest is billing `toolOverrides` (ClearSky-written, tenant-read). | The flag is `omega_orgs/{org}/billing/current.toolOverrides['portfolio-assets'] === true`. |
| Auth helpers | `api/_lib/admin.js` | `authenticate` (verified token), `safeOrg` (path-injection guard), `canActInOrg` (includes cross-org `org_members`), `billingOf`, `isTenantAdmin` | Used. `canActInOrg` is **deliberately not used**: a cross-org collaborator must not get the whole fleet (spec §11.2). |

### Documented gaps, verified against current code (spec §2 asked for this)

| Claim in `docs/PORTFOLIO-SCREENING.md` | Verified in code? | Status after this branch |
|---|---|---|
| Bills are stored and matched but **not extracted** | Yes. `match.js` classifies and matches; nothing reads PDF contents. | Still open (Phase 3). The register stores files privately with `reviewStatus: 'uploaded'` and says an attachment is not reviewed evidence. |
| IRR/NPV/incentives/tax are `null` | Yes (`finance.js`) | Still open (Phase 4) |
| Office-side view of customer portfolios not built | Yes. No office reader of `customers/*/portfolios`. | Still open. The workspace register covers the **workspace's own** fleet, not its customers' uploads. Promoting a customer intake into the workspace needs an explicit, authorized action (later phase). |
| Batch processing pauses when the browser closes | Yes (client-driven `analyze` loop) | Unchanged for that API. Register imports are a **single request** (preview, then commit). Undo images and the import record persist, so a closed tab never leaves a half-reported import. Very large imports still need a durable job (Phase 5). |
| XLSX export not implemented | Yes | Register exports **CSV** (formula-injection neutralised). XLSX export is still open. |
| XLSX reader: first sheet only, row numbers shift on blank rows, no macro or external-link refusal | **New finding** | Fixed additively (`sheetGrid`, `inspect`, `assertSafe`). |
| Template ingester assumes headers on row 1 | **New finding** | Register detects the header row (EVCS profile: signature match; generic: first row that resolves a Site ID or address header). |

**Baseline counts (current `main`, this box):** `npm test` passes (omega-core: 346 passed, 0 failed; all chained suites exit 0). `firestore.rules` is 3,749 lines with 143 `match` blocks. `scripts/check-html-scripts.js` passes on 132 HTML files.

---

## 2. Mapping the logical model (spec §5) onto storage

All register data sits **under the tenant record**. It is Admin SDK only and denied to browsers, the same pattern as custody, freight and purchase orders.

| Spec entity | Phase 1 storage | Notes |
|---|---|---|
| Site | `omega_orgs/{org}/asset_sites/{siteId}` | `siteId = 's_' + sha256(org | namespace | externalId)[:20]`. It's stable across re-imports and row reorders. Names, rows, addresses and APNs are never keys. |
| externalSiteIds | `externalSiteIds: { <namespace>: '<source id>' }` | Namespace per source/customer (`evcs` for the intake profile, `customer` by default, or caller-chosen) |
| Fact + provenance (§5.3) | `facts.<key> = { value, unit, kind, raw, source{file, sheet, cell, row, column, header, externalSiteId, profile}, reviewStatus, metricDefinition?, measurementScope?, observedPeriod?, note?, previous[≤5], importedAt }` | Adapts the existing provenance record `{value, units, kind, source{file, field, row}}` and adds cell, sheet and review state. `kind` vocabulary is unchanged, plus `manual`. |
| Portfolio and membership | `omega_orgs/{org}/asset_portfolios/{pid}` plus `asset_sites.portfolioIds[]` | Membership is a reference, so a site is never copied (tested) |
| Agreement | `asset_sites/{id}/agreements/{aid}` | Imported "Site host agreement (as reported)" is `needs_agreement_review`. Display states: `Verified through`, `Renewal option - unexercised`, `Needs agreement review`. |
| Equipment | `asset_sites/{id}/equipment/{eid}` | Imported: aggregate EV nameplate (count `null`, never derived) and switchgear raw text plus amps (no kW) |
| Task | `asset_sites/{id}/tasks/{tid}` | Review tasks from flags; completion history |
| Document | `asset_sites/{id}/files/{fid}` plus Storage `asset-portfolio/{org}/files/{siteId}/{sha256}` | Private, attachment-only, downloaded through the API with audit |
| Import (preview, commit, undo) | `omega_orgs/{org}/asset_imports/{importId}` plus `/before/{siteId}`. Original file in Storage at `asset-portfolio/{org}/imports/{sha256}` | `importId` is derived from org, file hash, namespace and plan hash: an idempotency key |
| Saved view | `omega_orgs/{org}/asset_views/{vid}` | Filters, sort, columns, pinned columns, page size, selection scope, plus the saved result hash, coverage and exclusions |
| Audit | `omega_orgs/{org}/asset_audit/{id}` | Append-only events (preview, commit, undo, review, upserts, export, download) |
| Opportunity / scenario | `asset_sites.opportunity.legacyProxy` (Phase 1 only, labelled) | Phase 2 moves scenarios to immutable analysis records |
| Service / meter / parcel / party / measurement / design / submission | **Not created in Phase 1** | Phases 2–4. The IDs `serviceId`, `meterId`, `scenarioId` and `projectId` are reserved in the design. |

**Bounded documents:** no site document holds arrays of intervals, files or unbounded history. Fact history keeps 5 versions, source refs keep 20, children are subcollections, and file bytes live in Storage.

---

## 3. Security, rules and access

- **Firestore rules:** one additive block of explicit `allow read, write: if false` lines for `asset_sites/**`, `asset_imports/**`, `asset_views`, `asset_portfolios` and `asset_audit`, in the same style as the custody lines. The default already denies these; the lines state it. `scripts/check-rules.js firestore.rules` reports no structural problems. **The rules change needs a deploy before or with the API.**
- **Storage rules:** no change. The catch-all `match /{allPaths=**} { allow read, write: if false; }` already covers `asset-portfolio/`.
- **Indexes:** none. The API reads collections by document path and limit, with no composite queries.
- **Authorization (every request):** verified token, then org. The org is always the caller's own, except for staff. A body or query `org` that differs gets **403**. Then the flag must be on (otherwise 403, staff included). Then role comes from `omega_orgs/{org}/members/{uid}`: owner, admin or member, and no record means viewer.
  - owner/admin: read, edit, import, review, manageViews, archive, export, files, tasks
  - member: read, edit, import, manageViews, export, files, tasks (manual entries are `entered_unreviewed`; they cannot mark evidence reviewed or accept import conflicts)
  - viewer: read
  - cross-org `org_members` collaborators: **denied** (no fleet access from a project grant)
- **Upload safety:** at most 3 MB per request. Accepts `.xlsx` and `.csv` only; `.xlsm/.xlsb/.xls` are refused. Macros (`vbaProject.bin`, macrosheets), external workbook links and ActiveX/embeddings are refused. Formulas are never evaluated (cached value only, counted). The existing ZIP reader refuses traversal, absolute paths and oversize entries. A PDF must start with `%PDF`.
- **Export:** cells beginning with `= + - @ \t \r` are prefixed with `'` (plain negative numbers are kept). Every export and download is audited.

---

## 4. Import profiles

### 4.1 EVCS intake (`evcs-intake-v1`, `api/_lib/portfolio/evcs.js`)
Recognised by **header signature**: at least 80% of the 49 headers match in place, and A=`Location ID`, R=`EVCS owns meter` and V contains `power`. The sheet name and filename don't matter (the `Intake` sheet is tried first). Rows with a valid Location ID are sites. A long single-cell note after the data is the **footer**, kept in import metadata, and the p95 definition becomes `definitionNotes` attached to `reportedPowerKw`. Any other row without a valid ID is **rejected with a reason**; other rows still import.

The Appendix A mapping is implemented column by column, with these rules:

| Field | Rule |
|---|---|
| A | String ID, namespaced |
| F | ZIP as text, leading zeros restored if Excel stored a number |
| R | Tri-state; blank means no fact (unknown), never false |
| T and U | Both kept; no kW is derived |
| V | `metricDefinition: unresolved_reported_peak_or_active_interval_p95`, `reviewStatus: needs_definition_review` |
| S | `aggregate_installed_charger_nameplate`, labelled "not service capacity" |
| M | `reported_remaining_term_snapshot`; no expiry date is fabricated |
| AD | Whole percent to fraction (6 becomes 0.06, raw `6` retained) |
| Blank cells | No fact. The UI says "Not provided". |

Flags raised: `POWER_DEFINITION_CONFLICT`, `POWER_EXCEEDS_INSTALLED` (no clamping), `POWER_MISSING`, `METER_UNKNOWN`, `TERM_ZERO_REVIEW`, `TERM_MISSING`, `UTILITY_MISSING`, `TARIFF_MISSING`, `SWITCHGEAR_MISSING`. Review-severity flags create in-app tasks.

**EVCS legacy proxy v1** is reproduced as a **labelled preliminary scenario**, for parity only. Missing power gives `Unable to estimate - power data missing`, and the workbook's historical zero goes in `legacyHistoricalPods`. It is never shown as headroom or approval.

### 4.2 Generic site list (`template-v1`)
This is the existing `ingest.siteList` template, so the same headers the customer portal accepts. The header row is detected, and provenance is converted to facts.

### 4.3 WB2 (`EVCS_Solela_Site_Model.xlsx`): Phase 2 started (`api/_lib/portfolio/evcs-model.js`, profile `evcs-model-v1`)

WB2 is recognised by its sheet set: Summary, Inputs, Monthly, Portfolio and 10 Sites. It is imported as **one analysis package**, never as site lists, and it **never creates sites**. Each sheet is handled differently:

| Sheet | Becomes | Binding and safeguards |
|---|---|---|
| Portfolio | A `opportunity.wb2Legacy` record on each existing site | Bound by Location ID through the canonical `evcs` namespace. Columns are matched by header name; the source row is kept for traceability only. |
| Inputs | An assumption set (`kind: assumed`, with the cell reference) | Stored on one immutable `omega_orgs/{org}/asset_analyses/{id}` record |
| Summary | Reconciliation metrics | Stored on the same analysis record |
| 10 Sites | The shortlist: members and the TOTAL row | Stored on the same analysis record |
| Monthly | Row count only | Financial parity (T26) is Phase 4 |

Further rules:
- WB2's meter, term and power columns are **not** imported, so the three WB1 blank meter flags stay unknown.
- Each site's WB1-derived proxy is reconciled against WB2. Mismatches are listed in the preview and on the analysis record.
- Re-import is idempotent.
- IDs with no matching site are reported, not created.
- The rules add a deny line for `asset_analyses`.

**Real-file finding (fixed):** WB2's XML uses `x:`-prefixed elements (`<x:sheet>`, `<x:row>`, `<x:c>`). Before the fix, `xlsx.js` saw zero sheets. It now strips element prefixes (`unprefix`) in every XML read. A synthetic prefixed fixture guards this.

### 4.4 Re-import semantics
- **Same file:** every site is unchanged and **nothing is written**. Committing twice is a no-op.
- **Row order:** reordered rows are still unchanged, because identity is not positional.
- **Changed file:** you get a field-level diff before any write.
- **Reviewed or manual facts:** a change from the file is a **conflict**. It isn't applied unless someone with `review` accepts it per field, and the accepting person is recorded.
- **Blank in the new file:** shown, and the previous value is kept.
- **Previous versions:** retained.
- **Stale preview:** if the register changed after a preview, the plan hash differs and commit returns 409.
- **Undo:** restores only that import's own changes. A site changed afterwards, or one with files, manual tasks or a project link, is skipped with a reason.

---

## 5. Surfaces

- **Page:** `/portfolio-assets.html`, titled "Portfolio & Assets", reached from Projects > Portfolio (flag only). Static HTML with inline ES5 and no build, using Firebase auth like the other pages.
  - **Overview:** six summary groups, with nameplate, verified headroom (`Not provided`), screened (scenario-labelled) and unknowns kept separate.
  - **Sites table:** search, filters, sort, saved views, explicit `this page` / `all matching` scope, pagination, CSV export, a sticky first column and its own scroll region. Below 700 px it switches to cards.
  - **Site detail:** a dialog with the seven sections, plus a context bar. Upload is live; Site Map, screening, scenario and finance are disabled with reasons.
  - **Import:** four steps (upload, columns, review with counts, conflicts, rejected rows, same-address suggestions and an error-report CSV, then confirm), plus import history with undo.
  - **Records:** agreement, equipment and task forms; private file upload and download; field edit with optimistic concurrency.
  - **Persistence:** the selected site survives refresh and return (`#site=` and sessionStorage).
- **API:** `api/portfolio-assets.js`. Handlers are injected so tests run against an in-memory store. Its `vercel.json` `maxDuration` is 60.

---

## 6. Feature flag, enablement and rollback

**Default ON for every tenant (Thomas, 2026-10-11); per-tenant off-switch.** Every workspace sees Portfolio (Projects > Portfolio and the Portfolio & assets widget beside Pulse/feed). ClearSky turns one org off with `omega_orgs/{org}/billing/current.toolOverrides['portfolio-assets'] = false` (ClearSky-written; a tenant cannot change it). Data is always tenant-private.

**Rollback, in order of cost:**
1. **Per tenant:** set the override to `false`. The page then 403s and the hub hides the entry. Data is kept.
2. **Code:** revert the branch's commits. Nothing else reads `asset_*`, and the customer portal, `sites`, custody, projects and the capacity ledger are untouched. The `xlsx.js` additions are new functions only; `sheetRows()` is byte-identical in behaviour.
3. **Data:** delete `omega_orgs/{org}/asset_*` and Storage `asset-portfolio/{org}/`. This needs explicit approval because it is destructive.

There is no migration: no existing document is changed or moved.

---

## 7. Tests (Phase 1)

| ID | Where | What runs |
|---|---|---|
| T01, T03–T08, T19, T29, T30 | `scripts/tests/tportfolioassets.js` (in `npm test`) | Synthetic WB1 (`scripts/fixtures/evcs-wb1-synthetic.js`, generated at test time, not committed as a binary), run through the **real gateway** on an in-memory Firestore/Storage |
| T33 | `scripts/tests/tportfolioassets-ui.js` (`npm run test:portfolioassets-ui`; needs playwright-core and Chrome, otherwise SKIP) | Real page plus real gateway logic at 320/390/768/1440 px. Firebase, SSO and splash are stubbed. |
| Real workbooks | `scripts/tests/tportfolioassets-real.js` (in `npm test`; SKIPs without `EVCS_WB1_PATH`) | Spec counts, fingerprints, the 15 IDs, the blank-meter IDs, Swinomish, and a T09 legacy-parity preview |
| T34 | the existing `npm test`, `test-portfolio.js`, `test-portfolio-screening.js`, `check:workspace`, `check-html-scripts.js` | Regression, plus a hub guard (Portfolio is hidden without the flag, and In flight / All projects are unchanged) |

What the synthetic fixture **does not** prove: real header spellings and cell types, the real WB1 value distributions (the T09 legacy totals of 90/215/40/124 only reconcile on the real file), and live Firestore/Storage behaviour, latency or rules deployment.

---

## 8. Phases 2–5, CRM and the workspace widget (2026-10-11)

Scope decisions from Thomas supersede the spec where they differ: visible to every tenant (per-org off-switch), a workspace widget beside Pulse and the feed as the entry point, a CRM on the register for each tenant's customers, EVCS data only in the EVCS tenant, IQGEN as an alternate compute-economics set.

### 8.1 Delivered

| Area | Where | Notes |
|---|---|---|
| Shortlist view + create linked projects | `GET ?shortlist=`, `shortlist-create-projects` | Explicit site choice, ≤25 per call, deterministic `projects/pa_<siteId>` in the shape `omega-newproject.js` writes, idempotent, org-checked |
| Power evidence (§7) | `power.js`, `power-evidence`, `interval-upload`, `envelope-save`, `allocation-reserve`, `bess-check` | Headroom contract, PUE once, baseline membership, shared envelopes in a transaction with idempotency keys, interval coverage (no annual/firm claims from partial or active-only data), BESS energy budget |
| Tool handoffs (§8.2) | `handoff.js`, `handoff`, `handoff-result` | Routes pinned to `omega-tools.js` keys and existing files; opaque selectors only; locked / unavailable / no-coverage / failed are recorded honestly with no result |
| Site Map link (§8.3) | `map-sync` | Empty project = not a map; revision by content hash; review marks a revision; a new revision marks design + package stale |
| Bills | `bill-save`, `bill-review`, `GET ?bills=` | Manual or extracted entry → review queue; meter mismatch, missing fields, estimated reads, non-reconciling charges block acceptance. **Automatic extraction (OCR/LLM) is not enabled**; the `extraction` field records provenance when one is added |
| Versioned results + stale propagation (T25) | `asset_results`, `readiness.propagate` | Bill/map/power/agreement/equipment changes mark dependent results and packages stale; nothing re-runs or republishes silently |
| Scenarios + economics (§9.1) | `economics.js`, `scenario-run`, `portfolio-irr` | Legacy per-pod model reproduces WB2 (T26 parity on the private file); dated XIRR with no-root / multi-root disclosure; portfolio IRR from aggregated dated flows |
| IQGEN | `iqgen.js`, `assumption-set-import` | Stored as `asset_assumption_sets/iqgen_*` (kind `iqgen-hardware-v1`) with cell provenance; runs on the same engine; never touches the WB2 legacy set |
| Packages + submission (§9.2) | `package-prepare`, `package-submit` | Server-side gates (map, reviewed bills, meter, site control, power class, current finance, permission) at prepare and again inside the submit transaction; explicit confirm; one private snapshot per package; publication disabled |
| CRM | `crm-link`, `activity-log`, `GET ?crm=`, `GET ?pipeline=` | Links a site to the workspace's existing `customers/{id}` (+contacts); pipeline stage, owner, activity log, follow-up tasks. Nothing is sent from Portfolio |
| Workspace widget | `GET ?widget=1`, `workspace.html` `portfolioPanel` | Counts only for the caller's org; Customize toggle; links into Portfolio, pipeline, bills |
| Phase 5 (honest scaffolding) | `GET ?performance=1`, `job-start/step/cancel` | No connector → no values (T31). Durable, resumable, client-driven jobs with per-site failure isolation (T32); there is no server-side worker yet |
| EVCS seed | `scripts/seed-evcs-portfolio.js` | Offline dry run by default; `--apply` refuses unless `omega_orgs/{org}` exists and `--confirm-org` repeats it; never creates tenants, users or passwords |

### 8.2 Tests

`scripts/tests/tportfolio-phases.js` (in `npm test`): T11–T18, T20–T25, T27, T28, T31, T32, T35, shortlist/projects, power workflow, scenarios incl. an IQGEN-shaped set, CRM, widget. `scripts/tests/tportfolio-economics-real.js` (SKIPs without `EVCS_WB2_PATH`): T26 parity at 1e-7 and IQGEN on the private file. `tportfolioassets-ui.js` adds the CRM tab, power form, pipeline and bills dialogs.

### 8.3 Still open / disabled

- Bill OCR/LLM extraction (queue and provenance exist; no extractor).
- Live telemetry/accounting connectors and alerts (Phase 5): "Connect live monitoring" is disabled with its reason.
- Server-side background worker for jobs (jobs are durable and resumable, but advance only while a client calls `job-step`).
- Tools do not yet read `?handoff=` or post `handoff-result` back automatically; results are recorded through the endpoint.
- Financing-marketplace publication of a submitted package (deliberately disabled).
- Agreement `reviewStatus` can be set by any editor; a reviewer-only check is a follow-up.
- Value-stack scenarios beyond the compute model (the Value stack tool is reachable by handoff).

---

## 9. The compute model follows the Site Map design (2026-10-13)

Tommy: "all the data based on the site zipcode, the map that we made, those
details should auto input into the compute site pro forma and that should
produce an accurate IRR; I don't want to have to open up the site and input
the details … as much as actually possible is done for the user from the
drawing and our tools so that they can just put in minimal information."

| What | Where | Rule |
|---|---|---|
| The ZIP | `site-model.zipOf`, `site-bridge.zipFromAddress`, `design-read` (`zip`, `address`) | the run's, the record's, the site address's, the project's address; never a street number or a PO box; a ZIP the run read is kept on the site |
| An Omega-Core skid design | `site-model.skidInput` | the skid's own case on its own meter and its own numbers (`docs/OMEGA-CORE.md`, *The skid on a portfolio site*); the host's project named, never blended; a mixed design runs the host's case |
| The automatic run | `site-crm.js designModel()` | on every read of the design (open, Sync Site Map, the editor's save) when the design or the facts changed; the compute pro forma's gate; `designModel` on the site keeps what ran or what stopped it; `latestModel.auto`, `designHash` |
| The editor's save | `editor.html omegaSiteDesignPush` | a project the register made (`siteId`, `siteOrgId`) posts `design-sync {source:'editor'}` four seconds after a save; fire and forget |
| The pod pro forma on a skid | `site-crm.js runScenario` | the skid as recorded, $764,000 each; the cost run only for plain pods beside it |
| The pages | `site-crm.html`, `portfolio.html` | *1 Omega-Core skid*; the design card's automatic-run words and what stopped it; the skid's chipsets; *What it ran on* (the model record's basis); the Pro forma tab's note; the register's button |

Tests: `scripts/test-site-crm.js` (the skid design runs by itself on open,
once per design and per change of facts, a viewer's open too, the register's
sync from the editor, what stops it is kept and said, a workspace without
Omega Compute is not modelled, nothing names the source workbook),
`scripts/tests/tcomputesite.js` (a compute unit on its own meter).

Not built: the host's service size and usage are not on the project record,
so a plain-pod design on a site with neither is named, not modelled.
