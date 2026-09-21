# Omega Logic — OEM operations

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## What this implementation does

The verified `tom@clearsky-usa.com` account gets an **Omega Logic** destination
in the Where to chooser. `/omega-logic` reads the existing OEM/white-label tenant
registry. `/omega-logic?org=cleancell.us` links customer intake/platform lite,
customer payments, office operations, factory records, white-label setup/editor,
and `/mission?view=logic&org=cleancell.us`. No customer domain or hostname is
invented: links remain on the currently deployed origin.

ClearSky can exclude a prospect from the directory with
`omega_orgs/{orgId}.logicDirectoryHidden: true`. This is a presentation flag,
not an access grant or revocation; the account and its records remain intact.

OEM admins/members can open their org-specific workspace; the cross-tenant
directory, commercial approval, accounting configuration and wire ledger are
restricted to the verified owner account. Buyers still use `/api/my-orders`
with verified email ownership, not the office APIs. Device tokens only operate
their paired station. New collection paths are **subcollections** of existing
orders, orgs, works orders and integrations. Firestore client writes remain
denied. No second database, runtime agent or browser-side commercial logic.

## Commercial protocol

1. A website request enters the existing `orders` queue. Requests/estimates are
   not automatically treated as a customer's accepted contract.
2. ClearSky approves the **customer selling price** in Omega Logic. Existing
   `pricing` is the internal fulfillment price and is never silently invoiced
   to the buyer. `tenantPricing` is the approved public total.
3. The immutable `logic.commercial` snapshot resolves account-specific deposit
   and due-date terms over OEM defaults. Standard is **30% down, due on receipt**.
   Existing `terms.netDays` is respected when `dueDays` is absent. Discounts,
   freight and applicable tax must already be reflected in the approved base;
   OMEGA does not invent a tax jurisdiction or calculate tax.
4. The configurable **0.25% initial ClearSky processing fee** is **added** to
   the base price, separately disclosed in the portal and invoice. It is not
   an estimate of Intuit/card/ACH charges. Subscription billing is separate.
   The owner can change the rate/fixed fee before approval; existing invoices
   cannot be retroactively repriced. Fee disclosure and applicability require
   commercial/accounting review before launch.
5. A durable job creates the deposit invoice in ClearSky's pinned QuickBooks
   company and retrieves its actual Intuit-hosted payment URL. The browser never
   fabricates a payment URL, and invoice email is not explicitly sent by OMEGA.
   Intuit's own company communication settings should be checked in sandbox.
6. Intuit notifications are HMAC-verified, deduplicated and retained. The worker
   independently rereads invoices and linked **Payment** allocations. An
   invoice with zero balance due to a credit is not cash. Customer, currency,
   total and allocation must match. Payment reallocation/reversal freezes
   fulfillment. This is accounting-payment evidence, **not bank settlement**.
7. After acceptance AND the required deposit, one Firestore transaction reserves
   eligible finished assemblies and their full component genealogy, or creates
   the outstanding manufacturing requirements in `plant_works_orders/wo_<id>`.
   Finished stock must have every component at Ready with passing machine
   evidence and no hold/NCR. Original works-order identity and scan history
   are retained. An unrecorded unit is never invented to fill demand.
8. Plant admins register actual serials, component parents, lot/supplier,
   capacity and firmware metadata. The existing scanner and EOL endpoints
   record immutable events. Human scans cannot replace a machine pass; a
   failed retest cannot be bypassed by clearing a hold and scanning onward.
9. When every ordered shipping unit and component is Ready, the worker queues
   the balance invoice automatically. Office can request the same check.
   Shipment recording requires full quantity, all components passed, no
   commercial hold and recorded final payment. The carrier/tracking/BOL is
   recorded by an authorized operator; no carrier booking API is integrated.

## Wire payments: deliberately distinct from accounting

The requested method is bank wire. There is no bank API selected or connected.
The office supports cumulative **bank-confirmed cleared receipts**, calculates
the corresponding CleanCell proceeds (excluding the added ClearSky fee), and
prepares the amount ready to wire. Once the actual bank wire is sent, ClearSky
records its cumulative amount and bank confirmation reference. Replaying the
same total does not add it twice. Amounts above verified receipts/cleared OEM
proceeds are rejected. These buttons **do not send money**.

Fully automatic wires remain blocked on a bank/provider connection, verified
beneficiary, settlement webhooks/API evidence, authorization limits, and an
approved payout milestone. A QuickBooks BillPayment would merely be an
accounting record and is not substituted for a real transfer. Refund receipts,
chargebacks and reconciliation exceptions need human accounting review until
the settlement provider is integrated. Cancellation freezes processing; it does
not automatically void invoices, refund money or return serials to stock.

## Launch checklist — not completed by a code edit

- Deploy the code through the existing GitHub → Vercel project. Deploy
  `firestore.rules` and `firestore.indexes.json`; wait for indexes to build.
  Run `npm run test:logic` and `npm test` before rollout.
- Configure server-only `FIREBASE_SERVICE_ACCOUNT`, `QBO_CLIENT_ID`,
  `QBO_CLIENT_SECRET`, `QBO_ENV` (`sandbox` first), and `QBO_REDIRECT_URI`
  (`https://<real-host>/api/logic-connect`). Register that exact callback at
  Intuit. OAuth state is single-use, expiring, cookie-bound; credentials never
  reach the client. A different company cannot silently replace a connected
  realm because orders are pinned to it.
- Connect ClearSky's company from the owner hub. Confirm QuickBooks online
  ACH/card payments are enabled and the company can return invoice payment
  links. Missing links remain missing, not fabricated.
- An accountant must approve the **installment item ID and NON-tax-code
  treatment** before enabling the workflow. Current invoices are installments
  of an approved gross amount, not automated sales-tax invoices. Do not enable
  in production if the business requires a different deposit liability,
  revenue recognition or tax workflow. Implement that accounting mapping first.
- Set `QBO_WEBHOOK_VERIFIER_TOKEN`; configure Intuit Invoice and Payment events
  to `/api/logic-webhook`. Set Vercel `CRON_SECRET`. The 5-minute
  `/api/logic-worker` schedule requires a Vercel plan supporting that frequency.
  It processes three due orders concurrently, uses leases and capped retry
  backoff, and continues reconciliation when webhook delivery is missed.
- Verify the real `omega_orgs/cleancell.us` record, member roles and active
  subscription. The owner configuration adds `omega-logic` + `whitelabel`
  entitlements but **does not charge** or assign an invented subscription price.
  Use existing platform billing for the agreed subscription amount.
- Publish real CleanCell product SKUs, footprint data and approved prices in
  the existing storefront setup. The checked-in catalog seed is intentionally
  empty; demo products are not production datasheets. Mint/reuse the allowed-
  origin embed key and install the provided snippet on cleancell.us.
- Platform lite/sizer/site placement and the white-label sitemap editor use
  existing shared applications. Full designer buyers still need explicit
  account provisioning through existing signup/tenant approval. This bundle
  does not grant anonymous visitors full editor access or move them into the
  OEM's tenant. Automated designer-seat resale billing is not implemented here.
- Pair each scanner and EOL rig; token displayed once and stored hashed.
  Configure the rig to post actual measurements to `/api/mes-test-result`.
  Test a pass, fail, hold/retest, duplicate scan, cancellation and shortage.
- Sandbox end-to-end: price → link → partial deposit → full deposit → allocate
  stock/make shortage → test → ready → balance → paid → shipment. Verify ledger
  amounts against Intuit and the bank before using real orders.

## Operational bounds and verification

Registration is an atomic complete-assembly batch of up to 400 serials.
Readiness currently refuses orders over 400 total components rather than
silently declaring a clipped roster ready. Allocation examines at most 100
stock roots / 200 components per assembly and reserves at most 350 components
per transaction; additional demand conservatively becomes manufacturing work.
Large cell-count installations need a partitioned release/readiness protocol
before production use. Office/factory lists show newest 100 rows; exact serial
lookup reads its latest 100 events, while older events remain stored.

`npm run test:logic-workflow` uses an in-memory transactional double (enforcing
read-before-write) and mocked Intuit responses. It is not a substitute for
Firestore emulator contention tests or Intuit sandbox/payment settlement tests.
It covers owner/tenant boundaries, default/override terms, integer fee math,
invoice idempotency after an uncertain response, payment proof, acceptance
gates, stock double-allocation, genealogy, held components, reversal blocking,
serial registration, wire limits, subscription suspension and buyer privacy.

The separate AI operator remains deferred. The deterministic, auditable
workflow is the substrate it can eventually invoke, not something it may bypass.
# Tenant enrollment and company sign-in

The verified ClearSky owner can enroll an existing tenant through **Admin →
Tenants & Users → Manage → Omega Logic bundle**. Enrollment retains the tenant's
plan and other add-ons, adds Omega Logic/white-label entitlements, and records
the four Editor Lite module selections in `billing/current.editorLite`.
It does not charge the subscription or activate QuickBooks automation.

Editor Lite opens at `/editor-lite.html?org=<tenant-domain>`. The four switches
select its guided-build modules; other modules remain labeled “not in plan”.
BESS target placement creates a generic concept until actual equipment is
configured. Compute, EV and solar open the canonical guided configuration
dialogs. Single-line, BOM, proposal, drawing-set and save commands use the
existing editor, including its existing validation and tier requirements.
This is an authenticated account feature, not the anonymous website sizer.

The company administrator action creates an unverified Firebase Auth account
and an `omega_orgs/{orgId}/members/{uid}` admin membership. It never resets an
existing password or grants ClearSky/custom staff claims. Passwords are not
written to Firestore or audit records. The account holder must verify their
mailbox and replace the temporary password before operational use. Company
admins see Office and Plant destinations at `/login`; the APIs enforce verified
identity, active membership, tenant scope, and subscription separately from
the fulfillment automation switch. An active bundle with automation disabled
can read operations and register inventory, but cannot release an unpaid order.
