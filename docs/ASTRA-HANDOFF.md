# Handoff: build and deploy OMEGA packaging (for Astra)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Owner: Tommy Gilmer (ClearSky). Written 2026-09-26. Repo:
`clearskyenergy/omega-core`. The design and specs are done; this is the build.

---

## 1. What you are building

OMEGA is being sold as a **menu of modules** with one price each, a **$500
floor**, and **nothing free**. Staff build a tenant's package in the admin
portal; the price, the Stripe subscription and the access all follow from
the ticks. Customers see the same menu inside their workspace and opt in to
more. The Site Map editor shows only what the tenant owns, stays tidy while
doing it, and lays itself out for the project type the user picks (Level 2,
DCFC, BESS…) without ever removing the draw tools.

## 2. Read these first, in this order

1. `CLAUDE.md`: the repo's non-negotiable rules. They override anything else.
2. `docs/VALUE-LADDER-PACKAGING.md`: the catalog, prices, pricing rules, the
   186-function editor inventory (Appendix A), where today's gates leak
   (§4.1) and what is not live (§4.2).
3. `docs/PACKAGING-ROADMAP.md`: the work order. Phases (§4), editor behaviour
   (§3), project-type workspaces and polish (§6), the agent brief (§7), and
   the admin Package panel build spec (§8).
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
- Never commit secrets. Stripe and Firebase Admin keys live in Vercel env vars.
- Never delete a Firestore document in a migration. Flag, don't drop.
- Never remove a draw function from any workspace or package.
- `npm test` and `npm run check:pages` green on every PR.

## 4. Pricing is not final: build in TEST mode

Every number marked **(decide)** in the specs is a proposal. Until Tommy
signs off:

- Seed the price book as version **`2026-10-proposed`** with `frozen:false`.
- Create Stripe Products/Prices in **Stripe test mode only**. Preview
  deployments use the test `STRIPE_SECRET_KEY`.
- No live Stripe price, subscription or charge is created, and no live
  tenant's `billing/current` is changed, until Tommy approves the price book
  in writing. At that point: a new version `2026-10`, `frozen:true`, synced to
  live Stripe by `scripts/stripe-sync-prices.js --live`.

Proposed values to use meanwhile: Lite $500 (3 builders, 10 viewers); Grid
Atlas $250; Standard $250; Premium $500; Deliverable $750 (+ usage: EV 20/mo
included then $50, matrices 1 then $2,500, site studies 25 then $15); Logic
Office $1,500, Plant $750, Materials $500, Logistics $500, Customer App $250,
all five $2,500; Field $1,299 (Lite + up to $1,250), Pro $2,499 (Lite + up to
$3,000, ≤1 Deliverable); credit 40% × 90 days, never below $500; service fee
$3,400/yr Field/Pro, $1,500/yr Lite (proposed), $10,000/yr Enterprise.

## 5. How to deploy

- **Branches and PRs.** One branch and one PR per phase, from `main`. Title
  `packaging: phase N — …`. Merging to `main` deploys production via
  GitHub → Vercel, so **Tommy approves every merge**.
- **Preview.** Every PR gets a Vercel `*.vercel.app` preview URL (already on
  the `PREVIEW_SUFFIXES` allowlist in `omega-tenant.js`). Test there.
  `staging.` and `next.clearskyomega.com` have no DNS; don't use them.
- **Firestore / Storage rules.** Edit `firestore.rules` / `storage.rules`,
  run `npm run rules:check`, then after the PR is merged and approved:
  `firebase deploy --only firestore:rules` (project `clearsky-portal`).
  Afterwards grep the live rules for your new helpers, as CLAUDE.md asks.
- **Vercel env vars** (set by Tommy, never in the repo):
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT`,
  `FIREBASE_PROJECT_ID`, `STRIPE_PORTAL_RETURN_URL`. Test keys on Preview,
  live keys on Production only after §4 sign-off.
- **Stripe webhook** must send `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`, `invoice.payment_failed` to `/api/stripe-webhook`.
- **Migration safety.** Before the Phase 3 backfill touches live tenants:
  `npm run audit` and save the counts; run `scripts/backfill-modules.js` dry
  run and send Tommy the diff; `--apply` only after approval; re-run the audit.
- **Rollback.** Every phase ships behind a flag (`billing/current.packaged:
  true` per tenant, or a price-book `enabled`), so turning a tenant back to
  today's tier/add-ons is one field.

## 6. Order of work

| # | Work | Spec | Ships when |
|---|---|---|---|
| 0 | Merge branch `claude/level-2-closeout-tool-aqkh73` (L2 closeout tool). Remove `csebuilders.com` from `omega-caps.js` `INTERNAL_DOMAINS` and require a verified email for the internal fallback. | Roadmap §4 | tests green |
| A | **Polish now** (parallel track): project start screen with seven project-type cards; ribbon clean-up (one icon style, label length, remove the duplicate Calibrate Scale and Export for Validation buttons, retire BESS Config/Viability); results rail per project type; empty states. | Roadmap §6.3 | screenshots approved |
| 1 | Catalog + price book + Stripe test prices. | Roadmap §4, VALUE-LADDER §5 | tests: every tool/ribbon/menu item in exactly one module; floor; frozen book immutable |
| 2 | Close the gate leaks (File menu, Summary › Cost, Documentation drawer, Output tab, Ctrl+K, Jarvis, `?customerEngine=1`, compute outside its tab). | VALUE-LADDER §4.1 | a test per path |
| 3 | Editor fits the package (`data-module`, `MODULE_GRANTS`, prune/renumber, + Modules tab) and project-type workspaces with "All tools". Backfill (dry run). | Roadmap §3, §6.1–6.2 | `check:pages`: 5 packages × 7 workspaces |
| 4 | Admin Package panel + `tenant-package` + webhook → modules; approve requires a package; signup proposes one. | Roadmap §8, §2 | activate → payment link → paid → access, in test mode |
| 5 | Customer "Your plan" + `plan-change`. | Roadmap §2, §8.4 | tenant admin adds a module without staff |
| 6 | Subscription proposal tool. | VALUE-LADDER §8 | branded proposal + order form |
| 7 | Usage counters, metered overage, 90-day review. | VALUE-LADDER §5.4 | overage billed in test mode |

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

## 9. Open decisions (build with the default; make each a config value)

| Decision | Default to build with |
|---|---|
| Prices, logins, credit, usage | §4 proposed values |
| Guided builds in Lite | yes |
| Self-serve trial | none: approval + payment first |
| Failed payment | drop to Lite, never lose work |
| + Modules tab for members | shown, with "Ask my admin" |
| Customer opt-in | instant on payment |
| Permitting Matrix while BETA | sold with a beta label, verified jurisdictions listed |
| Enterprise floor | $150k/yr, quoted by staff |
| Lite service fee | $1,500/yr |

## 10. Kickoff prompt (paste this to start)

> You are building the OMEGA packaging system in the `clearskyenergy/omega-core`
> repo. Read `CLAUDE.md`, then `docs/ASTRA-HANDOFF.md`, then
> `docs/VALUE-LADDER-PACKAGING.md` and `docs/PACKAGING-ROADMAP.md`, and open
> `docs/design/package-panel-prototype.html`. Follow the handoff exactly:
> test-mode Stripe only, one PR per phase from `main`, Tommy approves every
> merge and every rules deploy. Start with Phase 0 and the Polish track A in
> parallel. Before writing code for each phase, post a short plan (files you
> will touch, tests you will add) and wait for approval. Report back after
> each PR with the preview URL, test output and screenshots.

## 11. Report back to Tommy

After each PR: phase and title, preview URL, what a customer will notice,
test output summary, screenshots, anything that needed a decision, and what
is next.
