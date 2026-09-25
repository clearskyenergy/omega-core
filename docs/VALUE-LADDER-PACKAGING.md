# OMEGA value ladder, module packaging and the subscription proposal tool

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **build spec, not built.** Written 2026-09-25 from the Will × Andrew ×
Tommy call, Tommy's notebook pages, the Omega Energy OS Subscription Agreement
(.pages template), Tommy's instructions in session, and a read of this repo,
including a ribbon-by-ribbon inventory of `editor.html` (Appendix A). Hand this
file to the builder session as the brief. Every number marked **(decide)** is
a proposal waiting on Tommy, not a settled price.

---

## 0. What we are building, in one paragraph

A customer should understand in minutes which parts of OMEGA they need, buy
those, and opt in to more as their work grows. So: (1) ONE catalog of
sellable **modules**, carved out of the Site Map editor's 186 functions and
the platform's other tools, with ONE price each for everybody; (2) a
**Package** panel in the master console where staff build a tenant's menu at
onboarding, and the price, the Stripe subscription and the access all follow
from the ticks; (3) a **Your plan** menu inside the customer's own workspace
where their owner or admin opts in to more modules and pays for them; and (4)
a **Subscription Proposal** tool, built like the BESS Pro Forma, that turns a
discovery conversation into a branded proposal and order form for that
company. The floor is **$500 a month**. **Nothing is free.**

---

## 1. Sources and what each one decided

| Source | What it settles |
|---|---|
| Call, Andrew | A value ladder: meet customers where they are, a few clear blocks instead of a $1,250–$2,500 lump, blocks around $250, customers self-select and opt in fast, "flip them up" as they use more. Show value in cash-flow terms. |
| Call, Will | Value-based pricing from target audience, average deal size and what they save or earn. One **unit price per module** for every customer. Over/under consumption → restructure the contract; the unit price never changes. Start high and give a **transformation credit**; it is easier to discount than to raise. |
| Call, Tommy | Not per seat: one person designs, twenty look. Charge for what the org consumes. Tier 1 / Tier 2 / Custom stays. |
| Notebook | Value ladder → meet customers where they are → lead them on the journey. Granular approach, revenue budget, buying journey, modules: opt in, cash flow, start point, à la carte, self-select. Value-based pricing on consumption; reverse-engineer to bundle price; over/under consumption → restructure; break the price down to consumption; easier to discount than raise; automate and digitize the process and give them a credit; customer focused. |
| Notebook, account list | The 15 target accounts (§9). |
| Subscription Agreement | Tier 1 Field $1,299/mo, Tier 2 Pro $2,499/mo, Tier 3 Enterprise $150k–$350k/yr, Tier 4 Platform custom. Annual Service Fee $3,400/yr (T1/T2; year one = onboarding), $10,000/yr (T3). T3 setup $25,000. Annual prepay: pay 11 months for 12. Inaugural price locked 12 months. Custom dev $250/hr; T3 includes 7 hrs/mo. Named Authorized Users (§2.3). Tier Scope (§2.5). Telemetry audit (§2.6). |
| Tommy, 2026-09-25 | **Never under $500/mo.** **Never give anything away for free.** **Grid Atlas is its own $250/mo add-on.** The Site Map editor is 100+ tools (guided build, schematic editor, Grid Atlas, network proximity, parcel screening, plot plan, single line…) and must be packaged by what lives in it. Sell: the editor and its exports and reports; the financing marketplace; packages by customer type; Omega Logic (the ERP); BOM functions and exports; the Project Closeout tool; the EV Cost Workbook for rebates. Staff click the menu → that is the price and the payment; customers can see the menu and opt in. A PDF for the board advisors. |

---

## 2. Pricing rules (the builder enforces these in code, not in copy)

1. **Floor: $500/month.** No package, trial or credited month is below it.
2. **Nothing is free.** No free tier, no free function, no free viewer, no
   free trial outside a signed package. A trial is a package with a start
   date and a price. Everything `tier:TIER.ALL` in `omega-tools.js` today
   (Grid Atlas, the compute calculators, intake, the financing marketplace,
   the ComEd finder, the EV workbook) is inside a paid module or Lite. The
   public storefront (`/embed/`) is the paying tenant's White Label module
   serving THEIR visitors; it is not a free tier of ours.
3. **One list price per module**, in a versioned price book. A tenant's
   package records the version it was sold on; a new version never reprices a
   signed package (the rule `customerEditorLite` already follows with Stripe).
4. **Per workspace, not per seat.** Lite includes a counted number of builder
   logins **(decide: 3)** and viewer logins **(decide: 10)**. Extras are priced
   **(decide: $50 builder, $15 viewer, per month)**. Included means paid for
   inside the plan.
5. **Deliverable modules carry included usage and an overage price.** Usage
   is counted on the server where the deliverable is produced (§5.4).
6. **Transformation credit** at signing **(decide: 40% off list for the first
   90 days, never below $500)**, shown as its own line, never as a lower list
   price.
7. **Add any time, remove at the review.** A customer may opt in to a module
   whenever they like (prorated). Modules come off only at the quarterly
   right-size, and unit prices hold for the Initial Term (Agreement
   "Inaugural Pricing").
8. **Plans are value caps, not fixed lists** (§3.5): Field is Lite + up to
   $1,250 of modules for $1,299; Pro is Lite + up to $3,000 of modules
   (one Deliverable at most) for $2,499. The menu and the plans always agree
   because a plan is just a discounted amount of the menu.

---

## 3. The catalog

### 3.1 The ladder

| Rung | Name | Price | Who stands here |
|---|---|---|---|
| 1 | **Lite** | **$500/mo**, the floor | Anyone designing sites. Design, guided builds, blueprint, proposal. |
| 2 | **Lite + add-ons and modules** | +$250 / +$500 each | Most installers, developers, EPCs. |
| 3 | **Deliverables** | +$750 each + usage | Teams doing volume permitting or site sourcing. |
| 4 | **Omega Logic** | from $1,500, all five parts $2,500 | OEMs, distributors, builders running orders, plant and shipping. |
| 5 | **Enterprise / Platform** | $150k–$350k/yr, or custom | Multi-team, multi-workspace accounts. |

There is no rung 0. A lead who has not signed is a lead.

### 3.2 Lite — $500/month (the Site Map core)

What every paying workspace gets: design any site on live satellite, fast,
and show it. About 90 of the editor's functions. Full list in Appendix A.

| Group | Inside |
|---|---|
| Site setup and map | Site Setup (calibrated satellite backdrop), address search, satellite / aerial / street views, Upload Image + B&W stencil trace, Lock Map, Calibrate Scale, Set Plot, GPS Place, Native Layer, Compass, Layers, Coordinates, Recenter, Dock |
| Draw and annotate | Select/Move, Line, Polyline, Rectangle, Circle, EV and ADA stencils, Colour, Text Note, Callout Arrow, Dimension, Zone Box, Labels, Duplicate, Undo/Redo, command search (Ctrl+K), Designer/Pro modes |
| Equipment | BESS cabinet and pad, PCS/inverter, transformer, UPS, generator, solar, wind, fuel cell, panelboard, AC disconnect, meter, junction box, EV chargers (L2 + DCFC catalog), utility pole, Source/POI, concrete pad, fence, bollard, hydrant, camera, parking stall array, custom equipment |
| **Guided builds** | BESS Build, DER Build, Auto Layout, Full Topology, Level 2 Build, DCFC Build, Solar + Storage, BESS Config, Move System, Cluster tools, Fence & Tie, charger pads **(decide: in Lite, as the reason Lite is worth $500)** |
| Conduit and trench | Conduit runs, MV trench, home-run auto-routing, conduit schedule, BESS run checklist, re-anchor and diagnose |
| Review and present | Summary, Meters, live takeoff, 3D Review, Presentation mode, Snapshot |
| Outputs | **Blueprint / PDF** (the drawing you show, not a permit set), client Proposal, Spec Sheet, Interactive Report, Export to Monday (BETA), CRM integration and sync |
| Other pages | Sales Proposal Builder, Open a Sandbox, Project Intake, Account settings and OMEGA Signal, **financing marketplace listing** (File an Opportunity, Financing Partners) |
| Logins | 3 builders, 10 viewers **(decide)** |

### 3.3 Add-on and modules

List prices per month. "Replaces" is what the customer pays for today; the
ranges are typical market figures to confirm before they are quoted, and the
proposal tool lets the rep type the customer's own numbers over them.

**Add-on, $250**

| Key | Module | Inside | Replaces |
|---|---|---|---|
| `gridatlas` | **Grid Atlas** | Standalone Grid Atlas (substations, lines, plants, EIA), the in-editor Grid Atlas pre-screen, Find Substation, Substations → map layer, Grid Pre-Qualify, ComEd Capacity Finder, Interconnection Screener (FERC Order 792 fast track), load vs grid ceiling | Grid and hosting-capacity data subscription, $250–$1,500/mo |

**Standard, $250 each**

| Key | Module | Inside | Meter | Replaces |
|---|---|---|---|---|
| `storage` | **Storage Sizing & Revenue** | BESS Sizer, Solar BESS Sizer, BESS BTM, Solar → BESS, Import Bill, Bill Analysis, in-editor Value Stack (TOU, demand, capacity, ancillary, programs), Price Decks (nodal DA/RT + ancillary), Non-Export Headroom, Energy Balance, 10-year cost of ownership; pages Battery Sizer, BESS Pro Forma + investor deck, Value Stack, BESS ISO Calculator | models run | Storage modelling seat, $300–$1,000/mo |
| `estimate` | **Estimate, BOM & Procurement** | Construction Cost, Electrical Estimate (NECA labour units), Takeoff & Budget, **BOM / Sourcing** (Rexel, CES), BOM / trench / budget / estimate CSV and XLSX exports, cost and spec sheets, Cost Estimator page (AACE class), **Request for Quote** to every vendor on the BOM (`api/rfq.js`), Procurement Marketplace when it ships | BOMs, RFQs | Estimating seat + manual RFQ time, $250–$800/mo |
| `evrebates` | **EV Rebates & Closeout** | **EV Cost Workbook** (estimate → customer proposal + utility make-ready forms: Eversource CT/MA, National Grid, UI; unit-rate bands; eligibility), **L2 Project Closeout** (`ev-closeout.html`: Eversource MA/CT and National Grid MA/NY/RI completion packages: checklist, EVSE serials, final cost vs incentive, one ZIP), future-EV marking | applications + closeouts **(decide: 20/mo included, $50 each over)** | ~$1,000 per application prepared outside |

**Premium, $500 each**

| Key | Module | Inside | Replaces |
|---|---|---|---|
| `plansets` | **Plan Sets & CAD** | **Plot Plan E0/E1.1**, **One-Line E2.0**, **Schematic Editor** (CAD one-line), Riser, SLD check, Permit Sheet (title block, equipment and conductor schedules, NEC notes), Sheet Set Manager (numbering, revisions, issue sets, transmittals), Site Plan Styles, Architecture Mode (full CAD drafting), Building Designer, design rule check and design review, 3D Site Visualizer and AI Render, Georeferenced Export (DXF, DXF 3D, KMZ, GeoJSON, shapefile; BETA), Export for CAD (BETA) | CAD seat + outsourced drafting, $400–$1,500/mo |
| `siteintel` | **Site Intelligence** | **Network Proximity** (carrier hotels, route distance, fibre RTT), Site Pre-Screen (any US ZIP), Site Pre-Qual, Site Score, Viability Workflow, Project Intelligence (pursue/hold, readiness), GIS Layers import (parcels, easements, circuits, fiber, wetland), Buildable Area and exclusions, Terrain (USGS 3DEP LiDAR, slope, cut/fill), **Parcel Screening Register** (rank a folder of site KMZs), acoustic screening (BETA) | Site-screening consultant or GIS analyst time, $500–$2,000/mo |
| `engineering` | **Engineering & Analysis** | Circuit Analysis (panel hierarchy, NEC 220 load calc), Electrical Sizing (NEC 690.7 strings, MPPT), network load flow and short circuit (BETA), Conductor & Transformer Sizing, Multi-Node Power Flow, DER Generation and PVWatts yield, design optimizer (BETA), Optimise Layout, terrain screen, pile schedule, stringing, Site Optimizer (8760), Export for Validation / PE stamp (BETA) | Power-systems analysis licence or engineer hours, $500–$1,500/mo |
| `finance` | **Investor & Finance** | **Push to Marketplace**, **Apply for Financing** (DLL), Site Investment Analysis, DCFC Pro Forma, 3D Fleet Modeler, Residential BESS Analyzer, Degradation & Warranty, city net-zero investment case | Analyst model build + modelling tools, $500–$2,000/mo |
| `compute` | **Compute & Data Center** | Compute tab: Compute Build, ZTMM container data centre, Lay Out Site, Max Load, Load Siting Screen, prime-mover compare, gas and fiber tie-in, Compute Cost, Supply Link, compute campus proposal; Compute Land Lease; parcel screening for campuses | Site-selection consultant time, $500–$1,500/mo |
| `ops` | **Operations** | O&M console, SLA & contract intelligence, Field Service & Dispatch, Owner Reporting, Fleet Command, Site Lifecycle console, Digital Twin handoff | Asset-management platform, $500–$2,000/mo |
| `whitelabel` | **White Label Storefront** | The tenant's name on the platform, sizing embedded on their own website, leads and orders into their queue. Needs the Reseller addendum (§7) | Custom web sizing tool + lead capture, $500–$2,000/mo |

**Deliverables, $750 each + usage**

| Key | Module | Inside | Meter | Replaces | Honest limit today |
|---|---|---|---|---|---|
| `permitting` | **Permitting Matrix** | Permit Creator (full set), the five-sheet permitting matrix (cover, master matrix, Gantt timeline, dependencies & risk, fee summary), required-documents checklist, jurisdiction engine | matrices **(decide: 1/mo included, $2,500 each over)** | $30,000 consultant report | **BETA in the editor's own code: one verified jurisdiction pack (Vista / SDG&E).** Elsewhere the permits and code references are right but agencies, fees and durations come back blank. Sell by verified jurisdiction, or as a draft matrix, until more packs exist **(decide)**. |
| `sitefinder` | **Site Finder** | C&I property ranked by deliverable kW, hold a circuit, Site Discovery & Screening | site studies **(decide: 25/mo included, $15 each over)** | Parcel + capacity data, $1,000–$8,000/mo | **Northern Illinois (ComEd) only today.** ClearSky pays ~$100k/yr for the data; ~12 subscribers covers it. |

**Platform: Omega Logic** (sold in five parts; all five **$2,500**, $3,500 à la carte)

| Key | Part | List | Inside |
|---|---|---|---|
| `logic-office` | **Office** (required for the others) | $1,500 | Orders with pricing and acceptance, customers as accounts, CRM, PO loads in bulk, invoicing (QuickBooks or the tenant's own), Team, Today hub, the Omega Logic phone app |
| `logic-plant` | **Plant** | $750 | Work orders, stations and routing, bench scan station, steps and checks, quality holds, end-of-line tests, plant map |
| `logic-materials` | **Materials & Purchasing** | $500 | Bill-of-materials explosion, stock counts, suppliers and buy prices, purchase orders, the materials plan |
| `logic-logistics` | **Logistics & Warranty** | $500 | Freight plan, carrier quotes, loads, custody, sites, derived warranty and SLA, fleet register |
| `logic-customer` | **Customer App** | $250 | The tenant's own customers: fleet, POs, pay, shipping, warranty, Editor Lite |

**Not sold:** `osaportal` (JV agreement), `spatco_ev` (one tenant's own
tool), `intake_admin` (ClearSky's queue), `soon:true` placeholders
(`ahj`, `aggregators`, `offtakers`) until they ship. `interconnectstudy`
stays Enterprise-only.

### 3.4 The whole menu at a glance

| Shelf | Items | Each |
|---|---|---|
| Floor | Lite | $500 |
| Add-on | Grid Atlas | $250 |
| Standard | Storage Sizing & Revenue · Estimate, BOM & Procurement · EV Rebates & Closeout | $250 |
| Premium | Plan Sets & CAD · Site Intelligence · Engineering & Analysis · Investor & Finance · Compute & Data Center · Operations · White Label | $500 |
| Deliverable | Permitting Matrix · Site Finder | $750 + usage |
| Platform | Omega Logic (Office $1,500 · Plant $750 · Materials $500 · Logistics $500 · Customer App $250) | all five $2,500 |

Everything on the editor side at list: $500 + $250 + $750 + $3,500 + $1,500
= **$6,500/mo**. With all of Omega Logic: **$9,000/mo** ($108k/yr).

### 3.5 Plans

| Plan | Price | Rule | Saves |
|---|---|---|---|
| **Lite** | $500/mo | Lite only | n/a |
| **Tier 1 · Field** | $1,299/mo | Lite + up to $1,250 of add-on / Standard / Premium modules | up to $451/mo |
| **Tier 2 · Pro** | $2,499/mo | Lite + up to $3,000 of modules, at most one Deliverable | up to $1,001/mo |
| **Tier 3 · Enterprise** | $150k–$350k/yr | Every module, several workspaces, pooled usage, 7 dev hrs/mo, $25k setup, $10k/yr service fee | see note |
| **Tier 4 · Platform** | Custom | Omega Logic + anything above, scoped per contract | n/a |

Below Field's $1,299, the customer pays à la carte. **Enterprise note:** the
whole menu at list is $108k/yr, so the $150k floor is carried by multiple
workspaces, 7 dev hours a month (~$21k/yr at $250/hr), priority support and
pooled usage. **(decide)** whether that is the pitch, or the Enterprise floor
moves.

### 3.6 Starter packs by customer type

| Type | Examples | Start (list) | Usually next |
|---|---|---|---|
| EV installer | Concord, OGI | Lite + EV Rebates + Estimate/BOM + Grid Atlas + Plan Sets → **Field $1,299** ($1,750 list) | Permitting (as packs land), EV overage |
| Solar / BESS installer | SunESol | Lite + Storage + Estimate/BOM + Plan Sets → **Field** | Grid Atlas, Permitting |
| Developer | NextNRG, Budderfly, Solela | Lite + Grid Atlas + Storage + Investor & Finance ($1,500) → **Field** | Site Intelligence, Operations |
| EPC / engineering | CIR | Lite + Plan Sets + Engineering + Estimate/BOM + Permitting → **Pro $2,499** (room for Grid Atlas + Site Intelligence inside the cap) | Operations |
| OEM | Clean Cell, FENECON | Lite + White Label + Storage + Estimate/BOM → **Field**, + Omega Logic | Plan Sets, Permitting |
| Distributor | Walters | Lite + White Label + Estimate/BOM ($1,250) | Logic Office + Logistics |
| Compute / advisor | East West Energy | Lite + Compute + Grid Atlas + Site Intelligence → **Field** | Engineering, Site Finder |
| Capital partner | Helios | Lite + Investor & Finance + Grid Atlas ($1,250) | Site Intelligence |

### 3.7 Sizing up a company (the discovery that picks the package)

Ten questions, asked on the call or in the proposal tool. A module goes in the
starting package only when the answer is **"this quarter"**; a "within the
year" answer puts it on the next-rung list. The result is always ≥ $500.

| # | Question | Yes this quarter → |
|---|---|---|
| 1 | Do you design sites (BESS, solar, EV, microgrid, data centre)? | Lite |
| 2 | Do you find or screen your own sites or grid capacity? | Grid Atlas; many sites → Site Intelligence; northern Illinois C&I → Site Finder |
| 3 | Do you size storage or model savings/revenue for a customer? | Storage Sizing & Revenue |
| 4 | Do you price jobs, build a BOM or buy the equipment? | Estimate, BOM & Procurement |
| 5 | Do you file EV make-ready or rebate applications? How many a month? | EV Rebates & Closeout (>20/mo → overage in the proposal) |
| 6 | Do you submit drawings to a utility or an AHJ yourselves? | Plan Sets & CAD |
| 7 | Do you need permitting timelines, fees and a Gantt? Where? | Permitting Matrix (only where a jurisdiction pack is verified) |
| 8 | Do you do electrical engineering in-house or pay for it? | Engineering & Analysis |
| 9 | Do you raise capital, sell to investors or need financing? | Investor & Finance |
| 10 | Do you build compute / data-centre sites? | Compute & Data Center |
| 11 | Do you operate assets after COD? | Operations |
| 12 | Do you sell a product under your own name, take orders, build or ship? | White Label; Omega Logic parts by what they run |

Plus one money question: **what do you pay today for each of these** (tools,
consultants, drafting, data)? Those numbers feed the value page.

---

## 4. What already exists (do not rebuild)

- `api/tenant-billing.js`: staff-only, allow-listed writer of
  `omega_orgs/{org}/billing/current` with history. Fields: `tier`, `addons`,
  `toolOverrides`, `toolAccess`, `status`, `trialEndsAt`, `subscriptionDue`,
  `amountDue`, `paymentLink`, `autopay`, `paymentProvider`, `stripeCustomerId`,
  `customerEditorLite`.
- `omega-caps.js`: tier ladder (`trial`, `standard`, `deluxe`, `enterprise`)
  and `ADDON_GRANTS` (`compute`, `parcelscreen`, `engineering`, `schematics`,
  `exports`, `permitting`).
- `editor.html` ribbon gates today: Compute tab `data-cap="compute"`; Analyze
  and Estimate tabs `data-cap="engineering"`; Plot Plan `export.plotplan`;
  One-Line `export.oneline`; Blueprint `export.blueprint`; Permit
  `permitting`; Apply for Financing `export`; schematic section `schematic`.
  **Grid Atlas pre-screen and the whole Estimate tab sit behind
  `engineering`**, so they cannot be sold separately until they are
  re-gated (§5.1).
- `omega-tools.js`: tool catalog by tier; `toolAccess` allowlist wins over
  tier/add-ons/overrides ("absent ≠ empty"; `scripts/tests/ttoolaccess.js`).
- `admin/admin-console.js`: tenant drawer, add-on checkboxes (`ADDON_UI`),
  Omega Logic bundle (`/api/logic-onboard` `action:'bundle'`), Tier 1–4
  dropdown with prices.
- **Stripe is wired**: `api/stripe-create.js` (customer, subscription with ONE
  price, or a payment link; staff only), `api/stripe-webhook.js`
  (`invoice.paid` → active, `payment_failed` → grace, `customer.subscription.*`
  → tier from the price's `tier` metadata), `api/stripe-portal.js` (tenant
  admin opens the Customer Portal), `api/stripe-invoices.js`,
  `api/customer-subscribe.js` (the pattern for Checkout).
- `proforma.html` + `proforma-logic.js` + `/api/proforma` +
  `api/_lib/proforma-engine.js`: THE pattern for the proposal tool.
- Event Layer: product telemetry, **not** a billing meter (§5.4).
- `ev-closeout.html` and the Eversource MA template are on the unmerged branch
  `claude/level-2-closeout-tool-aqkh73`. **Merge it first.**

---

### 4.1 Where today's gates leak (fix before a module is sold)

A full sweep of `editor.html` (186 distinct user-facing functions) found that
the capability gate covers very few of them. A module can only be sold if its
tools stay shut for a tenant who has not bought it. Phase 2 must close all of
these, each with a test:

1. **`schematic` and `riser` protect almost nothing.** Schematic Editor,
   Riser, Check One-Line, Design Review, Permit Sheet, Sheet Set Manager and
   Geo Export sit on the ungated Output tab (anchors 109271, 128798, 140945,
   140956, 140985, 110975, 111955, 115800).
2. **`permitting` unlocks nothing visible.** The cap exists only in
   commented-out markup (2305); the Permitting Matrix (140991) is ungated.
3. **The File menu goes around the export and engineering gates.** The
   Documentation drawer (15 sheets E0–S3.0 plus XLSX/GeoJSON exports, 1800),
   Print/PDF (1798), BOM / Sourcing (1804) and Electrical Estimate (1805) are
   ungated there; View › Summary › Cost reaches Construction Cost (3618).
4. **Compute leaks out of its tab.** Compute Build (Build tab, 1835) and Data
   Ctr placement (Draw tab, 2071–2080) carry no `compute` cap.
5. **The command palette (Ctrl+K) and Ask Jarvis run hidden buttons.** They
   index every ribbon button, including those the gate removed, and click
   them by name (105492, 105558). They must read the same module check.
6. **`?customerEngine=1` switches the gate off entirely** (4491, 175932).
7. **Parcel Screen needs both `parcelscreen` and `engineering`** because it
   lives inside the Analyze tab; Grid Atlas pre-screen, Find Substation,
   Network Proximity and Site Score are behind `engineering` too. Each must
   move to its own module gate.
8. **The retired `csebuilders.com` still resolves to the ungated `internal`
   tier** in `omega-caps.js` (`INTERNAL_DOMAINS`, 306) with no verified-email
   check, against CLAUDE.md. Queued as its own fix.

`can('tou'|'demand'|'capacity'|'ancillary'|'program')` inside Value Stack
(93476) is NOT a tier gate; it filters revenue streams by market partner.

### 4.2 Not live yet: do not sell as included

Marked SOON, hidden or retiring in the editor today: Permit Creator (hidden;
stub says "contact your account rep"), Site Pre-Qual, Site Pre-Screen, Price
Decks, Digital Twin hand-off (SOON), Viability Workflow (hidden), BESS Config
(retiring), the radial power-flow / short-circuit engine (tagged BETA, no
button). BETA and sellable only with a beta clause: Permitting Matrix,
Noise Modeling, Design Optimizer, 3D Site Visualizer, Bill Analysis, Geo
Export, Export for CAD, Export for Validation. Unwired code that could become
a feature: `openLaborProposal` (49886), `openSiteCapture` (14525), the URDB
tariff import engine (130416).

---

## 5. Data model and server pieces

### 5.1 `api/_lib/modules.js`: the ONE module catalog (code)

Pure, ES5. What a module *is*: `{ key, name, shelf, tools[], caps[],
ribbon[], addons[], meter, requires[] }`. `ribbon[]` names the editor ribbon
buttons/tabs it unlocks (ids or handler names, as `OmegaTags` already matches
them). `resolve(moduleKeys)` → `{ tier, addons[], toolAccess[], caps[] }`.

- **Re-gate the editor by module**: `omega-caps.js` gains `MODULE_GRANTS`
  (fed from the same list, bundled for the browser), and the ribbon's
  `data-cap` values move from tier-sized caps to module caps
  (`gridatlas`, `estimate`, `siteintel`, `plansets`…). Staff keep `all`.
  This is the one piece of real editor work; it must be done button by
  button against Appendix A, with a test that every ribbon button is in
  exactly one module or in Lite.
- A test asserts every `omega-tools.js` key is in one module, in Lite, or on
  the "not sold" list, so tool 43 cannot go unpriced.
- Prices are NOT here.

### 5.2 `pricebook/{version}` (Firestore, staff-written, append-only)

`floorCents: 50000`, Lite price and included logins, each module's
`priceCents`, `stripePriceId`, included usage and `overageCents` +
`stripeMeteredPriceId`, plan caps (`field: {priceCents:129900,
capCents:125000}`, `pro: {…, capCents:300000, maxDeliverables:1}`), credit,
service fees. A version is frozen once used; a change is a new version.

### 5.3 `billing/current` gains allow-listed fields

In `api/tenant-billing.js` ALLOWED (and nowhere else): `modules[]`,
`pricebookVersion`, `plan`, `credit {pct, endsAt}`, `builders`, `viewers`,
`stripeSubscriptionId`. `tier`, `addons` and `toolAccess` become **derived**
from `modules[]` by `modules.resolve()` and are never hand-edited for a
packaged tenant again.

### 5.4 Usage counters

**Not the Event Layer** (terms-gated; FENECON and OSA excluded by design, so
they would get free usage). Count where the deliverable is produced:
`omega_orgs/{org}/usage/{YYYY-MM}` incremented in a transaction by the
producing endpoint; `POST /api/usage` (idempotent by client id) for the
producers that live in the browser today (EV workbook export, closeout ZIP,
permitting matrix). It is an honest billing counter, not a security boundary;
say so in the header. Overage reaches Stripe as metered usage records.

### 5.5 `subscription_proposals/{id}` (Admin-SDK only)

Prospect, discovery answers, modules, plan, price-book version, server-computed
lines, rep-entered "replaces" figures, term, payment election, credit,
service fee, totals, status (`draft|sent|accepted|declined|expired`), who and
when, PDF path. Accepting runs the same path as §6.1.

---

## 6. Click the menu → price → pay → access

### 6.1 Staff side (master console, onboarding a tenant)

1. Tenant drawer → **Package** panel: customer type preselects the starter
   pack (§3.6); staff tick and untick the menu. Live: list total, plan that
   fits, credit, first-90-days price, usage included, **floor enforced**.
2. **Send proposal** (opens the proposal tool prefilled) or **Activate**.
3. Activate → `POST /api/tenant-package` (staff): validates against the
   price book → creates or updates the **Stripe subscription with one item
   per module** (or the plan's price plus its module metadata), metered items
   for usage, the credit as a Stripe coupon → returns Checkout / the invoice
   link for the first payment.
4. `api/stripe-webhook.js` on `customer.subscription.created|updated` and
   `invoice.paid`: reads the subscription's items (price metadata `module`)
   → writes `modules[]` → `modules.resolve()` → `tier`, `addons`,
   `toolAccess`, caps. **What Stripe says is paid is what is switched on.**
   History row + `admin_audit` row on every change.

### 6.2 Customer side (the menu they opt in from)

1. **Your plan** page in Account Settings for the tenant's owner/admin
   (`A.isTenantAdmin`): the same menu, what they have, what each module adds,
   the price, the usage against included.
2. Tick a module → shows the new monthly total and today's prorated charge →
   **Add to my plan** → `POST /api/plan-change` (tenant admin) adds the
   Stripe subscription item (prorated, card on file via the Customer Portal)
   → the webhook switches it on in seconds. An accepted opt-in is an Order
   Form amendment (§7).
3. Removing a module: **request removal at the next review**, never an
   instant drop (rule 7). Staff see it in the console.
4. Members who are not admins see the menu read-only with **Ask my admin**.
5. The storefront and the editor's locked buttons show "Part of <Module>,
   $X/mo, Add" to an admin, and "Ask your admin" to anyone else.

---

## 7. Changes the Subscription Agreement needs (for counsel)

- **Order Form**: a Lite line ($500/mo), a **Module Schedule** (modules, unit
  prices from price-book version X, included usage, overage), included
  builder and viewer logins, credit line.
- **§2.3 Authorized Users**: add counted **Viewer** logins and extras priced.
- **§2.5 Tier Scope** → "Tier and Module Scope".
- **New: electronic opt-in**: adding a module in the product is an amendment
  to the Order Form at the published unit price, prorated.
- **New: usage and quarterly right-size**: included usage, overage in
  arrears, the 90-day review, removals at review, unit prices fixed for the
  Initial Term.
- **New: transformation credit**: amount, period, never below $500,
  forfeited on early termination **(decide)**.
- **§2.4 service-bureau restriction** conflicts with White Label resale: a
  **Reseller / White Label addendum** first.
- **§4.4 Annual Service Fee** for Lite: $3,400 is more than half a year of
  Lite **(decide: lower for Lite, e.g. $1,500, or fold into Lite's price)**.
- **Beta modules** (Permitting Matrix outside verified jurisdictions, Geo
  Export, Export for CAD, Validation, network analysis, optimizer, noise)
  sold with a beta clause, or not sold until finished **(decide)**.
- FENECON and OSA: the menu reaches them only as an amendment.

---

## 8. The Subscription Proposal tool (`subscription-proposal.html`)

The BESS Pro Forma pattern: page + `subscription-proposal-logic.js` (draws the
deck) + `POST /api/subscription-proposal` (`context | recommend | price |
save | send | accept`) backed by `api/_lib/subscription-pricing.js`. All
pricing math server-side (CLAUDE.md IP rule). Staff-only to start.

1. **Company**: domain → `omega_orgs/{org}` brand and vertical, or a prospect.
2. **How they work today**: the §3.7 questions + what they pay today.
3. **Recommended package**: server maps answers → modules; rep adjusts.
4. **Value**: their spend vs ours, deliverable math, payback, per month /
   quarter / year.
5. **Terms**: monthly or annual prepay, service fee, credit, Initial Term,
   the next rungs and the trigger for each.
6. **Deck**: 6–8 page PDF in the customer's name (the Agreement's Order Form
   filled in, signature block). Reseller's brand when a White Label tenant
   sends it.
7. **Send and accept**: acceptance → §6.1 step 3 → payment → access.

---

## 9. The 15 target accounts

Status is from `tenants/<slug>/tenant.json` seeds and may be stale; check the
live console first.

| Account | Type | Status | Start with | List/mo | Pay | Next | Trigger |
|---|---|---|---|---|---|---|---|
| Clean Cell | OEM | Trial ends **2026-09-30**; white label + Logic live on trial | Lite + White Label + Grid Atlas + Storage + Estimate/BOM + Omega Logic (all five) | $5,250 | $1,299 Field + $2,500 Logic = **$3,799** | Plan Sets, Permitting | Storefront orders and bulk POs through Logic |
| Concord Energy | EV installer | Paying, Field | Lite + EV Rebates + Estimate/BOM + Grid Atlas + Plan Sets | $1,750 | **$1,299** Field | EV overage >20/mo, Permitting (CT/MA packs) | 45 applications in 72 h |
| NextNRG | Developer | Enterprise, Compute add-on | Storage + Investor & Finance + Compute + Grid Atlas + Site Intelligence + Plan Sets | $3,000 | Existing contract; map to modules at renewal (Pro covers this set) | Operations, Site Finder | Quarterly right-size |
| Budderfly | Developer (EE-as-a-service) | Trial ends 2026-10-16 | Lite + Grid Atlas + Storage + Investor & Finance | $1,500 | **$1,299** Field | Operations, Site Intelligence | Installed sites needing owner reporting |
| East West Energy | Compute / advisor | Trial ends 2026-10-16 | Lite + Compute + Grid Atlas + Site Intelligence | $1,750 | **$1,299** Field | Engineering, Site Finder | >5 campuses screened a month |
| CIR | EPC / engineering | Trial | Lite + Plan Sets + Engineering + Estimate/BOM + Permitting (+ Grid Atlas + Site Intelligence inside Pro) | $3,250 | **$2,499** Pro | Operations | >1 matrix a month |
| FENECON | OEM, receives full BOM | Signed MSA | Lite + White Label + Storage + Estimate/BOM | $1,500 | $1,299 Field **by MSA amendment** | Omega Logic | RFQ volume |
| Walters Wholesale | Distributor | Trial | Lite + White Label + Estimate/BOM | $1,250 | **$1,250** | Logic Office + Logistics | Contractor orders via storefront |
| Solela / Chileasing | Developer / leasing | Standard | Lite + Storage + Investor & Finance | $1,250 | **$1,250** | Operations | Leased assets in service |
| Helios Energy Advisors | Capital partner (confirm = `heliosnrgy.com`) | Partner | Lite + Investor & Finance + Grid Atlas | $1,250 | **$1,250** | Site Intelligence | Sourcing own pipeline |
| OGI Solar / OSA | Installer / JV | OGI standard; OSA under JV | OGI: Lite + Storage + EV Rebates + Estimate/BOM | $1,250 | **$1,250**; OSA on JV terms | Plan Sets | OSA verification volume |
| Green Wolf Strategies | Not on platform | Discovery | §3.7 on the call | ≥ $500 | | | |
| Lattice Energy | Not on platform | Discovery | same | ≥ $500 | | | |
| Roam Energy | Not on platform | Discovery | same | ≥ $500 | | | |
| R.E.S. (confirm the company) | Not on platform | Discovery | same | ≥ $500 | | | |

Pipeline at the proposed prices, excluding NextNRG's existing contract and
counting the four discovery accounts at the $500 floor: **$18,494/mo
(~$221.9k/yr)**. Brett (batteries + compute, not on the list): Lite + Compute
$1,000, or Lite + Grid Atlas $750.

---

## 10. Build plan

Constraints for every phase: ES5 in tool pages and `omega-*.js`, no build
step, single-file tools with one optional `-logic.js`, the copyright header,
pricing math only in `/api/`, staff = verified `@clearsky-usa.com`
(`caller.staff`), Admin-SDK-only billing/usage/proposal paths, tests on
`scripts/_lib/firestore-double.js`, `npm test` and `npm run check:pages` green.

- **Phase 0**: merge `claude/level-2-closeout-tool-aqkh73`; Tommy settles
  every **(decide)**; counsel starts §7.
- **Phase 1, catalog**: `api/_lib/modules.js` + tests (every tool and every
  ribbon button accounted for); `pricebook/` rules + seed; Stripe Products
  and Prices per module (script, idempotent, writes ids into the price book).
- **Phase 2, editor re-gate**: close every leak in §4.1 first (File menu,
  command palette, Jarvis, `?customerEngine=1`, ungated Output tools);
  `MODULE_GRANTS` in `omega-caps.js`; ribbon
  `data-cap` → module caps per Appendix A; locked buttons say which module
  unlocks them. Backfill script proposes `modules[]` for every live tenant
  from its current tier/add-ons, dry run first, **flag, don't drop**.
- **Phase 3, staff Package panel + `tenant-package` + webhook → modules.**
- **Phase 4, customer Your plan + `plan-change`.**
- **Phase 5, proposal tool.**
- **Phase 6, usage meter + Stripe metered overage + the 90-day right-size
  report.**

Docs to update as phases land: this file, `CLAUDE.md` (Tool gating),
`docs/WHITE-LABEL.md` (reseller addendum), `MERGE.md`.

---

## 11. Decisions for Tommy

1. Prices: Lite $500; Grid Atlas $250; Standard $250; Premium $500;
   Deliverable $750; Logic Office $1,500, Plant $750, Materials $500,
   Logistics $500, Customer App $250, all five $2,500.
2. Guided builds in Lite (this spec: yes).
3. Logins in Lite (3 builders, 10 viewers) and the extra-login prices.
4. Credit: 40% for 90 days, never below $500, forfeited on early exit?
5. Usage: EV 20 included / $50 over; matrices 1 / $2,500; site studies 25 /
   $15.
6. Permitting Matrix while it is BETA: sell per verified jurisdiction, as a
   draft, or hold.
7. Enterprise: keep $150k floor with dev hours and workspaces as the reason,
   or move it.
8. Lite's Annual Service Fee.
9. Who may send proposals (staff only, or White Label tenants too).
10. Whether a customer's opt-in is instant (this spec) or staff-approved.

---

## Appendix A. What lives in the Site Map editor, by module

From the `editor.html` ribbon (tabs File, Edit, Build, Compute, Insert, Draw,
Annotate, Analyze, Estimate, View, Output, Settings) and the modules it loads.
Status column: `NEW`/`BETA` as the editor's own `OmegaTags` list marks them.

| Module | Ribbon location | Functions |
|---|---|---|
| Lite | Build › Site | Site Setup, address search, Upload Image, Stencil B&W, Lock Map, Calibrate Scale, Clear Scale, Set Plot, Clear Plot, GPS Place, Recenter |
| Lite | Build › Build (guided) | DER Build, Auto Layout, BESS Build, Full Topology, Level 2, DCFC Build, Solar + Storage, BESS Config, Move System, Cluster tools, Fence & Tie |
| Lite | Insert | BESS Cabinet, PCS/Inverter, Transformer, UPS, Generator, Solar, Wind, Fuel Cell, Panelboard, AC Disconnect, Meter, Junction Box, EV Charger (L2/DCFC catalog), Utility Pole, Source/POI, Utility, Parking Stalls, Concrete Pad, Fence, Bollard, Fire Hydrant, Camera, custom equipment |
| Lite | Draw / Annotate / Edit | Select/Move, Line, Polyline, Rectangle, Circle, EV Stencil, ADA Symbol, ADA Aisle, Colour, Conduit runs, MV Trench, home-run routing, Text Note, Callout Arrow, Dimension, Zone Box, Labels, Duplicate, Delete, Undo/Redo, Clear |
| Lite | View | Layers, Compass, Coordinates, Crosshair, Native Layer, Dock Left, Diagnose, Conduit Schedule, Solar panel view, 3D Review, Summary, Meters, live takeoff, Presentation, Snapshot, command search |
| Lite | Output | Blueprint / PDF, Proposal, Spec Sheet, Interactive Report, Export to Monday (BETA) |
| Lite | Settings / File | Maps key, AI keys, CRM Integration, Sync to CRM, Equipment Library, New/Open/Save projects, share link |
| Lite | AI | Ask Jarvis (F1), Design with AI (address → sketch), AI Stencil, AI Render, AI bill reader |
| Grid Atlas | Analyze (today behind `engineering`) | Grid Atlas pre-screen, Grid Pre-Qualify, Find Substation, Substations → map layer, load vs grid ceiling |
| Storage | Build › Size & Configure; Analyze | BESS Sizer, Solar BESS Sizer, BESS BTM, Solar → BESS, Import Bill, Bill Analysis (NEW), Value Stack (TOU/demand/capacity/ancillary/program), Price Decks, Non-Export Headroom, Energy Balance, 10-year cost of ownership |
| Estimate/BOM | Estimate (today behind `engineering`) | Construction Cost, Electrical Estimate, Takeoff & Budget (NEW), BOM / Sourcing, Budget CSV, Trench schedule CSV, estimate CSV, cost/spec sheet |
| EV Rebates | Insert; Output | Future EV marking, EV Cost Workbook link (page), L2 Project Closeout (page, on branch) |
| Plan Sets & CAD | Output › Permit Documents / Handoff; Annotate › Markup; Draw › Drafting | Plot Plan E0/E1.1, One-Line E2.0, Schematic Editor (NEW), Riser (NEW), SLD check (NEW), Permit Sheet (NEW), Sheet Set Manager (NEW), Site Plan Styles (NEW), Architecture Mode, Building Designer (NEW), design rule check (NEW), design review, 3D Site Visualizer, AI Render, Georeferenced Export (BETA), Export for CAD (BETA), general and keyed notes |
| Site Intelligence | Analyze › Assessment; Insert › Site & Safety | Network Proximity, Site Pre-Screen, Site Pre-Qual, Site Score, Viability Workflow, Project Intelligence, GIS Layers (NEW), Buildable Area, Add Exclusion, Terrain Layer, 3DEP Tiles, Terrain Key, Parcel Screening Register, acoustic screening (BETA) |
| Engineering | Analyze | Circuit Analysis (NEW), NEC 220 load calc, Electrical Sizing (NEC 690.7), network analysis (BETA), DER Generation, Generation Analysis / PVWatts, design optimizer (BETA), Optimise Layout, terrain screen, pile schedule, stringing CSV, Export for Validation (BETA), Validation Status (BETA), Digital Twin handoff |
| Investor & Finance | Output › Marketplace | Push to Marketplace (NEW), Apply for Financing (DLL), city net-zero investment case, Building Net-Zero |
| Compute | Compute (behind `compute`) | Compute Build, ZTMM container data centre, Lay Out Site, Max Load, Load Siting Screen, prime-mover compare, gas / fiber tie-in, Compute Cost, Supply Link, Land Lease, compute campus proposal |
| Permitting Matrix | Output › Permit Documents | Permit Creator (hidden today), Permitting Matrix (BETA: Vista / SDG&E verified), Gantt timeline, dependencies & risk, fee summary, required-documents checklist |

186 distinct user-facing functions in all (a full sweep found 189 rows across 13 categories: site intelligence 28, design and drawing 41, guided builds 13, conduit 9, electrical 16, drawings and exports 13, permitting 6, BOM and cost 6, revenue 13, compute 20, collaboration 8, AI 8, imports 8). Items in §4.2 are listed where they live but are not sold until live. The builder must reconcile this table
button by button in Phase 2; anything found that is not here goes into one
module or Lite, never left ungated.
