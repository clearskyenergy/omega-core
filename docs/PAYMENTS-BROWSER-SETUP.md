# Card payments for ClearSky-OMEGA — the browser runbook

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Paste everything below the line into Claude in Chrome, on the Chrome
profile that is signed in to QuickBooks Online (the ClearSky company) and
to the Stripe dashboard. Tommy stays at the keyboard: Claude fills and
clicks, Tommy submits anything that signs an agreement or sends money.

Why it is in this order: **a QuickBooks invoice gets its "Pay now" card
page from QuickBooks Payments**, Intuit's own card processing. That is the
link OMEGA puts on a first invoice, a plan change and a pack
(`api/_lib/qbo-billing.js` asks QuickBooks for `invoiceLink` with card and
bank payments allowed). The "Connect to Stripe" app in QuickBooks is a
**bookkeeping import**: it copies Stripe payments, fees and payouts into
the books. It does not make a QuickBooks invoice payable by Stripe. So
step 1 is what turns the pay-at-the-end signup on; steps 2 and 3 keep
Stripe ready and reconciled for later, with one set of books.

---

## Prompt for Claude in Chrome

You are helping Tommy Gilmer (ClearSky Energy Solutions) set up card
payments for the ClearSky-OMEGA platform. Work through the three parts
below in order, in the tabs already open. Rules that do not bend:

- **Never copy, read aloud, paste or screenshot a secret.** That means a
  Stripe secret key (`sk_live_…`, `rk_live_…`), a restricted key, a
  webhook signing secret, a bank account number, an EIN or a Social
  Security number. If a page shows one, look away from it: describe the
  field, do not transcribe it. Publishable keys (`pk_live_…`) are public and
  fine. Nothing here needs an API key created.
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

### What NOT to do

- Do not sign OMEGA's invoices, customers or items up for anything here;
  OMEGA creates those itself through the API.
- Do not add Stripe payment links, Stripe Checkout or "Pay with Stripe"
  to any QuickBooks invoice or template. QuickBooks invoices are paid with
  QuickBooks Payments.
- Do not change the QuickBooks OAuth app, developer keys, or the
  connected apps list beyond the Stripe connector.

### Report format (paste this back to Tommy at the end)

```
QuickBooks Payments: on | pending approval (since …) | not started — waiting on: …
  Cards: on/off   Bank transfer: on/off   Pay now visible on an invoice preview: yes/no
  Deposits to: <bank account name>   Fees to: <expense account name>
Stripe account: active | pending (needs: …)
  Descriptor: CLEARSKY OMEGA   Customer emails: off   Keys created: none
Connect to Stripe app: connected | not connected (stuck at: …)
  Start date: …   Deposit account: …   Fee account: …   First sync: …
Things Tommy still has to click: …
Anything I could not find or that looked different from these steps: …
```

---

## After the report: how this reaches OMEGA (for Tommy, not the browser)

- OMEGA's pay-at-the-end signup, plan changes and packs all use the
  QuickBooks invoice link. Once Part 1 reports "Pay now visible", the
  production switch in `docs/PACKAGING-RELEASE-CHECKLIST.md` §2
  (`PACKAGING_LIVE=true`, `QBO_ENV=production`, the book synced with
  `scripts/qbo-sync-items.js --live`) is all that stands between a sandbox
  invoice and a real one.
- Stripe is held in reserve behind the same seam: the QuickBooks driver
  is three functions (`customer`, `invoice`, `reconcile`) in
  `api/_lib/qbo-billing.js`. A Stripe driver would answer the same three
  (a Checkout Session as the pay link, a PaymentIntent as the receipt) and
  the connector from Part 3 would book it. Nothing else in OMEGA would
  change. It is not built, and it is not needed to launch.
- No key from either dashboard goes anywhere but Vercel's environment
  variables, entered by Tommy. Nothing in the repo, nothing in a chat.
