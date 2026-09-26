# Packaging release checklist — the stacked merge, in order

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Phases 0–8 of the packaging program are nine stacked draft pull requests.
Nothing in them is live: every flag is off, the price book is disabled in
the seed, no rule is deployed, no tenant is packaged. This is the order in
which one person turns that into a release, with the check that proves each
step before the next. Tommy runs the steps marked **(Tommy)**; nothing here
is to be run by an agent without them.

## 0. Before anything merges

- [ ] Decisions on record (roadmap §11): $0 module inside a paid tier
      activates at once (option 1); AI Render only in Plan Sets & CAD;
      Export to Monday stays in Lite; annual prepay is ten months (two months free) with no
      transformation credit; trials start at approval, once per
      organization, at most 14 days; staff is a verified `@clearsky-usa.com`.
- [ ] **(Tommy)** Price book values signed off (VALUE-LADDER §11). Until
      then `api/_lib/pricebook.js` stays proposed and disabled.
- [ ] Counsel's Agreement changes for clickwrap terms and the usage meters.
- [ ] The tip branch (`codex/packaging-phase-8`) passes `npm test` and
      `npm run check:pages` on a clean checkout.
- [ ] **Signing in on a preview (Tommy, console only).** "This site isn't
      authorised for sign-in" on a `*.vercel.app` address is Firebase's
      `auth/unauthorized-domain`: the hostname is not on the project's
      list. Add each preview hostname you will click through under
      Firebase → Authentication → Settings → Authorized domains (no
      wildcards; one line per branch, e.g.
      `omega-core-git-codex-packaging-phase-9-clearsky-usa.vercel.app`),
      or sign in with email and password, which does not check the list.
      Then sign in with an address whose domain is a workspace
      (`tom@clearsky-usa.com` for ClearSky; a public-provider address such
      as gmail has no workspace and is refused by design).
- [ ] **The rules are deployed** (§4). Until then a person who signed up
      with a capital letter in their address is refused every Team Hub
      write and the terms acceptance: the deployed rules compare the token
      email verbatim; the repo's compare it lower-cased (Phase 9).

## 1. Merge order

Each PR's base is its predecessor, so merge bottom-up and retarget the next
PR to `main` as its base lands (GitHub does this when the base branch is
deleted; check it did). Merge with a merge commit, not a squash, so the
per-phase history and the guide manifests stay attached to their commits.

| Order | PR | Phase | Merge only after |
|---|---|---|---|
| 1 | [#134](https://github.com/clearskyenergy/omega-core/pull/134) | Docs + Phase 0 (decide, fixes, 14-day cap) | §0 |
| 2 | [#135](https://github.com/clearskyenergy/omega-core/pull/135) | A · polish | #134 |
| 3 | [#136](https://github.com/clearskyenergy/omega-core/pull/136) | 1 · catalog and price book | #135 |
| 4 | [#137](https://github.com/clearskyenergy/omega-core/pull/137) | 2 · close the leaks | #136 |
| 5 | [#138](https://github.com/clearskyenergy/omega-core/pull/138) | 3 · editor fits the package | #137 and the `modules[]` backfill dry run reviewed (§3) |
| 6 | [#139](https://github.com/clearskyenergy/omega-core/pull/139) | 4 · admin panel, signup billing, trial, QuickBooks customer | #138 |
| 7 | [#140](https://github.com/clearskyenergy/omega-core/pull/140) | 5 · subscribe in the editor | #139 |
| 8 | [#141](https://github.com/clearskyenergy/omega-core/pull/141) | 6 · proposal tool and signup discovery | #140 |
| 9 | [#142](https://github.com/clearskyenergy/omega-core/pull/142) | 7 · usage, packs, review | #141 |
| 10 | [#143](https://github.com/clearskyenergy/omega-core/pull/143) | 8 · Omega Logic follows the package | #142 |
| 11 | [#144](https://github.com/clearskyenergy/omega-core/pull/144) | 9 · the plant's doors and sign-in | #143 |

After each merge: `npm test` on `main`; the Vercel production build is
green; nothing changes for a tenant because every flag is off.

## 2. Flags and environment (Preview first, Production last)

All off by default. Set them in Vercel per environment; never in the repo.

| Variable | Where | Meaning |
|---|---|---|
| `QBO_ENV=sandbox` | Preview | every QuickBooks call goes to the sandbox company (`api/_lib/packaging-mode.js`) |
| `PACKAGING_LIVE=true` **and** `QBO_ENV=production` | Production only, both literal | LIVE: the production company, an enabled book under a release version, any tenant may buy. One without the other, or `QBO_ENV` unset, is refused everywhere: no invoice, no sync, no runner tick, no packaged signup |
| `PACKAGING_SIGNUP_ENABLED=true` | Preview | `start.html` collects the billing profile and the discovery answers |
| `PACKAGING_BILLING_ENABLED=true` | Preview | activation, invoices, reconciliation, plan changes, packs |
| `CRON_SECRET` (and the billing runner's own secret, per `api/billing-run.js`) | Preview and Production | the authenticated runners: `/api/logic-worker` (five-minute) and `/api/billing-run` (daily: reconcile, recurring invoices, review) |
| existing Firebase Admin and QuickBooks credentials | as today | no new OAuth scope; Step B (saved card) stays off |

In sandbox mode a tenant takes part only when its `omega_orgs/{org}`
record carries `packagingSandbox: true` (signup writes it in Preview);
applying a package to an unmarked organization is refused. In live mode
every tenant may buy, a live signup is not a sandbox tenant, and the daily
runner finds its tenants by `packaged: true` on the organization record,
which signup and every activation write.

## 3. Seeds, sync and backfill

1. `node scripts/seed-pricebook.js` — dry run, read the diff, then `--apply`.
   The seed writes the book disabled.
2. `node scripts/qbo-sync-items.js` against the **sandbox** realm with the
   income account and the reviewed tax treatment: one Product/Service per
   module, plan, `overage:<meter>` and `pack:<meter>`; the ids land in the
   book. Idempotent; run again after any book change.
3. `node scripts/enable-packaging-sandbox.js` read-only; its `--apply` needs
   the exact `--expected-hash` it printed, an unused book, every item
   binding and a stored connection in that sandbox realm.
4. `node scripts/backfill-modules.js` — **dry run only until reviewed**. It
   proposes `modules[]` for every live tenant from today's tier and add-ons
   and flags, never drops. Before and after any `--apply`, run
   `node scripts/audit-counts.js` and keep the per-orgId counts; they must
   match. No live tenant may lose a tool it uses today without a decision
   recorded in the roadmap.
5. `node scripts/seed-omega-orgs.js` is unchanged; it still refuses a
   `tenant.json` carrying a cost basis.

## 4. Rules deploy (one deploy, after the stacked merge)

The rules in the repo already carry every block; none is live. Deploy once,
then prove it:

- [ ] `npm run rules:check` on the merged tree.
- [ ] `npm run test:packaging:rules` against the emulator
      (`@firebase/rules-unit-testing`, Firestore at localhost:8187, Storage
      at localhost:9297, project `demo-omega-packaging`).
- [ ] Deploy `firestore.rules` and `storage.rules`.
- [ ] Grep the **live** rules for `isTenantAdmin`, `opportunities`,
      `pricebook`, `subscription_proposals`, `/usage/`, the packaged
      write gates from Phase 4 and `token.email.lower()` in the team
      blocks, `termsAcceptances` and `isAdmin()` (Phase 9); each must read
      exactly as the repo's. Then sign in with a mixed-case password
      account and post one Team Hub message.
- [ ] `scripts/audit-counts.js` before and after; counts unchanged (a rules
      deploy moves no data).

## 5. Sandbox acceptance, phase by phase (Preview, sandbox company)

Each row is a real click-through with the flags on and a fresh synthetic
organization. None has been performed yet; every validation document says
so. Record the date and who did it beside each.

| Phase | Do | Expect |
|---|---|---|
| 4 | Sign up a synthetic work-email tenant on the preview hub; approve it from the master console with a package | A QuickBooks sandbox customer exists; the trial starts at approval and ends within 14 days; the first invoice is issued at trial end; after payment (mark paid in the sandbox) access continues; unpaid, it drops to read-only with the ribbon |
| 5 | As the tenant's owner, add a module from + Modules / Your plan | A prorated change invoice with a pay link; nothing switches on before payment except a $0 module inside a paid tier; after the runner reconciles the payment, the tools appear without staff |
| 6 | Send a proposal from `subscription-proposal.html`; accept it from `proposal.html` | The prospect lands in signup with the package prefilled; accepting never prices; the proposal reads `accepted`; a proposal for a paid packaged tenant becomes a plan change |
| 7 | Export an EV workbook past the included count; buy a pack; switch auto top-up on | The 402 offer at the allowance; a paid pack adds units after reconciliation; overage appears as a line on the next recurring invoice; the Package tab's review names it |
| 10A | From /login create an account with a fresh work address; verify it; the billing profile; build a system (watch the price and the yearly saving); Pay and start now; pay the sandbox invoice; I've paid | The login pane names the next steps and links to the signup page; an unverified address is held with Resend; the build step shows `$…/month` and the yearly card `…/year, invoiced once · save $…`; the pay step opens with QuickBooks' page; paid, the workspace opens with the package bought |
| 8 | Activate Lite + Office + Plant; open the office, a materials page, the Omega Logic app and the customer portal | Build shown, no Deliver or materials plan; the materials page prints "Materials & Purchasing is not in your Omega Logic package"; the app has four tabs; the customer portal says "not active" until Customer App is added; a legacy tenant shows nothing new |

Then the runners: `vercel.json` schedules `/api/billing-run` daily and
`/api/logic-worker` every five minutes, but Vercel scheduled crons run only
on Production, so in Preview invoke each by hand with its secret and read
the audit rows it writes.

## 6. Production (Phase 10A: in this order, each step checked before the next)

- [ ] **QuickBooks Payments is on** in the production company, with cards
      and bank transfer allowed on invoices and *Pay now* visible on an
      invoice preview. Without it no invoice carries a pay link and every
      pay-at-the-end signup falls back to approval. The browser runbook:
      `docs/PAYMENTS-BROWSER-SETUP.md` (it also connects the Stripe
      bookkeeping app; that is not what pays an invoice).
- [ ] Sandbox acceptance complete for every phase above.
- [x] **Sign the values off**: `VERSION` in `api/_lib/pricebook.js` is
      `2026-10` (renamed from `…-proposed` on 2026-09-26, Tommy's word). A
      `-proposed` book is refused as a production book by its own
      validation, so this was the one line that could not be skipped.
- [ ] Seed it for the production company:
      `node scripts/seed-pricebook.js --live --realm=<production realm>`
      (dry run), then `--apply`.
- [ ] Bind the items in the production company, with the process in live
      mode and the flag as the second confirmation:
      `PACKAGING_LIVE=true QBO_ENV=production node scripts/qbo-sync-items.js --apply --live --realm=<production realm> --income-account=<id> --taxable|--non-taxable`
      (dry run first without `--apply`). One without the other is refused.
- [ ] Enable the book: `node scripts/enable-packaging-sandbox.js` (dry run
      prints the hash), then `--apply --expected-hash=…`. It enables the
      current book in either mode; the name is historical.
- [ ] Vercel **Production** environment: `PACKAGING_SIGNUP_ENABLED=true`,
      `PACKAGING_BILLING_ENABLED=true`, `PACKAGING_LIVE=true`,
      `QBO_ENV=production`, `CRON_SECRET`. Redeploy.
- [ ] One real signup by ClearSky (a company on a ClearSky-controlled
      domain, a real card): the pay step shows QuickBooks' page, the
      invoice is in the production company, "I've paid" opens the
      workspace with the package bought. Then refund the payment and void
      the invoice in QuickBooks; the runner marks the record reversed.
- [ ] Existing tenants one at a time: `packagingSandbox` is **not** the
      production gate — production packaging follows the backfilled
      `modules[]` per tenant; cut over a tenant by writing its package from
      the Package tab and watching its first recurring invoice.
- [ ] Signed-agreement tenants (Fenecon, the OSA JV) stay excluded from
      clickwrap-driven changes until counsel clears them.
- Once the release version is seeded for production, the sandbox
  acceptance for that version is over: one Firestore, one `VERSION`.

## 7. Debt carried into the release (not blocking the merge, blocking "done")

- Step B (saved card, instant charge) needs the QuickBooks Payments
  permission on a reconnect (Tommy); pay-first uses the invoice link.
- A cancelled change does not void its QuickBooks invoice; removals are
  recorded, not executed; annual and Enterprise changes are quoted by staff.
- Permitting matrices are priced but not counted (no producer); storage
  models and site screens are not counted (verify-token producers).
- Packs expire with the cycle; no rollover; no refund beyond taking units
  back on a reversal.
- A tenant that never pays keeps receiving recurring invoices; the invoice
  DocNumber depends on the sandbox company's custom transaction numbers.
- The Phase 2 browser-engine ports and the historic release inventory
  remain prerequisites for a full production cutover (MERGE.md).
- White-label proposal senders are staff only; the deck PDF is browser print.
