# Packaging Phase 4 — admin, signup and subscription billing

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Draft PR [#139](https://github.com/clearskyenergy/omega-core/pull/139),
stacked on Phase 3. [Vercel preview](https://omega-core-git-codex-packaging-phase-4-clearsky-usa.vercel.app).
No live organization, trial, billing date, QuickBooks
record, environment variable or deployed rule was changed. Runtime flags
remain off by default; the proposed book remains disabled in the seed.

## What changed

The tenant record has Package, What Activate writes, Customer's Your plan,
and History tabs. Both staff and tenant admins use the same record page;
only staff receive activation controls. The shared ES5 module menu renders
server catalog prices, included usage, dependencies and beta coverage. The
summary requests server quotes. Annual prepay excludes transformation credit,
per Tommy's decision. Staff review a server preview tied to the exact org,
billing profile and price-book revision before applying it.

Signup's Billing step stores contact/address/tax/PO/company information in
`billing/profile`, never `tenant_public`. Pending signup does not start a
trial. Approval creates/finds the sandbox QuickBooks customer and starts the
one capped trial. The approved selection replaces the signup proposal.
Original signup day anchors recurring billing, with short-month clamping.
Existing trial dates cannot be rewritten through this flow.

At trial end, the first invoice prorates to the next signup-day anchor.
Recurring invoices, credit allocation, annual prepay and service fees are
computed in API libraries. The first-year waiver expires at renewal. Invoice
identity is tenant plus billing date; prepared invoice plans and QuickBooks
request IDs survive retries. QuickBooks computes tax. Neither a zero balance
nor a signed webhook body is payment proof: reconciliation rereads invoices
and allocated payments before granting modules. A reversal or reconciliation
failure closes production access. A previously paid renewal gets the proposed
10-business-day grace, then Lite; an unpaid first invoice stays read-only.

`billing-run` starts a daily pass; the existing five-minute worker continues
the bounded tenant scan and payment polling. Invoice history reconciliation
advances two invoices per tenant tick so historical reversals are revisited.
The signed Intuit webhook remains a hint, with no direct entitlement writes.
The day-11 notice and approval/invoice messages use the existing notification
collection and mailer. SMTP claims prevent normal duplicate sends; ambiguous
crashes or failed sends are marked for operator review rather than silently
resent. The browser refreshes the server projection every minute and closes
presentation at the access deadline while the API and rules enforce it.

Packaged billing/profile writes now require the API, including for staff
browsers. Project and tool-data writes and project/map uploads deny unpaid
production while saved-work reads remain. Staff can upload a private exemption
certificate; certificates have no public download links and are not deleted.
Legacy un-packaged records retain their prior behavior. The API authenticator
now requires a verified ClearSky domain even if an old token says role=staff.

## Verification

- Full `npm test` and `npm run check:pages` passed locally. Hosted results are tracked on the PR.
- Packaging unit/API suites: 2,058 assertions, including 81 billing-foundation,
  52 lifecycle, 45 API/worker and 141 access assertions.
- Signup: 39 checks, including private profile, pending/no-trial, duplicate and
  concurrent signup, invalid email verification and production-env refusal.
- Local Firestore and Storage emulators: 57 checks in `demo-omega-packaging`.
  These run the actual rules, including paid/unpaid/expired/overlong-trial,
  private profile, certificate, staff browser-write refusal and JDA invariants.
- New actual-page browser check: 46 checks and 20 screenshots. The tenant and
  signup HTML use the real API handlers over an in-memory Firestore double.
  QuickBooks and email are mocked. Lite/Field, light/dark, four tabs, 1024px
  and 768px layouts, tenant-admin restrictions and approval/signup are tested.
- Inherited full-editor matrix and existing page checks remain required.

## Screenshots

| Package | Package tab | Server write preview | Customer preview | History |
|---|---|---|---|---|
| Lite, light | [image](screenshots/packaging-phase-4/lite-light-package.png) | [image](screenshots/packaging-phase-4/lite-light-writes.png) | [image](screenshots/packaging-phase-4/lite-light-customer.png) | [image](screenshots/packaging-phase-4/lite-light-history.png) |
| Lite, dark | [image](screenshots/packaging-phase-4/lite-dark-package.png) | [image](screenshots/packaging-phase-4/lite-dark-writes.png) | [image](screenshots/packaging-phase-4/lite-dark-customer.png) | [image](screenshots/packaging-phase-4/lite-dark-history.png) |
| Field, light | [image](screenshots/packaging-phase-4/field-light-package.png) | [image](screenshots/packaging-phase-4/field-light-writes.png) | [image](screenshots/packaging-phase-4/field-light-customer.png) | [image](screenshots/packaging-phase-4/field-light-history.png) |
| Field, dark | [image](screenshots/packaging-phase-4/field-dark-package.png) | [image](screenshots/packaging-phase-4/field-dark-writes.png) | [image](screenshots/packaging-phase-4/field-dark-customer.png) | [image](screenshots/packaging-phase-4/field-dark-history.png) |

[1024px](screenshots/packaging-phase-4/field-tablet-1024.png) ·
[768px](screenshots/packaging-phase-4/field-tablet-768.png) ·
[Signup billing](screenshots/packaging-phase-4/signup-billing.png) ·
[Staff billing profile](screenshots/packaging-phase-4/field-billing-profile.png)

## Sandbox enablement and operator checks

1. Seed the proposed book with `scripts/seed-pricebook.js` (dry run first).
2. Sync its sandbox items with `scripts/qbo-sync-items.js`; explicitly supply
   the sandbox realm, income account and reviewed item tax treatment.
3. Run `scripts/enable-packaging-sandbox.js` read-only. Its `--apply` requires
   the exact `--expected-hash` printed by that dry run, an unused book, every
   item binding and a stored connection in that same sandbox realm.
4. Preview environment only: `QBO_ENV=sandbox`, `PACKAGING_SIGNUP_ENABLED=true`,
   `PACKAGING_BILLING_ENABLED=true`, existing QBO/Firebase credentials and
   `CRON_SECRET`. No new OAuth scope. Do not overwrite a production connection.
5. Use a new synthetic organization. Signup marks it `packagingSandbox:true`.
   Applying a package to any unmarked organization is refused. Approval or
   activation freezes the used book. No migration applies this flag to a live
   tenant. Manually invoke the authenticated runner in Preview, since Vercel
   scheduled crons operate on Production deployments.
6. Real sandbox acceptance must still establish customer/profile updates,
   invoice tax and online-pay-link behavior, payment, renewal and reversal.
   This has **not** been performed with the connected QuickBooks company.

To repeat rule checks, install `@firebase/rules-unit-testing` and `firebase`
in a separate test environment, run Firestore at localhost:8187 and Storage
at localhost:9297 under project `demo-omega-packaging`, then run
`npm run test:packaging:rules`. `RULES_TESTING`, `FIREBASE_FIRESTORE` and
`FIREBASE_STORAGE` can point to those modules. The check loads the repository's
actual rules. Emulator data deletion is local test reset, not a migration.

## Remaining acceptance and later phases

- The reference prototype's source supplied the layout/tokens. Automatic
  approval review rejected opening that reference in the browser; no bypass
  was attempted. Side-by-side visual acceptance of that reference remains
  outstanding. Screenshots above are of the implemented application.
- No connected sandbox payment, hosted authenticated customer acceptance,
  price-book sign-off, production merge, rule deployment or live migration
  is claimed. All fixture invoices and emails are mocks.
- Historic browser-engine ports and broad release inventory from Phase 2
  remain release prerequisites. These rules add packaged project/tool-data
  payment gates; they are not a redesign of all legacy product collections
  or Storage membership policy.
- Checkout for existing packaged subscriptions, the customer opt-in preview,
  proration of plan changes and quarterly removals are Phase 5. The current
  customer tab is honest read-only presentation; staff cannot use activation
  to bypass that upcoming payment flow. Proposal and usage are Phases 6–7.
- Proposed default prices, fee amounts, grace, packs, Enterprise floor and
  card-on-file-off remain price-book configuration. Annual prepay's no-credit
  decision is explicit `policy.annualTransformationCredit:false`.
