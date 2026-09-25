# OMEGA value ladder, module packaging and the subscription proposal tool

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **build spec, not built.** Written 2026-09-25 from the Will × Andrew ×
Tommy call, Tommy's notebook pages, the Omega Energy OS Subscription Agreement
(.pages template) and a read of this repo. Hand this file to the builder
session as the brief. Every number marked **(decide)** is a proposal waiting on
Tommy, not a settled price.

---

## 0. What we are building, in one paragraph

A customer should understand in minutes which parts of OMEGA they need, buy
those, and be switched up to more as their work grows. So: (1) ONE catalog of
about ten sellable **modules** with ONE price each for everybody, (2) a
**Package** panel in the master console where staff build a tenant's menu at
onboarding and switch modules on and off later, and (3) a **Subscription
Proposal** tool, built like the BESS Pro Forma, that produces a branded,
customer-specific proposal and order form for their organization. The floor is
**$500 a month**. Nobody is sold anything cheaper.

---

## 1. Sources and what each one decided

| Source | What it settles |
|---|---|
| Call, Andrew | A value ladder: meet customers where they are, ~10 clear blocks instead of a $1,250–$2,500 lump, each block ~$250, customers self-select and opt in fast, "flip them up" as they use more. Show value in cash-flow terms. |
| Call, Will | Value-based pricing from target audience, average deal size and what they save or earn. One **unit price per module** for every customer (no "price treatment" arguments between customers). Over/under consumption → restructure the contract at renewal; the unit price never changes. Start high and give a **transformation credit**; it is easier to discount than to raise. |
| Call, Tommy | Not per seat: one person designs, twenty look. Charge for what the org consumes. Tier 1 / Tier 2 / Custom stays; custom is "you do these three things, it's $750". |
| Notebook p.1 | Value ladder → meet customers where they are → lead them on the journey. Granular approach. Revenue budget. Buying journey. Modules: opt in, cash flow, start point, à la carte, self-select opt-in. $1,250–$2,500 is the ladder's top of the standard range. |
| Notebook p.3–5 | Value-based pricing on consumption; target audience, average deal size, what they save (revenue and cost); reverse-engineer to bundle price; 100 users × $1k/user/yr illustration; over/under consumption → restructure contract; price treatment → break down unit price to consumption; easier to discount than raise; automate and digitize the process, give them a credit; circle of life; customer focused. |
| Notebook p.2 | The 15 target accounts (§9). |
| Subscription Agreement | Tier 1 Field $1,299/mo, Tier 2 Pro $2,499/mo, Tier 3 Enterprise $150k–$350k/yr, Tier 4 Platform custom. Annual Service Fee $3,400/yr (T1/T2; year one = onboarding), $10,000/yr (T3). T3 setup $25,000 one-time. Annual prepay = 12th month free. Inaugural price locked 12 months. Custom dev $250/hr; T3 includes 7 hrs/mo. Named Authorized Users (§2.3). Tier Scope (§2.5). Telemetry audit (§2.6). |
| Tommy, 2026-09-25 | **Never under $500/mo**, even for a very lite version. Must be able to sell: the Site Map editor and its exports and reports; the financing marketplace; packages by customer type; Omega Logic (the ERP); BOM functions and exports; the Project Closeout tool; the EV Cost Workbook for customers applying for rebates. |

---

## 2. Pricing rules (the builder enforces these in code, not in copy)

1. **Floor: $500/month** list, before any credit is applied. Credits can bring
   the first 90 days under list, but never below $500. **(decide)** whether
   the credit may take the price under $500 at all; this spec assumes it
   may NOT.
2. **One list price per module**, stored in a versioned price book. A tenant's
   package records the price-book version it was sold on. Changing the price
   book never reprices a signed package (same rule `customerEditorLite` already
   follows with Stripe).
3. **Charged per workspace, not per seat.** The workspace includes a number of
   builder logins **(decide: 3)** and unlimited viewers. Extra builders are a
   line item **(decide: $50/mo each)**. This needs Agreement §2.3 changed (§7).
4. **Deliverable modules carry included usage and an overage price**
   (permitting matrices, site studies, EV applications). Usage is counted
   server-side (§5.4), never from browser telemetry.
5. **Transformation credit** at signing **(decide: 40% off list for the first
   90 days)**, shown as a line on the proposal, never as a lower list price.
6. **Quarterly right-size.** At each 90-day review, under-used modules can come
   off and over-used modules move the tenant to the plan that fits. The unit
   prices do not change inside the Initial Term (Agreement "Inaugural
   Pricing" still holds).
7. **Plans are pre-picked module sets**, priced below the sum of their parts,
   so the plans and the à la carte menu always agree.

---

## 3. The catalog

### 3.1 The ladder

| Rung | Name | Price | Who stands here |
|---|---|---|---|
| 0 | **Taste** (free, not a subscription) | $0 | Anyone who sizes a battery on a tenant's storefront, uses Grid Atlas or the compute calculators, files an opportunity, or views a project shared with them. Lead capture, not a customer. |
| 1 | **Lite** | **$500/mo** (the floor) | Somebody designing their first sites. |
| 2 | **Lite + modules** | +$250 / +$500 each | Most installers and developers. |
| 3 | **Deliverables** | +$750 each + usage | Teams doing volume permitting or site sourcing. |
| 4 | **Omega Logic** | from $2,500/mo on top | OEMs, distributors, builders running orders, plant and shipping. |
| 5 | **Enterprise / Platform** | $150k–$350k/yr, or custom | Multi-team accounts; every module on one usage contract. |

### 3.2 Lite: $500/month, the floor

What every paying workspace gets. Lite alone is a real product: design a site,
show it, propose it, send it to financing.

| Included | Tool keys (`omega-tools.js`) / caps (`omega-caps.js`) |
|---|---|
| Site Map editor on live satellite, sandboxes | `editor`, `sandbox`; caps `design`, `view`, `export.blueprint` |
| Blueprint export (the drawing you show, not a permit set) | cap `export.blueprint` |
| Sales Proposal Builder | `sales` |
| Grid Atlas, ComEd Capacity Finder, compute calculators | `gridatlas`, `comedcap`, `datacenter`, `computepower` (already tier ALL) |
| Project Intake | `intake` |
| **Financing marketplace: file an opportunity, see financing partners** | `opportunity`, `financing` |
| Account settings, OMEGA Signal connections | `signal` |
| 3 builder logins, unlimited viewers **(decide)** | |

### 3.3 Modules

Prices are list, per month. "Replaces" is the tool or service the customer pays
for today. The ranges are typical market figures to confirm before they are
quoted, and the proposal tool lets the rep overwrite them with the customer's
own numbers (§6).

| Key | Module | Class / list | What is inside (tool keys, caps, add-ons) | Meter | Replaces |
|---|---|---|---|---|---|
| `plansets` | **Plan Sets, Exports & Reports** | Standard · $250 | Plot plan, one-line, schematics and risers, georeferenced and plan-set exports, branded reports. Caps `export`, `schematic`, `riser`; add-ons `exports`, `schematics`; `branded-report.html` | plan sets exported | CAD seat + outsourced drafting, $250–$600/mo |
| `evrebates` | **EV Rebates & Closeout** | Standard · $250 + usage | **EV Cost Workbook** (estimate → customer proposal + utility make-ready forms: Eversource CT/MA, National Grid, UI; unit-rate bands and eligibility checks) and the **Project Closeout tool** (`ev-closeout.html`: Level 2 completion packages for Eversource MA/CT and National Grid MA/NY/RI: checklist, EVSE serials, final cost vs incentive, one ZIP). On its branch the closeout is `tier:ALL`; packaging moves it into this module. Tools `evcostwb`, `evcloseout` | applications + closeouts produced **(decide: 20/mo included, $50 each over)** | ~$1,000 per application prepared outside |
| `storage` | **Storage Sizing & Pro Forma** | Standard · $250 | Battery Sizer (bills, bill PDFs, 8760), BESS Pro Forma and investor deck, Value Stack, BESS ISO Calculator. `batterysizer`, `proforma`, `valuestack`, `isocalc` | models run | Storage modelling seat, $300–$1,000/mo |
| `bom` | **BOM & Procurement** | Standard · $250 | The editor's bill of materials, BOM CSV/XLSX export (`bomToCSV` in `editor.html`), Request for Quote to vendors (`api/rfq.js`, `rfqs/` + `recipients/`), Procurement Marketplace when it ships (`procurement`, `soon:true` today) | BOMs exported, RFQs sent | Estimating/takeoff seat + manual RFQ time, $250–$800/mo |
| `engineering` | **Engineering** | Premium · $500 | Conductor & transformer sizing, multi-node power flow, interconnection screener, Site Optimizer, cost estimator; cap `engineering`; add-on `engineering`. `conductorsizing`, `powerflow`, `interconnect`, `siteoptimizer`, `costestimator` | studies run | Power-systems analysis licence or engineer hours, $500–$1,500/mo |
| `finance` | **Investor & Finance** | Premium · $500 | Site Investment Analysis, DCFC pro forma, 3D fleet modeler, residential portfolio analyzer, degradation & warranty; **financing marketplace pro side** (pipeline, capital-partner matching, portfolio screening) **(decide exactly what the paid side is vs the free filing)**. `investment`, `dcfc`, `fleet`, `apartment`, `degradation` | investor packages | Analyst model build + modelling tools, $500–$2,000/mo |
| `compute` | **Compute & Data Center** | Premium · $500 | Compute campus builder + the parcel screening that feeds it (add-on `compute` already grants `compute` + `parcelscreen`), Compute Land Lease. `computelease` | campuses screened | Site-selection consultant time, $500–$1,500/mo |
| `ops` | **Operations** | Premium · $500 | O&M console, SLA & contract intelligence, field service & dispatch, owner reporting, Fleet Command, Site Lifecycle console. `omconsole`, `slaintel`, `fieldservice`, `ownerreport`, `fleetcommand`, `sitelifecycle` | sites operated | Asset-management / monitoring platform, $500–$2,000/mo |
| `whitelabel` | **White Label Storefront** | Premium · $500 | Tenant's name on the platform (`whiteLabel`), embed sizing on their own website (`/embed/`, publishable key), leads and orders into their queue. Add-on `whitelabel` | leads captured | Custom web sizing tool + lead capture, $500–$2,000/mo |
| `permitting` | **Permitting Matrix** | Deliverable · $750 + usage | Permit Creator (`permit`), AHJ programme, the 20-page permitting matrix with Gantt (the jurisdiction engine in `editor.html`, §"close-out and end of life" et al.). Add-on `permitting` | matrices **(decide: 1/mo included, $2,500 each over)** | $30,000 consultant report |
| `sitefinder` | **Site Finder & Parcel Screening** | Deliverable · $750 + usage | Site Finder (ranked by deliverable kW, hold a circuit), Site Discovery & Screening, parcel screening. `sitefinder`, `sitediscovery`; add-on `parcelscreen` | site studies **(decide: 25/mo included, $15 each over)** | Parcel + hosting-capacity data subscription, $1,000–$8,000/mo. ClearSky pays ~$100k/yr for the data; ~12 subscribers covers it. |
| `logic` | **Omega Logic (ERP)** | Platform · from $2,500 | The office, plant and customer apps; bulk POs (`api/po-intake.js`); materials plan and BOM explosion (`api/logic-materials.js`, `api/_lib/materials.js`); purchase orders; freight plan; custody, sites and warranty; CRM; QuickBooks or tenant invoicing. Add-on `omega-logic` (`api/_lib/logic-access.js`) | orders and units run **(decide tiering)** | ERP/MRP + CRM subscriptions, $1,500–$5,000/mo |

Not sold as modules: `osaportal` (JV, governed by the JV agreement),
`spatco_ev` (one tenant's own tool), `intake_admin` (ClearSky's own queue),
the `soon:true` placeholders (`ahj`, `aggregators`, `offtakers`) until they
ship. `interconnectstudy` stays Enterprise-only.

### 3.4 Plans, rebuilt from modules

| Plan | Price | Contents | Sum at list |
|---|---|---|---|
| **Lite** | $500/mo | Lite only | $500 |
| **Tier 1 · Field** | $1,299/mo | Lite + 3 Standard + 1 Premium | $1,750 |
| **Tier 2 · Pro** | $2,499/mo | Lite + 3 Standard + 3 Premium + 1 Deliverable | $3,500 |
| **Tier 3 · Enterprise** | $150k–$350k/yr | Every module, pooled usage, quarterly right-size, 7 dev hrs/mo (per Agreement §4.6) | n/a |
| **Tier 4 · Platform** | Custom | Omega Logic + whatever above, scoped per contract | n/a |

À la carte between plans: Lite + any modules, each at list. The proposal tool
always shows the à la carte sum next to the plan that fits, so the customer
sees why the plan is the better deal.

### 3.5 Starter packs by customer type

The Package panel and the proposal tool preselect these from the tenant's
`vertical` (and the extra types below, which need a `customerType` field or a
widening of `vertical`, **(decide)**).

| Customer type | Examples | Preselected | Usually next |
|---|---|---|---|
| Installer (EV) | Concord, OGI | Lite + EV Rebates & Closeout + Plan Sets | Permitting Matrix, BOM |
| Installer (solar/BESS) | SunESol | Lite + Storage + Plan Sets | BOM, Permitting |
| Developer | NextNRG, Budderfly, Solela | Lite + Storage + Investor & Finance | Site Finder, Operations |
| EPC / engineering | CIR | Lite + Plan Sets + Engineering + Permitting | BOM, White Label on deliverables |
| OEM | Clean Cell, FENECON | Lite + White Label + Storage + BOM | Omega Logic |
| Distributor | Walters | Lite + White Label + BOM | Omega Logic (orders, freight) |
| Compute / advisor | East West Energy | Lite + Compute + Investor & Finance | Site Finder, Engineering |
| Capital partner | Helios | Lite + Investor & Finance | Site Finder |

---

## 4. What already exists (do not rebuild)

- `api/tenant-billing.js`: staff-only, allow-listed writer of
  `omega_orgs/{org}/billing/current` with a history subcollection. Fields
  today: `tier`, `addons`, `toolOverrides`, `toolAccess`, `status`,
  `trialEndsAt`, `subscriptionDue`, `amountDue`, `paymentLink`, `autopay`,
  `paymentProvider`, `stripeCustomerId`, `customerEditorLite`.
- `omega-caps.js`: tier → editor capability ladder (`trial`, `standard`,
  `deluxe`, `enterprise`) and `ADDON_GRANTS` (`compute`, `parcelscreen`,
  `engineering`, `schematics`, `exports`, `permitting`).
- `omega-tools.js`: the tool catalog with `tier` (ALL/STANDARD/DELUXE/
  ENTERPRISE). `toolAccess` is an allowlist that wins over tier, add-ons and
  overrides ("absent ≠ empty"; `scripts/tests/ttoolaccess.js`).
- `admin/admin-console.js`: tenant drawer with add-on checkboxes
  (`ADDON_UI`, `_addonToggles`), Omega Logic bundle (`/api/logic-onboard`
  `action:'bundle'`), tier dropdown with the Tier 1–4 prices.
- `api/logic-admin.js` + `logic-admin.html`: ClearSky commissioning of Logic
  subscribers; every write lands in `admin_audit`.
- `api/_lib/logic-access.js`: Omega Logic gate (`addons` contains
  `omega-logic`).
- `proforma.html` + `proforma-logic.js` + `api/proforma` +
  `api/_lib/proforma-engine.js`: THE pattern for the proposal tool (inputs in
  the page, every dollar from the endpoint, deck drawn from the same answer,
  saved under `toolData/{orgId}/tools/proforma`).
- Event Layer (`omega-events.js` → `api/events.js`): product telemetry. **Not
  a billing meter** (§5.4).
- `ev-closeout.html` (Project Closeout) and the Eversource MA estimate
  template live on the unmerged branch `claude/level-2-closeout-tool-aqkh73`.
  **Merge it first**; the `evrebates` module depends on it.

---

## 5. Data model and server pieces

### 5.1 `api/_lib/modules.js`: the ONE module catalog (code)

Pure, ES5, no Firebase. The single place that says what a module *is*:

```js
{ key:'evrebates', name:'EV Rebates & Closeout', cls:'standard',
  tools:['evcostwb','evcloseout'], caps:[], addons:[],
  meter:{ key:'ev.application', label:'applications and closeouts' },
  verticals:['installer'], blurb:'…', replaces:'…' }
```

- `resolve(moduleKeys)` → `{ tier, addons[], toolAccess[] }`, the fields the
  existing gates already read. Lite's tools are always in `toolAccess`.
  Writing `toolAccess` means a new tool joins nobody's package by accident,
  which is the property `ttoolaccess.js` already guards.
- Prices are NOT here. What a module contains changes with code; what it
  costs changes with a sales decision.
- A test asserts every `tools[]` key exists in the REAL `OMEGATools.catalog()`
  and every tool in the catalog is either in a module, in Lite, or on an
  explicit "not sold" list (§3.3), so tool 43 cannot go unpriced.

### 5.2 `pricebook/{version}` (Firestore, staff-written, world-unreadable)

```
pricebook/2026-10
  floorCents: 50000
  lite: { priceCents: 50000, builders: 3, extraBuilderCents: 5000 }
  modules: { plansets:{priceCents:25000}, evrebates:{priceCents:25000,
             included:20, overageCents:5000}, … }
  plans: { field:{priceCents:129900, rule:'3S+1P'}, pro:{…} }
  credit: { pct: 40, days: 90 }
  serviceFee: { lite: ?, field: 340000, pro: 340000, enterprise: 1000000 }
  createdAt, createdBy, frozen: true
```

Append-only: a new version is a new doc; `frozen` versions are never edited
(rules: create by staff, update/delete denied). This is what keeps "one price
for everybody" defensible in a dispute.

### 5.3 `billing/current` gains four allow-listed fields

Add to `ALLOWED` in `api/tenant-billing.js` (and nowhere else):
`modules[]`, `pricebookVersion`, `credit {pct, endsAt}`, `builders`. A new
staff endpoint `POST /api/tenant-package` (or an `action` on
`tenant-billing`) takes `{ orgId, modules[], pricebookVersion, credit?,
builders? }`, validates against the price book, **refuses anything under the
floor**, runs `modules.resolve()` and writes `modules` + the derived `tier`,
`addons`, `toolAccess` in ONE transaction with a history row and an
`admin_audit` row. Staff never hand-edit `toolAccess` for a packaged tenant
again. The derived fields keep every existing gate working unchanged.

### 5.4 Usage counters (the meter)

**Do not bill from the Event Layer.** It is gated on terms acceptance and
`event_exclusions`. FENECON and the OSA JV are excluded by design, so billing
from it would give signed-agreement tenants free usage and a gap we could
never explain. Count on the server, where the deliverable is produced:

- `omega_orgs/{org}/usage/{YYYY-MM}`: `{ 'ev.application': n,
  'permit.matrix': n, 'site.study': n, … }`, incremented in a transaction by
  the endpoint that produces the deliverable (the way `api/embed-layout.js`
  already caps site studies per org per day). Admin-SDK only in rules.
- Where a deliverable is produced purely in the browser today (e.g. the EV
  workbook's export, the permitting matrix inside `editor.html`), the builder
  must add a small `POST /api/usage` "I produced one" call that is idempotent
  by a client-generated id. It is an honest counter for billing, **not a
  security boundary**. Say so in the file header.
- The console and the proposal both show usage against included credits.

### 5.5 `subscription_proposals/{id}` (Admin-SDK only)

```
orgId (may be a prospect domain with no omega_orgs yet), prospect{name,
logo, vertical, contactName, contactEmail}, discovery{…answers},
modules[], plan, pricebookVersion, lines[] (computed by the server),
replaces[] (rep-editable: tool, their current $/mo), term, paymentElection
('monthly'|'annual'), credit, serviceFee, totals{list, credit, firstYear},
status: 'draft'|'sent'|'accepted'|'declined'|'expired', sentAt, acceptedAt,
acceptedBy, pdfPath, createdBy, audit[]
```

Accepting a proposal calls the SAME code path as §5.3, so a signed proposal
and a console change produce identical billing records.

---

## 6. The Subscription Proposal tool (`subscription-proposal.html`)

Built on the BESS Pro Forma pattern: one page + `subscription-proposal-logic.js`
(draws the deck) + `POST /api/subscription-proposal` backed by
`api/_lib/subscription-pricing.js`. **All pricing math is server-side** (per
CLAUDE.md IP rule: pricing logic never ships to a browser). The page collects,
posts, renders. Staff-only to start (ClearSky reps), then optionally a tenant's
own reps for reseller cases (White Label).

Steps:

1. **Company**: domain → pulls `omega_orgs/{org}` name, logo, colours,
   vertical if the tenant exists; else a prospect record.
2. **How they work today** (discovery; this is the "game"): projects per
   month, EV applications per month, permits per year, sites screened per
   month, people who design vs people who view, tools they pay for now and
   what each costs. Ten questions, not sixty.
3. **Recommended package**: the server maps answers → modules (starter pack
   by type, plus modules triggered by volumes, e.g. >5 EV applications/mo ⇒
   `evrebates`). The rep can tick and untick. Live: list, closest plan, à la
   carte sum, floor warning.
4. **Value**: their current spend per replaced tool (rep-entered, defaults
   from the catalog ranges), deliverable math ("45 applications × ~$1,000 =
   $45,000 vs $1,299"; "one permitting matrix = $30,000 vs $9,000/yr"),
   payback. Cash-flow framing: this month, this quarter, this year.
5. **Terms**: monthly vs annual prepay (12th month free, Agreement §4.3),
   Annual Service Fee, transformation credit, Initial Term 12 months,
   Inaugural Pricing lock, quarterly right-size, the ladder of what switches
   on next and the trigger for each.
6. **Deck**: a 6–8 page PDF: cover in the customer's name; what you do
   today; your package; what it replaces; the numbers; your next rungs;
   order form (the Agreement's Order Form, filled in); signature block.
   ClearSky brand by default; the reseller's brand when a White Label tenant
   sends it (`OmegaWhiteLabel`).
7. **Send and accept**: save as `sent`; a link for the customer to review and
   accept (signed-in, verified email at their domain). Acceptance →
   `tenant-package` path (§5.3) → workspace switched on. Declines and expiry
   recorded.

Saved per the standard contract: `toolData/{orgId}/tools/subproposal` for the
rep's drafts, `subscription_proposals/` for the record.

---

## 7. Changes the Subscription Agreement needs (for counsel)

The template assumes four fixed tiers and named seats. The ladder needs:

- **Order Form**: a Lite line ($500/mo), a **Module Schedule** (ticked modules
  with unit prices from price-book version X, included usage, overage),
  builders included, credit line. Tier checkboxes stay for Field/Pro/
  Enterprise/Platform.
- **§2.3 Authorized Users**: today named users only, no sharing. Add a
  **Viewer** class (read-only, unlimited, not counted) and a builder count.
  Credential-sharing prohibition stays.
- **§2.5 Tier Scope** → "Tier and Module Scope": access follows the Tier AND
  the Module Schedule; adding a module is an Order Form amendment or an
  accepted proposal.
- **New: Usage fees and quarterly right-sizing**: included usage, overage
  billed monthly in arrears, the 90-day review, module removal at review, unit
  prices fixed for the Initial Term.
- **New: Transformation credit**: amount, period, forfeited on early
  termination **(decide)**.
- **§2.4 service-bureau restriction** conflicts with White Label resale (Clean
  Cell sells Site Map + Grid Atlas under its own name). A **Reseller / White
  Label addendum** is needed before that module is sold.
- **§4.4 Annual Service Fee** for Lite: $3,400 would be more than half a
  year of Lite. **(decide: lower for Lite, e.g. $1,500, or waive)**.
- FENECON and OSA are under signed agreements; the menu reaches them only as
  an amendment.

---

## 8. Admin console: the Package panel (tenant onboarding)

In the master console tenant drawer (`admin/admin-console.js`), replace the
free-standing add-on checkboxes with a **Package** panel:

- Customer type → starter pack preselected (§3.5).
- The ten modules as tick boxes grouped Standard / Premium / Deliverable /
  Platform, each with its price, what's inside, and usage-to-date vs included.
- Live summary: list, plan that fits, à la carte sum, credit, first-90-days
  price, **floor enforced** (Save disabled with the reason under $500).
- Buttons: **Save as proposal** (opens §6 prefilled) · **Apply to tenant**
  (§5.3 endpoint) · **History** (billing history + admin_audit rows).
- The raw add-on text field stays for `osa-jv` and `grid-atlas`, as today.

The same panel, read-only, belongs on the tenant's own Account Settings as
"Your plan", with a **Request this module** button that files a request into
the console (no self-serve charge yet).

---

## 9. The 15 target accounts: starting package

Lite = $500. Status is from each `tenants/<slug>/tenant.json` seed and may be
stale; check the live console before any call.

| Account | Type | Status | Start with | List/mo | Switch on next | Move-up trigger |
|---|---|---|---|---|---|---|
| Clean Cell | OEM | Trial ends **2026-09-30**; white label + Logic live on trial | Lite + White Label + Storage + BOM + Omega Logic | $4,000 | Permitting, Engineering | Storefront orders and bulk POs running through Logic |
| Concord Energy | Installer (EV L2) | Paying, Field $1,299 | Field: Lite + EV Rebates & Closeout + Plan Sets + BOM + Engineering | $1,299 plan | EV application overage above 20/mo, then Permitting | 45 National Grid applications in 72 h |
| NextNRG | Developer | Enterprise, Compute add-on | Enterprise contract: Storage + Investor & Finance + Compute + Plan Sets | contract | Operations, Site Finder | Quarterly right-size; viewers free so the team presents James's IRR |
| Budderfly | Developer (EE-as-a-service) | Trial ends 2026-10-16 | Lite + Storage + Investor & Finance | $1,250 | Operations, Site Finder | Installed sites needing owner reporting |
| East West Energy | Advisor / integrator (DC + BESS) | Trial ends 2026-10-16 | Lite + Compute + Investor & Finance | $1,500 | Site Finder, Engineering | >5 campuses screened a month |
| CIR (Cleantech Industry Resources) | EPC / engineering | Trial | Lite + Plan Sets + Engineering + Permitting | $2,000 | BOM, White Label on deliverables | >1 permitting matrix a month |
| FENECON | OEM, receives full BOM | Signed MSA; Event Layer excluded | Lite + White Label + Storage + BOM (by MSA amendment) | $1,500 | Omega Logic | RFQ volume from the BOM tool |
| Walters Wholesale Electric | Distributor, receives full BOM | Trial | Lite + White Label + BOM | $1,250 | Omega Logic (orders, freight) | Contractor orders via their storefront |
| Solela / Chileasing | Developer / leasing | Standard | Lite + Storage + Investor & Finance | $1,250 | Operations (owner reporting) | Leased assets in service |
| Helios Energy Advisors | Capital partner | Partner (confirm it is `heliosnrgy.com`) | Lite + Investor & Finance | $1,000 | Site Finder | Sourcing their own pipeline |
| OGI Solar / OSA | Installer / JV | OGI standard; OSA under JV agreement | OGI: Lite + Plan Sets + Storage + EV Rebates. OSA: JV terms, not the menu | $1,250 | Permitting | OSA verification volume |
| Green Wolf Strategies | Not on platform | Discovery | Run the proposal tool's discovery step | ≥$500 | Set on the call | n/a |
| Lattice Energy | Not on platform | Discovery | Same | ≥$500 | Set on the call | n/a |
| Roam Energy | Not on platform | Discovery | Same | ≥$500 | Set on the call | n/a |
| R.E.S. (marked "??" on the list; confirm the company) | Not on platform | Discovery | Same | ≥$500 | Set on the call | n/a |

Not on the list but raised on the call: **Brett** (batteries + compute, five
sites): Lite + Compute ($1,000) or Lite + Storage ($750); the case the floor is for.

---

## 10. Build plan

Phases are independently shippable. Every phase keeps the repo's constraints:
ES5 in tool pages and `omega-*.js`, no build step, single-file HTML tools with
one optional `-logic.js`, the copyright header on every new file, pricing math
only in `/api/`, staff = verified `@clearsky-usa.com` (`caller.staff`),
Admin-SDK-only paths for billing/usage/proposals, tests on
`scripts/_lib/firestore-double.js`, `npm test` and `npm run check:pages` green.

**Phase 0: prerequisites**
- Merge `claude/level-2-closeout-tool-aqkh73` (`ev-closeout.html`, the
  Eversource MA template, the `evcloseout` tool entry).
- Tommy settles every **(decide)** in this file.

**Phase 1: catalog + price book + packaging endpoint**
- `api/_lib/modules.js` + `scripts/tests/tmodules.js` (every tool accounted
  for; `resolve()` output; Lite always present; unknown module refused).
- `pricebook/{version}` rules (staff create, no update/delete, no browser
  read for non-staff) + `scripts/seed-pricebook.js`.
- `tenant-billing` ALLOWED += `modules`, `pricebookVersion`, `credit`,
  `builders`; `POST /api/tenant-package` with floor enforcement; tests for
  floor, derived fields, audit row, and "a frozen price book is never edited".

**Phase 2: Package panel in the master console**
- §8, calling Phase 1. `check:pages` render against the logic fixtures.
- Backfill: a dry-run script that proposes a `modules[]` for every live
  tenant from its current `tier`/`addons` and prints the diff; `--apply` only
  after review (flag, don't drop).

**Phase 3: Subscription Proposal tool**
- `subscription-proposal.html`, `subscription-proposal-logic.js`,
  `api/subscription-proposal.js` (`context | recommend | price | save |
  send | accept`), `api/_lib/subscription-pricing.js` (pure; tested).
- Register in `omega-tools.js` as a staff-only tool (not in any module).
- The deck and the Order Form render from the same server answer.

**Phase 4: usage meter**
- `omega_orgs/{org}/usage/{YYYY-MM}` counters in the endpoints that produce
  EV applications, closeouts, permitting matrices, site studies; `POST
  /api/usage` for the browser-only producers; usage-vs-included in the panel
  and on invoices.

**Phase 5: customer side**
- "Your plan" on Account Settings; **Request this module** → console inbox;
  90-day right-size report per tenant (used vs included, recommended change).

**Docs to update when each phase lands:** this file, `CLAUDE.md` (Tool gating
section: "effective tools" now derives from `modules[]` for a packaged
tenant), `docs/WHITE-LABEL.md` (reseller addendum), `MERGE.md` for any logic
moved server-side.

---

## 11. Decisions for Tommy (collected)

1. Module list prices: Standard $250, Premium $500, Deliverable $750, Logic
   from $2,500. Lite $500.
2. Builders included in Lite (3?) and the extra-builder price ($50?).
3. Transformation credit: 40% for 90 days? May it take a month under $500
   (this spec says no)? Forfeited on early termination?
4. Usage: EV applications (20 included, $50 over?), permitting matrices (1
   included, $2,500 over?), site studies (25 included, $15 over?).
5. What exactly is free vs paid in the financing marketplace.
6. Annual Service Fee for Lite ($3,400 as in the Agreement, lower, or waived).
7. Whether to add `customerType` (distributor, capital partner, compute)
   beside `vertical`, or widen `vertical`.
8. Omega Logic tiering (by orders/month, units/month, or plant stations).
9. Who may send proposals: ClearSky staff only, or White Label tenants to
   their own customers too.
