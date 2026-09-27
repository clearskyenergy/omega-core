# ClearSky-OMEGA · Omega Workspace — user-journey handoff

For the assistant continuing this work (Astra). Read with `CLAUDE.md` and
`docs/OMEGA-WORKSPACE.md` in the repository `clearskyenergy/omega-core`.
Everything below is live on `silmarillion.clearskyomega.com` as of
2026-09-27 unless marked **not built**.

## 1. What the product is, in one paragraph

ClearSky-OMEGA is a multi-tenant SaaS for battery, EV-charging, solar,
microgrid and data-center project development. One codebase serves every
tenant; a tenant is the user's email domain; Firestore rules are the
security boundary; every price and every grant is the server's. A signed-in
person lands on the **Omega Workspace** (`/workspace`): a hex hub of where
to go, a ranked **Today**, the board (In flight, Around you), and two
catalogue pages, **All tools** and **Modules**. The **Marketplace**
(`/marketplace.html`) is the tools catalogue again (kept for now); modules
are the editor's paid services and are bought on the **Modules** page:
packaged tenants by card through QuickBooks, legacy tenants as a recorded
request ClearSky confirms. Site Map shows the plan and modules in a chip
with links to Plan & billing and Modules.

## 2. The journey today

| Step | Where | What happens | Rule that decides it |
|---|---|---|---|
| Sign in | `login.html` → `/workspace` | Firebase Auth; the gateway lands on the workspace; the workspace sends a classic choice to the classic dashboard | `OmegaWorkspaceShell.homeOf()` (workspace unless `omega_orgs/{org}.shell = 'classic'`, a partner-type workspace, or `?home=classic` on this browser) |
| Home | `/workspace` | Hex hub (Today in the centre, six cells composed from what the person may open), Today (four numbers, "Needs you" ranked), Your modules (held Live, three to add), In flight (project cards), Around you (feed, People, Omega pulse, Partners) | `omega-workspace-hub.js` composes the hub; `omega-workspace-today.js` ranks Today; `GET /api/pulse` for the pulse |
| All tools | `/workspace#tools` | Every tool by category, Live / Locked / Soon; a locked tile explains which module carries it and offers Opt in (the one menu) or its card on Modules | `OMEGATools.isUnlocked()` |
| Modules | `/workspace#modules` | Every module in shelf order, detailed (what it is for, features, where it lives, allowance, needs, popular with, price), one status and one action each: Live · Opt out, Waiting for payment · Pay, Opting out / Opt-in requested · Cancel request, Partly included / Not on your plan · Opt in; the plans shelf closes it (`#plans`) | `OmegaWorkspaceHub.moduleCard()` on `moduleState()` (a legacy plan's modules counted by what its tools AND Site Map open) |
| Opt in / out, packaged | Modules page | The one menu on that module: server quote → Opt in and pay → QuickBooks invoice with the card button, on when paid; Opt out queues for the quarterly review (fee before → after, the review date) | `POST /api/plan-change` (quote, apply, cancel, reconcile-now) |
| Opt in / out, legacy | Modules page | The one menu: the price first (dry run), then *Request opt-in* / *Send opt-out request*, recorded on the plan (who, when, history, audit) and mailed to ClearSky; the card reads *Opt-in requested* / *Opting out* with Cancel request. Nothing is charged or switched off until ClearSky confirms | `POST /api/plan-change` `opt-in` / `opt-out` / `withdraw-*` (owner or admin; refuses a packaged workspace) |
| Marketplace | `/marketplace.html` | The tools catalogue in the workspace chrome: every tool, categories, search, pin; a locked tool names its module and links to its card on Modules; `#<module>` and `#plans` forward there | `GET /api/offerings` (public) or the package's catalog |
| Plan & billing | rail → `/workspace#billing` | A page: your subscription (plan, modules bought and on, monthly, billing day), what you owe and when (unpaid invoices with pay links, next invoice, *I've paid*), the payment method (Stripe portal for the card and autopay, or QuickBooks' own payment page), additions waiting, billing history | `GET /api/plan-change` (any verified member), `POST /api/stripe-invoices`, `POST /api/stripe-portal` |
| Projects | `/projects.html` | Legacy page wearing the workspace rail (own topbar still) | `OmegaWorkspaceShell.theme()` |
| In flight | home board | What needs something first (offers on a finance-marketplace deal, a next action, a package to submit, a stall), then what was touched last; never online; each card says why and who has it, with **Assign** | `OmegaWorkspaceToday.board`; `projects/{id}` owner merge |
| Admin Package tab | `/admin/tenant?org=` (staff) | Opens on what the tenant holds and pays today (a legacy tier's Live modules by the shared rule, plus any opt-in request); staff change it and Review activation | `admin/package-panel.js` `standing()`, `OmegaWorkspaceHub.moduleState` |
| Site Map (editor) | Settings tab › Appearance | Light (white top, grey ground, buttons with faces), Dark, or Auto | `OmegaUI.theme()`, `omega.ui.theme` in the browser |
| Classic home | `/?home=classic` | The old dashboard; "Open Omega Workspace" and Account settings › Home flip back with `/?home=workspace` | `homeOf()` |

## 3. What is built and verified

- `npm run check:workspace` renders the workspace, the marketplace and the flow
  as several tenants on the Firebase double (desktop and 390px phone);
  `npm run check:dashboard` renders the classic dashboard; `npm test` runs
  every pure-rule test (`tworkspacehub`, `tworkspacetoday`, `tpulse`, …).
- Every rule lives once: home (`homeOf`), hub composition, Today ranking,
  module held-or-not (`moduleState`), pricing (server), the Ladder menu
  (`omega-package-menu.js`), the chrome (`omega-workspace-shell.js`).

## 4. Not built — the next improvements to the journey, in order

1. **Self-serve conversion of a legacy plan.** A legacy workspace's Opt in
   is recorded with its price today (`billing/current.optIns`) and ClearSky
   activates a package from the admin tab, which opens preselected on it.
   Build: `plan-change` accepts a legacy record as
   the starting point of a quote (Lite + the module, prorated), creates the
   packaged record and the first QuickBooks invoice, and the module opens
   when paid. Needs the packaging flags live (`PACKAGING_LIVE`, `QBO_ENV`)
   and the engine guard; see `api/_lib/plan-change.js state()` and
   `api/_lib/package-billing.js`.
2. **Plan changes from a plan card.** The plans shelf's cards are facts;
   moving a packaged workspace to another plan (`plan-change` with `plan`)
   is only reachable through a module quote's steer.
3. **The projects page in the full chrome.** `wear()` is built and used by
   the marketplace; the projects page keeps its own topbar.
4. **Project-scoped tools from the hub** (the Cost Estimator opens
   standalone today).
5. **Company switcher across grants.** The switcher lists this sign-in's
   company only; `org_members` grants could list more.
6. **Phone install** of the workspace (manifest, shell service worker, a
   guide), as the Omega Logic apps have.
7. **Pulse depth.** Counts only today; the Event Layer (`docs/EVENT-LAYER.md`)
   is the honest source for richer signals once the twin exposes them.
8. **Today's actions.** A "Size" row opens the sizer; a row could carry the
   project id into the editor so the person lands on the right site.
9. **The saved card by brand and last four** on Plan & billing, read back
   from Stripe or QuickBooks Payments (the page says where the card lives
   and never holds one).
10. **Person-level assignment across a JDA.** Assign lists this workspace's
   people only; a partner's staff needs a `team_members` read widening that
   has not been designed (see CLAUDE.md, Silmarillion 2.0).

## 5. Guardrails the next assistant must keep

- No build step; ES5 in runtime files; single-file HTML tools.
- Showing a link, a cell or a tile is never access; the server decides.
- Nothing in the browser prices or grants; every figure is the server's.
- The pulse and every community panel are counts only; never a name that
  crosses a tenant boundary.
- Staff is a VERIFIED `@clearsky-usa.com` address, never the email alone.
- Run `check:workspace`, `check:dashboard` and `npm test` before any push;
  the CI runs the same.
- Design record: `docs/OMEGA-WORKSPACE.md` (keep its "not built" list
  honest). Tenant record fields: `CLAUDE.md`.
