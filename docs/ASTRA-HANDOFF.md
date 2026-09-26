# Handoff: build and deploy OMEGA packaging (for Astra)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Owner: Tommy Gilmer (ClearSky). Written 2026-09-26. Repo:
`clearskyenergy/omega-core`. The design and specs are done; this is the build.

---

## Execution updates approved by Tommy — 2026-09-26

These later conversation decisions supersede the historical workflow and
operator assignments below; the source commercial requirements still apply.

- Remaining phase plans have standing implementation approval. PRs are stacked:
  Track A on Phase 0, then each phase on its predecessor.
- Tommy assigned release execution (production merges, rules deployment,
  live billing changes and QuickBooks reconnection) to the agent. Complete
  implementation and validation before release. Concrete tenant billing
  changes and connection/scopes must be made reviewable before application;
  the proposed book remains sandbox-only until price-book sign-off.
- AI Render belongs only to **Plan Sets & CAD**, not Lite.
- Export to Monday (BETA) stays in **Lite** (explicit decision, 2026-09-26).
- Annual prepay charges 11 months for 12 and **does not receive the
  transformation credit** (explicit decision, 2026-09-26).
- A $0 module addition inside a tier whose current cycle is **already paid**
  activates immediately; anything owed waits for the paid invoice
  (explicit decision, 2026-09-26, option 1).
- Phase 5 Step A (subscribe in the editor, Your plan, `POST /api/plan-change`)
  was built on `codex/packaging-phase-5`, stacked on Phase 4, under the same
  sandbox flags; Step B (card on file) stays off. See
  `docs/PACKAGING-PHASE-5-VALIDATION.md`.
- Phase 6 (the Subscription Proposal tool for the reps, the customer's
  proposal page, and the same discovery inside self-serve signup) was built
  on `codex/packaging-phase-6`, stacked on Phase 5. Tommy's direction,
  2026-09-26: the tool is for every ClearSky sales rep, and a company that
  signs up walks the same steps, so the system reflects their choices. See
  `docs/PACKAGING-PHASE-6-VALIDATION.md`.
- Phase 7 (usage counters, overage on the recurring invoice, buy-more packs,
  auto top-up, the 90-day review) was built on `codex/packaging-phase-7`,
  stacked on Phase 6. See `docs/PACKAGING-PHASE-7-VALIDATION.md`.
- Phase 8 (Omega Logic follows the package: the Logic endpoints, chrome and
  apps read `modules[]`; legacy tenants unchanged) was built on
  `codex/packaging-phase-8`, stacked on Phase 7, with the ordered release
  checklist for the whole stack. See `docs/PACKAGING-PHASE-8-VALIDATION.md`
  and `docs/PACKAGING-RELEASE-CHECKLIST.md`.

## 1. What you are building

OMEGA is sold as a **menu of modules** with one price each, a **$500
floor**, and **nothing free**. Customers buy one of two ways: **à la carte**
(Lite + the modules they pick) or a **tier** (Field, Pro, Enterprise), with
**Omega Logic as an add-on** to either. Our proposal steers them to the base
they need and shows the value in their own numbers.

- **Signup** collects billing details; staff approve; the tenant becomes a
  **customer in ClearSky's QuickBooks** and gets a **14-day trial** at most.
- After the trial, **everyone pays** (at least $500) or the workspace goes
  read-only. Their **billing date** is the day of the month they signed up.
- Staff build a tenant's package in the admin portal; the price, the
  QuickBooks invoice and the access all follow from the ticks.
- Customers **subscribe to more inside the editor** (+ Modules tab): they
  pay first, prorated to their billing date, billed in QuickBooks, and the
  tools appear when QuickBooks shows it paid. When they run out of included
  usage they **buy more**, like credits (ROADMAP §10.6).
- The Site Map editor shows only what the tenant owns, stays tidy while
  doing it, and lays itself out for the project type the user picks
  (Level 2, DCFC, BESS…) without ever removing the draw tools.

## 2. Read these first, in this order

1. `CLAUDE.md`: the repo's non-negotiable rules. They override anything else.
2. `docs/VALUE-LADDER-PACKAGING.md`: the catalog, prices, pricing rules, the
   186-function editor inventory (Appendix A), where today's gates leak
   (§4.1) and what is not live (§4.2).
3. `docs/PACKAGING-ROADMAP.md`: the work order. Phases (§4), editor behaviour
   (§3), project-type workspaces and polish (§6), the agent brief (§7), the
   admin Package panel build spec (§8), **billing through QuickBooks (§9)**,
   and **tiers vs à la carte, the 14-day trial, the billing date, signup
   billing details and paying to opt in (§10)**.
4. `docs/design/package-panel-prototype.html`: open it in a browser. The admin
   panel must look and behave like this.
5. `MERGE.md` before any edit to `editor.html`.

## 3. Guardrails (from CLAUDE.md, restated so they are not missed)

- No build step, no bundler, no transpiler. Shared `omega-*.js` and tool
  pages are **ES5** (`var`, `function`). Match the file you are in.
- Pricing, eligibility and billing math run in `/api/`, never in the browser.
  The browser sends `modules[]`; the server prices it.
- ONE catalog (`api/_lib/modules.js`), ONE price book (`pricebook/{version}`),
  ONE menu component (`/omega-package-menu.js`). No second copies.
- Staff = a **verified** `@clearsky-usa.com` address: read `caller.staff`,
  never `isStaffEmail()`. `csebuilders.com` is retired; never add it back.
- Firestore rules are the security boundary. `billing/*`, `pricebook/*`,
  usage and proposals are Admin-SDK or staff-only writes.
- Every new source file carries the copyright header.
- Never commit secrets. QuickBooks, Stripe and Firebase Admin keys live in Vercel env vars.
- Never delete a Firestore document in a migration. Flag, don't drop.
- Never remove a draw function from any workspace or package.
- A trial is never longer than 14 days (enforced in code). After it, the
  tenant pays or the workspace is read-only. Nothing switches on until
  QuickBooks shows it paid.
- `npm test` and `npm run check:pages` green on every PR.

## 4. Pricing is not final: build against the QuickBooks sandbox

Every number marked **(decide)** in the specs is a proposal. Until Tommy
signs off:

- Seed the price book as version **`2026-10-proposed`** with `frozen:false`.
- Create QuickBooks Products/Services and invoices in the **QuickBooks
  sandbox company only** (`QBO_ENV=sandbox` on Preview deployments). If a
  Stripe path is touched, Stripe test mode only.
- No item, customer or invoice is created in ClearSky's real QuickBooks
  company, and no live tenant's `billing/current` is changed, until Tommy
  approves the price book in writing. At that point: a new version `2026-10`,
  `frozen:true`, synced to the real company by `scripts/qbo-sync-items.js --live`.

Proposed values to use meanwhile: Lite $500 (3 builders, 10 viewers); Grid
Atlas $250; Standard $250; Premium $500; Deliverable $750 (+ usage: EV 20/mo
included then $50, matrices 1 then $2,500, site studies 25 then $15); Logic
Office $1,500, Plant $750, Materials $500, Logistics $500, Customer App $250,
all five $2,500; Field $1,299 (Lite + up to $1,250), Pro $2,499 (Lite + up to
$3,000, ≤1 Deliverable); credit 40% × 90 days, never below $500; service fee
$3,400/yr Field/Pro, $1,500/yr Lite (proposed), $10,000/yr Enterprise.

## 5. How to deploy

Reconciled with Tommy's approval on 2026-09-26: §9–§10 of the roadmap
govern billing timing. Approval starts the trial; the first invoice is
at trial end, and the daily cron bills on each tenant's signup-day anchor.
No production merge, rules deploy or live billing action is delegated.


- **Branches and PRs.** One branch and one PR per phase, from `main`. Title
  `packaging: phase N — …`. Merging to `main` deploys production via
  GitHub → Vercel, so **Tommy approves every merge**.
- **Preview.** Every PR gets a Vercel `*.vercel.app` preview URL (already on
  the `PREVIEW_SUFFIXES` allowlist in `omega-tenant.js`). Test there.
  `staging.` and `next.clearskyomega.com` have no DNS; don't use them.
- **Firestore / Storage rules.** Tommy deploys these after review. The agent may edit `firestore.rules` / `storage.rules`,
  run `npm run rules:check`; after the PR is merged and approved, Tommy runs:
  `firebase deploy --only firestore:rules` (project `clearsky-portal`).
  Afterwards grep the live rules for your new helpers, as CLAUDE.md asks.
- **Vercel env vars** (set by Tommy, never in the repo):
  `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENV`, `QBO_REDIRECT_URI`,
  `QBO_WEBHOOK_VERIFIER_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`,
  `FIREBASE_PROJECT_ID`; Stripe keys only if the optional Stripe path is used.
  Sandbox QuickBooks keys on Preview,
  live keys on Production only after §4 sign-off.
- **QuickBooks webhook** (Intuit developer portal) sends Invoice and Payment
  events to `/api/logic-webhook`, the endpoint already used for Omega Logic.
  The sandbox app for previews, the production app after sign-off.
- **Monthly billing cron**: `api/billing-run.js` scheduled in `vercel.json`
  daily; it must be idempotent (one invoice per tenant per
  billing date) because Vercel may retry.
- **Migration safety.** Before the Phase 3 backfill touches live tenants:
  `npm run audit` and save the counts; run `scripts/backfill-modules.js` dry
  run and send Tommy the diff; `--apply` only after approval; re-run the audit.
- **Rollback.** Every phase ships behind a flag (`billing/current.packaged:
  true` per tenant, or a price-book `enabled`), so turning a tenant back to
  today's tier/add-ons is one field.

## 6. Order of work

| # | Work | Spec | Ships when |
|---|---|---|---|
| 0 | Verify the L2 closeout integration (already merged by PR #133). Remove `csebuilders.com` from `omega-caps.js` `INTERNAL_DOMAINS` and require a verified email for the internal fallback; cap new signup trials at 14 days. | Roadmap §4 | tests green |
| A | **Polish now** (parallel track): project start screen with seven project-type cards; ribbon clean-up (one icon style, label length, remove the duplicate Calibrate Scale and Export for Validation buttons, retire BESS Config/Viability); results rail per project type; empty states. | Roadmap §6.3 | screenshots approved |
| 1 | Catalog + price book + QuickBooks sandbox items (`scripts/qbo-sync-items.js`). | Roadmap §4, VALUE-LADDER §5 | tests: every tool/ribbon/menu item in exactly one module; floor; frozen book immutable |
| 2 | Close the gate leaks (File menu, Summary › Cost, Documentation drawer, Output tab, Ctrl+K, Jarvis, `?customerEngine=1`, compute outside its tab). | VALUE-LADDER §4.1 | a test per path |
| 3 | Editor fits the package (`data-module`, `MODULE_GRANTS`, prune/renumber, + Modules tab) and project-type workspaces with "All tools". Backfill (dry run). | Roadmap §3, §6.1–6.2 | `check:pages`: 5 packages × 7 workspaces |
| 4 | Admin Package panel + `tenant-package` + webhook → modules; approve requires a package; **signup collects billing details** (ROADMAP §10.4) and proposes a package; **QuickBooks customer created at approval**; **14-day trial** from approval; **billing date** = signup day; first invoice at trial end; read-only when unpaid. | Roadmap §8, §2, §9, §10.2–10.4 | activate → QuickBooks invoice → paid in the sandbox → access |
| 5 | **Subscribe in the editor** (+ Modules tab) and "Your plan": `plan-change`, `api/_lib/proration.js`, pay-first via QuickBooks invoice link (Step A); auto-steer to a tier when cheaper. | Roadmap §3.1, §8.4, §10.1, §10.5 Step A |
| 5b | **Card on file** (Step B): only after Tommy approves AND reconnects ClearSky's QuickBooks with the QuickBooks Payments permission himself. | Roadmap §10.5 Step B | tenant admin adds a module without staff |
| 6 | Subscription proposal tool. | VALUE-LADDER §8 | branded proposal + order form |
| 7 | Usage counters, metered overage, 90-day review. | VALUE-LADDER §5.4 | overage lines on the sandbox monthly invoice |

## 7. Every PR includes

- `npm test` and `npm run check:pages` output (green).
- Screenshots of affected screens under **Lite** and one paid package, light
  and dark.
- A status line added to `docs/PACKAGING-ROADMAP.md` (phase, what shipped,
  what's left).
- Docs updated where the phase changes behaviour: `CLAUDE.md` (Tool gating),
  `docs/WHITE-LABEL.md`, `MERGE.md` for any logic moved server-side.

## 8. Do not

- Charge, or change a live tenant's billing, before §4 sign-off.
- Add a free tier, free trial or free function.
- Remove a draw function; grey out buttons in place (hide them, per §3).
- Put a price calculation in the browser that decides what is charged.
- Hard-code a tenant, or edit core for one tenant.
- Sell or label as included anything in VALUE-LADDER §4.2 (not live).
- Deploy rules or merge to `main` without Tommy's approval.
- Reconnect ClearSky's QuickBooks, add an OAuth scope, or touch the real
  QuickBooks company. Tommy does those.
- Change a live tenant's trial end date or billing date.

## 9. Open decisions (build with the default; make each a config value)

| Decision | Default to build with |
|---|---|
| Prices, logins, credit, usage | §4 proposed values |
| Guided builds in Lite | yes |
| Self-serve trial | no access while pending; staff approval starts the one trial (14 days maximum), no card needed; payment required at trial end |
| Failed payment | drop to Lite, never lose work |
| + Modules tab for members | shown, with "Ask my admin" |
| Customer opt-in | pay first: prorated to the billing date, switched on when QuickBooks shows it paid |
| Trial | 14 days max from approval; no card needed to start; read-only when unpaid after |
| Billing date | day of the month they signed up; 29–31 → last day of short months |
| Refunds on removal | none; removals take effect at the quarterly review |
| Card on file (Step B) | off until Tommy approves and reconnects QuickBooks |
| Running out of included usage | "Buy more" pack, paid first (EV 10 for $500, matrix 1 for $2,500, site studies 25 for $375), lasts to cycle end; auto top-up off by default |
| Billing provider | QuickBooks for every tenant; Stripe autopay only on request |
| Grace before dropping to Lite | 10 business days |
| Permitting Matrix while BETA | sold with a beta label, verified jurisdictions listed |
| Enterprise floor | $150k/yr, quoted by staff |
| Lite service fee | $1,500/yr |
| Service fee per tenant | staff can Charge standard / Custom amount / Waive, reason required, audited; a waiver applies to the first year only unless staff choose every year (ROADMAP §10.7) |

## 10. Setting Astra up (for Tommy)

### 10.1 Give Astra

1. **GitHub** access to `clearskyenergy/omega-core`: create branches and
   open pull requests. **Not** permission to merge into `main`.
2. **These documents on `main`.** They were written on branch
   `claude/pensive-mendel-hy0eks` (documents only, no code). Merge that
   branch first, or upload the zip `OMEGA-Packaging-for-Astra.zip`.
3. **No secrets.** Astra does not get QuickBooks, Stripe or Firebase admin
   credentials. Tommy sets the sandbox QuickBooks keys (`QBO_*`,
   `QBO_ENV=sandbox`) in Vercel's **Preview** environment and points the
   sandbox Intuit app's webhook at the preview deployment. Tommy deploys
   rules and reconnects QuickBooks himself.

### 10.2 Standing instructions (paste into Astra's instructions field)

```
You are the build engineer for ClearSky OMEGA (repo: clearskyenergy/omega-core).
Your job: build and ship the OMEGA packaging system exactly as specified.

SOURCE OF TRUTH (read before any work, in this order):
1. CLAUDE.md — repo rules; they override everything else.
2. docs/ASTRA-HANDOFF.md — your work order, deploy steps and guardrails.
3. docs/VALUE-LADDER-PACKAGING.md — catalog, prices, editor inventory, gate leaks.
4. docs/PACKAGING-ROADMAP.md — phases, editor behaviour, workspaces, admin panel,
   QuickBooks billing (§9), tiers / trial / billing date / opt-in (§10).
5. docs/design/package-panel-prototype.html — the admin panel must match it.
6. MERGE.md — before any edit to editor.html.
If these conflict, stop and ask me. Never guess.

HARD RULES:
- No build step. Shared omega-*.js and tool pages are ES5 (var, function). Match the file.
- All pricing, proration and billing math runs in /api/. The browser sends modules[];
  the server prices it and returns what to display.
- One catalog (api/_lib/modules.js), one price book, one menu component. No second copies.
- $500 floor. Nothing is free. One trial per organization, 14 days maximum, enforced in code.
- Two ways to buy: à la carte (Lite + modules) or a tier (Field/Pro/Enterprise).
  Omega Logic is an add-on to either. modules[] is the only record of what is on.
- Staff = verified @clearsky-usa.com (caller.staff). Never add csebuilders.com.
- Never remove a draw function. Hide tools a tenant doesn't own; never grey them out in place.
- Never commit secrets. Never delete a Firestore document in a migration (flag, don't drop).
- Every new file carries: © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

MONEY AND PRODUCTION:
- Billing runs through ClearSky's QuickBooks (ROADMAP §9, §10).
- QuickBooks SANDBOX company only (QBO_ENV=sandbox). Price book "2026-10-proposed".
  Do not create items, customers or invoices in the real QuickBooks company, or change a
  live tenant's billing, trial or billing date, until I approve in writing.
- Opt-ins are paid first, prorated to the tenant's billing date (the day they signed up),
  and so are "buy more" usage packs. Nothing switches on until QuickBooks shows it paid.
- Never reconnect QuickBooks or add an OAuth scope. Never merge to main or deploy
  Firestore/Storage rules. I do all of these after review.

HOW YOU WORK:
- One phase = one branch from main = one pull request, titled "packaging: phase N — <what>".
- Before coding a phase, post a plan (files to touch, tests to add, risks) and WAIT for "go".
- Every PR: npm test and npm run check:pages green; screenshots under Lite and one paid
  package, light and dark; a status line in docs/PACKAGING-ROADMAP.md; docs updated.
- Anything marked (decide): build with the default in docs/ASTRA-HANDOFF.md §9, make it a
  config value, and list it in the PR.

REPORTING (after every PR, in this format):
Phase and title / Preview URL / What a customer will notice / Tests (pass counts) /
Screenshots / Decisions needed from me / Next step.

When unsure, ask one clear question rather than assume.
```

### 10.3 First message

```
Read CLAUDE.md, then docs/ASTRA-HANDOFF.md, docs/VALUE-LADDER-PACKAGING.md and
docs/PACKAGING-ROADMAP.md (especially §9 and §10), and open
docs/design/package-panel-prototype.html.

Then post two plans for my approval, and don't write code yet:
1. Phase 0: merge branch claude/level-2-closeout-tool-aqkh73, and fix omega-caps.js
   (remove csebuilders.com from INTERNAL_DOMAINS; the internal fallback requires a
   verified email). Also cap the signup trial at 14 days in api/tenant-signup.js
   (Math.min(TRIAL_DAYS, 14)) with a test.
2. Track A (polish): the project start screen with seven project-type cards, and the
   ribbon clean-up from ROADMAP §6.3.

For each plan: files you'll touch, tests you'll add, screenshots you'll provide, risks.
```

### 10.4 Messages along the way

- Approving a plan: "Go on phase N as planned" (or list changes first).
- Reviewing a PR: open the preview URL, click through, then "approved,
  merging", or list fixes.
- Prices final: "Price book approved at these values: … Create version
  2026-10, frozen, and prepare `scripts/qbo-sync-items.js --live` in its own
  PR. I will run it."
- Before any live tenant changes (Phase 3 backfill, trial dates): "Send me
  the dry-run diff and the audit counts first."

### 10.5 Handing back to Claude

Work continues in Claude Code from Monday. Keep the status table in
`docs/PACKAGING-ROADMAP.md` current after every PR (phase, PR link, merged or
not, what's left, open questions), so whoever picks it up next starts from
the file, not from a chat.

## 11. Report back to Tommy

After each PR: phase and title, preview URL, what a customer will notice,
test output summary, screenshots, anything that needed a decision, and what
is next.
