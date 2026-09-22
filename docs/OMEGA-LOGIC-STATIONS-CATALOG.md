# Omega Logic — maps, catalog and production workspaces

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Entry points

All links carry `?org=<supplier-org>`; access is checked server-side, not granted
by the URL. Office navigation links the catalog, URL Generator and plant manager.

- `/logic-catalog`: tenant products/services, archived rather than deleted.
- `/logic-urls`: customer walkthrough, customer login, licensed design studio,
  and the existing public battery-sizer key/embed. No station tokens or office
  credentials are included. Allow the actual website origin in Website installation.
- `/plant/work-orders`: the work-order board — a filterable grid (line, stage,
  priority, target date, progress, ready units, holds, next operation, assignee)
  with a location/stage tree, column filters, CSV/print, and a per-order detail
  card: step progress, operations checklist, activity feed derived from the
  units' scan/test/hold evidence, audited manager edits (line, priority, target
  date, assignee, notes), parts required vs registered, services and units.
  Progress is computed in `api/_lib/plant-board.js`, never in the browser.
- `/plant/manager`: line overview, paginated work orders, stations and units;
  links to immutable serial/test history and existing quality disposition.
- `/plant/manager#flow`: ClearSky-owner production routing/version editor.
- `/plant/station?stationId=<id>`: screen hint only; pairing still requires a
  station credential. A tablet with pending scans cannot be repurposed silently.

## Editor Lite

Site address loads the canonical editor's Google satellite map. Guided placement
is unavailable until the map reports success. Site and Grid Atlas are the only
view navigation; document/BOM/proposal actions are grouped under Exports. Grid
Atlas reuses the existing server engine after checking Editor Lite entitlement;
nearby infrastructure is not a utility capacity commitment.

BESS selections and unit counts are checked against this supplier's published
design catalog on the server. No platform-wide equipment picker is exposed.
When there is no dimensioned, enabled BESS product, the existing generic
`GENERIC-BESS` concept is offered, clearly marked make/model TBD. It is not a
published product, carries no selling price and cannot be ordered as that SKU.
Setting `storefront/config.genericDesign: false` disables that fallback.
Layouts are concept assemblies, not construction-ready clearance studies.

## Catalog storage and approval

Uses existing `omega_orgs/{org}/storefront/config.products`, preserving unrelated
storefront settings and legacy engineering fields. Public and office projections
are explicit allowlists. Every edit compares `catalogRevision` and records a
before/after audit event. OEM admins can maintain quote-only products/services;
ClearSky alone can publish or edit list-priced entries. Services are excluded
from battery sizing, scaled battery layouts and the BESS picker. Archived products
are excluded from new storefront selections; existing accepted snapshots remain.

Service order lines are distinct from hardware requirements. A manager records
service-completion evidence before final billing. Service-only orders complete
after that evidence and verified final payment; no fake serial or shipment is made.
Mixed orders still need every physical component passed and ready.

## Components and bills of materials

A catalog row may be a third kind, `component`: what a product is **made of**
— a cell, a module, a BMS, an enclosure. It lives in the same list as the
products because bills of materials reference it by SKU and two lists drift
apart the first time somebody renames one. It is never sold: `api/embed-config.js`
drops the kind before projecting, `omega-bess-products.js` refuses to turn a
module's kWh into a battery the designer can place, `designs()` never offers it
to the BESS picker, and `api/orders.js` refuses it on an order line. A
component carries `unit`, `supplier`, `supplierSku`, `moq` and `leadTimeDays`
— and never a buy price. That number is exactly what turns up on a supplier's
sheet, and `scripts/import-products.js` refuses the column in both files.

Any product or component may carry `bom: [{ sku, qty, unit }]`, the quantity
of each component in **one** of it. Multi-level is the normal case (cabinet →
module → cell). `api/_lib/materials.js` `validateCatalog()` runs on every
catalog save and every import, against the whole list as a graph: every
referenced SKU must exist, none may be a service, nothing may contain itself,
no loop, no more than eight levels. A loop hangs a plan; a missing SKU
under-buys silently; both are refused with the path in the message.

**The materials plan** (`/logic-materials.html`, `GET /api/logic-materials`)
is an MRP explosion netted level by level. Demand is classified by how firm it
is: works orders still to be built are *committed* (requirements minus
`registeredCounts`), priced orders awaiting a deposit are *pipeline*, unpriced
requests are *forecast*; an order that already has a works order is counted
once, through the works order. Each SKU is processed only after every assembly
that uses it (low-level code), netted against on-hand and on-order — stock goes
to committed first, then pipeline, then forecast — and only the remainder is
exploded into its children, so forty modules on the shelf mean forty modules'
worth of cells that are not bought. The page lists what to buy (suggested
order rounded up to the MOQ, need-by from the earliest works order, order-by =
need-by minus lead time, late when that is already past), what to build, and a
purchase-list CSV. Forecast demand is shown and never suggests a purchase.
A component that has its own bill is a **sub-assembly** — the plant makes
it. It is listed under what to build, never on the purchase list, is never
"late", and does not block a works order; the parts it cannot be built
without do.

Stock counts are recorded from the same page (`POST action:'stock'`) into
`omega_orgs/{org}/fulfillment/materials`, which the rules already close to
browsers; each count is dated, attributed, revision-checked and audited.

**Purchase orders** (`POST action:'po' | 'receive' | 'cancel-po'`) close the
loop: a record of what was sent to a supplier in
`omega_orgs/{org}/purchase_orders/{id}` (no rule grants it — Admin SDK only,
named in `firestore.rules` so that is a statement rather than a default),
written in the same transaction that adds its quantities to `onOrder`.
Receiving moves the received quantity from `onOrder` to `onHand` and marks
the order `partial` or `received`; cancelling releases what never arrived.
A manual count still overrides either number — a count is a fact about the
shelf, a PO a fact about a promise. The page raises a PO pre-filled from the
purchase list. What is still not here is any message to the supplier: the
record is of what a person sent, and sending is theirs.

**Safety stock.** A component may carry `safetyStock`, the quantity to keep
on the shelf at all times. The plan nets it as a fourth bucket, `buffer`,
after committed and pipeline demand and before forecast — the shelf serves
real orders first, and what is left below the buffer is a firm purchase with
the driver `safety`. A shelf below its buffer with no demand at all still
shows, marked "below safety stock", with order-by = today; it is never
"late" and never a works order's shortfall. A buffer on a sub-assembly
explodes into its parts like any firm demand. This is what a reorder point
does in Katana or MRPeasy and how NetSuite treats safety stock (as demand);
`docs/MATERIALS-COMPETITORS.md` has the comparison.

**Twelve weeks ahead.** `projection()` runs the plan once per week with only
the demand due by the end of that week and only the supply that will have
arrived by then — an open purchase order counts from its expected date,
undated on-order counts now — so the week view reuses the exact netting and
cannot disagree with the purchase list. Cumulative: a shortfall appears in
the week it first bites and stays. The endpoint returns it with the plan.

**Suppliers and prices** (`POST action:'supplier' | 'price' | 'price-remove'`)
live in `omega_orgs/{org}/fulfillment/suppliers`: supplier records (contact,
terms, default lead time) and, per component, up to six prices — one per
supplier, each with unit cost, MOQ, lead time and part number, one marked
preferred. The plan buys at the preferred price (else the cheapest), lets it
override the component's own MOQ and lead time, names the supplier on the
row, prices the suggested order (`spend`, totalled in `summary.spend`, with
`summary.unpriced` counting lines that have no price on file) and groups the
purchase list by supplier. A buy price is exactly the number a supplier's
spreadsheet leaks, so it exists only in that document: never in the catalog,
never accepted by `scripts/import-products.js` (which still refuses a cost
column in either sheet), never in any public projection — a test greps
`api/embed-config.js` for the words. A purchase order may name a supplier
record and takes its name.

**Lots.** A receipt line may carry the supplier's lot number; it is kept on
the receipt and on the shelf (`stock[sku].lots`, last twenty), so a unit's
`trace.lot` at registration can name the lot it was built from.

**Yield.** A bill line may carry `yieldPct` (1–100, blank = 100): the share of
what is issued that ends up in a good assembly. The plan divides net demand by
it — 98% on 104 cells means 106.12 issued per module — and marks every row fed
by such a line `yielded`, so the page says when a quantity is not the
datasheet's. Import: `--bom bom.csv` (`parentSku, componentSku, qty, unit,
yieldPct, station, step`, template in `docs/bom-template.csv`) alongside a products file whose
component rows carry `kind=component`.

**Per works order.** `GET /api/logic-materials?org=&workOrder=<id>` runs the
same engine with demand restricted to that one record and returns `feasible`
plus the components it is short of, on its own — other open work is not
competing for the same stock in that view, and the plant manager's work-order
detail says so. Every plan row also carries `worksOrders[]`: the committed
works orders whose demand reaches it, traced down through the bills.

**Jarvis.** `api/jarvis-operations.js` computes the plan (best-effort: a
catalog whose bills fail validation is skipped, never a crash) and hands it to
`api/_lib/plant-agent.js`, which adds two bounded actions — a component past
its order-by date (`order_material`, priority 1) and a works order that cannot
be built from stock (`material_shortfall`, priority 2). Naming them is the
whole remit; nothing in the queue can place an order.

## Production versioning and evidence

Configuration is `fulfillment/config.production`, not a new collection. Owner
publishes an ordered route, line/location list, step instructions and parameter
instructions. New work orders snapshot this version; previously released work
orders keep their instructions. EOL → QA → Pack → Ready remain mandatory gates.

Parameters here are operator/test instructions, **not programmable measurement
limits**. The paired test rig remains responsible for its test program and
measured pass/fail results. A human arrival scan never substitutes for machine
evidence. Scan events retain station/flow version, line, location and the applicable
instructions; machine events retain their readings and station context.

Managers can edit line assignment, priority, due date, manager notes and station
screen settings with optimistic revision checks and audit records. They cannot
rewrite scan/test evidence, change a station's operation binding, or fabricate a
quality pass. Configure legacy station line assignments before sending new
line-bound work orders: mismatched or unassigned stations are refused.

## Validation and rollout

Offline transactional tests cover catalog boundaries, revision conflicts, flow
pinning, immutable quality gates, wrong-line scans, pagination and secret-free
station projections. Browser checks use explicitly labeled read-only local data;
Google Maps itself loaded a public test address and the canonical BESS guide.
No live invoices, customer accounts, hardware passes, or production scans were
created during these checks. Pair and rehearse one real scanner and EOL rig at
each deployment before operating a physical line. QuickBooks activation, bank
wire execution and paid Editor Lite checkout retain their existing launch gates.
