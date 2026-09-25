# CleanCell OMEGA Logic upgrade log

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Updated 2026-09-21. Client: CleanCell (`cleancell.us`).

**Current release status: company PO launch deployed to production and live-verified on 2026-09-21 (PR #65, see the release entry below).** The earlier "not deployed" statement is superseded. Portfolio ZIP screening, carrier integration, onward transfers, commissioning approval, email intake, payments and catalog data remain open scope.

This is the client delivery backlog and change record. **Prepared, tested, deployed and accepted are separate states.** No item is production-ready merely because its screen exists. The new scope comes from the September 21 call notes and subsequent user direction.

## Delivery status

| ID | Upgrade | State | Acceptance requirement |
| --- | --- | --- | --- |
| CC-001 | Verified customer can submit a catalog PO without Editor Lite | In progress | Correct account attribution, duplicate prevention, no client-controlled price or payment status |
| CC-002 | Allocate a large PO across named sites and staged deliveries | In progress | Allocations reconcile by SKU to all ordered quantities; no over-allocation |
| CC-003 | Serialized shipment legs and custody history | In progress | A serial cannot be dispatched twice or moved without a recorded prior receipt |
| CC-004 | Carrier quotes, selection and booking | Planned | Select actual broker/carriers; authorize booking and validate API integration; no simulated booking |
| CC-005 | Pickup and transit events | In progress | Evidence, actor and timestamp recorded; manual updates explicitly identified |
| CC-006 | Delivery inspection, shortage and damage exceptions | In progress | Separate delivered, accepted and exception states; retain original evidence |
| CC-007 | Destination and commissioning approval | Planned | Confirm CleanCell/ClearSky approval authority, required evidence and external approvals |
| CC-008 | Portfolio workspaces within customer profiles | Planned | Customer isolation; multiple portfolios and sites; office access through authorized roles |
| CC-009 | ZIP upload and document-to-site review | Planned | Private storage, file limits, archive traversal/bomb protection, malware controls, explicit file mapping |
| CC-010 | Portfolio screening jobs and reports | Planned | Durable background jobs, retry/cancel/status, source provenance, missing-input warnings, reproducible report versions |
| CC-011 | Screening to guided design and saved exports | Planned | Same site identity survives design, plot plan, preliminary one-line, quote and PO |
| CC-012 | Subscription and usage controls | External setup required | Configure customer checkout, portfolio limits and resale economics; proposed Editor Lite price $799/month |
| CC-013 | QuickBooks and verified payment release | External setup required | Connect company and approved invoice items; prove invoice, payment, reversal and reconciliation behavior |
| CC-014 | Bank remittance | Decision required | Agree settlement policy and bank integration; recording a wire is not initiating one |
| CC-015 | Website installation and pilot | Planned | Install customer links/sizer embed; verify origins, mobile signup, branding and role isolation |
| CC-016 | MOU and executive summary | Drafted | Confirm legal entity, commercial terms and signatories; counsel review before execution |
| CC-017 | AI operations agent | Deferred | Implement only after audited workflows and integrations pass acceptance |
| CC-018 | Corporate accounts and explicitly assigned company users | Deployed; live-verified 2026-09-21 | Harbor company account without invented email; named verified contacts; no domain-wide auto-enrollment |
| CC-019 | Original PO upload, staff entry and review queue | Deployed; live-verified 2026-09-21 | Private PDF/PNG/JPEG up to 2 MB, duplicate-safe PO number, retained original and reviewed catalog/site mapping |
| CC-020 | Email-to-company PO intake | Mailbox setup required | Select receiving mailbox/provider; authenticate inbound events; match approved senders; retain originals and quarantine unmatched mail |
| CC-021 | Login-first customer entry | Deployed; live-verified 2026-09-21 | Existing-customer login is primary; new customer account creation is secondary |

## Existing baseline

The prior walkthrough captured deployed customer, office, Editor Lite, catalog, theme, URL Generator, factory and plant-manager screens. Catalog data, paid subscription checkout, QuickBooks activation and station commissioning were not complete at capture. Recheck live status before any sales representation.

## Operating decisions

- Free customer accounts and direct PO ordering are separate from the optional design subscription.
- Default proposed deposit is 30% upon order; approved account terms override the default. A PO is not payment evidence.
- Prices, taxes, freight and fees require approved commercial terms. No client-submitted price controls an invoice.
- Model order → destination allocations → shipment legs → serials → receiving → commissioning.
- Retain test results, original custody events and prior approvals. Changes append an audit record.
- Delivered does not mean received intact, and received intact does not mean approved to energize.
- Track planned destination and last confirmed location separately. Do not imply GPS tracking without a provider feed.
- Support warehouse-to-site transfers without losing the originating PO or unit history.
- Screening and preliminary drawings are not sealed engineering or guaranteed savings.

## Required client inputs

1. CleanCell legal entity and authorized commercial contact.
2. Approved SKUs, dimensions, weights, packing information, handling requirements and source datasheets.
3. Example PO for a multi-site order, customer ship-to list and release schedule.
4. Freight broker/carriers, integration availability, booking authority and insurance/claims responsibilities.
5. Receiving and commissioning checklists, evidence requirements and named approvers.
6. Example portfolio ZIP, supported input formats and desired report layout.
7. Subscription price, resale share, usage limits, order fee and settlement policy.

## Pilot acceptance scenario

Use an explicitly labeled test order for 56 units split across at least three destinations and two shipment legs. Prove duplicate submission safety; tenant/customer isolation; payment and QA holds; serial allocation; pickup evidence; partial receipt; damage handling; onward transfer; and commissioning approval. Reconcile every unit throughout. Test rejected actions as well as the happy path. No live charge, bank wire or carrier booking is part of this test without separate authorization.

## Change history

### 2026-09-21

- Captured expanded scope from four call-note photos and the customer's written clarification.
- Created isolated branch `codex/logic-po-lifecycle` to preserve concurrent editor changes.
- Drafted nonbinding MOU and executive summary. Commercial and legal unknowns remain explicit.
- Implemented authenticated catalog PO intake, exact destination allocation, duplicate prevention and account terms capture. PO submission does not accept, price or charge the order.
- Implemented serialized load planning, manual pickup/location/delivery events and per-unit receiving dispositions. Pickup checks payment reconciliation and component quality gates.
- Added customer purchase-order and staff logistics pages and navigation links.
- Offline verification: 17 lifecycle checks and 44 existing workflow checks passed; three changed/new HTML pages passed script parsing and path validation. Browser acceptance and production integration remain pending.
- No production deployment or client acceptance claimed.

## First-increment limits

- Evidence is a text/reference audit entry, not an uploaded photograph or signed delivery document.
- Carrier details are recorded manually; no carrier booking, GPS or tracking-provider feed is connected.
- A load supports up to 100 shipping serials. Existing fulfillment has a 400-component query limit; large assemblies need scaling work before a 56-unit production pilot.
- Legacy orders need a reviewed destination-plan migration. The new ledger does not infer destinations or automatically close the parent order.
- Load cancellation/replanning, shortage resolution, onward transfers and commissioning approvals are not implemented in this increment.
- Existing subscription, QuickBooks and bank setup dependencies still apply. Offline fixtures do not prove live provider behavior.
- Concurrent editor changes were deliberately excluded; integrate and retest before deployment.

### Launch integration — 2026-09-21

- Merged production `origin/main` into the isolated branch, preserving already released owner/editor fixes. Main checkout's uncommitted work remains untouched.
- PR: https://github.com/clearskyenergy/omega-core/pull/65. Implementation commit: `7802f90`.
- Added Company accounts & POs to the office, Company POs & deliveries to the customer portal, and a public PO inbox link to URL Generator.
- Company users are assigned by office administrators. A website/email domain is descriptive only and grants no access. No Harbor contact or password is invented.
- Office members can enter POs; company/contact administration requires an office administrator. Customer uploads are scoped to their verified account membership.
- Private originals use authenticated API downloads, not public Storage download tokens. File signatures/size are checked; attachments are untrusted and are not automatically executed, OCR-processed or treated as order instructions.
- The same company PO number cannot create both an uploaded draft and a second catalog order. Conversion preserves the original document and audit trail and still requires approved catalog SKUs and a real assigned billing contact.
- Automated portfolio/ZIP screening, order extraction, optimization and mailbox ingestion are not represented as live. Site/portfolio references can be entered with PO details; structured multi-site allocations are recorded during review.
- Full `npm test` passed with local dependencies, plus browser inspection of the company inbox and multi-destination review page. Release checks also passed on GitHub. Live promotion and company provisioning are recorded below when verified.

### Production release and live verification — 2026-09-21

- Deployed: https://silmarillion.clearskyomega.com. PR #65 merged into `main` (`7f8ba54`); implementation commit `7802f90`. Promoted Vercel deployment `dpl_CWCjSWEjfvQdMtrh7xxqLmHxWKBm`. Later `main` builds may serve the same source.
- Live company account: Harbor Charging under CleanCell, `company_2b06b22951a9dd00659e1c59c676c523cb69474e`, domain `harborcharging.com` (descriptive only), active, free customer account. No customer contact, login or access grant was created because none was supplied.
- Live office PO entry verified with `SYSTEM-VERIFY-20260921-NOT-AN-ORDER` (`po_05cf050cf5358cc9f885c689baa6b1c4a35016a2`). Closed as `po_declined` with note "System release verification complete; not a customer order. No charge or fulfillment." Audit record preserved.
- Live attachment upload verified with `SYSTEM-UPLOAD-20260921-NOT-AN-ORDER` (`po_0c5633c97a08f8ab51429c2491483a418aa9b147`) using the public ClearSky logo `assets/clearsky-omega-dark.png` (90,365 bytes), not a customer document. `POST /api/po-intake` returned 200; the original was stored under the private `logic-po/**` prefix.
- Live authenticated download verified: `GET /api/po-intake?…&id=…&file=…` returned 200 with a 90,365-byte `application/octet-stream` body and the original filename. Closed as `po_declined` with note "System upload and authenticated download verification complete; not a customer order. No charge or fulfillment."
- No invoice, charge, work order, wire, carrier booking or shipment was created by either test.
- Navigation verified signed in as ClearSky staff: customer portal shows "Company POs & deliveries"; URL Generator lists Customer walkthrough, Customer login, Company PO inbox, Editor Lite and Battery sizer; office shows "Company accounts & POs", "Logistics & receiving" and URL Generator; logistics page loads with its manual-ledger disclaimer. No console errors on any page.
- Test evidence: `scripts/test-order-lifecycle.js` gained a download-authorization check (28 lifecycle checks incl. cross-company denial). Full `npm test` passed before merge; mocks do not prove payment, carrier or mailbox providers.
- Finding (open): `api/logic-logistics.js` lists every order for the org in its Order selector, so declined and unconverted PO intake records (`PO-IN-…`) appear there as "legacy order". The page refuses to plan them without a reviewed destination plan, so no movement can be recorded, but the selector should exclude `po_declined` and unconverted intake.
- Improvement (open): the Update review action on `po-inbox.html` uses two browser `prompt()` dialogs; an inline review form would be easier to operate and to automate.
- Resolved later the same day by PR #68 (`8f0cb5b`): `api/logic-logistics.js` excludes unconverted and declined PO intake server-side (regression test added), and the inbox review action is an inline status/note form. Live-verified after the production deployment: both declined test POs show the inline form with "Declined" selected; the logistics Order selector no longer lists `PO-IN-…` records.
- Unresolved launch dependencies unchanged: approved CleanCell catalog (live catalog empty), QuickBooks activation, subscription checkout ($799/month shown, not chargeable), Harbor contact emails, email-to-PO mailbox, portfolio/ZIP automation, carrier booking and GPS, processing fee and bank settlement, and scaling the 100-serial load / 400-component query limits before a large pilot.

## Update discipline

For each release, append date, task IDs, commit/PR, test evidence, deployment URL/version, remaining limits and acceptance owner. Update the table only when evidence supports the new state. Do not remove earlier decisions or mark external integrations complete based on mock tests.
