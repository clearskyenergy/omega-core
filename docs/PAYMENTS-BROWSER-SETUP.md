# Card payments for ClearSky-OMEGA — the browser runbook

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Paste everything below the line into Claude in Chrome, on the Chrome
profile that is signed in to QuickBooks Online (the ClearSky company), to
the Stripe dashboard and, for Part 4, to Vercel. Tommy stays at the
keyboard: Claude fills and clicks, Tommy submits anything that signs an
agreement or sends money.

Why it is in this order: **a QuickBooks invoice gets its "Pay now" card
page from QuickBooks Payments**, Intuit's own card processing. That is the
link OMEGA puts on a first invoice, a plan change and a pack
(`api/_lib/qbo-billing.js` asks QuickBooks for `invoiceLink` with card and
bank payments allowed). The "Connect to Stripe" app in QuickBooks is a
**bookkeeping import**: it copies Stripe payments, fees and payouts into
the books. It does not make a QuickBooks invoice payable by Stripe. So
step 1 is what turns the pay-at-the-end signup on; steps 2 and 3 keep
Stripe ready and reconciled, with one set of books. Part 4 is a separate,
later switch: OMEGA's own **Stripe rail**, where a workspace pays by card
on Stripe's hosted Checkout and its card stays on file. It issues no
QuickBooks invoice at all; the Part 3 app is what books those payments.

---

## Prompt for Claude in Chrome

You are helping Tommy Gilmer (ClearSky Energy Solutions) set up card
payments for the ClearSky-OMEGA platform. Work through Parts 1–3 below in
order, in the tabs already open. Do Part 4 only when Tommy says card
payments are being turned on. Rules that do not bend:

- **Never copy, read aloud, paste or screenshot a secret.** That means a
  Stripe secret key (`sk_live_…`, `sk_test_…`), a restricted key
  (`rk_live_…`, `rk_test_…`), a
  webhook signing secret, a bank account number, an EIN or a Social
  Security number. If a page shows one, look away from it: describe the
  field, do not transcribe it. Publishable keys (`pk_live_…`) are public and
  fine. Parts 1–3 need no API key. Part 4 needs one secret key and one
  webhook signing secret: Tommy creates, reveals and pastes both himself,
  straight into Vercel; you open the page and step back.
- **Tommy clicks the last button** on anything that accepts an agreement,
  applies for a merchant account, connects a bank, or sends money. Fill
  the form, stop, say "ready for you to submit", and wait.
- **One company.** In QuickBooks, the company is ClearSky Energy Solutions
  LLC (the one whose realm is already connected to OMEGA). If a page offers
  to create a new company, or shows a different one, stop and ask.
- Do not turn on anything that emails customers automatically (reminders,
  statements, marketing). OMEGA sends its own mail.
- After each part, write down exactly what is now on, what is pending
  approval, and what you could not do, in the report format at the end.

### Part 1 — QuickBooks Payments (this is what OMEGA's invoices need)

1. In the QuickBooks Online tab, open the gear (⚙) → **Account and
   settings** → **Payments** (if it is not listed, search Settings for
   "Payments" or open the **Get paid** / **Payments** entry in the left
   menu).
2. If it says Payments is not set up: open **Learn more** / **Set up
   payments** / **Apply**. Fill the application from what QuickBooks
   already knows about the company (legal name, address, industry:
   software / SaaS for energy project development, typical sale:
   subscription invoices from $500 to $5,000, no card-present sales).
   Leave EIN, owner identity and bank details to Tommy; tell him which
   fields are waiting. **Tommy submits.** Approval is usually same day;
   note "pending approval" in the report if it is.
3. If Payments is already on (or once it is approved): still in Account
   and settings, open **Sales** → **Invoice payments** (older layout:
   **Online delivery** / **Online payments**). Turn ON **Cards** (credit
   and debit) and ON **Bank transfer (ACH)**. Save.
3b. Still in **Account and settings** → **Sales** → **Sales form content**:
   turn ON **Custom transaction numbers**. Save. OMEGA numbers its invoices
   (`OP-…`) and finds them again by that number so a retry never issues
   twice; with this off QuickBooks renumbers them and OMEGA refuses to
   invoice at all. Report "Custom transaction numbers: on/off".
4. Open **Sales** → **Online delivery**: set invoice email to include the
   **online payment link** / "Online invoice" (the full invoice with the
   Pay now button). Leave "Show short summary" and any automatic reminders
   OFF. Save.
5. Open the gear → **Account and settings** → **Company**: confirm the
   customer-facing name is **ClearSky Energy Solutions** and the
   customer-facing email is one Tommy reads (`tom@clearsky-usa.com`
   unless he says otherwise). Save if changed.
6. Prove it: open **Sales** → **Invoices**, open any existing invoice (or
   the **New invoice** preview) and confirm the preview shows a **Pay
   now** / **Pay invoice** button and the toggles for cards and bank
   transfer are on. Do not send it. Report "Pay now visible on an
   invoice preview: yes/no".
7. Deposits: in **Account and settings** → **Payments** → **Deposits**
   (or **Chart of accounts**), note which bank account QuickBooks Payments
   deposits go to and which expense account the processing fees post to.
   Report the account names (not numbers). If none is set, tell Tommy;
   do not create accounts.

### Part 2 — the Stripe account (ready, not wired)

1. In the Stripe dashboard tab (ClearSky Energy Solutions), open
   **Setup guide** / **Activate your account**. Fill the business profile
   from public facts: legal entity ClearSky Energy Solutions LLC, website
   `https://clearskyomega.com`, product description "Software
   subscriptions for energy project development (battery, EV charging,
   solar, microgrid, data center)", customer-facing statement descriptor
   **CLEARSKY OMEGA**, support email `tom@clearsky-usa.com`. Stop at
   identity, EIN and bank account: **Tommy submits** those.
2. **Settings → Business → Public details**: descriptor as above, support
   phone and email Tommy confirms. Save.
3. **Settings → Payments → Payment methods**: leave cards on; leave
   everything else default. Do not enable Link, BNPL or crypto.
4. **Settings → Customer emails**: turn OFF successful-payment and refund
   emails from Stripe (OMEGA and QuickBooks send the receipts). Save.
5. **Developers → API keys**: do NOT create, reveal or roll any key. Read
   nothing off this page except that keys exist. Report "no keys created".
6. Report the account's activation state (active / pending / needs
   information, and which items).

### Part 3 — the Connect to Stripe app in QuickBooks (books stay in one place)

The tab titled **Install QuickBooks Online | Stripe Apps** is Stripe's side
of this: every permission on that screen is **Read-only**, which is right
(QuickBooks only reads Stripe to record it). The QuickBooks tab titled
**Connect to Stripe** is Intuit's side.

1. In the Stripe **Install app** screen, confirm every row says
   Read-only, then click **Install app**. If it asks which Stripe account,
   pick ClearSky Energy Solutions.
2. Back in the QuickBooks **Connect to Stripe** window: if it is waiting on
   "Sign in to your account", click **Reopen window** and sign in to
   Stripe in the popup (Tommy types the password and any 2-factor code;
   do not ask him to say it aloud). Approve the connection.
3. In the app's settings inside QuickBooks (**Apps → My apps → Stripe →
   Settings**, or the setup screen it lands on):
   - **Start date**: today. Nothing older needs importing.
   - **Deposit / bank account**: the bank account Stripe pays out to
     (Tommy confirms which). If Stripe payouts are not yet set up, choose
     an account named like "Stripe clearing" only if it already exists;
     otherwise stop and report.
   - **Fee account**: an expense account for processing fees (the same
     one QuickBooks Payments uses, if Part 1 step 7 found one; else the
     existing "Merchant fees" / "Bank charges" account). Do not create one.
   - **Record payments as**: sales receipts, with the Stripe customer
     name; taxes: none (subscriptions are not taxed today).
   - **Sync**: automatic, daily.
   Save.
4. Run the first sync (it will find nothing; that is fine) and report
   "connected, first sync ran, 0 transactions".

### Part 4 — Turning on card payments (the Stripe rail)

Only when Tommy says so, and only after Parts 1–3 are reported. What the
switch does (`api/_lib/packaging-mode.js` `rail()`,
`api/_lib/stripe-billing.js`): with `PACKAGING_RAIL=stripe`, every
workspace that signs up or is activated from then on pays by card on
Stripe's hosted Checkout, reached through OMEGA's own signed pay link
(`/api/package-pay`). The card is kept on file, and renewals, confirmed
module additions and usage packs are charged to it at once; a decline, or
a bank that wants the cardholder, falls back to the pay link. Workspaces
already on QuickBooks invoices stay on them. Card numbers never reach
OMEGA. Do the whole part in **one Stripe mode**: test mode for Vercel
Preview (`QBO_ENV=sandbox`), live mode for Vercel Production
(`PACKAGING_LIVE=true` with `QBO_ENV=production`). Test mode first, always.

1. **The Stripe account is activated** (Part 2 step 1): legal entity, EIN,
   payout bank account, phone. Fill what is public, stop at each of those;
   **Tommy submits.** Live card payments need the account active; test
   mode works before. Report the activation state.
2. **The secret key (Tommy).** Open the Stripe dashboard's API keys page in
   the mode being set up and stop. Tommy creates the key and pastes it
   straight into Vercel as `STRIPE_PACKAGING_SECRET_KEY`, in that
   environment only (Preview: the test key; Production: the live key). You
   never read, copy or report it; you may type the variable's name.
   What the code accepts: `sk_test_…` or `rk_test_…` in sandbox,
   `sk_live_…` or `rk_live_…` in live; a key of the other mode counts as no
   key and card payments refuse to start. With `STRIPE_PACKAGING_SECRET_KEY`
   unset, packaging falls back to the shared `STRIPE_SECRET_KEY` when its
   mode agrees, which is why the packaging one is set on its own. Pay links
   are signed with a key derived from this one: rolling it invalidates
   every pay link already issued, so roll it only when no card invoice is
   waiting.
3. **The webhook.** In the same mode, add a webhook endpoint
   `https://<host>/api/package-stripe-webhook`, where `<host>` is a host of
   that Vercel environment that Stripe can reach without signing in
   (Production: `silmarillion.clearskyomega.com`). Select exactly the
   events listed in `api/package-stripe-webhook.js`:
   `checkout.session.completed`, `checkout.session.expired`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
   Then stop: **Tommy** reveals the endpoint's signing secret and pastes it
   into Vercel as `STRIPE_PACKAGING_WEBHOOK_SECRET` for the same
   environment. It is its own endpoint with its own secret: do not add
   these events to the existing `/api/stripe-webhook` endpoint and do not
   touch `STRIPE_WEBHOOK_SECRET` (that endpoint serves legacy tenants and
   Editor Lite, and ignores packaged objects even when Stripe sends it one).
4. **Stripe's customer emails stay off** (Part 2 step 4: successful-payment
   and refund emails). OMEGA mails the receipt when a payment settles, and
   ClearSky its own alert.
5. **The books.** The Connect to Stripe app from Part 3 records each card
   payment in QuickBooks as a sales receipt. That is the only place a card
   charge is booked: OMEGA issues **no** QuickBooks invoice for it (one
   rail per charge), so nobody raises one by hand either, or the revenue is
   counted twice and the invoice sits open.
6. **The switch (Tommy, in Vercel).** Set `PACKAGING_RAIL=stripe` (literal,
   lower case) in the same environment and redeploy, so the new variables
   are read. Unset, or anything else, keeps QuickBooks invoices for new
   workspaces. Turning it off later stops only new card workspaces: one
   already on cards keeps being charged by card, so the key and the
   webhook stay while any exists.
7. **Prove the webhook before relying on it.** Send one signed test event
   of a registered type (`payment_intent.succeeded`, say) to the new
   endpoint and read the response in Stripe's delivery log:
   - `200` with `"ignored":"not a packaged-billing event"`: the raw body
     reached the function and its signature checked. Good.
   - `400 Invalid Stripe signature`: the body arrived altered (parsed, not
     raw) or the secret is not this endpoint's. Stop and report.
   - `503` naming `STRIPE_PACKAGING_WEBHOOK_SECRET`: the secret is missing
     or the redeploy has not happened.
   - a sign-in page instead of JSON: the host is protected; use one Stripe
     can reach.

   Until this passes a payment still settles from Checkout's return, from
   *I've paid* and from the billing runner, each of which re-reads Stripe;
   the webhook is what settles a payer who closed the tab, and what hears
   refunds and disputes at once.
8. **Prove a payment in test mode (Preview) before live.** Sign up a
   synthetic work-email company and take *Pay and start now*: the pay
   step's card button opens Stripe's Checkout. Pay with the test card `4242 4242 4242 4242`
   (any future expiry, any CVC). Expect Stripe to send the payer back to
   the workspace (`/workspace?checkout=done#billing`), the workspace open
   and Plan & billing naming the card on file. Then, on a monthly plan, add
   a priced module: it is charged to that card and switches on in the same
   step, with no pay page. Only then repeat in live mode, per
   `docs/PACKAGING-RELEASE-CHECKLIST.md` §6 (*Card rail*): one real payment,
   refunded in Stripe, and the record reads reversed.

### What NOT to do

- Do not sign OMEGA's invoices, customers or items up for anything here;
  OMEGA creates those itself through the API. On the Stripe rail it also
  creates its own Stripe customers and Checkout sessions and prices each
  charge from the book: do not create Stripe products, prices, Payment
  Links or subscriptions for OMEGA.
- Do not add Stripe payment links, Stripe Checkout or "Pay with Stripe"
  to any QuickBooks invoice or template. QuickBooks invoices are paid with
  QuickBooks Payments. The Stripe rail (Part 4) needs none of that: OMEGA
  opens Checkout from its own pay link, and a card-rail charge has no
  QuickBooks invoice.
- Do not change the QuickBooks OAuth app, developer keys, or the
  connected apps list beyond the Stripe connector.

### Report format (paste this back to Tommy at the end)

```
QuickBooks Payments: on | pending approval (since …) | not started — waiting on: …
  Cards: on/off   Bank transfer: on/off   Pay now visible on an invoice preview: yes/no
  Custom transaction numbers: on/off
  Deposits to: <bank account name>   Fees to: <expense account name>
Stripe account: active | pending (needs: …)
  Descriptor: CLEARSKY OMEGA   Customer emails: off   Keys created: none
Connect to Stripe app: connected | not connected (stuck at: …)
  Start date: …   Deposit account: …   Fee account: …   First sync: …
Card rail (Part 4, only if Tommy asked): mode test | live
  Stripe account: active | pending (needs: …)   Key in Vercel (Tommy): yes/no
  Webhook /api/package-stripe-webhook: registered, 7 events | not yet
  Signing secret in Vercel (Tommy): yes/no   Signed test event: 200 ignored | 400 | 503 | other: …
  PACKAGING_RAIL=stripe and redeployed (Tommy): yes/no   Test card payment: workspace opened yes/no
Things Tommy still has to click: …
Anything I could not find or that looked different from these steps: …
```

---

## After the report: how this reaches OMEGA (for Tommy, not the browser)

- On the default rail, OMEGA's pay-at-the-end signup, plan changes and
  packs all use the QuickBooks invoice link. Once Part 1 reports "Pay now
  visible", the production switch in `docs/PACKAGING-RELEASE-CHECKLIST.md` §2
  (`PACKAGING_LIVE=true`, `QBO_ENV=production`, the book synced with
  `scripts/qbo-sync-items.js --live`) is all that stands between a sandbox
  invoice and a real one.
- The Stripe rail is built (2026-09-27) and off. `api/_lib/stripe-billing.js`
  answers the same driver contract as `api/_lib/qbo-billing.js`
  (`customer`, `invoice`, `reconcile`, `guard`), so the engine keeps one
  paid transition and one access rule whichever rail took the money. A
  first charge goes through hosted Checkout, reached by OMEGA's signed,
  durable pay link (`/api/package-pay`, safe to mail); Checkout's return
  re-reads the session from Stripe, keeps the card on file, settles that
  one invoice record and sends the payer to Plan & billing. With a card on
  file, renewals, confirmed additions and packs are charged off-session at
  once; a charge already made for a record is found again before charging,
  so a retry never charges twice; a decline leaves the record waiting on
  its pay link. Reconciliation re-reads every payment: paid when what was
  received covers the total, reversed on a full refund or a lost dispute,
  flagged for a person when paid twice or disputed. Events arrive at their
  own endpoint, `/api/package-stripe-webhook`, with its own secret; every
  Stripe object carries metadata `kind: 'omega-package'` and `org` (never
  `orgId`), and the customer is kept at `billing/current.stripe.customerId`
  (never the legacy `stripeCustomerId`), so the legacy `/api/stripe-webhook`
  cannot take them for its own; it also ignores any packaged workspace
  outright (a legacy tenant moved onto a package keeps its old
  `stripeCustomerId`), and `/api/stripe-create` refuses one. A card-rail
  charge gets no OMEGA QuickBooks invoice: the Part 3 app books it as a
  sales receipt. Nothing changes until `PACKAGING_RAIL=stripe` (Part 4);
  QuickBooks invoices stay the default rail.
- No key from either dashboard goes anywhere but Vercel's environment
  variables, entered by Tommy. Nothing in the repo, nothing in a chat.
