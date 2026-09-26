# Packaging roadmap: tenant onboarding, pricing and the editor that fits the package

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **roadmap, not built.** Companion to `docs/VALUE-LADDER-PACKAGING.md`
(the catalog, prices, rules and the editor inventory). This file says what
gets built, in what order, and how the product behaves when a tenant owns
only part of it. Prototype of the admin panel:
https://claude.ai/artifact/2Sou93uMRrCsc8K4E2Xg8n (private to the owner).

---

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
| **Self-serve signup** (`api/tenant-signup.js`) | Creates `status:'pending'` with `billing.tier:'trial'` and a **free 30-day trial** | Creates `status:'pending'` with a **proposed package**: `modules[]` from the signup form's customer type (§3.6 starter pack of the catalog), `pricebookVersion`, `status:'awaiting approval'`. No access, no charge. The "being set up" screen shows their proposed package and price. |
| **Seed** (`scripts/seed-omega-orgs.js`, `tenants/<slug>/tenant.json`) | Writes `tier` | `tenant.json` carries `modules[]` (not `tier`); the seed runs it through `resolve()` and refuses a package under the floor. Legacy `tier` in a seed file is mapped once by the backfill (Phase 3) and then rejected. |
| **Approve** (`api/tenant-approve.js`) | `status:'active'` + optional `tier` | **Approve requires a package.** Staff confirm or edit `modules[]` in the Package panel; approve calls `tenant-package`, which issues the first QuickBooks invoice and QuickBooks emails the pay link. `status` goes `active` when the first invoice is paid (webhook), not on the click. A trial, if offered, is a priced package with `trialEndsAt` and a card on file (**decide**). |
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
4. **One place for everything else: the Add-ons tab.** A single ribbon tab
   at the far right, **"+ Modules"**, shows what the tenant doesn't have as
   a tidy gallery: one card per module with its icon, three things it adds,
   the price, and **Add** (tenant admin) or **Ask my admin** (member). This
   is the only upsell surface inside the editor. Nothing else nags.
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
| Lite | File, Edit, Build, Insert, Draw, Annotate, View, Output, Settings, + Modules | Output has Blueprint, Proposal, Spec Sheet, Interactive Report only |
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
| **4 · Admin Package panel** | Package panel in the admin portal, full spec in §8 (prototype: `docs/design/package-panel-prototype.html`); `POST /api/tenant-package`; webhook writes `modules[]`; `tenant-approve` requires a package; signup proposes one. | Approving a tenant produces a QuickBooks invoice, and access only after QuickBooks shows it paid. |
| **5 · Customer opt-in** | "Your plan" in Account Settings; `POST /api/plan-change`; + Modules tab wired to it. | A tenant admin adds a module and sees it in the ribbon without staff. |
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
  charge, credit toggle and first-90-days, annual service fee, included
  usage, a sentence on room left in Field/Pro or when Field becomes the
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
| `api/billing-run.js` (cron) | new | 1st of the month: next invoice per packaged tenant; overdue check (grace, then Lite) |
| `api/stripe-webhook.js` | changed (optional path) | only for tenants with `billingProvider:'stripe'` |
| `api/tenant-approve.js` | changed | `approve` requires a package (calls tenant-package) |
| `api/tenant-signup.js` | changed | writes a proposed package, no free trial |
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
| First invoice | On Activate / Approve: one line per module (or the plan line with its modules in the description), the credit as a discount line, the annual service fee, due on receipt. The invoice's `invoiceLink` (QuickBooks Payments: card or ACH) is the pay link. |
| Monthly invoice | `api/billing-run.js` (Vercel cron, 1st of the month) issues each packaged tenant's invoice from `modules[]` + last month's overage (`usage/{YYYY-MM}`). Generated by us, not a QuickBooks recurring template, so the lines always match what is switched on. Annual prepay = one invoice for 11 months. |
| Opt-in mid-month | `plan-change` issues a prorated invoice for the rest of the month; the module joins next month's invoice. |
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

## 5. Decisions this roadmap adds

1. Self-serve trial: none (approval + payment first), or a priced package
   with a card on file and a start date.
2. What a tenant keeps on failed payment: Lite (this roadmap) or read-only.
3. Whether members (not admins) see the + Modules tab at all, or only admins.
4. Grace period before an unpaid tenant drops to Lite (default 10 business days).
5. QuickBooks for everyone, or Stripe card autopay offered to tenants who ask.
