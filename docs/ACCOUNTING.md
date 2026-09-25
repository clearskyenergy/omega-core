# Accounting — receivables, payment voids, release on PO, and the workspace's own books

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-09-24. This covers the accounting page (`logic-accounting.html`),
what it may change on an order, and how a tenant-billed workspace keeps its
**own** QuickBooks company or Stripe account in step. It ends with the steps
that fix the live Acme order and the list of what is **not built**.

---

## Why this exists

The live Acme Fleet order (PO `ACME-4X7Q-0926`, USD 1,498,999.00,
tenant-billed, 90 % deposit invoice USD 1,349,099.10) was run through
`scripts/intake-order.js` with the template's placeholder payment still in
the order file. The run recorded `payment-received` USD 1,349,099.10 dated
2026-09-24 with the bank reference *"REPLACE WITH THE BANK REFERENCE, or
delete this payment if not yet received"*. `recordPayment` accepted it, the
deposit counted as satisfied, and `processOrder` released the order: it is in
build, works order `wo_<id>` exists and 56 serials are registered. Only the
PO had arrived. The dashboard showed Received $1,349,099.10 and Outstanding
$0.

There was no way to correct that from the office short of editing Firestore.
Now there is, and the placeholder cannot happen again.

## The decisions

1. **A payment is never deleted; it is voided.** The entry stays in
   `payments[]` with `voidedAt / voidedBy / voidReason / voidSource`.
   `paidCents / balanceCents / satisfied / status` are **recomputed** from the
   entries that are not voided by one pure function, `settle()` in
   `api/_lib/receivables.js`. The dashboard's "Received" sums `paidCents`, so
   it excludes voided money with no page change.
2. **A voided reference is never silently received again.** Recording a
   reference whose only match is a voided entry is refused (409) and names the
   void. The office may deliberately *reinstate* it (`reinstate: true` and a
   reason); that appends a NEW entry (`reinstates: <index>`) and the voided
   one stays. The ledger sync never reinstates: a voided `qbo:` / `stripe:`
   reference that reappears in a pull is reported as a conflict, not
   recorded. The office may take back its OWN void of such a reference the
   same way (reinstate and a reason, for the amount the provider recorded):
   the new entry is the provider's again (its `source`, `external` id and
   amount), so later pulls match it and a real reversal in the books still
   voids it. The office can never type a NEW `qbo:` / `stripe:` reference.
3. **Placeholders are refused outright** (`isPlaceholder`: `REPLACE`,
   `PLACEHOLDER`, `TBD`, `TODO`, `PENDING`, `NOT (YET) RECEIVED`, `DELETE
   THIS`, `XXXX`, `0000`, `N/A`) on every path, reinstated or not. The intake
   script now skips such a payment and prints
   `! payment NOT recorded — <why>` instead of recording it.
4. **Voiding the payment a release rested on needs a human choice** — when
   the voided payment is the deposit of an order that is released, not
   shipped / complete / cancelled, and has no credit release yet:
   - *Keep building on the PO* records `logic.creditRelease`: the release is
     explained, nothing is raised, the plant carries on.
   - *Hold* sets `logic.paymentHold` + `logic.paymentException`, which every
     plant scan already refuses, exactly as a QuickBooks reversal does.

   A void that arrives from a provider (a QuickBooks payment that vanished,
   a Stripe refund or lost dispute) cannot ask, so it **holds**.
5. **Release on PO** (`logic.creditRelease`) satisfies the deposit gate in
   `release()` and nothing else. Tenant-billed only, workspace admin or the
   ClearSky owner only, audited, shown on the order, the dashboard ("Released
   on PO", amber) and the accounting page ("On PO credit").
6. **No ship rule is loosened.** Shipment still needs the balance recorded,
   and now also the deposit: a credit release breaks the old "released ⇒
   deposit paid", so `finish(…, shipment)` gained the deposit check that
   `api/logic-logistics.js` already applied. A services-only order likewise
   completes only with the deposit and the balance recorded. Terms that let
   an order ship before it is paid are **not** built.
7. **One writer.** Only `api/_lib/logic-workflow.js` writes order money
   fields. The rules it applies are the pure `api/_lib/receivables.js`
   (plans, settle, aging, ledger rows, CSV), which the render fixture and the
   app sandboxes bundle, so they apply the same rules without a second copy.
   `api/_lib/ledger-sync.js` talks to QuickBooks / Stripe and to its own
   `integrations/**` documents and never writes an order. The Stripe webhook
   is a **hint** that makes the workflow re-read Stripe.
8. **Per-workspace sync uses the workspace's own books**, never ClearSky's
   company. Tokens and account ids live only under `integrations/**`, which
   `firestore.rules` closes to browsers. No token, key or code reaches a
   browser; the page lists missing env var **names** only.
9. **Only invoices issued while a provider was chosen are pushed
   automatically** (`ledger.state === 'pending'`). An invoice issued before
   (Acme's deposit) is pushed or **linked** by an explicit action, so
   nothing is entered twice in books that may already hold it.

10. **One invoice takes its payments from one place.** Bank references
    from the office and `qbo:` / `stripe:` references from a pull never
    match, so the same money could otherwise be counted twice — once by
    hand, once by the pull — and a doubled part payment would release the
    plant on money that never arrived (the Acme failure again). So:
    - an invoice that lives in the workspace's **QuickBooks** (linked or
      pushed, and QuickBooks is still the chosen provider) refuses a payment
      recorded by hand — *"This invoice is in QuickBooks (145); apply the
      payment there and sync"* — and the page does not offer Record payment
      on it. After the workspace switches to *Off* (or to Stripe) the office
      records by hand again;
    - a **Stripe** invoice still takes a wire recorded by hand: that is the
      path for an installment above Stripe's per-payment cap (Acme);
    - either way, while an invoice carries payments recorded by hand, a
      provider receipt is **not recorded**: the pull reports a conflict
      naming the hand entries, and a person voids the hand entry the books
      now hold, then syncs. Nothing is released on it meanwhile.

## Where it lives

| Piece | File |
|---|---|
| The rules (pure) | `api/_lib/receivables.js` — `settle`, `recordPlan`, `voidPlan`, `releasePlan`, `editPlan`, `rows / filter / totals / ledger / csv` |
| The one writer | `api/_lib/logic-workflow.js` — `issueInvoice`, `recordPayment`, `voidPayment`, `editInvoice`, `releaseOnPo`, `pushLedgerInvoice`, `linkLedgerInvoice`, `syncLedger`; `release()` and `finish()` |
| Office stage labels | `api/_lib/office-stage.js` — `creditOpen(o)`; `stage.credit: true` while a deposit released on PO is open |
| Office actions | `api/logic-office.js` — `invoice-issued`, `payment-received`, `payment-void`, `invoice-edit`, `release-on-po` |
| The ledger + sync actions | `api/logic-accounting.js` — GET ledger / CSV; POST `sync-choose`, `sync-connect`, `sync-disconnect`, `sync-push`, `sync-link`, `sync-pull` |
| Provider code | `api/_lib/ledger-sync.js`; `api/_lib/qbo.js` (every export takes an optional org; without one it is ClearSky's company exactly as before) |
| OAuth / Connect callback | `api/ledger-connect.js` |
| Stripe Connect webhook | `api/ledger-webhook.js` (NOT `api/stripe-webhook.js`) |
| The page | `logic-accounting.html` (Money → Accounting in `omega-logic-theme.js`); the dashboard links it from Cash flow and from each tenant-billed invoice |
| Tests | `scripts/test-accounting.js` (workflow, endpoints, the Acme scenario), `scripts/test-ledger-sync.js` (providers, callback, webhook); render checks `accounting` and `office` in `scripts/render-logic-pages.js` |

**Who.** Every accounting read and write passes
`X.authorize(caller, org, true)`: a workspace owner/admin or the ClearSky
owner. A member gets 403 — the ledger names every customer's balance.

## The data, in short

All money is integer cents; dates are `YYYY-MM-DD`, instants ISO.

- **Invoice** `orders/{id}.logic.invoices.{deposit|balance}` — existing
  `amountCents, id (the number), date, issuedAt, issuedBy, payments[],
  paidCents, balanceCents, satisfied, status, payUrl`, plus
  `dueAt` (only when set explicitly; otherwise derived from
  `commercial.terms.dueDays`), `edits[]` (≤ 50: `{at, by, reason, was, now}`,
  only the fields that changed) and `ledger` (where it lives in the
  workspace's books). For a tenant invoice, status is exactly `settle(inv).status`.
- **Payment entry** — `amountCents, date, bankReference, by, at, source
  ('office'|'quickbooks'|'stripe'), external?, reinstates?, reinstateReason?`,
  and when voided all four of `voidedAt, voidedBy, voidReason, voidSource`.
  Provider references are `qbo:<PaymentId>` and
  `stripe:<chargeId | paymentIntentId | invoiceId>`; the office cannot type
  either prefix.
- **Credit release** `logic.creditRelease` —
  `{by, at, reason, poNumber, basis: 'po'|'void'|'hold-lifted', voidedReference?, openCents}`.
  Never removed; once the deposit is paid it stays as history. "On PO
  credit" = a credit release and a deposit not yet satisfied.
- **Payment hold** `logic.paymentHold` `{stage, reference, reason, by, at, source, message}`
  with `logic.paymentException = message`. Lifted (both `null`) when a
  payment satisfies that stage again or a release on PO is recorded. A
  `paymentException` without a `paymentHold` (a cancellation, a ClearSky
  QuickBooks reversal) is never lifted by this code.
- **Sync error** `logic.ledgerSyncError` `{provider, message, at}` — written
  by the worker's sync only when the message changes; it is not `lastError`
  and never blocks fulfilment.
- **Invoice ledger** `invoice.ledger` — `{provider, state: 'pending'|'pushed'|'linked'|'error',
  invoiceId, number, customerId, company (realmId | acct_…), hostedUrl,
  totalCents, at, by, error, warning, pushWarning, lastPullAt}`. `hostedUrl`
  also becomes the invoice's `payUrl`. `pushWarning` keeps what the provider
  said when the invoice went in (a QuickBooks total that differs from ours;
  Stripe's per-payment cap), so a later pull with nothing to say does not
  erase it; `warning` shows the pull's own conflict first, else that.
- **Workspace choice** `omega_orgs/{org}/fulfillment/config.ledgerSync` —
  `{provider: 'none'|'quickbooks'|'stripe', quickbooks: {itemRef, taxCodeRef,
  approved, approvedBy, approvedAt}|null, stripe: {paymentMethods, sendEmail}|null,
  since, chosenBy, chosenAt}`. Written only by `api/logic-accounting.js`.
  Connection state is not kept here.
- **Provider records** (Admin SDK only; see the comment above
  `match /integrations/…` in `firestore.rules`):
  `integrations/quickbooks_workspaces/orgs/{org}` (+ `customers/`, `invoices/`),
  `integrations/stripe_connect/orgs/{org}` (+ `customers/`, `invoices/`),
  `integrations/stripe_connect/accounts/{acct}`,
  `integrations/stripe_connect/events/{evt}`,
  `integrations/ledger_oauth/states/{state}`. No Stripe token is stored at
  all: the platform key plus the connected account id is what a call needs.

Every order write lands in `omega_audit` in the same transaction as the
order change and its order event: `ledger-invoice-issued`,
`ledger-payment-recorded`, `ledger-payment-reinstated`, `ledger-payment-void`,
`ledger-invoice-edit`, `ledger-release-on-po`, `ledger-invoice-push`,
`ledger-invoice-link`. The workspace's sync settings are audited too:
`ledger-sync-choose`, `ledger-sync-connect-start`, `ledger-sync-connected`,
`ledger-sync-disconnect`, `ledger-sync-pull`.

## Decisions made while putting it together

- **The owner's cleared receipts are not rewritten by a void.**
  `logic.payout` (owner-only "Confirm cleared receipts" / "Record completed
  wire") is ClearSky's own settlement ledger. When a void leaves
  `payout.clearedCents` above what is now recorded, the void's order event
  says so ("… now exceed what is recorded …; the owner reviews the wire
  settlement") and its audit row carries `after.payoutReview
  {clearedCents, recordedCents}`. Nothing is changed automatically.
- **Recording the same invoice number twice changes nothing.** A second
  `invoice-issued` with the recorded number is a duplicate; a correction is an
  `invoice-edit`, which keeps its history. Issuing with the other stage's
  number is refused.
- **A failed push is not retried behind anybody's back.** It is stored as
  `ledger.state: 'error'` with the provider's message; the row's Push button
  retries it.
- **"Sync all now"** runs at most 25 orders and stops starting new ones after
  20 s; the rest wait for the next click or the 5-minute worker.
  `api/logic-accounting.js` and `api/ledger-webhook.js` have `maxDuration: 60`
  in `vercel.json`.
- **Stripe amounts above USD 999,999.99** (Stripe's per-line maximum; the
  Acme deposit is USD 1,349,099.10) are split into tagged parts on one
  invoice, and the invoice carries a warning: a single card or bank payment
  that large may be refused unless the Stripe account has a raised limit. A
  wire recorded by the office is the path for those.
- **Stripe disputes** are read through `GET /v1/disputes?charge=` when a
  charge is `disputed` (the pinned API version `2024-06-20` does not expand
  `charge.dispute`). An open dispute or a partial refund is a warning a
  person reads; a full refund or a lost dispute is a reversal (void + hold).
- **QuickBooks invoices have a reverse index** like Stripe's
  (`…/quickbooks_workspaces/orgs/{org}/invoices/{realmId}_{id}`), so one
  QuickBooks invoice can never be linked to two orders and a push that died
  after Intuit committed resumes instead of duplicating. It is keyed by
  company because QuickBooks numbers invoices per company: after a workspace
  moves to another company, that company's invoice 145 is not the old one's
  145, and the old company's entries stay as history (never overwritten).
- **A pull applies reversals before new receipts.** A QuickBooks payment
  deleted and entered again under a new id (or two merged into one) is then
  a void followed by a receipt that lifts the hold the void set, in the same
  pull, instead of a receipt refused as "exceeding the invoice" followed by
  a void that holds an order whose money never left the books. (The void and
  the lift are both in the order's events, a moment apart.)
- **One invoice refused by the provider does not stop the other.** The
  deposit and the balance are pulled separately; a whole-invoice refusal
  ("QuickBooks invoice changed; reconcile by hand", a payment customer
  mismatch, an invoice in a company the workspace is no longer connected
  to) is kept on that stage, the other stage is still pulled and recorded,
  and only then does the sync fail — `logic.ledgerSyncError` names the
  invoice ("deposit invoice: …"). "Sync all now" reports what the other
  invoice recorded; a Stripe event about the invoice that synced is marked
  done instead of being retried for days.
- **Deposits expected** on the dashboard (`S.finance`) includes a deposit
  still open on an order released on PO, whatever stage the order has moved
  to, so the Cash flow panel agrees with itself and with "On PO credit".
- **What an action says is shown where the person is looking**: inside the
  open drawer (it covers the page on a phone), and a failed push or sync
  redraws the row so the error kept on the invoice is on screen. A void the
  server answers with "choose keep building on the PO, or hold" (the order
  reached the plant after the page loaded) now offers that choice in the
  dialog. Release on PO says whether the plant has actually started.
- **"Connected"** means usable: a QuickBooks company whose refresh token has
  expired, or that was connected in the other Intuit environment, shows as
  not connected, with the reason, and the page offers Connect again.
- **Stripe counts as configured only with `STRIPE_CONNECT_WEBHOOK_SECRET`
  set**, so a deployment never sends invoices it cannot hear about.

## Deployment setup (not done yet — the page says exactly what is missing)

QuickBooks, the workspace's own company:
- `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` (shared with ClearSky's connection),
  `QBO_ENV` (shared).
- `QBO_WORKSPACE_REDIRECT_URI` = `https://<host>/api/ledger-connect`,
  registered in the Intuit app **beside** ClearSky's `QBO_REDIRECT_URI`.

Stripe, the workspace's own account through Connect (Standard OAuth):
- `STRIPE_SECRET_KEY` (the platform key), `STRIPE_CONNECT_CLIENT_ID` (`ca_…`),
  `STRIPE_CONNECT_REDIRECT_URI` = `https://<host>/api/ledger-connect`
  (registered in the Connect settings), `STRIPE_CONNECT_WEBHOOK_SECRET`.
- A **Connect** webhook endpoint at `https://<host>/api/ledger-webhook`,
  listening to events on connected accounts: `invoice.paid`,
  `invoice.payment_succeeded`, `invoice.voided`,
  `invoice.marked_uncollectible`, `charge.refunded`,
  `charge.dispute.created`, `charge.dispute.closed`,
  `account.application.deauthorized`.

The OAuth state cookie is host-scoped: Connect must be started on the
redirect URI's host. The page says so when it is opened elsewhere.

## Fixing the live Acme order (after deploy — no script, no data surgery)

As Tom (owner) or a Clean Cell admin:
1. Open `/logic-accounting.html?org=cleancell.us`.
2. Open the row `ACME-4X7Q-0926 · deposit`, and choose **Void** on the
   placeholder payment.
3. Reason: *"Recorded by the intake script from the template; the money has
   not been received — only the PO"*.
4. Choose **Keep building on the PO** (PO `ACME-4X7Q-0926`), then **Void
   payment**.

Result: the deposit of USD 1,349,099.10 is *awaiting payment* with 0
received; the order stays in build, the works order and the 56 serials are
untouched; the dashboard shows Received $0.00, Outstanding $1,349,099.10 and
"Released on PO" on the order. When the wire lands, record the payment with
the bank's real reference and the invoice becomes paid. Shipment still needs
the deposit and the balance recorded.

`scripts/test-accounting.js` runs exactly this on the Firestore double
(tests "THE ACME ORDER …" and "then the real wire …").

## Not built

- **QuickBooks webhooks for workspace companies.** `api/logic-webhook.js`
  only takes ClearSky's realm. The 5-minute worker (`processOrder`) and the
  page's "Sync payments now" / "Sync all now" read QuickBooks instead.
- **The Stripe payment link in the customer portal.** The hosted invoice
  page is stored as the invoice's `payUrl`, but the portal shows a link only
  once `P.paymentLink` (`api/_lib/logic-policy.js`, shared) accepts
  `invoice.stripe.com`; this change does not widen that filter. Customers
  already see the corrected status and received amount through
  `api/_lib/portal.js`; they do not see `dueAt` edits.
- **Editing an invoice that lives in QuickBooks or Stripe** — edit it there.
  Credit notes and partial refunds are reported, not applied. Non-USD.
- **Terms that let an order ship before full payment** ("unless terms say
  otherwise") are not implemented. Ship rules are unchanged apart from the
  deposit check `finish()` gained, which logistics already applied.
- **Pushing ClearSky-billed orders** anywhere but ClearSky's QuickBooks
  (unchanged).
- **Swapping a hand entry for the provider's copy in one step.** When a pull
  reports that the books hold money already recorded by hand, the office
  voids the hand entry and syncs; on a released deposit that void asks keep
  building / hold like any other, and the pull that follows records the
  provider's entry (lifting a hold).
- **Entries for this page** in `CLAUDE.md`, `docs/OMEGA-LOGIC-MANUAL.md` and
  `api/_lib/kit.js` are follow-ups: those files were being changed by other
  work when this landed.
