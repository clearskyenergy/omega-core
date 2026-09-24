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

## Many sites at once — a PO's list of sites

A customer's PO for dozens of units that go to a dozen or more stores
usually names the stores as a plain list in an email (`- Street, City, ST
ZIP` per line) or a sheet. Before this, each site was added by hand and each
unit given its *Going to* one at a time. Now the list is pasted once, the
sites are created in one go, and the order's units are spread over them in
one go. It is built ON the unit record and the `destination` event above:
nothing new is stored beside them.

**Where.** The customer: the portal's *Fleet & sites* → **Sites from a
list**, and the customer app's Fleet → **Sites from a list**
(`?tab=sitelist`). The office: *Deliver → Sites & custody* → **Many sites at
once** (`/logic-custody.html#many`), with a customer-account picker first;
the office app's Sites tab links there. The same three steps on each:

1. **Paste or upload** the list (a .csv, .tsv or .txt file is read as text
   in the browser; an Excel sheet is saved as CSV first).
2. **Check**: one row per line — a tick, name (editable before Create),
   address, units, and *new* / *already a site* / *problem* with the reason;
   a pin when the address was found on the map. Lines that are not
   addresses (the greeting, a name) are listed as left out. A street with
   no house number in front (*to check*: as often the sender's office in an
   email signature as a site) is read but starts **unticked**; an unticked
   line is not created and not ticked in step 3. A typed name and a tick
   are kept when the list is changed and previewed again (matched by street
   and ZIP). Editing the list after a preview turns Create off until it is
   previewed again. **Create N sites** (the ticked new ones).
3. **Assign (office) / Send (customer)**: pick the order; the list's sites
   come first, ticked, with the list's unit counts; a blank box shows its
   even share; a running total compares the numbers with the units that can
   be sent. **Preview** shows the serials per site, what is left over, what
   is released, what is already going elsewhere and what cannot be sent and
   why. **Assign / Send** records it. The result has **Download CSV** (one
   row per unit: serial, site, address, city, state, ZIP, order, status —
   the office's adds site ref and PO), made in the browser from the answer,
   UTF-8 with a BOM, a `'` before a cell starting with `= + - @`, and a
   ZIP (or the office's site ref) with a leading zero written as text,
   `="07022"`, so a spreadsheet keeps the zero; the list reader takes
   `="…"` back as the value.

The preview IS the confirmation. No step opens a browser `confirm()` box;
the Assign/Send call carries `confirm: true` and the preview's `planKey`.

**The list** (`api/_lib/custody.js` `parseSiteList`). One address per line:
bullets and numbering are stripped; `Street, City, ST 12345` (or ZIP+4, or
`ST, 12345`), read from the right so a `Suite 100` stays in the street; a
full stop or semicolon at the end of a line is not part of the ZIP; a
leading `Name: ` names the site, and so does `Name — ` when the name is not
itself a street and a house number follows (an emailed `1200 S Hwy 99 –
Suite 100`, where Outlook turned ` - ` into ` – `, is one street); a
trailing count ` x3`, ` ×3`, ` (3 units)`, ` - 3 units` or `; 3` sets its
units. A line in quotes (a one-column sheet saved as CSV quotes every
address) is read as its cells, and so is a row copied out of a sheet
without its header (tab-separated): by position, `[name] street, city,
state, ZIP [units]`, the state found from the right — so a ZIP is never
taken for a unit count. A line of column names (`Address`) is read past.
Or a sheet whose first line is a header (name/site/store, address/street,
city, state, zip, units/qty/batteries, ref/store #). The state must be one of the
50, DC or PR (full names become codes); a row missing a part is a problem
and is not created; the same street and ZIP twice is a problem on the
second; at most 200 sites per list; units a whole number 0–10,000. A site
with no name is called `City, ST` (`City, ST · street` when two share a
city).

**Matching** (`matchSites`, `placeSites`). A row is *already a site* when the
account has a site at the same street (case, punctuation and the usual USPS
abbreviations folded) and 5-digit ZIP — never by id, because `siteId()` cuts
at 60 characters and folds capitals. A new site whose id is taken gets the
next free `-2` … `-9`. So a second Create of the same list creates nothing.

**The map pin** (`api/_lib/geocode.js` `many`, `censusOnly`). Only rows that
would be created are looked up, on the US Census geocoder only (Nominatim's
policy is one request a second), four at a time, at most 40 per preview and
none started after 15 seconds. A miss, or a row not reached, is shown
without a pin and still created; it is never a refusal. The lookups are an
**allowance** (`api/_lib/site-geo.js`), claimed in a Firestore transaction
before any leaves, as the site study claims its parcel lookups: a
customer's preview spends its account's (200 a day) and all customers'
(1,000 a day), the office's its own (1,000 a day), in
`omega_orgs/{org}/geocode_usage/{scope__day}` (Admin SDK only); a cache
hit is free. Spent, the rows come back without a pin and the answer says
`geoLimited` (the screens say so) — because `sites-preview` answers any
verified email, and uncounted it was an open geocoding proxy.

**Bounded.** The text is at most 100,000 characters (400 on one line; a
longer line is left out by name, a sheet cell is cut there), and every
pattern in the reader is anchored or runs on a short window, the
right-hand trims done by hand: a crafted line of tabs or spaces cannot
hold the function (`scripts/test-site-list.js` times them).

**The spread** (`spread`, recomputed by the endpoint on every call — the
browser never sends serial → site pairs).
- Eligible units: shipping units of the order, not scrapped or lost, not
  already bound to a site, custody status at the plant, in transit or
  delivered (`plannable`). A received unit is left out: receipt is what
  turns *going to* into an assignment, so it is assigned when it gets there.
  Units still being built are eligible — that is the whole order the week
  the PO lands.
- Lowest serial first, in natural order (`…-9` before `…-10`), sites in the
  order shown.
- No numbers: an even spread, one more to the first sites (56 over 16 is
  8 × 4 and 8 × 3). All numbers: exactly those, and asking for more than the
  order can send assigns nothing and says so. Mixed: the numbered sites
  first, the rest spread evenly over the others.
- A re-run writes nothing. A lowered number keeps the site's lowest serials
  and clears the rest. Units already going to a site not on the list are
  left alone unless *Also move them* (`replan: true`); with it, one the
  numbers do not use keeps its destination and is reported with those
  (`elsewhere`, `unused: true`), never as "without a site".
- A unit of the order stamped for **another account** (an import or a
  replacement put it on a resale account) is left out on both doors
  (`why: 'account'`, `C.stampedAccount`), re-checked inside the write, and
  never re-stamped.

**The writes.** `plan-apply` needs `confirm: true` and the preview's
`planKey` (or `perSite` counts); a plan that changed since answers 409
"preview it again". Each unit is re-read inside a transaction (25 per
transaction) and recorded through `destination()` — one `destination` event
per unit with `via: 'site-list'` and a `planId`; `custody.customerId` is
stamped only where it is empty. At most 200 units per call; `more: true`
means call again with the same body (the pages do): the `planKey` is over
the serial → site assignments only, which the calls of one apply do not
change — the released units are not in it, because a release written by
the first call is (rightly) no longer a release when the second recomputes,
and a key over them refused the second call after the first had written.
A unit that moved since
the preview is skipped with its reason. The customer's writes are
`method: 'customer'` and re-check the login's account pointer inside each
transaction (`still(tx)`); the office's are `method: 'manual'` with one
`omega_audit` row per create and per plan.

| Action | Customer (`api/my-sites.js`) | Office (`api/logic-custody.js`) |
|---|---|---|
| `sites-preview { text }` | the caller's account | needs `customerId` (400 missing, 404 unknown or closed) |
| `sites-create { rows }` | `source: 'customer-list'` | `source: 'office-list'`, audited |
| `plan-preview { sites, replan? }` | by `orderNo` (the order id never reaches a customer) | by `orderId`; a site on another account → 409 |
| `plan-apply { …, confirm, planKey }` | as above; a unit stamped for another account is left out (`why: 'account'`) | as above; the same, and a site on another account → 409 |
| GET | `orders: [{ orderNo, po, units, eligible, building, planned }]`; sites carry `planned` | `?view=plan&customerId=` → the account's sites and its orders with units |

## Freight plan — from sites to priced loads

Written 2026-09-24. The situation it is for: one PO for 56 cabinets going to
16 sites across the US, the addresses arriving a few at a time, and freight
quoted by hand, site by site. Once *Many sites at once* has given each unit
the site it is going to, the order's **freight plan** puts every unit
against its address, groups the sites into lanes a logistics partner can
price, builds the two sheets they price from, records the prices they send
back, and plans the loads from the one the office accepts — on the same
ledger, through the same code as *Record planned load*.

It is built on what exists, with two small additions:

| What | Where |
|---|---|
| Which site a unit goes to | `plant_units/{org__serial}.custody.plannedSiteId` / `siteId` (bulk sites; `siteId` wins) |
| The site's address, pin, contact, ref | `omega_orgs/{org}/sites/{siteId}` |
| The loads | the order's `delivery.legs[]` — only `api/logic-logistics.js` writes it |
| Weight, height, class, stacking, handling | optional fields on the catalog product (below) |
| The ship-from (**new**) | `omega_orgs/{org}/fulfillment/config.freight.origin` |
| Carrier quotes (**new**) | `omega_orgs/{org}/freight_quotes/{quoteId}`, append-only |

`api/_lib/freight.js` is the pure library (no Firestore, no network, no
clock but the `now` handed in; bundled into the public sandbox, so ES5). It
holds no pricing logic — a quote is a number a carrier gave the office,
recorded as typed — and it never reads a list price, a supplier, a cost
basis or a margin.

**Lanes.** One fixed map sends each state to a region; each region is one
lane, in this order:

| Lane (key) | States |
|---|---|
| Northeast (`NORTHEAST`) | CT MA ME NH NJ NY PA RI VT |
| Mid-Atlantic (`MIDATLANTIC`) | DC DE MD VA WV |
| Southeast (`SOUTHEAST`) | AL FL GA KY MS NC SC TN |
| Great Lakes (`GREATLAKES`) | IL IN MI OH WI |
| Central Plains (`CENTRALPLAINS`) | IA KS MN MO ND NE SD |
| South Central (`SOUTHCENTRAL`) | AR LA OK TX |
| Mountain (`MOUNTAIN`) | AZ CO ID MT NM NV UT WY |
| Pacific (`PACIFIC`) | CA OR WA |
| Alaska (`ALASKA`) · Hawaii (`HAWAII`), ocean/air · Puerto Rico (`PUERTORICO`), ocean | each alone |
| Address to check (`CHECK`) | no state, an unknown one, or another country |

A lane key is never a state's two letters (asserted): it is in every load
id Accept names, which a carrier and the customer read, and a Texas load
named `…-SC-1` reads as South Carolina.

**Stop order.** Within a lane the stops that still need freight are ordered
nearest-neighbour from the ship-from, by straight-line (haversine) miles,
when the ship-from and the stop both have a map pin; ties go to the name as
a person reads it. A stop with no pin is appended in state, city, name
order; with no pinned ship-from every stop is in that order and no miles are
shown. Stops whose units are all booked or shipped follow, unnumbered by
distance. The lane shows its total straight-line miles only when every point
has a pin.

**Every unit stays on the plan.** Each shipping unit of the order is in one
of five states: *Needs freight* (a site, at the plant, on no load), *Booked
on load* (on a planned leg), *Shipped* (a custody status, or a leg past
planned), *No site yet*, or *Cannot ship* (scrapped or lost). The last two
are listed under the lanes and in the master list; nothing is dropped. A
unit with no site that is already booked or shipped (planned by hand, or
before bulk sites) is not *No site yet* — there is nothing to assign — and
is listed apart as *On a load without a site* (`offLane`), with its load;
the *No site yet* tile counts only the units under that heading.

**Ready** is the pickup gate's ready (`logic-policy.ready`, copied into the
bundled library and held to the same answers by the tests): at Ready, no
hold, no NCR and a **passing** test — no test record reads *Awaiting test*
— and every serialized component of the unit on the order the same (pickup
checks the rootSerial family; one that is not reads *Component not ready ·
<serial> …*). A stop is *Ready now*, and the quote request's earliest
pickup date is today, only when pickup would not refuse it.

**Estimates, from the catalog only.** Per stop and per lane, over the units
that still need freight: total weight, floor area (W × D, unstacked), the
tallest unit, whether they stack, the freight classes and the handling
notes ("Do not stack" is added when any SKU is not stackable). A sum that
is missing a SKU's value says so — `27500 (not on file: CC-C418)` — and so
do the class (`85 (not on file: CC-C418)`) and stacking (`no (not on file:
CC-C418)`; SKUs that differ are named, `yes: A; no: B`, never "mixed"); a
value nobody entered reads **not on file**. Nothing is guessed.

**Catalog shipping fields** (`api/_lib/shipping-fields.js`, the one
validator): `weightLb` (1–200,000), `heightFt` (0.5–80, in the footprint's
`dimUnits`), `freightClass` (an NMFC class, 50 … 500), `stackable` (yes/no;
blank is *not on file*, never "no"; the importer hands the cell as typed to
the validator, so `TBD` or `N/A` is a row problem, never a quiet "no") and `handlingNote` (≤ 200 characters),
flat on a **product** row. `scripts/import-products.js` is still the one
mapping of the CSV: new columns `weightLb` (alias `weight`,
`shippingWeight`) with `weightUnits` `lb` or `kg`, `heightFt` (alias
`height`), `freightClass` (alias `class`, `nmfcClass`), `stackable`,
`handlingNote` (alias `handling`, `specialHandling`); a bad value makes the
row a problem, a component or service row carrying them gets a warning, and
the readiness report counts products with a shipping weight.
`docs/product-list-template.csv` has the six columns. The catalog writer
keeps a stored value a save leaves out. `api/embed-config.js` still builds
its public answer key by key and names none of them (asserted).

**The two sheets.** Built by the library — the ONLY place their columns are
defined (`MASTER_COLUMNS`, `QUOTE_COLUMNS`) — returned by the GET as
`exports.master` / `exports.quote` (`{filename, csv}`); the browser only
makes the file. UTF-8 with a BOM, CRLF, a leading-zero ZIP or ref kept as
`="07501"`, a `'` before a cell that starts `= + - @`.

- *Master list* (`freight-master-<order>-<day>.csv`): one row per unit —
  serial, SKU, product, build status, ready since, freight status, lane,
  stop, site, site ref, going to / assigned, street, street 2, city, state,
  ZIP, country, latitude, longitude, receiving contact and phone, weight,
  dimensions, class, stackable, handling, load, carrier, order, customer PO.
  Sorted by lane, stop and serial; no site, then cannot ship, last.
- *Quote request* (`freight-quote-request-<order>-<day>.csv`): one row per
  stop that still needs freight — lane, stop, stops in lane, pick up from
  (the ship-from), site, ref, the address and pin, miles from the previous
  stop (straight line), receiving contact and phone, units, SKUs, serials,
  est. weight, est. floor area, max height, class, stackable, ready
  ("Ready now", "k of n ready · plant date …" from the works order's due
  date or the order's promised date), earliest pickup date, special
  handling, order. The carrier's sheet carries **no customer name, PO,
  email or price**.

**A quote's life.** `freight-quote` records carrier, amount (USD only, more
than $0 and at most $10M, kept in cents), transit days (0–90), valid until
(not already past), the carrier's reference and a note, against the lane
**as it stands** (`planKey` over the open serial → site-at-its-address
pairs — the street as matched, city and state, `F.placeKey` — so a lane
that changed since the page was opened answers 409, and a site whose
address is corrected after a price makes that price stale). The stored
document names its stops (with the street, city, state and ZIP priced) and
serials. "Valid until" is judged against the calendar day in Hawaii
(`F.quoteDay`, UTC−10), the last US state to finish a day: a quote is good
through the end of its last day wherever the office is, not until 5pm
Pacific when UTC rolls over (a few hours' grace after midnight in the east;
the carrier confirms the rate at booking). The page's date picker uses the
browser's own day, never earlier. The commercial fields never change; only `status`
moves — `recorded` → `accepted`, `superseded` (a newer quote that
`supersedes` it, or another quote accepted for the lane) or `withdrawn`
(with a 3–300 character reason) — each move on `trail[]` and in
`omega_audit`. Nothing deletes a quote. An accepted quote cannot be
withdrawn. *Best* is the lowest recorded, unexpired quote on the lane (ties
to the earlier) that Accept would take. A quote whose lane has since changed
is flagged *lane changed*; one past its date, *expired*; one with a stop
whose address has changed says so, with the address priced and the address
now, is never *best*, and offers no *Accept*.

**Accept plans the loads.** `freight-accept {orderId, quoteId, revision,
loadId?, bookingRef?}` runs in one transaction: every stop is planned or
none is. The `plan` action's checks now live in `L.planLeg()`
(`api/_lib/order-lifecycle.js`); `plan` calls it once and accept once per
stop, with the legs planned so far — so the per-destination allowance, the
100-leg cap and "an unassigned shipping unit on this order" are exactly the
ledger's. The ledger is one leg per destination, so a lane of N stops is N
legs under one load id (`FRT-<order>-<lane>-<n>`, or the office's; n is
one past the lane's loads from a quote however they were named, stepped
past any leg id the ledger has — `F.nextLoadId`, the ONE rule: the
endpoint names the load with it and each lane of the plan carries it as
`nextLoadId`, which is what the Accept step previews):
`<loadId>-S1 … -SN`, one carrier, one booking reference (the typed one, else
the quote's). Each leg also records the real drop (`siteId`, `siteName`)
and `freight{quoteId, laneKey, loadId, stop, stops}` — never the amount.
Accept refuses (409), naming the serial, a unit that is no longer eligible:
not on this order, on another load, shipped, scrapped or lost, moved to
another site, or with no site; also an expired, withdrawn or already
accepted quote, a stale revision, a cancelled order, a site that is gone or
inactive, a site whose address changed since the price (naming the address
priced and the address now), a stop over 100 units or a quote over 400. Units on the lane the
quote does not cover are reported (`notOnQuote`), never planned. A unit
still being built is not refused: planning never required *Ready*; pickup
does. The lane's other open quotes are marked superseded.

**Which order destination a stop plans onto** (`F.destinationFor`): the
destination at the same address; else, when the order has exactly one
destination (a PO shipped "per the site list"), that one, with the real
drop on the leg; else the stop is named and cannot be accepted — plan it on
the ledger against the right destination. A legacy order with no
destination plan still gets the plan, the sheets and quotes, but Accept is
refused with the ledger's own message.

**The ship-from.** `freight-origin` saves name, street, city, state (a US
state), ZIP (5 or 9 digits), shipping contact and phone, dock hours and
notes on `fulfillment/config.freight` — a merge of that one key, as
`logic-accounting` writes `ledgerSync`, audited. It does not go through
`logic-office` `configure`, which is the ClearSky owner's and rewrites
terms, fee and QuickBooks settings: an OEM administrator sets their own
ship-from. A new address is looked up once on the Census geocoder inside
the office's daily allowance (`api/_lib/site-geo.js`); a miss leaves it
without a pin (stops then go in state order) and is never a refusal. The
same address keeps its pin.

**Who.** Every freight read and write is the ledger's own gate:
`logic-access.authorize(…, write)` — an OEM owner or admin, or the ClearSky
owner — and the subscription. A member, a customer and another workspace get
403; another org's order 404. Quotes live off the order because any member
may read an order from a browser; `freight_quotes` is closed in
`firestore.rules`. The customer projections (`portal.publicOrder`,
`L.buyerOrder`) build legs key by key and carry no `freight{}`, site or
amount (asserted).

| Endpoint (`api/logic-logistics.js`) | |
|---|---|
| `GET ?org=&freight=<orderId>` | the plan: `order`, `origin`, `summary`, `rows`, `lanes[]` (stops, estimates, `planKey`, `nextLoadId`, quotes with each stop's `where` and `moved`, best, accepted, loads), `unassigned`, `offLane`, `blocked`, `otherQuotes`, `notice`, `exports` |
| `POST freight-origin {origin}` | `{ok, origin, geoLimited}` |
| `POST freight-quote {orderId, laneKey, carrier, amount, …, planKey, supersedes?}` | `{ok, quote}` |
| `POST freight-withdraw {orderId, quoteId, reason}` | `{ok, quote}` |
| `POST freight-accept {orderId, quoteId, revision, loadId?, bookingRef?}` | `{ok, revision, loadId, legs, quote, notOnQuote, superseded}` |

**Screens.** *Shipping & receiving* (`/logic-logistics.html`) has a
**Freight plan** panel under the ledger: the summary (units, sites, lanes,
need freight, booked, shipped, no site, cannot ship, ready, weight on file),
the ship-from with its form, *Download master list* and *Download quote
request*, the lanes table (lane, stops, units open / booked, est. weight,
best quote, status), and per lane its stops, its loads on the ledger, its
prices (best, expired, lane changed; withdraw with a reason), *Record price*,
and *Accept…*, a second step on the page (no browser box) listing the loads
it will plan before *Plan* sends it; an accepted lane links each load to its
paragraph on the ledger. `?order=` opens an order and `#freight` scrolls to
the plan. It is reached from the desktop order (*Freight plan →* and
*Export master list*, which saves the master list straight away), from the
Omega Logic app's order (*Freight plan on the desktop*, administrators) and
from *Many sites at once* after an assignment (*Next: price the freight for
this order*). Quotes are not in the phone app.

Tests: `scripts/test-freight.js` (library: regions and keys that are never
a state code, 56 units over 16 fictional sites, stop order and miles by
hand, estimates with each missing SKU named, the five states and the
units on a load without a site, ready as the pickup gate's, destinations,
both sheets' columns and cells, no commercial field in the plan, a moved
address, the quote day, the next load id; endpoint: the gate, the
ship-from, quotes append-only, accept's parity with the `plan` action and
its refusals — a moved address among them — the previewed load id after a
custom-named load, what customers see, the catalog fields) in `test:logic`;
`scripts/test-import-products.js` for the new columns and an unrecognised
stackable; `npm run check:pages` drives the panel on the sample's
56-cabinet order (order `o7` in `scripts/_lib/logic-fixtures.js`) at 1280px
and 390px, both downloads, two prices, *Accept* (each load named as the
ledger names it, each stop at its current address) and the load links, a
price whose site's address was corrected, a unit on a load without a site,
and the three links in.

## The fleet register — the spreadsheet

`/logic-register.html` (Deliver → Fleet register) is one flat row per
serialized unit, at the plant or beyond, with every column a spreadsheet
would want, and it is edited in place: click a cell, type, Enter saves and
steps down, Tab steps across, Escape cancels. `api/_lib/custody.js`
`registerRow()` builds the row for the endpoint (`?view=register`) and the
sandbox alike; `REGISTER_COLUMNS` is the one column list.

| Group | Columns |
|---|---|
| Unit | serial, product, product name, type, built |
| Where it is | status, condition (side state), held by, site confirmed (customer says / confirmed on), going to |
| Parties | **seller** (the tenant), **buyer** (the account that ordered), **reseller** (who sold it on), **end customer** (whose site it runs at) |
| Site | site, position, address, utility, interconnection point, meter |
| Shipping | order, customer PO, load, carrier, BOL / tracking, shipped, delivered, received |
| Install | installed, commissioned, installer, in service |
| Coverage | warranty status / from / until, SLA status / until / uptime % |
| Service | replaced by, replaces, RMA opened, notes |

An edit is one of two things. **A detail** (reseller, end customer,
position, installer, notes, commissioning report: `detail` action,
event `detail`) links the unit to a party and never moves it. **A move**
(the Site cell → `assign`; the Installed and Commissioned cells →
`install` / `commission`) goes through the same status machine as every
other door, so a refused move stays refused here with its reason, and a
cell that no move applies to is not editable. Rows can be selected and
assigned to a site, or given a destination, in one go — a destination only
where the one planning rule allows (`can.destination`, `plannable`): a
received unit or one already at a site is named and left out, to be
assigned instead; the visible sheet exports to CSV.

### What Siemens, Schneider and the standards do, and what was taken

The register's shape follows how the large OEMs keep an installed base:

- **Register by serial, from the label.** Schneider's mySchneider registers
  a product by scanning its QR code or typing the serial, and warranty
  support asks for the part number, the serial and the factory order
  number; a customer's installed base is the list of what they registered.
  Siemens prints an *ID-Link* (IEC 61406) on the nameplate: a QR code that
  resolves to the unit's digital nameplate with its data, manuals and
  certificates. Here the plant's serial label is the identifier and the
  passport is the nameplate; a label that encodes the passport URL
  (`/logic-custody?org=&serial=`) would be the same idea.
- **Events, not edits.** GS1's EPCIS records custody as events — *what*
  (a serialized item, SGTIN), *when*, *where* (a location, GLN), *why* (the
  business step and disposition) — and keeps product attributes in master
  data. That is the custody event log under each unit plus the catalog
  product; the register is the flattened view of both. Pallet-level
  identity (SSCC) is not modelled.
- **A passport per battery.** The EU Battery Regulation requires, from
  February 2027, a passport per individual industrial battery over 2 kWh
  placed on the EU market: a unique identifier behind a QR code, the
  manufacturer, place and date of manufacture, chemistry and weight, with
  a new passport referencing the old one when a battery is repurposed.
  The unit record already carries identity, product, build date and the
  full history; what a passport would add (chemistry, weight, carbon
  footprint, state of health) is product and telemetry data this register
  does not hold.

Sources consulted 2026-09-23: Schneider Electric mySchneider tailored
services and warranty registration FAQs (se.com), Siemens Digital ID /
IEC 61406 ID-Link (siemens.com), GS1 EPCIS and CBV implementation
guideline (gs1.org), EU battery passport guides (Circularise, OpenDPP,
automotive-iq).

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

- **Office → Deliver → Fleet register** (`/logic-register.html`): the
  spreadsheet, above.
- **Office → Deliver → Shipping & receiving** (`/logic-logistics.html`): the
  ledger's loads and receiving inspection, and each order's **Freight plan**
  (above).
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
- Freight plan:
  - no carrier API, booking, rate shopping or tracking, and no email to
    carriers: the office sends the quote request and types back the prices;
  - miles are straight-line, not road miles, and the stop order is
    nearest-neighbour, not an optimised route;
  - one leg per stop (the ledger is one leg per destination): a lane is N
    legs under one load id, not one multi-stop bill of lading;
  - no pallet, linear-foot or trailer-fit calculation; the estimates are
    sums of catalog values;
  - an order's destinations cannot be edited here (a stop with no matching
    destination on a multi-destination order is planned on the ledger);
  - the shipping fields come only from the product CSV
    (`scripts/import-products.js`): the catalog page has no form fields for
    them yet;
  - no hazmat inference: a lithium battery's class and handling are what the
    product row says;
  - Alaska, Hawaii and Puerto Rico are only flagged as their own lanes
    (ocean or air), not priced differently;
  - there is no workspace time zone: a quote's "valid until" is judged on
    Hawaii's calendar day for every office;
  - a component's readiness counts only when it is stamped with the order
    (the plan reads the order's units; pickup reads the rootSerial family);
  - an accepted quote cannot be withdrawn, and accepting does not cancel or
    re-plan legs already on the ledger;
  - quotes are not in the phone app (it links to the desktop plan);
  - the PDF guides' sources describe it (`scripts/guides/office.html`, shot
    `desktop-freight`); the PDFs themselves are rebuilt at merge.
- `firestore.indexes.json` is unchanged: the custody views read the org's
  units by `createdAt` and filter in memory (2,000 newest; older units open
  by serial).
- Many sites at once:
  - the site list does not write the order's delivery destinations or plan
    loads (Shipping's destinations and legs stay as they were); it records
    where each unit is *going*;
  - no Census batch endpoint: a preview geocodes at most 40 new rows one
    call at a time, inside the daily allowance, so a longer list (or a day
    past the allowance) shows the rest without a pin (they are created
    without coordinates), and nothing re-geocodes a site later — an address
    edited on the Sites form drops its pin rather than keeping the old
    address's (`site()` keeps a pin only while the address is the same
    place);
  - `siteId()` still cuts at 60 characters and folds capitals; matching is
    by address and Create takes the next free `-2` … `-9`, but the id
    function itself is unchanged;
  - the single `site` action on `api/logic-custody.js` still does not check
    that its `customerId` is an account in the workspace (the list's
    actions do);
  - a received unit can still be left at *going to* through the single-unit
    `destination` action (the unit passport, the customer's Fleet); the bulk
    plan and the register's *Going to…* leave received units — and units
    already at a site — out and name them (`registerRow().can.destination`
    is `plannable`);
  - the customer's single-unit `destination` and moves still stamp the
    unit's account unconditionally, as before; only the bulk plan leaves out
    a unit stamped for another account;
  - the "to check" flag is a heuristic (a street without a house number in
    front); a signature line that starts with one is read as a site like any
    other and has to be unticked by eye;
  - an .xlsx is not read (save it as CSV); at most 200 sites per list;
  - the PDF guides (`/guides/*.pdf`) were not re-shot for these screens.

Tests: `scripts/test-custody.js` (library, office endpoint, customer
endpoint, replacement and import) and `scripts/test-site-list.js` (the list
parser and its time bounds, matching, the spread, both endpoints' four
actions, the geocoding allowance, a unit on another account, an apply over
200 writes; fictional addresses only) in the `test:logic` chain; `npm run
check:pages` renders the custody page and the customer app's panel against
the shared sample tenant, and drives a pasted list end to end on the
customer portal, the customer phone sandbox at 390px and
`logic-custody.html` (a flagged signature left unticked, a typed name kept
through a second preview, create, assign, per-site counts, the CSV's rows
with a leading-zero ZIP, a second run that changes nothing, a re-run after
a unit is received that the running total does not block, no browser box),
and the register's *Going to…* leaving out a unit already at a site.
