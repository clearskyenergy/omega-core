# Logistics, custody and coverage — how the spec maps onto Omega Logic

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-09-23 against the *OMEGA Logistics & Asset Custody Tracking*
spec. The spec asked for a way to trace and track each serialized product to
the end site where it is interconnected, and to tie its warranty or SLA to
that site. This is what was built, where it lives, and what is deliberately
not built yet.

---

## The one decision

The spec sketched a fresh `lgx_` collection family (units, shipments,
containers, locations, sites, coverage, events). Omega Logic already keeps
the unit, the shipment and the customer, so **custody was built ON those
records, not beside them**. One serial has one record from the day it is
registered at the plant to the day it is decommissioned; the custody chain
is a block on it and an append-only subcollection under it.

| Spec concept | Where it lives now |
|---|---|
| Unit | `plant_units/{org__serial}` (existed) + `custody{}` block |
| Event log | `plant_units/{…}/custody_events/{auto}` — append-only, never edited |
| Shipment / ASN | the order's `delivery.legs[]` (existed; `api/logic-logistics.js`) |
| Site | `omega_orgs/{org}/sites/{siteId}` — new |
| Coverage template | `storefront/config.products[].coverage[]` on the catalog product; `warrantyYears` is the default template |
| Coverage instance | **derived at read time** from the template and the unit's custody dates — never stored |
| Container / pallet | not modelled (see *Not built*) |
| Lot | not modelled; a lot carries no coverage, so nothing here needs it |
| Import batch | `omega_orgs/{org}/custody_imports/{batch}` |
| Column mapping | `omega_orgs/{org}/custody_mappings/assignment` |

Every new path is Admin-SDK-only: `firestore.rules` denies browser reads and
writes explicitly, and every read and write goes through an endpoint that
checks the token, the org and the subscription.

## The status machine

`api/_lib/custody.js` is the one place the rules live. Pure: no Firestore,
no clock except the `now` handed in. A move from a form, a scan, a
spreadsheet, the logistics ledger or the customer's phone is judged by the
same table and refused with a reason, never applied quietly.

```
'' (plant) ──ship──▶ in_transit ──deliver──▶ delivered ──receive──▶ received
                          │                                  │
                          └──────────receive─────────────────┘
received/delivered ──assign──▶ assigned ──install──▶ installed ──commission──▶ commissioned ──in-service──▶ in_service
installed/commissioned/in_service ──rma-open──▶ rma_open ──replace──▶ replaced
                                                   └──rma-return──▶ returned
installed/commissioned/in_service/returned ──decommission──▶ decommissioned
```

Side states (`damaged`, `lost`, `quarantined`, `scrapped`) sit beside the
status and clear independently; `scrapped` is final. Commissioning without
an install date implies installed. The custodian is implied by the status:
carrier in transit, the customer from receipt, the site once assigned.

Where each move is recorded:

- **ship** — only by Shipping & receiving (a load's pickup) and the office
  workflow's *ship* step; the custody page refuses it so the load stays the
  record of what left.
- **deliver, receive** — the logistics ledger's *carrier delivered* and
  *receiving inspection* (a damaged or missing receipt sets the side state);
  the custody page's scan session (*Receive a load*, reconciled against the
  planned load: shorts and overages named); the customer's phone.
- **assign, install, commission, in-service** — the custody page (passport,
  scan session, import) and the customer's phone (assign, installed,
  commissioned). A customer's assign is a declaration the office confirms
  (next section).
- **rma-open, rma-return, replace, decommission** — the custody page.

## "This one is going here" — declare and confirm

The customer holds the batteries and says where each one goes; Omega Logic
tracks it and the office confirms it.

- **Going to.** Before a unit is bound — ready, in transit, delivered or
  received — the customer (phone) or the office (passport) names its
  destination site: `custody.plannedSiteId/plannedSiteName/plannedPosition`,
  `plannedBy`, `plannedAt`, event `destination`. Not a move. When the unit is
  then received without a site named on the receipt, it is bound to the
  planned site as that party's declaration.
- **Declared vs confirmed.** Every site binding records who said so:
  `custody.declaredBy` (`customer` | `office`) and `declaredAt`. A binding
  the office records is its own confirmation (`confirmedAt`, `confirmedBy`
  set). A binding the customer records is *declared* until the office
  confirms it (`confirm` action, event `confirm`); a new declaration to
  another site is unconfirmed again. Coverage binds on the declaration —
  confirmation is the office's check on the record, not a gate on the
  warranty, so a customer is never uncovered because the office is slow.
- **Where it shows.** Office overview: *The customer says · awaiting your
  confirmation* with a Confirm button per serial, and *Going to*; the
  passport says *customer says … not yet confirmed* or *confirmed by … on …*.
  Customer app: *going to X* on a unit in transit, *at X · awaiting your
  supplier's confirmation*, then *confirmed by your supplier on …*.
  Exceptions: `declared_unconfirmed` after three days.

## Coverage

A product carries up to ten templates, each `{id, type: warranty|sla,
provider, termMonths, trigger: ship|delivery|commissioning|earliest_of,
capMonths, metrics{uptimePct, responseHours, resolutionHours}, exclusions,
docUrl}`. They are edited on the *Sites & custody* page and saved through
the catalog endpoint, so there is one product list.

Coverage is worked out every time a unit is shown:

| Status | Meaning |
|---|---|
| `pending` | no trigger date yet, the start is in the future, or **no site is assigned** (the assignment rule: coverage binds to a site) |
| `active` | started, site bound, not ended |
| `expired` | past its end date |
| `transferred` | the unit was replaced; the remaining term moved to the replacement |

`earliest_of` starts at commissioning, or at the ship date plus `capMonths`,
whichever comes first — the usual OEM "18 months from ship or 12 from
commissioning" clause. A replacement inherits the remaining term
(`custody.inheritedCoverage` on the new serial) unless the template says
`restartOnReplace`.

The customer portal's warranty line (product years × ship date) is unchanged
and agrees with the default template.

## Intake

- **Manual** — the passport on the custody page, one serial.
- **Scan** — the scan session: a keyboard-wedge gun types and presses Enter;
  the camera reads QR, Data Matrix or Code 128 (`BarcodeDetector`, the same
  pattern as the bench). *Receive a load* reconciles against the planned
  load; *Assign to a site* binds each scan to the chosen site.
- **Spreadsheet** — paste or choose a CSV/TSV. Columns are matched by name
  (`api/_lib/custody.js` `COLUMNS`), the mapping is shown and can be
  remembered per tenant, the plan is shown row by row (what each row would
  record, or why it cannot), and nothing is written until *Commit*. A second
  run of the same sheet changes nothing. New sites are created from the sheet
  only when the office allows it. Template: *Download the template* on the
  page or `GET /api/logic-custody?template=1`.

## Screens

- **Office → Deliver → Sites & custody** (`/logic-custody.html`): where the
  fleet is (counts by status, coverage summary), the unit passport (custody,
  coverage, every event, plant scans, the moves that apply, side states,
  replacement), sites (with interconnection details: utility, account and
  meter numbers, point of interconnection, service voltage and kW, agreement
  reference), the scan session, the import, exceptions, coverage templates.
- **Customer app → Account → Sites & equipment** (`/portals/customer/app`,
  `api/my-sites.js`): their sites, every unit on their orders with where it
  is and its coverage, *Received*, *Assign* to a site, *Commissioned* (date
  and by whom), and *Add a site*. Scope is the verified email, as on every
  portal endpoint: a serial on somebody else's order is "not on one of your
  orders".
- **Exceptions**: commissioned with no site, received and not assigned
  within 30 days, in transit over 21 days, any side state, coverage ending
  within 90 days, in service with coverage still pending.

## The spec's open questions, answered for Clean Cell

1. **Who logs in.** The factory (Clean Cell) and the office are one tenant;
   the end customer has the portal and the app. There is no third tier: a
   customer that resells onward is a later phase.
2. **Serialized vs lot.** Every `shipUnit` in `plant_units` is tracked;
   components travel with their assembly and are refused by name. A
   sub-component with its own warranty is not modelled.
3. **Default trigger.** `warrantyYears` from the ship date, as the portal
   already showed. A template on the product overrides it; templates are
   edited by any active member of the workspace through the catalog endpoint
   (the same people who edit the product).
4. **Can end customers create sites.** Yes, on their own account only
   (`customerId` is forced to the caller's account; a site with the same
   name and ZIP is refused as a duplicate).
5. **SLA on the unit or the site.** On the unit, bound to a site. A
   site-level uptime SLA across units is not modelled.
6. **Labels.** The plant already prints its own; the scan session reads
   whatever the label encodes, and `Plant.serialFrom` unwraps the plant's own
   QR payload.
7. **Proof at commission.** `installer` and `commissioningReportUrl` are
   fields on the custody block; the page takes the installer. Photos and a
   GPS stamp are not built.

## Rollout phases, against the spec

| Phase | Status |
|---|---|
| 1 · Track & assign | Built: import, receiving by scan against the load, site assignment by scan, form and spreadsheet, passport, event log. No pallet or container level. |
| 2 · Coverage | Built: templates, trigger engine, per-unit status, exceptions, expiring list. |
| 3 · Multi-org handoff | Partly: OEM → end customer is one hop and the customer app is the self-service side. No installer role, no onward ASN between tenants. |
| 4 · Service & automation | RMA and replacement with coverage transfer are built. No SLA/O&M feed, no carrier webhooks, no offline scan queue. |

## Not built

- Containers, pallets and lots.
- A separate installer or O&M login; the office records for them.
- Onward resale between tenants (`visibleTo[]` was not added; every read is
  the owning org's or the verified customer's).
- Site-level SLAs, photos and GPS at commissioning, printed labels beyond the
  plant's own, carrier webhooks, offline scanning.
- `firestore.indexes.json` is unchanged: the custody views read the org's
  units by `createdAt` and filter in memory (2,000 newest; older units open
  by serial).

Tests: `scripts/test-custody.js` (library, office endpoint, customer
endpoint, replacement and import) in the `test:logic` chain;
`npm run check:pages` renders the custody page and the customer app's panel
against the shared sample tenant.
