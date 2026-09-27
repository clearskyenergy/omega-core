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
| `api/stripe-webhook.js` | Answers a package invoice FIRST (after the signature check), then the legacy tier path, unchanged. |
| `scripts/test-stripe-billing.js` | The driver, the engine end to end and the webhook, against `scripts/_lib/stripe-double.js`. It runs in `npm test`. |

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
4. **Branding** (Settings → Branding): logo and colours for the hosted
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

## Testing it in test mode

With the Preview variables above, sign up a workspace at
`/start.html` and choose **Pay and start now**. Then pay the
invoice with Stripe's test card `4242 4242 4242 4242`. The workspace
opens within seconds of the webhook. Try these too:

- Refund the payment in the dashboard: the next reconcile reverses it.
- Void an open invoice: it reads as reversed.
- Pay a change invoice: the added module switches on.

## What is not built

- **Autopay.** Invoices are `send_invoice`: each is paid from its link. The
  Stripe portal keeps a card on file and downloads invoices, but nothing
  charges it automatically yet (the book's `policy.savedCardEnabled` is
  `false`).
- **Instant refund events.** A refund is a *charge* event with no
  workspace mark on it, so it is picked up by the next reconcile (the
  hourly runner, or *I've paid*) rather than by the webhook at once.
- **Tax.** Stripe Tax is off. Invoices carry the server's amounts as they
  are, as the QuickBooks rail did before QuickBooks calculated tax on its
  items.
- **Books.** Stripe payments reach QuickBooks through the *Connect to
  Stripe* bookkeeping app (`docs/PAYMENTS-BROWSER-SETUP.md` Part 3), not
  through OMEGA.
- **Moving a workspace between rails.** A QuickBooks-billed workspace stays
  on QuickBooks. Moving one means a person closing its QuickBooks
  subscription and re-activating it on Stripe; there is no one-click move.
