# Refer & earn

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

A workspace sends a company to OMEGA. When that company becomes a **paying
customer**, the workspace that sent it earns a **$500 credit code** to apply
to its own bill. Built 2026-09-27.

Everything that decides anything is in one file, `api/_lib/refer.js`. Every
writer calls it: `api/refer.js` (the page and the console),
`api/tenant-signup.js` (who sent a new workspace), the billing engine
(`package-billing` `issue` draws a credit onto an invoice, `reconcile`
rewards a payment) and `api/stripe-webhook.js` (a Stripe payment).

## The flow

1. **Share.** Refer & earn (the rail, `/workspace#refer`) shows the
   workspace's link, `https://silmarillion.clearskyomega.com/start?ref=CODE`,
   with Copy and Share by email. **Invite someone** emails a company the link
   from ClearSky's `dev` mailbox with Reply-To the member who sent it (20 a
   day per workspace; work addresses only; a colleague's address is refused).
2. **Sign up.** `start.html` keeps `?ref=` in the visitor's own browser for
   90 days (signing in, making an account and checking the email can come in
   between) and sends it with the signup. `tenant-signup` writes
   `refer_signups/{newOrg}` in the same transaction (packaged) or batch
   (legacy) that creates the workspace, once. No code, but an invitation to
   that domain in the last 90 days: the earliest inviter is credited. A code
   beats an invitation. A workspace never refers itself; a paused link or a
   cancelled or suspended referrer credits nobody. ClearSky hears about each
   referred signup.
3. **Pay.** The first time the referred workspace **pays**, the referrer is
   rewarded: a code `CR-XXXXX-XXXXX` in `refer_credits/`, issued to the
   referrer and no one else, good for a year. The owners are mailed the code
   (and the member who sent the invitation, if that is how it came), the
   workspace's inbox and ClearSky's get a notice, and the referrer's
   `admin_audit` a row. Triggers, all idempotent:
   * a subscription invoice reconciles **paid** in QuickBooks
     (`package-billing.reconcile`, so the runner and "I've paid" both do it);
   * a Stripe `invoice.paid` with `amount_paid > 0`;
   * ClearSky's **It paid: issue the credit** for a workspace invoiced by hand.

   Signing up earns nothing: a signup is free to fake, a payment is not.
4. **Apply.** An owner or administrator presses **Apply to my bill** (or
   types a code). Where it lands depends on how the workspace is billed:

   | Workspace billed by | What happens | Code state |
   |---|---|---|
   | the package engine (QuickBooks) | the next subscription invoice carries it as a discount; never below $0; what is left carries to the next | `applied` → `used` |
   | Stripe (`stripeCustomerId`) | a Stripe customer balance credit (idempotency key per code); Stripe takes it off the next invoice | `applied`, route `stripe` |
   | ClearSky by hand | recorded; ClearSky is mailed and told in its inbox to take it off the next invoice; staff mark it **Taken off an invoice** | `applied` → `used` |

   A workspace with no billing record at all (invoiced entirely by hand) goes
   to ClearSky the same way; a code never makes a billing record (the same
   rule as an opt-in). Stripe refusing (a missing key, an unknown customer)
   falls back to ClearSky by hand, with the reason on the code. A workspace
   that is not active cannot apply a code, and keeps it.

## Records (all Admin SDK only, `firestore.rules`)

```
refer_links/{orgId}             code (8 of 32 characters), active, createdAt/By,
                                invites {day, count}   (the daily invitation count)
refer_signups/{referredOrgId}   referrerOrgId, referrerName, code | null,
                                via link|invite|staff, invitedBy, state
                                signed_up → rewarded | declined, creditCode
refer_credits/{CODE}            orgId (the earner), amountCents, remainingCents,
                                state issued → applied → used | void,
                                route invoice|stripe|manual, issuedAt, expiresAt,
                                appliedAt/By, draws [{date, cents}],
                                stripeBalanceTxn, settledBy/Note, voidedBy/Reason
refer_invites/{orgId__domain}   email, name, company, by, at (first), lastAt, count
```

Not the `referrals` collection: that is the quote-request inbox
(`omega-referrals.js`), and nothing here touches it.

A packaged invoice record carries `credits: [{code, cents}]` and each credit
line (`itemKey: 'credit'`, `kind: 'referral'`, `code`). The billing history
row for the invoice records `referralCreditCents`.

## The invoice (packaged workspaces)

`package-billing.issue` reads the workspace's applied credits **inside** the
transaction that prepares a new invoice, draws them oldest first
(`refer.draw`, pure) and writes each credit's new remainder in the same
transaction (`recordDraws`). A prepared invoice that failed at QuickBooks is
retried with the draw it already carries, so a credit is never drawn twice.

QuickBooks takes **one** discount line per transaction. `qbo-billing` now
sums every negative line on a plan (the transformation credit and any
referral credit) into that one `DiscountLineDetail`, naming each in its
description, and `validateInvoice` compares the same sum. An invoice with a
single credit reads exactly as before. The credit uses the price book's
existing `credit` item binding, so **no QuickBooks item sync is needed**.

A credit that covers the whole invoice leaves a $0 invoice: QuickBooks still
sends it for the records, it reconciles as paid (nothing is owed), and the
notice and mail say "Your referral credit covered this invoice ($500 off).
Nothing to pay." rather than asking for payment.

## ClearSky's controls

The tenant page in the master console (`/admin/tenant?org=`) has a
**Referrals** panel: the workspace's link, the credits it earned, the
companies it sent and who sent it. Buttons, each a staff-only POST to
`/api/refer` and an `admin_audit` row:

* **It paid: issue the credit** (`qualify`) — a referred workspace invoiced
  by hand paid its first invoice.
* **Record** (`attribute`) — a referral made outside the link (a call, an
  introduction), recorded before the company pays.
* **Decline** (`decline`) — not a real referral (the same company under
  another domain): no credit will be issued.
* **Taken off an invoice** (`settle`) — a hand-invoiced credit came off an
  invoice; say which.
* **Void** (`void`) — withdraw a code nothing was taken off yet (a mistake, a
  refunded first payment). A Stripe credit is reversed in Stripe.

## Rules of the program (constants in `refer.js`)

* $500 per company that becomes a paying customer (`REWARD_CENTS`), no cap.
* A code lapses a year after it is issued if nobody applies it
  (`EXPIRES_DAYS`); once applied it does not lapse.
* Twenty invitation emails per workspace per day (`INVITES_PER_DAY`); an
  invitation credits a signup from that domain for 90 days (`INVITE_DAYS`).
* A code is money off the earning workspace's bill, never cash, and cannot be
  used by another workspace (the same answer for "no such code" and "another
  workspace's code", so codes cannot be probed).
* The referred company gets nothing extra; it is told on the signup page
  that the company that sent it is thanked when it becomes a customer, and
  that nothing about its workspace is shared.

## Checks

* `node scripts/test-refer.js` (in `npm test`): codes, attribution, both
  signup paths, the reward from a QuickBooks payment, applying to all three
  routes, the draw on real `issue()` calls (covered, partial, carried,
  retried), the one QuickBooks discount line through the real driver,
  invitations, ClearSky's controls and the page's summary.
* `scripts/tests/tworkspacetoday.js`: the Today row for a waiting code.
* `npm run check:workspace`: the rail item, the page and an invitation for
  Northstar; for NextGen (billed by hand) the Today row and badge, Apply to
  my bill through the real library, and the line on Plan & billing.

## What is not built

* **The classic dashboard** (`index.html`, `shell: 'classic'`, partner-type
  workspaces) has no Refer & earn entry; those workspaces bounce off
  `/workspace`. ClearSky can still record and reward their referrals.
* **Activation's first invoice** (a legacy workspace moved onto a package, or
  a signup's pay-now) does not draw credits; the next recurring invoice does.
* **A voided or refunded invoice does not restore a drawn credit**: a person
  decides (void, settle, or a goodwill code).
* **No second-sided reward** for the referred company, and no leaderboard.
* **Not white-labelled**: invitations and the link are ClearSky-OMEGA's; the
  program is the platform's, not a tenant's.
