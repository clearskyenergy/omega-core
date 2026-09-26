# Packaging Phase 10A — sign up, pay in QuickBooks, activate

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Draft PR [#146](https://github.com/clearskyenergy/omega-core/pull/146),
stacked on the dashboard fold-in
([#145](https://github.com/clearskyenergy/omega-core/pull/145)).
[Vercel preview](https://omega-core-git-codex-self-serve-clearsky-usa.vercel.app).
No live organization, trial, billing date, QuickBooks record, environment
variable or deployed rule was changed. Runtime flags remain off by default;
the production switch exists and is off.

Tommy, 2026-09-26: *"when someone wants to create an account, they need to
go through a process that intakes their details so that can go to
QuickBooks and then they set up what features they want and then they can
pay at the end"*; *"I can't get Stripe, use QuickBooks, QuickBooks can take
card payments"*; *"I don't want two different things"*; *"make it seamless
and let's get this all launched"*.

## What changed

**One system.** A company signs up, its details make the QuickBooks
customer, it chooses its package, and it pays its first invoice by card on
QuickBooks' own invoice page. The workspace opens the moment the payment
reconciles, with nobody's approval. There is no second payment provider.

**The price list is public: `GET /api/offerings` and `offerings.html`.** The
plans (Lite, Field, Pro, Enterprise), the starter packages per vertical,
every module with its server-formatted price, usage allowance and features,
the logins, the trial and the service fee, from the seeded book (or the
repo's proposed book, and the response says which). Nothing confidential:
no realm, item ids or secrets (`test-self-serve-signup.js` asserts it). A
button carries the choice to signup in the address
(`/start.html?plan=field`, `?modules=lite,gridatlas`). The page is ES5 with
no Firebase and no tenant runtime; it renders at 1280 and 390 wide.

**Signup pays at the end.** The billing step offers **Pay and start now**
first and *Request a 14-day trial instead* second. Pay now creates the
tenant, opens it (`status: 'active'`, `approvedBy: 'self-serve'`,
`selfServe: true`) and runs the engine's own `activate` — the same
`package-billing.apply` the Package tab runs, now allowed for a caller the
signup itself marks `selfServe: true` (else *Staff only*), recorded as such
in the billing history and the audit row. The first invoice carries the
first year's service fee and QuickBooks' card-payment page; the workspace is
`awaiting_payment` (read-only, Lite switched on, the pay link on the
billing bar) until the invoice reconciles. If the invoice cannot be issued
(QuickBooks down, a refused customer), the record is put back to `pending`
with `payNowError`, the person is told, and the request goes to the
approval path as before. The trial request is unchanged.

**The pay step and "I've paid".** `start.html` shows the workspace address,
the amount and **Pay now in QuickBooks**, checks QuickBooks every eight
seconds while open, and **I've paid — open my workspace** asks now:
`POST /api/tenant-signup {action:'check-payment'}` (owner only) runs
`plan-change.reconcileNow`, the same `S.reconcile` the daily runner runs,
throttled to one look per eight seconds per organization
(`paymentCheckedAt`), and answers with the state, the amount and the host to
open. The workspace's billing bar (`omega-tenant.js`) and settings use the
same look: `POST /api/plan-change {action:'reconcile-now'}` for the owner
or an administrator. Paid, the page leaves for the workspace; the package
bought is switched on. `login.html` sends a new company to `/start.html`
and the price list when packaged signup is on.

**Production is one rule.** `api/_lib/packaging-mode.js` decides where
packaging bills: SANDBOX (`QBO_ENV=sandbox`, a `packagingSandbox` tenant, an
enabled sandbox book) or LIVE (`PACKAGING_LIVE=true` **and**
`QBO_ENV=production`, both literal: an enabled book under a release version
synced to the production company; any tenant may buy). Neither is refused
everywhere. Before this phase the engine's guard, the item sync, the
QuickBooks driver's guard (every write passes it), the price book's
validation, signup and the daily runner were each hard-wired to the sandbox,
so the switch alone would have refused every invoice; now all of them read
the one rule. A book whose version ends in `-proposed` is never the
production company's (`pricebook.validate`): signing the values off is
renaming `VERSION` in `api/_lib/pricebook.js`. `seed-pricebook.js --live
--realm=<production realm>` seeds it; `qbo-sync-items.js --live` (with the
process in live mode: one without the other is refused before any call)
binds the items in the production company. The organization record is
marked `packaged: true` by signup and by every activation, which is how the
live runner finds its tenants (the sandbox runner keeps `packagingSandbox`).
A live signup is not a sandbox tenant.

**Two engine fixes found on the way.** Activation is floored to the minute,
and a signup that activates seconds after its record is made read as "in
the future" (*Original signup date is required*); the check is now against
the request's own time. And `prepare('activate')` accepts a packaged record
that is still `pending` (a signup nobody has approved or paid) as its first
step rather than sending it to plan-change.

## The flow as sold (later on 2026-09-26)

Tommy: *"when I click create an account it asks for all the details for a
payment profile, then asks them to build their system (the menu, they opt
in), it prices out their monthly membership, then they pay, monthly or for
the year with two months of savings."* The pages now walk exactly that:

1. **Create an account** (`login.html`, packaged mode): the account form
   stays (work email, company, what you do, password). The verification
   email's continue link is `/start.html?company=&vertical=`, and the pane
   says what comes next with a *Continue to your billing profile* button.
   A colleague of an existing tenant still just goes in.
2. **Verify** (`start.html`): a password account is not verified until its
   link is clicked and the server refuses an unverified one, so the page
   holds there, names the address, and offers *Resend* and *I've verified*.
3. **Your billing profile**: the details that make the QuickBooks customer.
4. **Build your system**: the one module menu (`OmegaPackageMenu.picker`),
   *Your monthly membership* quoted by the server as modules change
   (`subscription-proposal` `price`), and two cards: **Monthly** (invoiced
   on the billing day) or **Yearly · two months free** (ten months of
   twelve, invoiced once, the saving shown). `annualPaidMonths` is 10 in
   the book (it was 11); offerings, the proposal election and the tests
   follow.
5. **Pay and start now** (or request the trial), then the pay step.

Renders: the trial and pay-now drives in `render-packaging-billing.js` and
the proposal and self-serve drives in `render-subscription-proposal.js`
walk the new steps; `signup-build.png` is the build step.

## Verified

- `node scripts/test-self-serve-signup.js` — 12 checks on the Firestore
  double with a QuickBooks driver double: the public list, the pay-now
  signup, "I've paid" (unpaid, throttled, paid → opened, owner only), the
  billing bar's reconcile-now, the fallback to approval, the trial
  unchanged, the plan from the offerings page, the billing flag off, the
  two modes, the live end-to-end drive under a release version (signup →
  production customer and invoice → the runner finds and reconciles it by
  `packaged`; the guard refuses the sandbox host, a wrong realm, a stale
  connection and the switch off), the scripts' refusals, and the pages'
  source. In `npm test`.
- The suites the engine change touches: `test-qbo-items` 223,
  `test-tenant-signup` 39, `test-package-billing-api` 45,
  `test-packaging-billing-foundation` 81, `test-package-activation` 52,
  `test-plan-change` 165, `test-subscription-proposal` 89, `test-usage` 64,
  `tstaffverified`, `test-logic-pricing`, `tgrowth` — all green.
- `node scripts/render-packaging-billing.js` — 111 checks, 34 screenshots:
  the real `start.html` driven through pay-and-start (one invoice, the
  workspace opened by its owner, Lite on until paid, the pay link and
  amount shown, "I've paid" before and after the payment, the page leaving
  for the workspace), and `offerings.html` at 1280 light and 390 dark (the
  floor, four plan cards, every module of the one catalog priced, the
  buttons' addresses, no sideways scroll). In `check:pages`.

## Screenshots

- `docs/screenshots/packaging-phase-10a/signup-pay.png` — the pay step.
- `docs/screenshots/packaging-phase-10a/offerings-desktop-light.png`,
  `offerings-phone-dark.png` — the price list.
- `docs/screenshots/packaging-phase-4/signup-billing.png` — the billing
  step with *Pay and start now* first (retaken).

## Card payments: what makes the button

A QuickBooks invoice gets its **Pay now** card page from **QuickBooks
Payments**, Intuit's own processing, which the production company has to
have switched on (the invoice is created with card and bank payments
allowed and its `invoiceLink` read back). The *Connect to Stripe* app in
QuickBooks is a bookkeeping import of Stripe payments and payouts, not a
way to pay a QuickBooks invoice. The browser runbook that sets both up, and
keeps Stripe in reserve behind the same three-function driver seam, is
`docs/PAYMENTS-BROWSER-SETUP.md`.

## Going live

The order is in `PACKAGING-RELEASE-CHECKLIST.md` §6, updated here: QuickBooks
Payments on → sign the values off (`VERSION` without `-proposed`, one PR)
→ `seed-pricebook.js --live --realm=…` → `qbo-sync-items.js --live` →
`enable-packaging-sandbox.js` (it enables the current book in either mode)
→ the five Production variables → one real signup by ClearSky, paid by card
and refunded → existing tenants one at a time from the Package tab.

What a person sees on production today (Tommy's `test.com` account,
2026-09-26): the legacy path — a pending workspace, *awaiting approval*, no
package, no payment — because the flags are off and this phase is not
merged. Nothing else can show until step 6 above.

## Not built (honest list)

- Settings › Billing (Phase 10B): open invoices with their pay links,
  reconcile-now, Your plan and the autopay note in one place. The billing
  bar and Your plan carry it today.
- The admin console's Tenants & Users card and Client Inventory tiers still
  show the legacy plan and prices (Phase 10).
- A Stripe driver. Not needed to launch; the seam is documented.
- A production book and a sandbox book share one Firestore under one
  `VERSION`: once the release version is seeded for production, the sandbox
  acceptance for that version is over. `enable-packaging-sandbox.js` keeps
  its name.
- `test.com` on production is a legacy pending tenant created by hand; it
  can be approved or left from the master console.
