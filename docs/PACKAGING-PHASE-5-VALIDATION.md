# Packaging Phase 5 — subscribe in the editor, Your plan, change invoices

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Draft PR [#140](https://github.com/clearskyenergy/omega-core/pull/140),
stacked on Phase 4 ([#139](https://github.com/clearskyenergy/omega-core/pull/139)).
[Vercel preview](https://omega-core-git-codex-packaging-phase-5-clearsky-usa.vercel.app).
No live organization, trial, billing date, QuickBooks record, environment
variable or deployed rule was changed. Runtime flags remain off by default;
the proposed book remains disabled in the seed; Step B (card on file) is not
built and needs the QuickBooks Payments permission first.

## What changed

**Bought versus switched on.** `billing/current.subscription` is what the
tenant bought (modules, plan, interval, logins, since). It is written by
approval, by activation and by a paid or reversed change; reconciliation never
writes it. `billing/current.modules`, `toolAccess` and the caps are derived
from the subscription and the payment state of the subscription invoices.
This closes a Phase 4 defect found in review: `past_due_lite` overwrote
`modules[]` with Lite and the next recurring invoice then billed Lite, so a
late payer silently lost the package. Now a late payer drops to Lite for a
while and the recurring invoice keeps billing what they bought.

**A change is its own invoice record.** `billing/current/invoices/change-<id>`
carries `kind: 'change'`, the modules added, the plan before and after, the
cycle, the lines and its own QuickBooks DocNumber and memo ("OMEGA
subscription change"). States: `unpaid` → `paid`, `reversed`, `expired`
(the cycle rolled before it was paid) or `cancelled`. Reconciliation moves a
paid change into the subscription and a reversal of a paid change back out
unless a later paid subscription invoice already covers the modules. A
payment that arrives after the cycle rolled or after a cancel is still
honoured, because the customer paid, and the record is marked
`reviewRequired`. Only one change may wait for payment at a time. Cancelling
never voids the QuickBooks invoice; staff void it there.

**`api/_lib/plan-change.js`** (server-only money math). `quote` adds what a
module requires, keeps the plan the tenant chose and only offers a cheaper
tier as a steer, prices the difference between the before and after quotes
as invoice lines that each land on an item QuickBooks already has, scales
them to the days left until the billing date, discloses a changed annual
service fee, and returns display strings the browser shows as they are.
Inside a paid tier a $0 addition is `included` and activates immediately
(Tommy, 2026-09-26, option 1); a trial, unpaid or annual-prepay tenant is
refused with the reason. `apply` replays a finished request by its operation
record and request fingerprint, refuses a preview older than ten minutes or
one whose inputs moved, holds a `changeLock`, creates the sandbox QuickBooks
invoice only when something is owed, and for $0 writes the subscription and a
paid change record in one transaction. `cancel`, `removal` (queued for the
quarterly review, access unchanged) and `summary` complete the endpoint.

**`POST /api/plan-change`.** GET returns the plan summary; POST takes
`quote`, `apply`, `cancel`, `request-removal` and `withdraw-removal` with a
field allow-list. A tenant caller needs a verified email, their own
organization and a tenant admin role; members are told to ask their
administrator. ClearSky staff may act for a tenant by passing `orgId`.

**The editor's + Modules gallery** (`omega-package-menu.js`, ES5) gained the
subscribe control: Subscribe → the server quote ("$760.80 today (24 of 30
days left until your billing date, 2026-10-20)", "then $2,250/month on the
20th") → "Subscribe and pay" (invoice and pay link, the card waits for
payment, Cancel request) or "Turn it on" for an included module. The tools
appear when `OmegaCaps.fetchPackage` re-reads the server projection; the
browser prices nothing and grants nothing. Non-admins see "Ask your workspace
administrator to add this module."

**Your plan** in the tenant record (`admin/package-panel.js`) is the same
control: plan and monthly price from a server quote, the billing day and next
invoice, what is waiting for payment, In your package, removals at the next
review, and Add to your package. Staff see it as the customer does and any
action is taken on the customer's behalf. `api/tenant-package.js` gives a
non-staff caller a customer projection: whitelisted billing fields, the
service fee as mode and amount only, reduced history, no audit, no staff
notes, realms or before/after patches.

**Phase 4 fixes from the adversarial review**, all covered by tests: a
transient QuickBooks failure during reconciliation keeps the record's state
and retries (three in a row mark it for review) instead of closing a paying
tenant's access; invoice line validation compares a multiset of (type, item,
amount) because QuickBooks re-sequences discount lines; the transformation
credit window starts at trial end, not during the trial; `canApply` requires
`QBO_ENV=sandbox` as `guard()` does; a plan line's description lists the
modules it includes; a waived service fee is written on the invoice memo;
`issue()` bills the subscription record rather than the pre-approval
proposal.

## Verification

- Full `npm test` and `npm run check:pages` passed locally after every change.
- `scripts/test-plan-change.js`: 165 assertions on the Firestore double with
  a mocked QuickBooks driver, in `npm run test:packaging`. Sections: money
  math (Field → à la carte remainder lines, Pro upgrade as one plan line,
  steer to a cheaper tier, service fee disclosure), billing-day edges (month
  ends, the 31st), gates (trial, unpaid, annual, member, staff for a tenant,
  unknown module, Lite), pay first then the modules (invoice, notification,
  reconciliation to paid, subscription and grant), reversal inside the cycle
  removing only its modules, $0 inside a paid tier activating now, late
  payment after the cycle rolled flagged and honoured, cancelling a pending
  change, concurrency and stale previews (replay, fingerprint, ten-minute
  window, lock), a webhook body or client field never granting, the Phase 4
  fixes above, and removals waiting for the review.
- Existing packaging suites still pass: billing foundation 81, activation 52,
  billing API and runner 45, access 141, subscription pricing 559.
- `scripts/render-packaging-billing.js`: 66 checks and 25 screenshots. The
  tenant record page uses the real `api/tenant-package.js` and
  `api/plan-change.js` handlers over the in-memory Firestore; QuickBooks and
  email are stand-ins. Your plan is exercised as the tenant owner in light and
  dark: a quote, a pay-first change with its pay link, an included $0
  addition switching on, and a member refused.
- `scripts/render-packaging-workspaces.js` (the full canonical editor): 202
  checks, 22 of them new. The
  gallery is exercised as the workspace owner of a paid Field tenant against
  the real `/api/plan-change` handler over the in-memory Firestore: Storage
  tools gated before purchase, Subscribe on every unowned card, a
  server-priced prorated quote, one sandbox change invoice with nothing
  switched on before payment, a cancel that leaves the record marked
  cancelled, a $0 addition inside the tier that switches on at once, the
  gallery no longer offering it, and the Storage tools appearing without
  staff. Eight captures in light and dark.
- The shared fixture for both render checks is
  `scripts/_lib/packaging-billing-fixture.js` (one admin stand-in, one
  QuickBooks stand-in, one paid tenant).

## Screenshots

| Where | Quote | Waiting for payment | Included $0 addition | Afterwards |
|---|---|---|---|---|
| Editor, light | [image](screenshots/packaging-phase-5/editor-subscribe-quote-light.png) | [image](screenshots/packaging-phase-5/editor-subscribe-waiting-light.png) | [image](screenshots/packaging-phase-5/editor-subscribe-added-light.png) | [Analyze tab with Storage tools](screenshots/packaging-phase-5/editor-after-subscribe-light.png) |
| Editor, dark | [image](screenshots/packaging-phase-5/editor-subscribe-quote-dark.png) | [image](screenshots/packaging-phase-5/editor-subscribe-waiting-dark.png) | [image](screenshots/packaging-phase-5/editor-subscribe-added-dark.png) | [Analyze tab with Storage tools](screenshots/packaging-phase-5/editor-after-subscribe-dark.png) |
| Your plan, light | [image](screenshots/packaging-phase-5/your-plan-quote-light.png) | [image](screenshots/packaging-phase-5/your-plan-waiting-light.png) | [image](screenshots/packaging-phase-5/your-plan-included.png) | |
| Your plan, dark | [image](screenshots/packaging-phase-5/your-plan-quote-dark.png) | [image](screenshots/packaging-phase-5/your-plan-waiting-dark.png) | | |

The Phase 4 customer-tab captures (`packaging-phase-4/*-customer.png`) were
re-taken because that tab is now Your plan; the Phase 3 gallery captures
(`packaging-phase-3/lite-modules-*.png`) because the cards now carry the
control. Other re-renders that differed only by anti-aliasing were restored.

## Sandbox enablement and operator checks

The flags and steps are Phase 4's (`PACKAGING_BILLING_ENABLED=true`,
`QBO_ENV=sandbox`, a `packagingSandbox: true` tenant, the enabled proposed
book with synced sandbox items, a stored connection in that sandbox realm).
Nothing new is required. To exercise this phase in the sandbox:

1. As the owner of a sandbox tenant whose current cycle is paid, open the
   editor's + Modules tab, Subscribe to a module outside the tier, and pay
   the change invoice by its QuickBooks link.
2. Run the authenticated billing runner (or wait for the five-minute worker)
   so reconciliation re-reads the invoice; the module joins the subscription
   and the tools appear on the next projection refresh. The Intuit webhook is
   only a hint.
3. Subscribe to a module inside the tier's cap: no invoice, it switches on
   immediately.
4. Cancel a pending change and void its invoice in QuickBooks; pay a change
   after cancelling to see it honoured and marked for review.
5. Real sandbox acceptance of a paid change, a reversal and an expired change
   has **not** been performed with the connected QuickBooks company.

## Remaining acceptance and release debt

Phase 5's own:

- Cancel does not void the QuickBooks invoice; a change paid after expiry or
  cancel needs a person to invoice the gap or refund (it is flagged).
- Removals are recorded, not executed; the quarterly review is manual.
- Additions to an annual prepay and any Enterprise change are quoted by
  ClearSky, not self-served. Members never see the control (roadmap §11.3,
  default admins only).
- A paid change joins the subscription only when reconciliation runs; the
  editor shows "waiting for payment" until then.
- Step B (saved card, instant charge) is not built.
- No connected sandbox payment, hosted authenticated customer acceptance,
  price-book sign-off, production merge, rule deployment or live migration is
  claimed. All fixture invoices and emails are stand-ins.

Carried from the Phase 4 adversarial review, not fixed here:

- Recurring invoice identity is tenant plus billing date; a second invoice
  on the same date would collide.
- Activation without a trial holds a live tenant at `awaiting_payment`
  (read-only production) until the first invoice is paid; legacy tenants
  need a paid activation path.
- A tenant that never pays keeps receiving recurring invoices.
- Omega Logic modules are priced and invoiced but the Logic endpoints do not
  yet gate on them.
- Read-only for unpaid production covers projects, tool data and uploads;
  other legacy collections are not covered.
- Tax exemption is self-declared at signup; staff review the certificate.
- Invoice DocNumbers depend on the QuickBooks company's custom transaction
  numbers preference.
- `billingDay` is the UTC day of signup.
- Bumping the price-book `VERSION` strands tenants frozen on the old book.
- `reconcileCursor` compares dates as strings; the open-period state lives in
  three places (policy, reconciliation, the plan-change gate); the day-11
  notice names the plan by its key.
- Historic browser-engine ports and the Phase 2 release inventory remain
  release prerequisites.
