# Packaging roadmap: tenant onboarding, pricing and the editor that fits the package

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **roadmap, not built.** Companion to `docs/VALUE-LADDER-PACKAGING.md`
(the catalog, prices, rules and the editor inventory). This file says what
gets built, in what order, and how the product behaves when a tenant owns
only part of it. Prototype of the admin panel:
https://claude.ai/artifact/2Sou93uMRrCsc8K4E2Xg8n (private to the owner).

---

## Status (update after every PR)

| Phase | PR | State | Left / open questions |
|---|---|---|---|
| Docs (this file, VALUE-LADDER, handoff, prototype) | [#134](https://github.com/clearskyenergy/omega-core/pull/134) | supplied ZIP imported; timing reconciled with approval 2026-09-26 | review with Phase 0 |
| 0 · Decide + fixes | [#134](https://github.com/clearskyenergy/omega-core/pull/134) · [preview](https://omega-core-git-codex-packaging-phase-0-clearsky-usa.vercel.app) | implemented; npm test + check:pages pass; not merged | PR #133 already merged closeout; verified fallback + new-signup cap; approval-started lifecycle remains Phase 4 |
| A · Polish now | [#135](https://github.com/clearskyenergy/omega-core/pull/135) · [preview](https://omega-core-git-codex-packaging-phase-a-clearsky-usa.vercel.app) | implemented; npm test + check:pages pass; not merged | Seven cards and ribbon polish only. Full workspace filtering, results rail and broader empty states remain later work. |
| 1 · Catalog | [#136](https://github.com/clearskyenergy/omega-core/pull/136), stacked on #135 | implemented; npm test + check:pages pass; disabled | One catalog/price book; server quotes; sandbox-only item sync. AI Render: Plan Sets & CAD only. Real sandbox apply and later package gates remain. |
| 2 · Close the leaks | [#137](https://github.com/clearskyenergy/omega-core/pull/137) · [preview](https://omega-core-git-codex-packaging-phase-2-clearsky-usa.vercel.app) | implemented; npm test + check:pages pass; disabled | Catalog-based UI/API gates; eight entry paths covered. Full editor, legacy engine ports and packaged write rules remain release work. See PACKAGING-PHASE-2-VALIDATION.md. |
| 3 · Editor fits the package | [#138](https://github.com/clearskyenergy/omega-core/pull/138), stacked on #137 | draft, unmerged; local checks green; disabled | 1,870 packaging assertions; 180 full-editor checks, 84 desktop/tablet captures. Project workspaces, shared gallery, staff preview and dry-run planner. Export to Monday stays in Lite, per Tommy’s explicit decision. See PACKAGING-PHASE-3-VALIDATION.md. |
| 4 · Admin panel, signup billing, trial, QuickBooks customer | pending PR, stacked on #138 | implemented; npm test + check:pages pass; disabled | Four admin tabs, private signup profile, approval-started trial, sandbox customer/invoices, paid reconciliation and write rules. Annual prepay excludes transformation credit. See PACKAGING-PHASE-4-VALIDATION.md; real sandbox payment and reference visual acceptance remain. |
| 5 · Subscribe in the editor (Step A) | | not started | |
| 5b · Card on file (Step B) | | blocked on Tommy | QuickBooks Payments permission |
| 6 · Proposal tool | | not started | |
| 7 · Usage and review | | not started | |

---

## Timing reconciliation — approved 2026-09-26

Sections 9–10 govern: one trial, at most 14 days from approval; first
invoice at trial end, prorated to the signup-day billing anchor; daily cron.
Phase 0 only caps the existing signup clock; Phase 4 implements the new
approval/billing lifecycle. Existing tenant dates are untouched.

## 1. The one rule the repo follows

**A tenant's `modules[]` is the only thing that decides what they pay and
what they see.** Every path that creates, approves, changes or bills a tenant
goes through ONE function (`api/_lib/modules.js` `resolve()`) and ONE price
book (`pricebook/{version}`). `tier`, `addons` and `toolAccess` are derived
from `modules[]` and never edited by hand again. The floor is $500. Nothing
is free.

```
signup / seed / console / customer opt-in
        │  proposes modules[]
        ▼
api/tenant-package  ── validates against pricebook ── refuses < $500
        │  QuickBooks customer + invoice (one line per module or plan) — §9
        ▼
logic-webhook (Intuit) → worker re-reads the invoice in QuickBooks: paid?
        │  writes billing/current.modules[] + derived tier/addons/toolAccess
        ▼
omega-caps.js MODULE_GRANTS  →  editor ribbon, tools list, command palette, Jarvis
```

---

## 2. What happens when a tenant is added or approved

| Event | Today | After this roadmap |
|---|---|---|
| **Self-serve signup** (`api/tenant-signup.js`) | Creates `status:'pending'` with `billing.tier:'trial'` and a signup trial **capped at 14 days in Phase 0** (`TRIAL_DAYS`, default 14) | Collects the **billing details** in §10.4, creates `status:'pending'` with a **proposed package** from the customer type, records `signedUpAt` (this fixes the tenant's **billing date**, §10.3). No access until staff approve. |
| **Seed** (`scripts/seed-omega-orgs.js`, `tenants/<slug>/tenant.json`) | Writes `tier` | `tenant.json` carries `modules[]` (not `tier`); the seed runs it through `resolve()` and refuses a package under the floor. Legacy `tier` in a seed file is mapped once by the backfill (Phase 3) and then rejected. |
| **Approve** (`api/tenant-approve.js`) | `status:'active'` + optional `tier` | **Approve requires a package.** Staff confirm the proposed base (Lite + modules, or a tier) in the Package panel. Approval creates the tenant's **QuickBooks customer** from the signup billing details and starts a **14-day trial** of that package (never longer; §10.2). At trial end the first invoice is issued; the tenant must pay to keep working. |
| **Console change** (Package panel) | Tier dropdown + add-on boxes | Module ticks → `tenant-package` → QuickBooks invoice → paid → access. |
| **Customer opt-in** (Your plan) | n/a | Tenant owner/admin adds a module → `plan-change` → prorated QuickBooks invoice → paid → access in minutes. Removal waits for the 90-day review. |
| **Payment fails** | Grace, then suspend | Same, per module set: after grace the tenant drops to **Lite only** (read access to everything they built), never to nothing, so no project is ever lost. |
| **Suspend / cancel** | status only | Unchanged; export window per Agreement §6.5. |

---

## 3. How the editor responds to a package (and stays tidy)

The editor has 12 ribbon tabs and 186 functions. A Lite tenant owns about
90 of them. The design goal: **a tenant with three modules should see a
complete, calm product, not a full product with holes in it.**

### 3.1 Rules

1. **Hide what they don't own. Don't grey it out in place.** Scattered
   disabled buttons make the ribbon look broken. A button the tenant does
   not own is removed from its group, exactly like `OmegaCaps.apply()`
   removes nodes today.
2. **No empty containers.** A ribbon group with no buttons left is removed.
   A tab with no groups left is removed. `Analyze`, `Estimate` and `Compute`
   simply do not appear for a tenant who owns none of their modules.
3. **Groups reflow; order never changes.** Remaining buttons keep their
   canonical order and close up; no gaps, no placeholders. Group captions
   ("1 · Site", "2 · Build", "3 · Size & Configure") renumber so a Lite user
   never sees "1, 3".
4. **One place for everything else: the + Modules tab, where they
   subscribe.** A single ribbon tab at the far right, **"+ Modules"**, shows
   what the tenant doesn't have as a tidy gallery: one card per module with
   its icon, three things it adds, the monthly price and today's prorated
   charge (§10.5), and **Subscribe** (tenant admin) or **Ask my admin**
   (member). Subscribing charges them and bills in QuickBooks; the tools
   appear when the payment is confirmed. This is the only upsell surface
   inside the editor. Nothing else nags.
5. **Discovery without clutter.** Command search (Ctrl+K) and Ask Jarvis
   list un-owned tools in a separate "In other modules" section, greyed,
   with the module name. Choosing one opens that module's card, never the
   tool. (Today both can click hidden buttons; §4 Phase 2 closes that.)
6. **Menus follow the same rules.** The File menu, the Output tab, the
   Summary › Cost panel and the Documentation drawer check the same module
   caps as the ribbon (today they are the leaks).
7. **A tenant's default layout matches what they bought.** The Designer /
   Pro starting layout is chosen from the package: Lite and installer
   packages open in Designer; Engineering or Plan Sets open in Pro. The user
   can still switch.
8. **Their work is never locked.** A drawing that contains, say, a one-line
   made while they had Plan Sets still opens and displays after the module is
   removed; the *tools* to edit or export it are what go. Read, never lose.
9. **Beta and "soon" items are labelled once, consistently** (`OmegaTags` /
   `OmegaGating`), and never sold as included (VALUE-LADDER §4.2).
10. **Staff see everything**, with a small "viewing as <package>" switch so
    a demo can show exactly what a customer will see.

### 3.2 How it is built

- `api/_lib/modules.js` gives every module a `ribbon[]` list (button ids or
  handler names, as `OmegaTags` already matches them) and a `menu[]` list
  (File-menu and panel entries). A test asserts every ribbon button and menu
  entry belongs to exactly one module or Lite.
- `omega-caps.js` gains `MODULE_GRANTS` and a `layout()` pass that runs
  after `apply()`: prune empty groups, prune empty tabs, renumber captions,
  append the **+ Modules** tab. It re-runs on the same MutationObserver the
  gate already uses (editor.html ~175885), so buttons injected later by
  modules (Schematic Editor, Sheet Manager…) are placed or pruned too.
- One `data-module="…"` attribute per ribbon button replaces the scattered
  `data-cap` tier caps. Staff `all` still wins.
- `check:pages` renders the editor under five fixed packages (Lite, EV
  installer, Developer, EPC Pro, everything) and fails on: an empty group, an
  empty tab, a visible un-owned button, a gap in caption numbering, or a
  ribbon wider than its container at 1280px. Screenshots of the five go into
  the guides, so a customer's guide shows their own ribbon.

### 3.3 What each starter package looks like

| Package | Tabs shown | Notes |
|---|---|---|
| Lite | File, Edit, Build, Insert, Draw, Annotate, View, Output, Settings, + Modules | Output has Blueprint, Proposal, Spec Sheet, Interactive Report, and Export to Monday (BETA; Tommy approved Lite ownership on 2026-09-26) |
| EV installer (Field) | Lite tabs + Estimate + Analyze (Grid Atlas group only) | Output gains Plot Plan, One-Line, Schematic Editor, Permit Sheet |
| Developer (Field) | Lite tabs + Analyze (Grid Atlas, Storage groups) | Output gains Push to Marketplace, Apply for Financing |
| EPC (Pro) | All except Compute | Pro layout by default |
| Compute (Field) | Lite + Compute + Analyze (Grid Atlas, Site Intelligence) | Compute tab first after Build |

---

## 4. Roadmap

Each phase ships on its own, behind a flag, with tests. Constraints from
CLAUDE.md apply throughout (ES5 in shared runtime and tool pages, no build
step, pricing only in `/api/`, verified staff, Admin-SDK-only billing paths,
`npm test` + `npm run check:pages` green).

| Phase | What | Done when |
|---|---|---|
| **0 · Decide** | Tommy settles the (decide) items in VALUE-LADDER §11; counsel starts the Agreement changes; merge `claude/level-2-closeout-tool-aqkh73`; fix `csebuilders.com` in `omega-caps.js` (queued task). | Price book values signed off. |
| **1 · Catalog** | `api/_lib/modules.js` (modules, tools, ribbon, menu, meters); `pricebook/{version}` + rules + seed; QuickBooks Product/Service per module, plan (idempotent script writing ids into the price book). | Tests: every tool, ribbon button and menu entry in exactly one module; floor enforced; frozen price book immutable. |
| **2 · Close the leaks** | VALUE-LADDER §4.1: File menu, Summary › Cost, Documentation drawer, Output tab, command palette, Jarvis, `?customerEngine=1`, compute outside its tab. | A tenant without a module cannot reach its tools by any path (test per path). |
| **3 · Editor fits the package** | §3 above: `data-module`, `MODULE_GRANTS`, `layout()`, + Modules tab, palette "In other modules", package-driven default layout. Backfill `modules[]` for every live tenant from today's tier/add-ons (dry run, flag don't drop). | `check:pages` passes for the five packages; no live tenant loses a tool they use today without a decision. |
| **4 · Admin Package panel** | Package panel in the admin portal, full spec in §8 (prototype: `docs/design/package-panel-prototype.html`); `POST /api/tenant-package`; webhook writes `modules[]`; `tenant-approve` requires a package; signup proposes one. Signup collects billing details; QuickBooks customer at approval; 14-day trial; billing date = signup day (§10.2–10.4). | Approval creates the QuickBooks customer and starts the capped trial; first invoice at trial end; continued access after payment. |
| **5 · Subscribe in the editor** | + Modules tab and "Your plan" with Subscribe; `POST /api/plan-change`; `api/_lib/proration.js`; pay first via QuickBooks invoice link (§10.5 Step A); auto-steer to a tier when cheaper (§10.1). Step B (card on file) only after Tommy reconnects QuickBooks with the Payments permission. | A tenant admin subscribes to a module in the editor, pays the prorated amount, and sees the tools appear without staff. |
| **6 · Proposal tool** | `subscription-proposal.html` on the Pro Forma pattern. | A branded proposal and filled order form from a discovery. |
| **7 · Usage and review** | Server-side usage counters, overage lines on the monthly QuickBooks invoice, the 90-day right-size report in the console. | Overage billed; review lists what to add or remove. |

Phases 1–3 are the foundation and can run while the proposal and opt-in are
designed. Phase 3 is the one customers will feel, so it gets the most
screenshots and review.

---

## 6. The project decides the workspace (make it look nicer now)

Two layers, never confused:

| Layer | Decides | Strength | Source |
|---|---|---|---|
| **Package** | what the tenant OWNS | hard: un-owned tools are gone (§3) | `billing/current.modules[]` |
| **Project type** | what is IN FRONT of the user for this project | soft: one click shows everything they own | the project's `type` when it is created |

When a user creates or opens a project they pick what they are building:
**Level 2 EV · DCFC · BESS (behind or in front of the meter) · Solar + Storage ·
DER / Microgrid · Compute campus · Building / Net-Zero**. That choice sets up
the editor for that job. It builds on what already exists: `omega-editor-mode.js`
(`bess-lite` hides compute and EV categories), Compute Mode (a curated 4-tab
layout, editor.html ~166639), and the L2 / FOM / BTM modes on the Build panel.

### 6.1 Rules for a project workspace

1. **Draw functions are never removed by a project type.** Select/Move,
   Line, Polyline, Rectangle, Circle, Text, Callout, Dimension, Zone Box,
   Conduit, Trench, Undo/Redo, Layers, Calibrate Scale and 3D Review stay in
   every workspace. A project type only reorders and focuses.
2. **Relevant first.** The workspace opens on its guided build, puts its
   equipment at the front of Insert, and puts its outputs first on Output.
3. **Everything else is one click away.** A single **"All tools"** toggle in
   the ribbon header shows every tool the package owns. Nothing owned is
   ever unreachable, and the choice is remembered per user.
4. **Same order and style everywhere.** A workspace chooses which groups
   show first. It never invents new groups, colours or button styles.
5. **Mixed projects work.** A project can be BESS + Level 2; the workspace
   is the union of both.
6. **The package still wins.** A workspace never shows a tool the tenant
   doesn't own; in its place the + Modules tab shows the matching module
   ("DCFC projects usually add Plan Sets & CAD").

### 6.2 What each workspace puts forward

| Project type | Opens on | Insert shows first | Analyze / Estimate first | Output first | Tucked behind "All tools" |
|---|---|---|---|---|---|
| Level 2 EV | Level 2 guided build | L2 chargers, panelboard, meter, disconnect, bollard, ADA stencils, parking stalls | Electrical Estimate, Construction Cost | Proposal, EV Cost Workbook, Plot Plan, One-Line, L2 Closeout | Compute, BESS sizing, wind/genset/fuel cell, terrain, network proximity |
| DCFC | DCFC build (+ BESS demand management) | DCFC, transformer, switchgear, BESS pad, bollards | Grid Atlas, Estimate, Energy Balance | Proposal, EV Workbook, Plot Plan, One-Line | Compute, building net-zero, piles |
| BESS | BESS Build | BESS cabinet/pad/cluster, PCS, transformer, EMS, meter, fence | Grid Atlas, BESS Sizer, Value Stack, Import Bill | Proposal, Pro Forma, Plot Plan, One-Line | EV catalog, compute, building net-zero |
| Solar + Storage | Solar + Storage flow | Arrays (ground/roof/canopy), BESS, inverter, transformer | Generation / PVWatts, Non-Export Headroom, BESS Sizer | Proposal, pile/string CSV, Plot Plan, One-Line | EV catalog, compute |
| DER / Microgrid | DER Build / Full Topology | Genset, fuel cell, wind, BESS, switchgear, POI | Energy Balance, DER Generation, load flow | One-Line, Permit Sheet, Proposal | EV stencils, parking |
| Compute campus | Compute Build | Data-centre pods, substation, gas/fiber tie-in | Load Screen, Max Load, Network Proximity | Campus proposal, Land Lease | EV, parking, ADA |
| Building / Net-Zero | Building Designer | Building, panels, rooftop solar | Net-zero case, NEC 220 load calc | Building report, DXF | Compute, EV catalog |

### 6.3 Look-nicer-now track (runs alongside, does not wait for packaging)

Visible polish a customer notices in the first minute, safe to ship alone:
- **Project start screen:** big, illustrated cards for the seven project
  types instead of a form; the choice sets the workspace.
- **Ribbon clean-up:** one icon style and size (`OmegaRibbonIcons`), one
  label length (two short lines max), consistent group captions, no
  duplicated buttons (Calibrate Scale and Export for Validation appear
  twice today), retire hidden/retiring items (BESS Config, Viability).
- **Right panel order:** the results rail shows the numbers that matter
  for this project type first (kW/kWh and payback for BESS; ports and
  make-ready cost for EV).
- **Empty states:** every panel that has nothing yet says what to do next
  in one sentence, with the button.
- **One accent, one type scale** across the editor, the admin console and
  the customer pages.

### 6.4 Acceptance

`check:pages` gains the seven workspaces × the five packages. It fails if a
core draw function is missing from any workspace, if "All tools" hides
anything the package owns, if a workspace shows an un-owned tool, or on the
tidiness checks in §3.2. Screenshots of each workspace go into the guides.

---

## 7. Brief for the design and build agents (Fable, ChatGPT / Astra)

Two agents working on the same editor must share one source of truth:

- **Read first:** `CLAUDE.md`, `docs/VALUE-LADDER-PACKAGING.md` (catalog,
  Appendix A inventory, §4.1 leaks, §4.2 not-live list), this file, and
  `MERGE.md` before touching `editor.html`.
- **Split the work, not the files:** one agent owns the package layer
  (`api/_lib/modules.js`, `omega-caps.js`, gate tests, Phases 1–3); the
  other owns the workspace and polish layer (§6: project start screen,
  workspace presets, ribbon clean-up). They meet at one interface:
  `data-module` on each button (package) and a `workspaces` table in
  `api/_lib/modules.js`'s bundled twin (project type → groups first,
  tucked groups, start build). Neither edits the other's layer without a note
  in the PR.
- **Never:** remove a draw function; hard-code a tenant; add a build step;
  put pricing math in the browser; add a second list of modules or prices.
- **Every PR:** `npm test`, `npm run check:pages`, screenshots of the
  affected workspaces under Lite and one paid package, and a line in this
  file's status.
- **Order:** §6.3 polish and the project start screen can start now. Workspace
  presets (§6.1–6.2) start after Phase 1 exists, because they reference
  module ids.

---

## 8. The Package panel in the admin portal (build spec)

Tommy's decision (2026-09-26): the master-console Package panel goes into
the admin portal. The clickable design reference is
`docs/design/package-panel-prototype.html` (open it locally in a browser;
static data, writes nothing). Build it to look and behave like that file.

### 8.1 Where it lives

| Surface | File | What it gets |
|---|---|---|
| Master index (tools.clearskyomega.com `/admin`) | `admin/index.html` + `admin/admin-console.js` | Tenant list shows each tenant's plan and monthly charge (from `billing/current`), sortable; a status pill (trial ending, awaiting payment, past due, active). Clicking a tenant opens its record. The old tier dropdown and add-on checkboxes (`ADDON_UI`, `_addonToggles`) are replaced by a link to the Package tab. |
| Tenant record | `admin/tenant.html?org=<orgId>` | Four tabs, exactly as the prototype: **Package**, **What Activate writes**, **Customer's "Your plan"** (preview), **History**. `tenant.html` is already the one record page for staff and tenant admins ("two doors, one implementation"); keep that. |
| Customer side | Account Settings "Your plan" (§2, Phase 5) | The same menu component in read/opt-in mode. |

One component, three uses: write the menu once as `/omega-package-menu.js`
(ES5, no Firebase inside; takes the catalog, the price book and the current
`modules[]`, renders, calls back on change). Staff Package tab, customer
"Your plan" and the proposal tool all use it. No second copy of the menu.

### 8.2 Package tab (staff)

- **Customer type** select + **Apply starter pack** (types and packs from
  `api/_lib/modules.js`, VALUE-LADDER §3.6).
- **Shelves**: Floor (Lite, always on, not untickable), Add-on, Standard,
  Premium, Deliverable, Omega Logic. Each card: name, price, one-line
  contents, tags for included usage, BETA, "needs Office", and a red
  **Lock** tag while its editor gate is not yet enforced (VALUE-LADDER §4.1;
  the tag disappears when Phase 2 lands for that module).
- **Summary rail** (sticky): menu value at list, plan that fits, monthly
  charge, credit toggle and first-90-days, **annual service fee with a
  Charge / Custom / Waive control** (§10.7), included usage, a sentence on room left in Field/Pro or when Field becomes the
  better deal, and the **floor warning** that disables Activate.
- **Activate** → `POST /api/tenant-package {orgId, modules, pricebookVersion,
  credit}` → returns the QuickBooks invoice pay link, shown and copyable.
  **Send as proposal** → opens the proposal tool prefilled (Phase 6; until
  then disabled with "coming").
- Logic parts auto-add Office; removing Office removes the parts.
- **The browser never computes the price it charges.** The rail may show a
  live estimate from the price book, but Activate sends only `modules[]`;
  the server recomputes and the returned total is what is displayed after.

### 8.3 What Activate writes tab

Read-only preview from the server (`POST /api/tenant-package` with
`dryRun:true`): the QuickBooks invoice lines (plan line or one per module,
overage lines, credit discount line, service fee) and the QuickBooks customer and the exact `billing/current` patch
(`modules`, `pricebookVersion`, `plan`, `credit`, logins, derived `tier`,
`addons`, `toolAccess`). Staff see this before they commit.

### 8.4 Customer's "Your plan" tab

The customer menu rendered as the tenant admin will see it, in preview
(no writes from staff side). Add → confirm box with new monthly total and
today's prorated charge; "On · remove at review" on owned modules.

### 8.5 History tab

`omega_orgs/{org}/billing/current/history` + `admin_audit` rows, newest
first: when, who, what changed (was → now), monthly total. Read through the
existing endpoints; no new store.

### 8.6 Server pieces it needs

| Piece | New/changed | Notes |
|---|---|---|
| `api/_lib/modules.js` | new | catalog, starter packs, `resolve()`, `price()` (pure, tested) |
| `pricebook/{version}` | new collection | staff create, frozen once used; browser read for staff only |
| `GET /api/package-catalog` | new | modules + current price book for the panel (staff or tenant admin) |
| `POST /api/tenant-package` | new | staff; `dryRun` or apply; floor enforced; QuickBooks customer + invoice (Stripe only if the tenant is on the Stripe path); history + audit |
| `api/tenant-billing.js` | changed | ALLOWED += `modules`, `pricebookVersion`, `plan`, `credit`, `builders`, `viewers`, `billingProvider`, `qboCustomerId`, `nextInvoiceOn` |
| `api/_lib/qbo-billing.js` | new | subscription invoices in ClearSky's company, modelled on `qbo-sales.js`: customer per tenant, invoice lines from `modules[]` + usage, discount line, `invoiceLink`; idempotent by `requestid` |
| `api/logic-webhook.js` + worker | changed | an Invoice/Payment event for a subscription invoice → re-read in QuickBooks → paid ⇒ write `modules[]` → `resolve()` |
| `api/billing-run.js` (cron) | new | Daily: invoice tenants due on their billing date; overdue check (grace, then Lite) |
| `api/stripe-webhook.js` | changed (optional path) | only for tenants with `billingProvider:'stripe'` |
| `api/tenant-approve.js` | changed | `approve` requires a package (calls tenant-package) |
| `api/tenant-signup.js` | changed | writes a proposed package and signup date; approval starts the one capped trial |
| `scripts/qbo-sync-items.js` | new | QuickBooks Products/Services per module, plan and overage; ids into the price book; `--sandbox` default, `--live` after sign-off |
| `scripts/backfill-modules.js` | new | proposes `modules[]` from today's tier/add-ons; dry run default |

### 8.7 Access

Staff only for Package, Activate and History writes: verified
`@clearsky-usa.com` (`caller.staff`, never `isStaffEmail`). Tenant admins
(`A.isTenantAdmin`) see "Your plan" and their own History, never the staff
Package tab or another tenant. Firestore rules deny browser writes to
`billing/*` and `pricebook/*` except staff, as today.

### 8.8 Look and feel

Match the admin console tokens (`--cs-navy #16202B`, `--cs-blue #2B5FA8`,
`--cs-bg #F5F4F0`, DM Sans / DM Mono) as the prototype does; light and dark;
works at 1280px and down to a tablet. Cards the same height per row, one
accent, tags in one style, no empty shelves.

### 8.9 Done when

- Staff open a tenant, pick a type, adjust, Activate, and the customer gets a
  payment link; paying switches the modules on in the editor.
- Tests: floor refused; Logic parts need Office; dry run equals apply;
  webhook maps items to modules; a tenant admin cannot call tenant-package;
  a frozen price book cannot change; `check:pages` renders the tenant page
  with the sample tenant in `scripts/_lib/logic-fixtures.js`.
- `CLAUDE.md` Tool gating and White label sections updated to say
  `modules[]` is the source.

---

## 9. Billing runs through QuickBooks

Tommy runs ClearSky's books in QuickBooks, and the repo already invoices
Omega Logic orders from ClearSky's QuickBooks company. Subscriptions use the
same company and the same code patterns, so every dollar lands in one set of
books with no reconciliation between systems.

| Piece | How |
|---|---|
| Company | ClearSky's QuickBooks company (`api/_lib/qbo.js`, pinned by `realmId`, connected via `api/logic-connect.js`). `QBO_ENV=sandbox` for all development and previews; production only after the price book is signed off. |
| Catalog | One QuickBooks **Product/Service** per module, per plan (Field, Pro), per overage, plus "Transformation credit" (discount) and "Annual service fee". Created by `scripts/qbo-sync-items.js`; ids stored in the price book as `qboItemId`. Names match the menu exactly. |
| Customer | One QuickBooks **Customer** per tenant (`OMEGA-<orgId>`, company name, billing email = tenant owner), stored as `billing/current.qboCustomerId`. Same idempotent find-or-create as `qbo-sales.js`. |
| First invoice | At trial end (or paid activation without a trial): one line per module (or the plan line with its modules in the description), the credit as a discount line, the annual service fee **unless staff waived or changed it for this tenant (§10.7)**, due on receipt. The invoice's `invoiceLink` (QuickBooks Payments: card or ACH) is the pay link. |
| Recurring invoice | `api/billing-run.js` (Vercel cron, **daily**) issues each packaged tenant's invoice **on their billing date** (the day of the month they signed up, §10.3) from `modules[]` + the last cycle's overage (`usage/`). Generated by us, not a QuickBooks recurring template, so the lines always match what is switched on. Annual prepay = one invoice for 11 months, dated on the billing date. |
| Opt-in mid-cycle | `plan-change` charges a prorated amount to the next billing date (§10.5); the module joins the next recurring invoice at full price. |
| Paid → access | Intuit webhook → `api/logic-webhook.js` (a hint only) → the worker re-reads the invoice and its payments in QuickBooks → paid ⇒ `modules[]` written and switched on. Nothing is switched on from the webhook body alone. |
| Unpaid | Past due after the grace period (**decide**, default 10 business days, matching Agreement §4.8 notice) → the tenant drops to Lite; work is never lost. |
| Voids and refunds | Follow `docs/ACCOUNTING.md`: a payment is voided, never deleted; a reversal seen in QuickBooks puts the tenant back to unpaid. |
| Autopay (optional) | QuickBooks invoices are paid by link each month. A tenant who wants card autopay can be put on the existing Stripe path (`billingProvider:'stripe'`, `api/stripe-*`); Stripe payouts are then recorded in QuickBooks. Default is QuickBooks for everyone (**decide**). |
| Tax | Invoice lines carry the QuickBooks tax code chosen per item in QuickBooks; the code never computes sales tax. |

**Tests** (on `scripts/_lib/firestore-double.js`, QuickBooks mocked like
`scripts/test-ledger-sync.js` does): invoice lines equal `modules[]` + usage
+ credit + fee; same request twice creates one invoice; floor refused; a
webhook without a paid invoice in QuickBooks switches nothing on; a reversal
drops the tenant back; the cron issues exactly one invoice per tenant per month.

---

## 10. Tiers and à la carte, trials, the billing date, and paying to opt in

### 10.1 Two ways to buy, one menu

Every tenant has exactly **one base**, plus any **add-ons**:

| | À la carte | Tiers |
|---|---|---|
| Base | **Lite** ($500), then each module at its list price | **Field** $1,299 (Lite + up to $1,250 of modules) · **Pro** $2,499 (Lite + up to $3,000, ≤1 Deliverable) · **Enterprise** (annual, quoted) · **Platform** (custom) |
| Who it suits | A company that needs two or three things | A company that needs most of a shelf; the tier is cheaper than the same modules one by one |
| Adding a module | Adds its list price | Free while it fits under the tier's cap; past the cap, the next tier or an à la carte add |
| Omega Logic | Add-on on either model (Office $1,500, all five parts $2,500) | same |

- Tiers are **a discounted amount of the same menu**, so the two models never
  disagree: `modules[]` is still the only record of what is on.
- The **proposal steers** the base: discovery recommends Lite + the modules
  they need this quarter, or the tier those modules fit in, and shows the
  value in their own numbers (VALUE-LADDER §3.7, §8).
- **Auto-steer:** when an à la carte tenant's modules would cost more than
  Field, the menu and the + Modules tab offer "Switch to Field and save $X",
  one click, prorated (§10.5). Same from Field to Pro.
- The Subscription Agreement's Tier 1–4 stay; Lite + modules is the new
  à la carte line on the Order Form.

Annual prepay charges 11 months for 12, without the transformation credit
(Tommy’s explicit decision, 2026-09-26). The book records this as
`policy.annualTransformationCredit: false`.

### 10.2 Trials: 14 days at most, then everyone pays

- One trial per organization, **never longer than 14 days**. Enforced in
  code (`Math.min(TRIAL_DAYS, 14)` in `api/tenant-signup.js` and in
  `tenant-package`), not only by an env var. Staff cannot set a longer one.
- The trial runs the **proposed package**, so the customer experiences the
  base we are steering them to, not everything.
- The clock starts at **approval** (they cannot use a pending workspace).
- Day 11: in-product banner and email: "Your trial ends on <date>. Your plan:
  <package>, <price>/month."
- Trial end: the first invoice is issued from QuickBooks (§10.3). Until it
  is paid the workspace is **read-only** (projects open, nothing new is
  created or exported) with a **Pay to continue** bar. Never deleted.
- Existing tenants already on longer trials (Clean Cell, Budderfly, East West
  Energy) keep their current end dates; the cap applies to new trials. Any
  change to a live tenant goes through Tommy (**decide**).

### 10.3 The billing date

- A tenant's **billing date** is the day of the month they **signed up**
  (`signedUpAt`). Every recurring invoice is dated on it.
- Days 29–31 bill on the last day of shorter months.
- The first invoice, at trial end, covers **trial end → next billing date**,
  prorated (§10.5); from then on, a full month on each billing date.
- Stored as `billing/current.billingDay` (1–31) and `nextInvoiceOn`
  (YYYY-MM-DD). The daily `api/billing-run.js` invoices every tenant whose
  `nextInvoiceOn` is today, exactly once (idempotent by tenant + date).

### 10.4 What signup collects (so QuickBooks can bill them)

`start.html` today asks for company name, phone, subdomain, vertical and logo.
It adds a **Billing** step. Every field maps to the QuickBooks Customer:

| Field | Required | QuickBooks Customer field |
|---|---|---|
| Legal company name | yes | `CompanyName` |
| Billing contact name | yes | `GivenName` / `FamilyName` |
| Billing email (invoices go here) | yes | `PrimaryEmailAddr` |
| AP / accounts-payable email (cc) | no | kept on our record, used as the invoice `BillEmailCc` |
| Billing phone | yes | `PrimaryPhone` |
| Billing address (line 1–2, city, state, ZIP, country) | yes | `BillAddr` |
| Website | no | `WebAddr` |
| Sales-tax exempt? + exemption/resale certificate number (upload optional) | no | `Taxable`, `ResaleNum` (certificate file in Storage, staff-only) |
| PO number required on invoices? | no | kept on our record, printed on each invoice |
| Company type (vertical) and approximate team size | yes | our record only; steers the proposal |

- Stored in `omega_orgs/{org}/billing/profile`: **Admin SDK writes only**
  (through `api/tenant-signup.js` and a tenant-admin `billing-profile`
  endpoint); readable by the tenant's owner/admin and staff; **never** in
  `tenant_public`. No card data is ever stored by us.
- **QuickBooks customer creation:** at approval, `qbo-billing.customer(org)`
  finds or creates `OMEGA-<orgId>` in ClearSky's company from this profile,
  idempotent by `requestid`, and stores `qboCustomerId`. A later profile edit
  updates the QuickBooks customer. Seeded and console-created tenants get the
  same profile form in the admin Package panel (staff fill it in).

### 10.5 Opting in: pay first, prorated to the billing date

Anywhere a tenant opts in (the editor's + Modules tab, Account Settings
"Your plan", or accepting a proposal), the flow is the same:

1. The card shows **"$X today, then $Y/month on the <billing day>."**
   `X = Y × days left until the next billing date ÷ days in this cycle`,
   rounded to the cent, computed on the server (`api/_lib/proration.js`,
   pure and tested; the browser only displays what it returns).
   Inside a tier's cap, Y is $0 and the module switches on immediately.
2. The tenant admin confirms. `POST /api/plan-change` records the request
   and charges it:
   - **Step A (works with today's QuickBooks connection):** a QuickBooks
     invoice for X is created and its pay link opens. The card shows
     "Waiting for payment". The module switches on when the worker sees the
     invoice paid in QuickBooks (usually minutes).
   - **Step B (instant, card on file):** once ClearSky's QuickBooks is
     reconnected with the **QuickBooks Payments** permission
     (`com.intuit.quickbooks.payment`, alongside `…accounting`), the tenant
     saves a card or bank account once (Intuit's own card form; our server
     only ever holds Intuit's token). Opting in then charges it immediately,
     records the payment against the invoice in QuickBooks, and switches the
     module on in seconds. Recurring invoices on the billing date are charged
     the same way. Needs an active QuickBooks Payments merchant account and
     Intuit's production approval for that permission (**decide**).
3. The module joins the next recurring invoice at full price. Every change
   is an `admin_audit` row and a billing history row.
4. Removing a module or dropping a tier: requested any time, takes effect
   at the next quarterly review; no partial-month refunds (**decide**).
5. Moving from à la carte up to a tier mid-cycle charges the prorated
   difference between the old and new monthly totals.

### 10.6 Running out: buy more, like credits

It works the way people already buy software: a new feature is a new
subscription, and running out of what is included means buying more.

- The three metered modules show usage against what's included this cycle,
  in the editor where the work happens: "18 of 20 EV applications used".
- At 80% a quiet note; at 100% the next one asks: **"You've used all 20 EV
  applications this cycle. Buy 10 more for $500"**. The tenant admin pays
  first (same flow as §10.5: QuickBooks invoice link now, saved card once
  Step B is on) and the pack is added the moment it is paid. Members see
  "Ask my admin".
- Packs (**decide**, defaults): EV Rebates 10 applications $500; Permitting
  Matrix 1 matrix $2,500; Site Finder 25 site studies $375. A pack lasts until
  the end of the current cycle (**decide**: or rolls over once).
- **Auto top-up** (optional, tenant admin setting, off by default): when the
  included amount runs out, keep working and bill the overage on the next
  invoice at the per-unit price. Off means the buy-more prompt.
- The usage never blocks opening, viewing or exporting finished work; it
  only gates producing the next metered deliverable.
- Packs are QuickBooks items like everything else (`OMEGA · EV applications
  ×10` …), created by `scripts/qbo-sync-items.js`; purchases are counted in
  `omega_orgs/{org}/usage/{cycle}.purchased{}` by the server, and the
  counter checks included + purchased before producing a deliverable.

### 10.7 The annual service fee: charge, change or waive per tenant

The Agreement's Annual Service Fee (onboarding, configuration, account
maintenance) defaults from the price book: $3,400/yr Field and Pro, $1,500/yr
Lite (proposed), $10,000/yr Enterprise. Staff can change it per tenant.

- **Control:** in the Package panel (and the proposal tool), next to the
  fee: **Charge standard** · **Custom amount** · **Waive**. Staff only; a
  tenant admin never sees the control and cannot change it.
- **A reason is required** for Custom or Waive ("Launch partner",
  "Bundled into Enterprise setup", …). Stored on the tenant as
  `billing/current.serviceFee: { mode: 'standard'|'custom'|'waived',
  amountCents, reason, by, at, appliesTo: 'first-year'|'every-year' }`,
  allow-listed in `api/tenant-billing.js`, written through `tenant-package`,
  and audited (`admin_audit`: who, when, was, now, why).
- **Scope:** first year only (onboarding waived, renewal fee charged) or
  every year. Default when waiving: **first year only** (**decide**).
- **Invoices follow it:** standard → the fee line at the price-book amount;
  custom → the fee line at the custom amount; waived → no fee line. The
  proposal and the invoice show a waived fee as "Annual service fee: waived"
  so the customer sees the value they were given.
- **The $500 monthly floor is unaffected.** The fee is separate from the
  subscription; waiving it never lets a monthly package go under $500.
- **Order Form:** the Agreement's Annual Service Fee line prints the amount
  actually charged, or "Waived", from the same field.

### 10.8 Tests

Proration: first invoice at trial end; a mid-cycle add; billing days 29–31;
a leap year; an add inside a tier cap costs $0; à la carte → Field
difference. Trial: never more than 14 days, whatever `TRIAL_DAYS` says;
read-only after an unpaid trial end, projects still open. Signup: missing
billing fields refused; profile never reaches `tenant_public`; QuickBooks
customer created once at approval and updated on edit. Service fee: waived → no fee line; custom → that amount; a reason is
required; a tenant admin cannot change it; first-year-only waiver bills the
fee at renewal. Opt-in: nothing
switches on until QuickBooks shows the invoice paid (Step A) or the charge
succeeds (Step B). Buy more: the 21st EV application is refused until a pack
is paid (auto top-up off), or allowed and billed next invoice (on); a pack
expires at cycle end; a finished deliverable always opens.

---

## 11. Decisions this roadmap adds

1. Trial: 14 days maximum from approval (decided 2026-09-26); whether a card
   is required to start one (default: no, billing details only).
2. What a tenant keeps on failed payment: Lite (this roadmap) or read-only.
3. Whether members (not admins) see the + Modules tab at all, or only admins.
4. Grace period before an unpaid tenant drops to Lite (default 10 business days).
5. QuickBooks for everyone, or Stripe card autopay offered to tenants who ask.
6. Step B of §10.5: add the QuickBooks Payments permission and reconnect, so
   opt-ins and recurring invoices charge a saved card instantly.
7. Refunds when a module is removed mid-cycle (default: none; removal at review).
