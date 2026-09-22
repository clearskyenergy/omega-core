# Omega Logic — the manual

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Written for the four people who run a white-label tenant's business (the
Clean Cell account is the first) and for ClearSky staff who set them up.
Kept current with the build: every screen named here exists on the branch
`claude/white-label-cleancell-usa-st5trq`; anything not built is in the last
section, by name.

## 1. The shape of it

One order record runs from the customer's request to the serial number on
their site. Everything else hangs off it.

```
customer's website / PO  →  Orders (price, accept, deposit)  →  Work order
      →  Materials plan (buy)  →  Benches (build, scan, issue parts)
      →  Ready  →  Shipping & receiving  →  Customer portal (history, warranty)
```

Three places to be:

| Where | Who | Address |
|---|---|---|
| **Office** | project manager, procurement, commissioning | `/omega-logic?org=<org>` — every office page shares one left menu |
| **Plant board** | whoever runs the floor | `/plant/manager.html?org=<org>` |
| **Phone app** | the two builders | `/plant/app?org=<org>` — install it from the browser menu |
| **Bench screen** | a tablet bolted to a bench, or a builder's phone | `/plant/station.html` — paired once |
| **Customer portal** | the customer | `/portals/customer/?org=<org>` |

Sign out is top right on every office page. The left menu runs in the order
the business runs: **Run the business** (Dashboard, Orders, Company POs,
Customers) → **Build** (Work orders, Plant board, Stations & tablets, Phone
app) → **Stock & supply** (Inventory, Materials plan, Purchase orders,
Vendors & prices) → **Deliver** (Shipping & receiving, Quality & serial
records) → **Money** (Cash flow) → **Setup** (Products & bills, Settings).
Website, installation and the URL generator are ClearSky's to maintain and
appear only for ClearSky.

## 2. Setting up a tenant (ClearSky)

1. **Products & bills.** Send the customer `docs/product-list-template.csv`
   and `docs/bom-template.csv`. Import with
   `node scripts/import-products.js --org <org> --file products.csv --bom bom.csv`
   (dry run; fix every PROBLEM line; then `--apply`). Each bill line may name
   the **station** that fits it and a **step** name — that is what puts the
   part on the bench screen. Lines without a station are planned and bought
   but never gated at a bench.
2. **Production flow** (Plant board → Production flow, ClearSky publishes):
   the operations in order, work instructions, and **check steps** per
   operation — one per line — that the operator confirms with a tap (a torque
   check, a firmware load). Keep EOL → QA → Pack → Ready in that order.
3. **Stations.** Work orders → *Pair a scanner*: one credential per bench
   tablet, or a **Roaming phone** credential for a builder who moves between
   benches. The token shows once; paste it on the bench screen.
4. **Customer terms.** Default deposit % and due days in the office settings
   panel (ClearSky); per-customer terms under Customers → Manage.
5. **Theme, website, links.** Office → Tenant theme; Website installation;
   URL generator. All ClearSky.
6. **Deploy the rules** (`firebase deploy --only firestore:rules`) when a
   rules change ships. Nothing under `fulfillment/`, `purchase_orders/`,
   `plant_*` is ever written by a browser.

## 3. The office, by job

### Project manager — orders and customers

- **Dashboard.** The five stages with counts (requests & quotes → awaiting
  deposit → in build → ready to ship → shipped), cash flow (invoiced,
  received, outstanding, deposits awaiting, purchase list value, payment
  exceptions) and the floor (open work orders, units on the floor, on hold,
  finished on the shelf). Every tile is a link.
- **Orders.** Select an order to work it: lines, commercial summary,
  invoices, plant release, shipment. **Customer requests** appear on the
  order the moment the customer sends one from their portal (an address
  change, a question, a change, a warranty claim): make the change through
  its own control, then *Answer & close* — the answer appears on the
  customer's portal.
- **Company POs.** A fleet customer's purchase orders. One at a time with
  the PDF, or **Enter many POs at once**: paste one line per product per PO
  (`PO number, SKU, qty, ship-to name, address, city, state, ZIP, requested
  date, notes`); lines with the same PO number are one PO to one place. Each
  becomes an order awaiting pricing, mapped to the catalog, with its
  destination. Nothing is accepted or charged. A PO number that already
  exists is skipped and named.
- **Customers.** Each account: contacts, terms, and the money — orders with
  invoiced, paid, balance and shipped date, totals, open requests. Terms set
  here win for that customer's future orders.
- **Shipping & receiving.** Destinations, shipment legs with carrier and
  tracking, serials on each load, pickup, delivery and receiving condition.
  An order with more than one destination is shipped leg by leg.

### Procurement — stock, materials, vendors

- **Materials plan.** What to buy, what to build, twelve weeks ahead,
  purchase orders, suppliers, stock counts. Demand comes from open orders
  and work orders exploded through the bills; stock goes to the firmest
  demand first; a started unit still needs the parts no bench has issued
  to it; a finished unit needs none. Buy at the preferred supplier price;
  the purchase list is totalled and grouped by supplier; download it as CSV.
- **Vendors & prices.** Supplier records and up to six prices per part
  (unit cost, MOQ, lead time, part number, preferred). Prices live only
  here — never in the product list, a spreadsheet, or anything public.
- **Purchase orders.** Record what was sent to a supplier (adds to on
  order); **receive** with the supplier lot (moves to on hand; the lot
  travels onto every unit the part is issued into). Cancel what is still
  expected.
- **Inventory.** Finished units by product (available / assigned /
  building) and components on the shelf. **Assign** a finished unit to an
  order that is short of it — the whole assembly moves and the plant builds
  one fewer for that order.

### Commissioning — quality and serial records

- **Quality & serial records** (Work orders page): look up any serial for
  its trace, tests, genealogy and scan history; place or release a quality
  hold with a reason. A failed machine test needs a passing retest; a hold
  stops every scan until released.
- **Plant board → The line.** Each station in order with what is on it
  now, how long units sit there (median, average, p90), the oldest unit
  waiting, the bottleneck, finished per week and lead time. The steps each
  station carries come off the bills.

### Cash flow

Invoiced, received and outstanding are what QuickBooks has recorded on the
orders shown; a recorded payment is not bank clearance. Deposits awaiting is
what accepted orders still owe before release. Purchase list value is what
the materials plan says you still have to buy. The table under it lists the
orders with a balance and which invoice they are waiting on.

## 4. The plant, by screen

### The phone app (`/plant/app`)

Open it once from the office link, then **Add to Home Screen**. Four tabs:

- **Work** — open work orders, urgent first, then by due date, each with
  progress. Tap one: status, due date, line, notes, where its units are,
  what it is **short of**, every unit with its station and step progress.
  *Scan at a bench* opens the scanner.
- **Scan** — opens the scanner (paired once as a Roaming phone), or looks
  up a serial.
- **Stock** — finished units by product and the parts short for the open
  work, with purchase list value.
- **Quality** — units on hold; open one to release the hold or place one
  (plant administrators).

### The bench screen (`/plant/station.html`)

Paired once per device. **Scan the unit's label**: it arrives at this bench,
or is refused with the reason (out of sequence, on hold, not finished at the
previous bench, wrong line). If this bench has work for the product, the
**steps** appear: each part with the quantity for this unit and an *Issue*
button; each check with a *Done* button. **Scan the part's label** (SKU or
supplier part number) or tap Issue; type the supplier lot if you have it.
When every step is done the screen names the next bench; until then the
next bench refuses the unit and says what is open. Offline, scans queue and
send when the signal returns; each is idempotent.

A **roaming phone** shows a bench picker top right: choose the bench you are
at, then scan. Every scan records the phone and the bench it named.

### Registering serials

Work orders page → *Register units & component genealogy*: the real serials
off the labels, parent and children in one batch. Serials are never
invented; the label printer's sheet is the source.

## 5. The customer portal

Orders with a six-step milestone track, invoices with a QuickBooks pay link,
documents the tenant marked customer-facing, shipment carrier and tracking,
**warranty** on each line from the ship date for the product's warranty
years, and **Request a change or ask a question** on any order (delivery
address or date, a question, a change, a warranty claim). Requests and the
tenant's answers stay on the order.

## 6. Build notes — what landed in this pass, and what did not

Built on `claude/white-label-cleancell-usa-st5trq` after PR #45 (commits
newest last): supplier records and prices · stations do the work (steps and
parts per bench, issued on scan; check steps; roaming phones) · one office
chrome with sign-out, the dashboard, settings, inventory with assignment,
customer financials · the plant map · customer requests and warranty, bulk
PO entry · the phone app.

Tests: `npm test` (the plant chain now runs `test-plant-work`,
`test-plant-stats`, `test-office-ops`); `npm run check:pages` renders the
office dashboard, settings, inventory, materials, catalog, plant board and
map, the bench (tablet and roaming phone) and the phone app in Chromium.

**Needs a person with credentials**

- Deploy `firestore.rules`; `firestore.indexes.json` is unchanged by this
  pass (the map reads `plant_units` by `orgId, createdAt`, an existing
  index).
- Import Clean Cell's real product and BOM sheets with stations and steps;
  publish the production flow with its check steps; pair the tablets and
  the two phones.
- The phone app's icon comes from `omega_orgs/{org}.appIcon` (paths under
  the tenant's folder). Clean Cell's set is in `tenants/cleancell/icons/`
  and in its `tenant.json`; the live record takes it on the next seed run
  or from the master console. Until then the app shows the OMEGA icon.

**Not built, on purpose or not yet**

- Landed cost, inventory valuation, a second stock location, finite-capacity
  scheduling, an RFQ to a supplier.
- Carrier booking or live tracking (shipping is a manual evidence ledger).
- Cash settlement from a bank (QuickBooks records are the source; wires are
  recorded, not sent).
- Push notifications to the phone; the app polls when opened.
- Icons for tenants other than Clean Cell (each needs a mark of its own).
- Time per step (the map times stations from arrival to arrival; issues are
  logged with a time but not yet summarised per step).
- A warranty record separate from the derivation (product years × ship
  date). If a claim process is needed, it starts from the customer's
  warranty request on the order.
