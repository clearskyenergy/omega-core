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
| Sign in | `login.html` → `index.html` | Firebase Auth; the dashboard sends a signed-in visit on to `/workspace` once the tenant's shell is known | `OmegaWorkspaceShell.homeOf()` (workspace unless `omega_orgs/{org}.shell = 'classic'`, a partner-type workspace, or `?home=classic` on this browser) |
| Home | `/workspace` | Hex hub (Today in the centre, six cells composed from what the person may open), Today (four numbers, "Needs you" ranked), In flight (project cards), Around you (feed, People, Omega pulse, Partners) | `omega-workspace-hub.js` composes the hub; `omega-workspace-today.js` ranks Today; `GET /api/pulse` for the pulse |
| All tools | `/workspace#tools` | Every tool by category, Live / Locked / Soon; a locked tile explains which plan or module carries it and links the Marketplace on that module | `OMEGATools.isUnlocked()` |
| Modules | `/workspace#modules` | Every module in shelf order, detailed (what it is for, features, what is inside, allowance, needs, popular with, price); Live where held, Partly with the count, else **Opt in** | `OmegaWorkspaceHub.moduleState()` (the ONE held/partly/ask rule, shared with the store) |
| Opt in, packaged | Modules page or store | The one menu: server quote → Subscribe and pay → QuickBooks invoice with the card button; on when paid | `POST /api/plan-change` (quote, apply, cancel, reconcile-now) |
| Opt in, legacy | Modules page | The engine cannot charge a legacy plan; the panel says so and sends the request that moves the workspace onto a package, naming the module and its price | `plan-change.js state()` refuses non-packaged |
| Marketplace | `/marketplace.html` | The store in the workspace chrome: plan strip, Plans shelf (Lite, Field, Pro, Enterprise, starters, logins, annual, trial), every module priced; `#<module>` lands on one | `GET /api/offerings` (public) or `api/package-catalog` (packaged) |
| Plan & billing | rail → side panel | Plan, workspace, role, modules; for packaged: monthly, next invoice, pending changes with pay links, recent invoices, "I've paid"; opens the Modules page | `GET /api/plan-change` summary |
| Projects | `/projects.html` | Legacy page wearing the workspace rail (own topbar still) | `OmegaWorkspaceShell.theme()` |
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

1. **Self-serve conversion of a legacy plan.** A legacy workspace's Opt in
   sends a request today. Build: `plan-change` accepts a legacy record as
   the starting point of a quote (Lite + the module, prorated), creates the
   packaged record and the first QuickBooks invoice, and the module opens
   when paid. Needs the packaging flags live (`PACKAGING_LIVE`, `QBO_ENV`)
   and the engine guard; see `api/_lib/plan-change.js state()` and
   `api/_lib/package-billing.js`.
2. **Plan changes from a plan card.** The store's plan cards are facts;
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
