# What we built — the OMEGA packaging program, in plain words

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-09-26 for Tommy, at the end of phases 0–9. Ten stacked draft
pull requests sit above `main`, #134 → #144, each tested
(`npm test`, `npm run check:pages`) and previewed on Vercel. Nothing is live:
every runtime flag is off, the price book is disabled in the seed, no rule is
deployed, no tenant is packaged. The order to change that is in
`PACKAGING-RELEASE-CHECKLIST.md`; this page says what there is.

## 1. The product, as it is now sold

- **A menu of modules, one price each, a $500/month floor, nothing free.**
  The catalog is one file, `api/_lib/modules.js`: Lite (the base every
  package needs), Grid Atlas, Storage Sizing & Revenue, Estimate/BOM &
  Procurement, EV Rebates & Closeout, Plan Sets & CAD (the only home of AI
  Render), Site Intelligence, Engineering & Analysis, Investor & Finance,
  Compute & Data Center, Operations, White Label Storefront, Permitting
  Matrix, Site Finder, and the five Omega Logic parts: Office, Plant,
  Materials & Purchasing, Logistics & Warranty, Customer App. Every editor
  tool, ribbon button and menu entry belongs to exactly one module; a test
  fails if one is left out. Export to Monday stays in Lite, by your decision.
- **Three plans over the menu**: Field, Pro, Enterprise (Enterprise is an
  annual contract with setup and monthly development hours), plus à la
  carte, with the server steering a tenant to the cheaper of the two.
  Starter packages per vertical (EV installer, solar, developer, EPC, OEM,
  distributor, compute, capital) are what a new signup is proposed.
- **One price book**, `api/_lib/pricebook.js`, version `2026-10` (signed off
  2026-09-26; it was `2026-10-proposed` until then),
  frozen once used, disabled until you sign the values off. Annual prepay is
  ten months, two months free; there is no transformation credit.
- **Trials: 14 days at most, once per organization, starting at approval.**
  The billing day is the signup day; the first invoice is issued at trial
  end; unpaid, the workspace drops to read-only with a ribbon; paid, it
  continues. A Lite-only fallback exists for a lapsed renewal.
- **Billing runs through QuickBooks**, sandbox only in this code: a
  customer per tenant from the signup profile, Product/Service items per
  module, plan, overage and pack (`scripts/qbo-sync-items.js`), invoices
  with the online pay link, and a daily runner that reconciles payments.
  The saved-card path (Step B) waits on the Payments permission.
- **The Ladder** (Phase 10B): in the dashboard's Account panel a packaged
  workspace pays its invoice and opts into more — *build your own experience
  and pay for what you need to run your business*; every module is a rung
  and each Omega Logic department (Office, Plant, Materials & Purchasing,
  Logistics & Warranty, Customer App) stands on its own. A locked tile
  offers its rung by name and price. A legacy prepaid account sees none of
  it and keeps everything.
- **A company signs itself up and pays at the end** (Phase 10A): the
  public price list (`/offerings.html`), the details that make the
  QuickBooks customer, the package it chooses, the first invoice paid by
  card on QuickBooks' page, and the workspace open the moment the payment
  reconciles, with nobody's approval. One production switch
  (`PACKAGING_LIVE=true` with `QBO_ENV=production`) moves all of it from
  the sandbox company to the real one. The card button on an invoice is
  QuickBooks Payments; Stripe is bookkeeping only (`PAYMENTS-BROWSER-SETUP.md`).

## 2. Phase by phase

| Phase | PR | What a customer or a rep gets |
|---|---|---|
| 0 · Decide + fixes | #134 | The editor's staff fallback needs a verified ClearSky address; new signups capped at 14 days; the roadmap and the value ladder reconciled with your decisions. |
| A · Polish | #135 | Seven project cards and ribbon polish in the editor. |
| 1 · Catalog | #136 | The one module catalog, the proposed price book, server quotes (`api/package-catalog`), the sandbox item sync. |
| 2 · Close the leaks | #137 | Eight ways into a tool you had not bought (File menu, Summary › Cost, the documentation drawer, the Output tab, the command palette, Jarvis, `?customerEngine=1`, compute outside its tab) now go through the catalog on the server. |
| 3 · Editor fits the package | #138 | The editor lays itself out from `modules[]`: hidden tools you do not own (every draw function kept), the + Modules gallery, project workspaces, the shared gallery, a staff preview of any package, a dry-run backfill of today's tenants onto modules. |
| 4 · Admin panel, signup, trial, QuickBooks customer | #139 | The Package panel in the admin portal (Package, What Activate writes, Your plan, History); signup collects the billing profile and refuses public email providers; approval starts the one trial and creates the QuickBooks customer; invoices, paid reconciliation, the read-only-when-unpaid state; packaged writes are Admin SDK only. |
| 5 · Subscribe in the editor | #140 | An owner or admin adds a module from + Modules or Your plan: a prorated change invoice, pay first, the tools appear after reconciliation with no staff; a $0 module inside a paid tier switches on at once; cancel a pending change; request a removal. |
| 6 · Proposal tool | #141 | `subscription-proposal.html` for every ClearSky rep: discovery → recommended package → value → terms → a seven-page branded deck with the Order Form → send. `proposal.html` for the customer; accepting routes into signup (prefilled), a plan change or staff activation and never prices. Self-serve signup walks the same discovery, and the system reflects the answers. |
| 7 · Usage and review | #142 | Usage counted where a deliverable is produced (EV workbook, closeout ZIP, Site Finder packet, an RFQ), included + packs, the 402 offer at the allowance, overage as a line on the recurring invoice, buy-more packs and auto top-up from Your plan, the 90-day review on the Package tab. |
| 8 · Omega Logic follows the package | #143 | Office and the four Logic parts are refused by name where they are served; the office menu, hex hub, dashboard and phone app draw only the parts bought; the customer portal is the Customer App part. Legacy Logic tenants unchanged. The release checklist for the whole stack. |
| 9 · The plant's doors and sign-in | #144 | The bench, the rig and hold/release follow the Plant part; the rules compare a sign-in email lower-cased (Team Hub and terms were refused for a capitalised address); the preview sign-in refusal names the hostname to authorise. |
| 10B · The Ladder in settings | `codex/dashboard-billing` | Account › Billing & plan for a packaged workspace: package, status, monthly membership, next invoice, amount due with *Pay in QuickBooks* and *I've paid*, the invoices; *Open the Ladder* (every module an opt-in, Omega Logic by department) opens the one package menu on the dashboard; a locked tile says *Add <module> · $/month* and opens the Ladder on it; a legacy prepaid account (NextNRG) sees no Ladder and nothing locked. |
| 10A · Sign up, pay in QuickBooks, activate | #146 (+ the flow as sold: account → verified email → billing profile → build your system with a live price → monthly, or yearly at ten months) | The price list anyone can read; *Pay and start now* on signup: the first invoice with QuickBooks' card page, the workspace read-only until it is paid, "I've paid" opens it with the package bought; the fallback to approval when an invoice cannot be issued; the production switch, one rule for every money path. |

Every phase has a validation document (`PACKAGING-PHASE-N-VALIDATION.md`)
with what was verified, screenshots and what remains, and a row in
`PACKAGING-ROADMAP.md`'s status table.

## 3. Waiting to be folded in

`claude/stoic-goodall-zah8tv` (not on the stack): a Chromium render check
for the tenant dashboard (`npm run check:dashboard`), a dozen first-run
dashboard fixes in `index.html` (the locked-tile overlay, pending workspaces
with every tool live, the phone sidebar, dead guide links), and the sales
agent's first rung, `GET /api/growth` (staff only): each workspace's stage,
priority and one next action, no prices. `HANDOFF-DASHBOARD-AND-SALES-AGENT.md`
says how it merges (after the stack; four small conflicts) and what the
packaged world asks of it (six items). It is the next piece of work.

## 4. Not built, on purpose or not yet

- Step B, the saved card and instant charge: needs the QuickBooks Payments
  permission on a reconnect.
- Permitting matrices are priced but not counted (the producer does not
  exist); storage models and site screens are not counted.
- Packs do not roll over; a cancelled change does not void its QuickBooks
  invoice; removals are recorded, not executed; annual and Enterprise
  changes are quoted by staff.
- The proposal deck is browser print; senders are staff only.
- No sandbox click-through has been performed with the connected
  QuickBooks company; the flags have never been on outside tests.
- The older browser-engine ports and the Phase 2 release inventory
  (`MERGE.md`) remain prerequisites for a full production cutover.

## 5. Going live: who does what, in order

What can be done from a session like this one is the merge; everything
else needs your console access.

1. **Sign in on the preview (you, 2 minutes).** Firebase → Authentication →
   Settings → Authorized domains: add the preview hostname you are on (one
   line per branch, no wildcards). Or use email and password. Sign in with
   `tom@clearsky-usa.com`; a gmail address has no workspace by design.
2. **Read and approve the stack** (you): click through the previews in
   order; the checklist §0 lists the sign-offs the plan assumed (price
   book values, counsel).
3. **Merge** #134 → #144 bottom-up (I can do this on your word).
   Vercel deploys `main` to production; with every flag off, no tenant
   sees a change.
4. **Deploy the rules** (you): `firebase deploy --only firestore:rules,storage`
   from a machine with the project credentials, then the greps in
   checklist §4. This is what makes Team Hub work for a capitalised
   address and puts the packaged write gates in force.
5. **Seeds and sync** (you, with the Admin credentials): the price book
   (`--apply` after the dry run), `qbo-sync-items.js` against the sandbox
   company, `enable-packaging-sandbox.js`, the `modules[]` backfill dry run
   with audit counts.
6. **Flags in Vercel Preview** (you): `QBO_ENV=sandbox`,
   `PACKAGING_SIGNUP_ENABLED=true`, `PACKAGING_BILLING_ENABLED=true`,
   `CRON_SECRET`. Then the sandbox acceptance table in checklist §5, phase
   by phase.
7. **QuickBooks Payments** (you, in the browser): the runbook
   `PAYMENTS-BROWSER-SETUP.md`, pasted into Claude in Chrome. Until *Pay
   now* is on an invoice, there is no card page to send anyone to.
8. **Production** (you, checklist §6 in order): the values are signed off
   (`VERSION` is `2026-10`); seed the book `--live`, sync the items
   `--live`, enable the book, the five Production variables
   (`PACKAGING_LIVE=true` and `QBO_ENV=production` among them), one real
   signup paid and refunded, then existing tenants one at a time from the
   Package tab.

## 6. Where everything is

- Code: `api/_lib/modules.js` (catalog), `api/_lib/pricebook.js` (prices),
  `api/_lib/package-access.js` (who may use what), `api/_lib/package-billing*.js`
  (invoices, reconciliation), `api/_lib/plan-change.js` (subscribe),
  `api/_lib/subscription-proposal.js` (the proposal), `api/_lib/usage.js`
  (counters), `api/_lib/logic-access.js` (Omega Logic), `admin/package-panel.js`
  (the admin Package panel), `omega-package-menu.js` (the one menu),
  `subscription-proposal.html` / `proposal.html` (the rep tool and the
  customer page), `start.html` (signup with discovery).
- Documents: `PACKAGING-ROADMAP.md` (status and design), `VALUE-LADDER.md`
  (the ladder), `PACKAGING-PHASE-0…9-VALIDATION.md`,
  `PACKAGING-RELEASE-CHECKLIST.md`, `ASTRA-HANDOFF.md` (the build log).
- Tests: `npm run test:packaging` (fifteen suites), `npm run test:logic`,
  `npm run check:pages` (Chromium renders of every surface).
