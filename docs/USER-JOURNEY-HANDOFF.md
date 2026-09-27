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
packaged tenants by card on the invoice's own page (Stripe or QuickBooks),
legacy tenants by card as an add-on where their plan switches the module
on exactly (on its own QuickBooks invoice), else as a recorded request
ClearSky confirms. Site Map shows the plan and modules in a chip with links
to Plan & billing and Modules.

## 2. The journey today

| Step | Where | What happens | Rule that decides it |
|---|---|---|---|
| Sign in | `login.html` → `/workspace` | Firebase Auth; the gateway lands on the workspace; the workspace sends a classic choice to the classic dashboard | `OmegaWorkspaceShell.homeOf()` (workspace unless `omega_orgs/{org}.shell = 'classic'`, a partner-type workspace, or `?home=classic` on this browser) |
| Home | `/workspace` | Hex hub (Today in the centre, six cells composed from what the person may open), Today (four numbers, "Needs you" ranked), In flight (project cards), Around you (feed, People, Omega pulse, Partners); the module cards live on Modules, never on the home | `omega-workspace-hub.js` composes the hub; `omega-workspace-today.js` ranks Today; `GET /api/pulse` for the pulse |
| All tools | `/workspace#tools` | Every tool by category, Live / Locked / Soon; a locked tile explains which module carries it and offers Opt in (the one menu) or its card on Modules | `OMEGATools.isUnlocked()` |
| Modules | `/workspace#modules` | Every module as a card (what it does, the tools inside, allowance, needs, price), one status and one action each: Live · Opt out, Waiting for payment · Pay, Opting out / Opt-in requested · Cancel request, Partly included / Not on your plan · Opt in; the plans shelf closes it (`#plans`; Enterprise reads *Contact for pricing* with Contact ClearSky, never a figure) | `OmegaWorkspaceHub.moduleCard()` on `moduleState()`, the ONE rule (a legacy plan's modules counted by what its tools AND Site Map open: the catalog's `legacyGates` asked of the tier `editorCtx` names) |
| Opt in / out, packaged | Modules page | The one menu on that module: server quote → Opt in and pay → an invoice paid on its own page (Stripe or QuickBooks, as `payWith` says), on when paid; Opt out queues for the quarterly review (fee before → after, the review date) | `POST /api/plan-change` (quote, apply, cancel, request-removal, withdraw-removal, reconcile-now) |
| Opt in / out, legacy, by card | Modules page, a locked tile | Where the plan can switch the module on exactly (every Omega Logic department; `addons.exact()`): Opt in → the server's quote (the module and what it needs) → the billing contact once → **Opt in and pay** opens QuickBooks' page (a new card or the saved one); the card reads *Waiting for payment* with Pay, *I've paid* and Cancel request, and is Live the moment QuickBooks shows it paid; renewed monthly, off after an unpaid renewal's grace; the plan underneath is untouched. **Opt out** stops it at the end of the month paid for (not renewed, no refund); Cancel request keeps it | `POST /api/plan-change` `addon-quote`, `addon-buy`, `addon-cancel` (`addOnId`: an unpaid purchase; `remove`: a paid add-on), `withdraw-addon-cancel`, `reconcile-now` (owner or admin with a verified email, or of an active client, `admin.clientAdmin`; `api/_lib/addons.js`) |
| Opt in / out, legacy, by request | Modules page | Everything a card cannot switch on exactly (an editor module whose Site Map tab the plan cannot open alone; the quote says why), and everything while card payments are not open: the price first (dry run), then *Request opt-in* / *Send opt-out request*, filed by an owner or administrator on the role alone, recorded on the plan (who, when, whether the email was verified, history, audit) and mailed to ClearSky; the card reads *Opt-in requested* / *Opting out* with Cancel request. Nothing is charged or switched off until ClearSky confirms | `POST /api/plan-change` `opt-in` / `opt-out` / `withdraw-*` (owner or admin on the role alone, no verified email needed: a request grants and charges nothing; refuses a packaged workspace, and an opt-out of a card add-on) |
| Marketplace | `/marketplace.html` | The tools catalogue in the workspace chrome: every tool, categories, search, pin; a locked tool names its module and links to its card on Modules; `#<module>` and `#plans` forward there | `GET /api/offerings` (public) or the package's catalog; the same `moduleState` |
| Plan & billing | rail → `/workspace#billing` | A page: your subscription (plan, modules bought and on, monthly, billing day), what you owe and when (unpaid invoices with pay links, next invoice, *I've paid*), the payment method (linked to Stripe: the card on file read back, Add a card with Stripe, the portal, and Pay $X with Stripe for the amount ClearSky set as due, each on Stripe's own page in this tab; or QuickBooks' own payment page for a QuickBooks plan; a workspace with a billing record never reads "No billing account yet"), additions waiting, billing history | `GET /api/plan-change` (any verified member, or an active client's owner/admin), `POST /api/stripe-invoices`, `POST /api/stripe-customer` (owner or admin) |
| Projects | `/projects.html` | Legacy page wearing the workspace rail (own topbar still) | `OmegaWorkspaceShell.theme()` |
| In flight | home board | What needs something first (offers on a finance-marketplace deal, a next action, a package to submit, a stall), then what was touched last; never online; each card says why and who has it, with **Assign** | `OmegaWorkspaceToday.board`; `projects/{id}` owner merge |
| Admin Package tab | `/admin/tenant?org=` (staff) | Opens on what the tenant holds and pays today (a legacy tier's Live and Partly modules by the one rule, its card add-ons, plus any opt-in request, less what is opting out or ending; a trial opens on Omega Design plus its requests); staff answer a recorded request, change the picker and Review activation | `admin/package-panel.js` `standing()`, `OmegaWorkspaceHub.moduleState` / `editorCtx` |
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

1. ~~**Exact delivery of any editor module on a legacy plan.**~~ Built
   2026-09-27 with the editor's Opt in: the editor opens exactly a live
   add-on's own commands (`omega-caps` `addOnOpens`, from
   `/api/package-access`'s legacy answer: the add-ons on and the catalog's
   ribbon), so `addons.exact()` sells every editor module on every plan
   (the storefront aside), and a tab the plan stops at says Opt in and buys
   the module there (`docs/OMEGA-WORKSPACE.md`, *Opt in in the editor*).
2. **Moving a legacy plan onto a package, self-serve.** A legacy plan buys
   exact modules as add-ons beside its plan (`api/_lib/addons.js`) and
   records a request for the rest (`billing/current.optIns`); re-pricing
   the whole plan as a package stays ClearSky's, from the admin Package
   tab, which opens preselected on what it holds and partly uses (its
   add-ons included) plus its requests. Build: `plan-change` accepts a
   legacy record as the starting point of a quote (Omega Design + the module,
   prorated), creates the packaged record and the first invoice on the
   rail `billing-driver` names, and the module opens when paid. Needs the
   packaging flags live (`api/_lib/packaging-mode.js`) and the engine
   guard; see `api/_lib/plan-change.js state()` and
   `api/_lib/package-billing.js`.
3. **Plan changes from a plan card.** The plans shelf's cards are facts;
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
10. **The saved card by brand and last four** on Plan & billing, read back
   from Stripe or QuickBooks Payments (the page says where the card lives
   and never holds one).
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
