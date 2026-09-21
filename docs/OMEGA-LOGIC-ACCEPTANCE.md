# Omega Logic — demo-to-production acceptance

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Reference: https://claude.ai/artifact/T8JRXaeisQJMxskt4cbV3x

This is a release checklist, NOT a claim that the whole demo is deployed.
The demo simulates identity, records and payments; its UI behavior is the
product reference, not authority to fake real invoices, tests or fulfillment.

## Product boundaries confirmed by the owner

ClearSky → Omega Logic client (CleanCell) → that client's customer accounts.
Client customers are NOT OMEGA platform tenants, platform users or OEM staff.
Each client receives the same customer/office/plant flows with configurable
branding, catalog and licensed modules. No tenant-specific core copies.

- Free customer account: orders, documents, terms/agreements and profile.
- Editor Lite customer subscription: initially USD 799/month; owner-configurable
  offer. Site design, guided build, plot plan/single-line/proposal/drawing set/
  estimated BOM exports, quoting and ordering. It does not grant platform or
  office access. The demo also shows Grid Atlas; its scoped customer integration
  remains a release item rather than a link to an unrestricted platform tool.
- OEM Omega Logic bundle subscription is separate from that customer purchase.
- Default equipment deposit is 30% upon order; negotiated terms override it.
- ClearSky's processing fee is added to the order price, not deducted from the
  OEM equipment proceeds. Provider charges are not guessed.
- Support admin trust requires explicit ClearSky-owner provisioning; an admin@
  prefix on a self-registered account never bypasses verification.
- The autonomous AI operator remains a separate priority.

## Release gates

| Surface | Required acceptance | Current evidence / outstanding work |
|---|---|---|
| Website | Real catalog, anonymous sizer, scaled site study, order request, allowed-origin embed | Reusable `/customer-start.html?org=…` with office copyable URL and scoped public key lookup; actual SKU/footprint/price data and website installation still required |
| Customer identity | Self-signup or office-created account; verified email joins same record; no staff grant | Atomic helper and office registry implemented; offline tests; production email-link round trip still required |
| Customer portal | Demo sidebar: Orders, Documents, Terms & agreements, Design studio, Account | Implemented shared layout and API-backed views; browser checked with explicitly labeled local fixtures |
| Customer privacy | OEM + verified email scope; internal cost/margin never returned; suspension respected | Projection and access tests; no direct buyer Firestore access added |
| Editor Lite subscription | $799/month offer, checkout, webhook reconciliation, failed renewal/cancel/reversal handling | Configurable offer implemented. Recurring processor decision/connection, checkout and paid entitlement lifecycle outstanding; purchase disabled |
| Customer design | Own saved projects and sizing results; entitlement checked at API; no shared email-domain workspace | Customer-scoped transactional saves/reloads, module gates, expiry and optimistic revisions implemented/tested. Canonical drawing iframe does not initialize platform Auth/Firestore. Approved time-limited owner trials supported; paid lifecycle still blocked on processor setup |
| Editor Lite parity | BESS/compute/EV/solar tenant switches; bounded canvas; real guide; five export views; Grid Atlas as entitled | Actual BESS placement and BOM view browser-checked. Buyer adapter implemented; complete four-module/export/reload visual rehearsal and scoped Grid Atlas remain outstanding. Legacy financial/engineering export assumptions require review before issuance |
| Quote → order | Saved revision/SKU/quantity linked to buyer/order; server pricing; no client price authority | Buyer design quote API pins verified identity, published SKU and saved revision, stores immutable submitted snapshot, and deduplicates retries. Offline isolation/conflict tests pass; no real catalog or live order was created |
| Office | Customers, invitations, order history, future-order terms, work orders | Profile/contact/address/access editing and owner-only trial control added. Changes audited; invoices/terms not overwritten by profile updates. Full live role walkthrough still required |
| Deposit | Correct invoice, payment link, partial/full payment, retry after timeout, no release from a browser flag | Mocked QuickBooks workflow tests pass; connected Intuit sandbox run required |
| Plant | Real serialized cells/modules/assemblies, genealogy, fixed paired station, sequential scans, actual machine tests, holds/retest | Shared demo theme applied. Pairing now requires explicit successful station verification and creates no fake scan record. Hardware rehearsal and full live floor walkthrough outstanding |
| Stock | Allocate only passed/unheld stock; prevent double allocation; manufacture exact shortage; attach genealogy | Transactional-double tests pass; emulator contention and hardware evidence required |
| Logistics | Readiness across entire assembly, final invoice/payment gate, carrier/BOL/tracking visible to buyer | Core record flow exists; production document handling/carrier and delivery exception walkthrough outstanding |
| OEM settlement | Cleared-fund proof, retained processing fee, payment-to-wire reconciliation | Ledger only. No bank wire initiator is configured; automatic wires must not be advertised as live |
| ClearSky | Tenant directory, customer provisioning, offers, billing, internal order visibility, Jarvis links | Existing owner gates plus additions; full deployed role walkthrough outstanding |
| Replication | New tenant configured through registry, branded domains/mail/catalog/modules/prices; no source fork | Registry-driven paths exist; repeat complete rehearsal on a second isolated test tenant |

## Required end-to-end rehearsal

Use test identities and Intuit/payment sandbox data, never fabricated production
units or invoices. Create customer from office → customer proves email → same
account/terms → subscription paid → design saved/reloaded → exports → quote →
order → deposit invoice → partial deposit (no release) → sufficient payment →
stock allocation/manufacturing shortage → failed test/hold → genuine retest →
ready → balance → paid → shipment → customer documents/unit record → cleared
receipts and OEM settlement. Repeat callbacks/scans and concurrently allocate
the same stock. Cancel/reverse/suspend at intermediate steps. No duplicate
invoice, stock allocation or payout; no cross-customer or cross-tenant reads.

Release requires both business-path success and refusal-path evidence, plus
visual checks of each role at desktop/tablet/mobile sizes. Local fixture screenshots
and mocked service tests alone are not production acceptance.
