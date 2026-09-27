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
(`/marketplace.html`) is the store: plans and modules with the server's
prices. Packaged tenants buy there and on the Modules page by card through
QuickBooks; legacy tenants are billed outside the package engine.

## 2. The journey today

| Step | Where | What happens | Rule that decides it |
|---|---|---|---|
| Sign in | `login.html` → `/workspace` | Firebase Auth; the gateway lands on the workspace; the workspace sends a classic choice to the classic dashboard | `OmegaWorkspaceShell.homeOf()` (workspace unless `omega_orgs/{org}.shell = 'classic'`, a partner-type workspace, or `?home=classic` on this browser) |
| Home | `/workspace` | Hex hub (Today in the centre, six cells composed from what the person may open), Today (four numbers, "Needs you" ranked), In flight (project cards), Around you (feed, People, Omega pulse, Partners) | `omega-workspace-hub.js` composes the hub; `omega-workspace-today.js` ranks Today; `GET /api/pulse` for the pulse |
| All tools | `/workspace#tools` | Every tool by category, Live / Locked / Soon; a locked tile explains which plan or module carries it and links the Marketplace on that module | `OMEGATools.isUnlocked()` |
| Modules | `/workspace#modules` | Every module as a compact card: **Your modules** (Live, or paid for) first, then **Add to your plan**, each in shelf order (features, the tools inside, allowance, needs, price); Live where held, Partly with the count, else **Opt in** (a package) or **Add to plan** (a legacy plan) | `OmegaWorkspaceHub.moduleState()` (the ONE held/partly/ask rule, shared with the store) |
| Opt in, packaged | Modules page or store | The one menu: server quote → Subscribe and pay → QuickBooks invoice with the card button; on when paid | `POST /api/plan-change` (quote, apply, cancel, reconcile-now) |
| Add to plan, legacy | Modules page, store, a locked tile | The module joins the plan as its own monthly line: the server's quote (the module and what it needs), the billing contact once, **Pay now** opens QuickBooks' page (a new card or the saved one), the card waits with the pay link and *I've paid*, Live the moment QuickBooks shows it paid; renewed monthly, off after an unpaid renewal's grace; the plan underneath is untouched. Sold only where it switches on exactly (every Omega Logic department; an editor module whose Site Map tab the plan cannot open alone says why and offers **Ask ClearSky to include it**, the recorded request) | `POST /api/plan-change` `addon-quote`, `addon-buy`, `addon-cancel`, `reconcile-now`, `opt-in` (owner or admin; `api/_lib/addons.js` `exact()`) |
| Marketplace | `/marketplace.html` | The store in the workspace chrome: plan strip, Plans shelf (Lite, Field, Pro, Enterprise, starters, logins, annual, trial), every module priced; `#<module>` lands on one | `GET /api/offerings` (public) or `api/package-catalog` (packaged) |
| Plan & billing | rail → `/workspace#billing` | A page: your subscription (plan, modules bought and on, monthly, billing day), what you owe and when (unpaid invoices with pay links, next invoice, *I've paid*), the payment method (a plan ClearSky bills: Stripe, with *Pay $X by card* and *Add a card* on Stripe's Checkout in a new tab and the card on file by brand and last four; a package: the Stripe portal or QuickBooks' own payment page), additions waiting, billing history | `GET /api/plan-change` (any verified member), `POST /api/stripe-invoices`, `POST /api/stripe-portal`, `POST /api/stripe-checkout` (owner or admin) |
| Projects | `/projects.html` | Legacy page wearing the workspace rail (own topbar still) | `OmegaWorkspaceShell.theme()` |
| In flight | home board | What needs something first (offers on a finance-marketplace deal, a next action, a package to submit, a stall), then what was touched last; never online; each card says why and who has it, with **Assign** | `OmegaWorkspaceToday.board`; `projects/{id}` owner merge |
| Admin Package tab | `/admin/tenant?org=` (staff) | Opens on what the tenant holds and pays today (a legacy tier's Live modules by the shared rule, plus any opt-in request); staff change it and Review activation | `admin/package-panel.js` `standing()`, `OmegaWorkspaceHub.moduleState` |
| Site Map (editor) | Settings tab › Appearance | Light (white top, grey ground, buttons with faces), Dark, or Auto | `OmegaUI.theme()`, `omega.ui.theme` in the browser |
| Classic home | `/?home=classic` | The old dashboard; "Open Omega Workspace" and Account settings › Home flip back with `/?home=workspace` | `homeOf()` |

## 3. What is built and verified

- `npm run check:workspace` renders the workspace, the store and the flow
  as several tenants on the Firebase double (desktop and 390px phone);
  `npm run check:dashboard` renders the classic dashboard; `npm test` runs
  every pure-rule test (`tworkspacehub`, `tworkspacetoday`, `tpulse`, …).
- Every rule lives once: home (`homeOf`), hub composition, Today ranking,
  module held-or-not (`moduleState`), pricing (server), the Ladder menu
  (`omega-package-menu.js`), the chrome (`omega-workspace-shell.js`).

## 4. Not built — the next improvements to the journey, in order

1. **Exact delivery of any editor module on a legacy plan.** Add to plan
   sells only what switches on exactly (`addons.exact()`): a legacy editor
   opens Site Map a whole tab at a time, so most editor modules below
   Enterprise are a recorded request today. Opening exactly the bought
   module's commands (the editor's legacy gate by command ownership, as a
   package's is, with `/api/package-access` projecting the add-on
   modules' ribbon) makes every one of them buyable on every plan.
2. **Moving a legacy plan onto a package, self-serve.** A legacy plan buys
   modules today as add-ons beside its plan (Add to plan,
   `api/_lib/addons.js`); re-pricing the whole plan as a package stays
   ClearSky's, from the admin Package tab, which lists the add-ons.
3. **Plan changes from a plan card.** The store's plan cards are facts;
   moving a packaged workspace to another plan (`plan-change` with `plan`)
   is only reachable through a module quote's steer.
4. **The projects page in the full chrome.** `wear()` is built and used by
   the marketplace; the projects page keeps its own topbar.
5. **Project-scoped tools from the hub** (the Cost Estimator opens
   standalone today).
6. **Company switcher across grants.** The switcher lists this sign-in's
   company only; `org_members` grants could list more.
7. **Phone install** of the workspace (manifest, shell service worker, a
   guide), as the Omega Logic apps have.
8. **Pulse depth.** Counts only today; the Event Layer (`docs/EVENT-LAYER.md`)
   is the honest source for richer signals once the twin exposes them.
9. **Today's actions.** A "Size" row opens the sizer; a row could carry the
   project id into the editor so the person lands on the right site.
10. **The saved card by brand and last four** from QuickBooks Payments.
   Stripe's is shown (read back by `/api/stripe-invoices`, never stored);
   a QuickBooks-billed page still says where the card lives. Charging a
   saved Stripe card on the due date by itself (autopay for a plan ClearSky
   bills) is not built either: `docs/PAYMENTS-STRIPE.md`.
11. **Person-level assignment across a JDA.** Assign lists this workspace's
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
