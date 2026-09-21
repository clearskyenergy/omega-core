# CleanCell OMEGA Logic upgrade log

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Updated 2026-09-21. Client: CleanCell (`cleancell.us`).

**Current release status: first increment implemented and offline-tested in an isolated branch; not deployed.** Portfolio ZIP screening, carrier integration, onward transfers and commissioning approval remain open scope.

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

## Update discipline

For each release, append date, task IDs, commit/PR, test evidence, deployment URL/version, remaining limits and acceptance owner. Update the table only when evidence supports the new state. Do not remove earlier decisions or mark external integrations complete based on mock tests.
