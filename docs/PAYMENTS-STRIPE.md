# Packaged billing through Stripe

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Decided 2026-09-27 (Tommy): *"a customer creates an account, they add billing
and that's all done through Stripe, and once they do that it needs to allow
them to use what they paid for."* Stripe is the rail for a packaged
workspace, switched on by **`PACKAGING_PROVIDER=stripe`** in Vercel. It is
a switch rather than the default because production was already taking
pay-now signups through QuickBooks when this landed: flipping the rail on
a merge would have issued real Stripe invoices before the Stripe
account's webhook and invoice settings were ready (or, with a live key and
no live switch, closed signup). Set up Stripe below, then flip it. Unset,
QuickBooks stays the rail, and a workspace already billed in QuickBooks
stays there after the flip.

## What happens, end to end

1. **Account.** `login.html`, a verified work email, then `start.html`.
2. **Billing profile.** The same form as before. It becomes the workspace's
   **Stripe customer**: one per workspace, marked `metadata.omegaOrg`, found
   again by email and that mark so a retry never makes a second one.
3. **Build your system.** The one menu, priced by the server from the book.
4. **Pay.** *Pay and start now* runs the engine's own `activate`. The first
   invoice is a **Stripe invoice**:
   - It is `send_invoice`, with one item per line the server priced.
   - Stripe is handed amounts, never a price list, so no Products or Prices
     need to be set up in Stripe.
   - It is finalized and emailed by Stripe. Its **hosted invoice page** is
     the card page, so the card is entered on Stripe's page, never ours.
5. **Access.** When the card clears, Stripe posts `invoice.paid` to
   `/api/stripe-webhook`. The webhook runs the engine's `reconcile` for that
   workspace at once, and exactly what was bought switches on within
   seconds. The workspace does not have to press anything:
   - *I've paid* (signup page, billing bar, Plan & billing) runs the same
     reconcile.
   - So does the hourly runner. A lost webhook only delays; it never
     decides.

Every later cycle, addition (`plan-change`) and usage pack is a Stripe
invoice to the same customer, reconciled the same way.

**Reversals.** A void, an uncollectible mark, a full refund or a credit note
after payment reads as **reversed**. A partial refund reads as not
satisfied. A dispute is flagged for an accounting review. Access follows
the one rule in `package-billing.accessAfterInvoices`.

## Where it lives

| File | What it owns |
|---|---|
| `api/_lib/packaging-mode.js` | The ONE rule for where packaging bills, now per provider (`PACKAGING_PROVIDER=stripe` selects Stripe). Stripe: a **test key** (`sk_test_…`/`rk_test_…`) is the sandbox; **live** needs `PACKAGING_LIVE=true` **and** a live key. QuickBooks keeps `QBO_ENV`. |
| `api/_lib/billing-driver.js` | Which rail a workspace bills through (`providerOf`: its customer record decides, else the deployment's rail), the field names on its records, and the one pay-link check. |
| `api/_lib/stripe-billing.js` | The Stripe driver. It makes the same three calls as `qbo-billing.js` (`customer`, `invoice`, `reconcile`) and adds `eventOrg` for the webhook. |
| `api/stripe-webhook.js` | Answers a package invoice FIRST (after the signature check), then a plan's amount-due invoice (below), then the legacy tier path, unchanged. |
| `scripts/test-stripe-billing.js` | The driver, the engine end to end and the webhook, against `scripts/_lib/stripe-double.js`. It runs in `npm test`. |
| `api/_lib/stripe-customer.js`, `api/stripe-customer.js` | Plan & billing's Payment method for a plan billed outside the engine: the one Stripe customer, the card read back, Stripe's add-a-card page and portal, and the amount ClearSky set as due (below). |
| `scripts/test-stripe-customer.js` | That path end to end on the Stripe and Firestore doubles, the webhook included. It runs in `npm test`. |

## Plan & billing's Payment method, for a plan billed outside the engine

Decided 2026-09-27 (Tommy, on Concord Energy's Payment method card, a
Standard plan ClearSky had invoiced by hand, $1,299 due, "No billing
account yet"): *"This payment method should be linked to the stripe payment
system we built with quickbooks. Stripe collects and takes the payment and
sends it to quickbooks which is our account."* It does not need
`PACKAGING_PROVIDER`: it is the legacy tier's own Stripe customer, on the
same `STRIPE_SECRET_KEY` as `stripe-create.js` and the portal.

1. **Add a card with Stripe** (an owner or administrator, whose email need
   not be verified when the workspace is an active client,
   `admin.clientAdmin`; verified staff may act for a tenant). The first time, it links the workspace's one Stripe
   customer: `billing/current.stripeCustomerId`, the field `stripe-create.js`
   writes and the webhook's tier path finds a workspace by, marked
   `metadata.orgId` and `omegaOrg`, named after the billing contact (else the
   owner's address; never a ClearSky address), found again by that mark so a
   retry or a second admin never makes a second one. A `manual` plan now
   reads *By card through Stripe*. Then Stripe's customer portal opens on its
   add-a-payment-method flow: the card is typed on Stripe's page, becomes the
   customer's default for invoices, and Stripe sends the person back to
   `/workspace#billing`. The page shows the card read back from Stripe
   (brand, last four, expiry); nothing about it is stored.
2. **Pay $X with Stripe** (What you owe): the amount ClearSky set
   (`amountDue`, never priced here) as ONE `send_invoice` Stripe invoice per
   due date and amount (`metadata.omegaDue`), paid on Stripe's hosted invoice
   page, which offers the card on file. Stripe emails it once, the
   accountant's copy. Back on the page it reads *Pay now* and *I've paid*.
3. **Recorded once.** The webhook (answered before the tier path, which
   would have moved `subscriptionDue` to the invoice's own date) or *I've
   paid* reads the invoice back: `amountDue` 0 (only while the figure is
   still the one it billed), `lastPaidAt`, `amountPaid` plus what was paid,
   a history row, the tenant's receipt and ClearSky's `paidAlert`.
   `subscriptionDue` stays as ClearSky set it: roll the next due date and
   amount in the master console as before.

What keeps it honest: a figure ClearSky changes (the master console writes
the record directly) voids the stale open invoice the next time the
workspace's Stripe is touched: opening Plan & billing, the portal, or Pay.
A payment for a figure that has since changed (paid from Stripe's email
first) is recorded but leaves `amountDue`, ClearSky gets a `billingAlert`,
and nothing more is taken from the page (`stripeDueHold`) until ClearSky saves
the amount due again in the master console (or `/api/tenant-billing`). The
same figure releases it too: ClearSky rolling on to next month before last
month's emailed invoice was paid keeps next month's figure, and saving it
is the review. Pay records any such payment nothing had recorded before it
bills. The same figure and date billed again after a payment is a new
invoice (`stripeDueSeq`). A balance on the Stripe customer (Stripe applies
it to the next invoice) is ClearSky's to settle before a card payment here.
An invoice ClearSky already has open in Stripe (the dashboard, a tier
subscription) is the way to pay and is never doubled; a `paymentLink`
ClearSky set wins. A
**test key** links only a workspace marked `packagingSandbox` (the one
database is production's, so a preview deployment never binds a real
tenant); a binding made in the other mode is refused and never overwritten.
A **package** keeps the engine's rules: its card is read back and its portal
opens, its invoices stay the engine's. A plan ClearSky invoices through
QuickBooks (`paymentProvider: 'quickbooks'`) keeps its card on QuickBooks'
page, and its Opt-in add-ons bill through QuickBooks too.

**Opt in on a legacy plan buys on Stripe** (2026-09-28). Under
`PACKAGING_PROVIDER=stripe`, a plan billed outside the engine that has no
QuickBooks add-on customer buys a module (`plan-change` `addon-quote` /
`addon-buy`, `api/_lib/addons.js` `rail()`) on its OWN Stripe customer, the
one the card door above links, on a `send_invoice` invoice beside the plan
(metadata `omegaPackage`, `omegaKind: 'addon'`, so the webhook answers it
first and the engine's reconcile opens the module when it is paid); the
monthly renewal is issued there too, and a cancel voids the invoice. A
workspace whose add-ons already have a QuickBooks customer stays on
QuickBooks. The same guard applies: a test key sells only to a
`packagingSandbox` workspace; live needs `PACKAGING_LIVE=true` and a live
key. `scripts/test-addons.js` §6d.

**The customer portal needs no dashboard step.** Stripe refuses every
portal session until someone has saved the portal settings in the
dashboard, and refuses Add a card while those settings leave cards out.
When it does, OMEGA uses its own portal settings instead. Those are a
configuration made once through the API, found again by
`metadata.omega = 'workspace-billing'`, that offers the card and the
invoice history and nothing else: no cancelling, no plan changes, no
address edits. Stripe's own settings (Settings → Billing → Customer
portal) are used whenever they can take the card. Only a restricted key
without the portal-configuration permission still needs the dashboard
switch: Add a card then says the portal is not switched on yet. The
webhook's `invoice.*` events above already carry the amount-due invoices;
without the webhook, *I've paid* still records the payment.

**Records.** A Stripe-billed workspace's `billing/current` carries
`billingProvider: 'stripe'`, `stripeCustomerId` and `stripeLivemode`. Its
invoice records carry `provider: 'stripe'`, `stripeInvoiceId` and
`stripeCustomerId`.

**Legacy tiers.** A legacy Stripe tier (the old `stripe-create` path)
also has a `stripeCustomerId`. That alone never binds a packaged workspace
to Stripe; only `billingProvider: 'stripe'` on a packaged record does.

## Setting it up (Stripe dashboard, then Vercel)

**Stripe dashboard.** Do this in test mode first, then again in live mode.

1. **Settings → Invoices / Payment methods.** Turn on **Card** (and ACH
   Direct Debit if wanted) for invoices, so the hosted invoice page offers
   them.
2. **Settings → Customer emails.** Turn on *Email finalized invoices to
   customers*. OMEGA also mails the link; Stripe's email is the
   accountant's copy.
3. **Developers → Webhooks → Add endpoint.**
   - URL: `https://silmarillion.clearskyomega.com/api/stripe-webhook`.
   - Events: `invoice.paid`, `invoice.payment_succeeded`, `invoice.voided`,
     `invoice.marked_uncollectible`, `invoice.payment_failed`,
     `invoice.updated`, plus the legacy tier events already on the
     endpoint (`customer.subscription.*`).
   - Copy nothing out of the dashboard by hand into a chat. The signing
     secret goes straight into Vercel.
4. **Settings → Billing → Customer portal.** Switch on *Payment methods:
   allow customers to update* and *Invoice history*, then **Save** — once,
   in each mode. Stripe refuses every portal session until the portal
   settings have been saved, and Plan & billing's *Add a card with Stripe*
   is a portal session (`stripe-customer.js` falls back to a configuration
   of its own, but only after that refusal).
5. **Branding** (Settings → Branding): logo and colours for the hosted
   page.

**Vercel environment.** Set Preview first; Production last.

| Variable | Preview (test) | Production (live) |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | the test endpoint's secret | the live endpoint's secret |
| `PACKAGING_PROVIDER` | `stripe` | `stripe`, the go-live flip, last |
| `PACKAGING_SIGNUP_ENABLED` | `true` | `true` at launch |
| `PACKAGING_BILLING_ENABLED` | `true` | `true` at launch |
| `PACKAGING_LIVE` | unset | `true` at launch |
| `CRON_SECRET` | set | set (the hourly runner) |

The price book must be **seeded and enabled** (`scripts/seed-pricebook.js`)
under a release version: live refuses a `-proposed` book. The Stripe rail
needs **no item sync**. `scripts/qbo-sync-items.js` is the QuickBooks
rail's alone.

## Going live, and reading where a deployment stands from outside

Production was read on 2026-09-28 without a dashboard, from what the
deployment answers the public. `npm run check:production`
(`scripts/check-production.js`; no credentials, writes nothing) does the
same for any host and says, row by row:

- **the rail**: `/api/offerings` → `signup.payWith` is `Stripe` under
  `PACKAGING_PROVIDER=stripe`, else `QuickBooks`; `--expect-stripe` makes
  anything but Stripe a failure (the go-live check);
- **the book**: `pricebookVersion` must be this tree's `VERSION` and
  `source` must be `seeded`, or live issuing refuses;
- **the switches**: `signup.packaged` and `signup.payNow` are
  `PACKAGING_SIGNUP_ENABLED` and `PACKAGING_BILLING_ENABLED`;
- **the routes**: `/api/stripe-webhook` answers a stranger 400 (the
  signature check; a 404 means the route is not deployed), `/api/billing-run`
  and `/api/plan-change` answer 401, `/api/auth-check` says Google has the
  host's sign-in handler;
- **parity**: the billing runtime and the pages it draws hash to this tree's.

What it cannot see is the key's mode and `PACKAGING_LIVE`. Plan & billing
shows the first (*This deployment uses Stripe's test mode…* on a workspace
that is not `packagingSandbox`); the runner's hourly mail and the master
console show the second.

**The flip, in order** (Stripe in live mode, then Vercel's Production
environment only — Preview keeps its test key):

1. Stripe: the account activated for live payments; the live secret key
   into `STRIPE_SECRET_KEY`; the live endpoint at
   `https://silmarillion.clearskyomega.com/api/stripe-webhook` with the
   events above, its signing secret into `STRIPE_WEBHOOK_SECRET`; the
   Customer portal saved with payment-method updates on; Card on for
   invoices. Nothing is copied into a chat or a note on the way.
2. Vercel: `PACKAGING_PROVIDER=stripe`; `PACKAGING_LIVE=true`,
   `PACKAGING_BILLING_ENABLED=true`, `PACKAGING_SIGNUP_ENABLED=true` and
   `CRON_SECRET`, already there for the QuickBooks rail, stay; **Redeploy**
   the latest Production deployment of `main` (a variable change does not
   redeploy by itself).
3. `npm run check:production -- --expect-stripe` passes. Then, signed in
   on a legacy workspace, Plan & billing offers *Add a card with Stripe*
   (a live `billing.stripe.com` page) and Modules → Opt in says Stripe
   with no billing form; a purchase not meant is withdrawn with *Cancel
   request*, which voids the invoice at Stripe. A workspace already
   invoiced through QuickBooks (`paymentProvider: 'quickbooks'`, or a
   QuickBooks add-on customer) stays on QuickBooks by design.

## Testing it in test mode

With the Preview variables above, sign up a workspace at
`/start.html` and choose **Pay and start now**. Then pay the
invoice with Stripe's test card `4242 4242 4242 4242`. The workspace
opens within seconds of the webhook. Try these too:

- Refund the payment in the dashboard: the next reconcile reverses it.
- Void an open invoice: it reads as reversed.
- Pay a change invoice: the added module switches on.

## What is not built

- **Autopay on a package, and on the plan's amount due.** Package invoices
  are `send_invoice`: each is paid from its link (the book's
  `policy.savedCardEnabled` is `false`), and so is *Pay $X with Stripe*. The
  saved card is offered on each hosted invoice page and is the default for
  any invoice ClearSky raises in the Stripe dashboard with *Charge customer
  automatically*, but OMEGA never charges it for those on a date by itself.
  A legacy plan's **add-ons are the exception** (2026-09-28, Tommy: "charge
  their credit card or saved payment method"): with a card on file — the
  customer's default payment method for invoices, saved through *Add a card
  with Stripe* — an opt-in is charged the moment *Opt in and pay* is pressed
  (`stripe-billing.invoice(…, { charge })`, a `charge_automatically` invoice
  paid on the spot; the purchase runs the same reconcile and answers *on*)
  and each renewal is charged on its date by the runner. A refusal (a
  decline, a card that needs its bank) leaves that invoice open on its
  hosted page, with Stripe's own words in the mail and the menu, and *change
  the card in Plan & billing* is the way back. Without a card, add-ons pay
  from their link as before. `scripts/test-addons.js` §6e holds it.
- **Refunds of a plan's amount due.** A refund in Stripe does not put the
  amount back on `amountDue`; ClearSky sets it in the master console.
- **Instant refund events.** A refund is a *charge* event with no
  workspace mark on it, so it is picked up by the next reconcile (the
  hourly runner, or *I've paid*) rather than by the webhook at once.
- **Tax.** Stripe Tax is off. Invoices carry the server's amounts as they
  are, as the QuickBooks rail did before QuickBooks calculated tax on its
  items.
- **Books.** Stripe payments reach QuickBooks through the *Connect to
  Stripe* bookkeeping app (`docs/PAYMENTS-BROWSER-SETUP.md` Part 3), not
  through OMEGA, a plan's amount due included; OMEGA writing them too would
  book every payment twice.
- **Moving a workspace between rails.** A QuickBooks-billed workspace stays
  on QuickBooks. Moving one means a person closing its QuickBooks
  subscription and re-activating it on Stripe; there is no one-click move.
