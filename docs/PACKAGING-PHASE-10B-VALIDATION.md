# Packaging Phase 10B — the Ladder: pay and change the plan in settings

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Branch `codex/dashboard-billing`, on `main` after Phase 10A (#146), the
sign-off (#147), the ribbon icons (#148) and the signup flow (#149).
No live organization, billing record, QuickBooks record, environment
variable or deployed rule was changed. Runtime flags remain off.

Tommy, 2026-09-26: *"we need that they can pay in their settings no
different than I can in Claude"*; *"in the dashboard in settings there
needs to be a page that they can open to opt into other services"*; *"call
the settings page for the opt in the 'Ladder' — focus is build your own
experience and pay for what you need to run your business; for Omega Logic
each department is an opt-in: customer, office, plant"*; *"for NextNRG they
are a legacy account and they paid for the whole year so they will just
have everything available to them"*.

## What changed

**The Account panel's Billing & plan, for a packaged workspace.** The
dashboard's Account panel (the *Account* button, `index.html`) already had
a Billing & plan section for the legacy plans (tier, Stripe portal, Stripe
invoices). A workspace on the QuickBooks package now gets its own section
there, `renderPackagedBilling()`: the **package** bought and, when it
differs, what is **on now**; the **status** (awaiting your first payment,
active, overdue, read-only until paid); **billing** (monthly on the billing
day, or yearly at ten months of twelve); the **monthly membership** as the
server prices it; the **next invoice** and **paid through** dates; the
**amount due** with **Pay in QuickBooks** and **I've paid** (the same look
at QuickBooks the signup page and the billing bar make:
`plan-change reconcile-now`), and the **invoices** the workspace has, each
with its pay link while unpaid. The facts come from `billing/current`,
which the tenant may read; the priced figure and the invoices come from
`GET /api/plan-change` (owner or administrator), whose summary now carries
`invoices[]`, `moduleNames`, `subscriptionNames`, `amountDue`, `paymentLink`,
`accessUntil` and `paidThrough`. A member sees the facts and is told that
an administrator climbs the Ladder and pays the invoices.

**The Ladder.** The opt-in page is named: *Build your own experience and
pay for what you need to run your business. Every module is an opt-in, and
Omega Logic is by department: Office, Plant, Materials & Purchasing,
Logistics & Warranty and the Customer App each stand on their own rung.*
**Open the Ladder** opens the ONE package menu (`omega-package-menu.js`)
on the dashboard: `open(key, { view, onChanged })` takes the page's own
package view where the editor's `OmegaCaps` is not loaded, the dialog is
titled *The Ladder* with the tagline, and a change calls back so the page
can ask for the package view again (`OmegaTenant.refreshPackage()`, new)
and repaint the tiles and the panel without a reload. The editor's ribbon
tab that opens the same menu is now *The Ladder* too.

**A locked tile offers its rung.** On a packaged workspace a tile the
package does not include no longer says *Upgrade to unlock · Request
access* with a mailto: its badge reads **Add**, the overlay names the
module the tool comes with and its monthly price (one read of
`/api/package-catalog` per visit), and **Add <module>** opens the Ladder on
that module. A legacy plan keeps the request.

**A legacy account is left alone.** No packaged record means no packaged
section, no Ladder, no *Add* badges and no billing bar: the Account panel
shows the plan, the paid amount and the next payment date as before. That
is NextNRG: enterprise, the year paid, everything open.

## Verified

- `npm run check:dashboard` — eight scenarios on the real `index.html`
  with the Firebase double, the package view from the real
  `package-access.project()`, the Ladder's summary and quote from the real
  `plan-change` library over the scenario's own records, the catalog from
  the real server catalog:
  - **lite-ladder**: the panel shows the package, not the legacy rows
    (Lite · Active · $500/month · next invoice date); the Ladder is named
    and says what it is for; *Open the Ladder* opens the menu with every
    rung not yet bought and a Subscribe on each; Subscribe brings the
    server's quote for the rest of the cycle; a locked tile offers to add
    its module by name with the price, and its *Add* opens the Ladder on
    that module.
  - **awaiting**: the billing bar carries *Pay in QuickBooks* and *I've
    paid*; Lite is on and the rest is locked; the panel says awaiting the
    first payment, what was bought and what is on, the amount and the
    QuickBooks link; *I've paid* asks QuickBooks and says not yet; the
    Ladder waits for the first payment.
  - **legacy-enterprise**: nothing is locked, nothing says upgrade, no
    billing bar; the account page shows the paid year and no Ladder.
  - the five earlier scenarios unchanged (newco, northstar, northstar-phone,
    pending, lite).
- `scripts/test-plan-change.js` asserts the summary's invoices and names.
- Full `npm test` and `npm run check:pages` pass on the branch.

## Screenshots

`docs/screenshots/packaging-phase-10b/`: `account-ladder.png` (the paid
Lite tenant's panel), `ladder-menu.png` (the Ladder open on the dashboard
with a quote), `account-awaiting.png` (the first invoice unpaid),
`account-legacy.png` (a prepaid legacy account).

## Not built

- Removing a module from the Ladder is still a request (`removalRequests`),
  applied at the review; a yearly workspace's additions are quoted by
  ClearSky (the gate says so in the panel).
- A saved card charged automatically (Step B) still waits on the QuickBooks
  Payments permission; the panel says what is true: each invoice arrives
  with its pay link, a card saved on QuickBooks' page pays the next in one
  click.
- The admin console's Tenants & Users card and Client Inventory tiers
  (Phase 10).
