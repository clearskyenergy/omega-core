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
| **Office app** | the same four people, away from the desk | `/office/app?org=<org>` — install it from the browser menu |
| **Plant app** | the two builders | `/plant/app?org=<org>` — install it from the browser menu |
| **Bench screen** | a tablet bolted to a bench, or a builder's phone | `/plant/station.html` — paired once |
| **Customer portal** | the customer | `/portals/customer/?org=<org>` |
| **Customer app** | the customer, on a phone | `/portals/customer/app?org=<org>` — opens on its hub |

**Try them first, with nothing behind them.** `/app-sandbox/plant`,
`/app-sandbox/office`, `/app-sandbox/customer` and `/app-sandbox/bench` are
the same four pages with a sample Clean Cell on the phone instead of the
platform: sign in with any email, answer a request, assign a unit, key in a
stack of POs, issue parts at the bench, size a system, log a call on a
customer's account, upload a document from either side, subscribe to the
design tool; **Reset** in the
purple strip starts the sample over. Install them the same way. What they
compute is the product's own arithmetic; what they show is not real.
`app-sandbox/README.md` says exactly what is and is not.

Three phone apps, one pattern: open the link once, then **Add to Home
Screen** (iPhone: Share → Add to Home Screen; Android: the browser's
Install). The Omega Logic app and the Plant app are ClearSky's and wear
Omega Logic's name and icon on every workspace's phone, with the workspace
named inside; only the customer app wears the tenant's own name and icon
(`omega_orgs/{org}.appIcon`, or a set under `appIcon.customer`), because the
tenant's customers use it. Each opens offline and says so, and never shows
yesterday's data — the shell is cached, the data never is.

**Both apps open on the hex hub** (`omega-hexhub.js`): seven cells in a
honeycomb, the way the Ω in the app icon holds seven lit cells — one hub of
the business in the middle, six around it, a red badge where a person is
needed, and under it a panel per hub listing what is in it now. The office
dashboard and the customer's desktop portal show the same hub at the top of
their home page. The map of who uses what, and the endpoints behind it:
`docs/OMEGA-LOGIC-ECOSYSTEM.md`.

Sign out is top right on every office page. The left menu runs in the order
the business runs: **Run the business** (Dashboard, Orders, Company POs,
Customers, Office app) → **Build** (Work orders, Plant board, Stations &
tablets, Plant app) → **Stock & supply** (Inventory, Materials plan, Purchase orders,
Vendors & prices) → **Deliver** (Shipping & receiving, Quality & serial
records) → **Money** (Cash flow) → **Setup** (Products & bills, Settings).
Website, installation and the URL generator are ClearSky's to maintain and
appear only for ClearSky.

## 2. Setting up a tenant (ClearSky)

**Apps & guides** (`/logic-kit.html`, the ClearSky group of the menu) is
where everything lives, per subscriber: every app, page, sandbox and PDF
guide with its address; a message per audience (customer, office, plant)
ready for Jarvis or a person to send with the guide attached; and the log
of what was sent to whom. `/api/logic-kit?org=` returns the same as JSON
for Jarvis. The list is one file, `api/_lib/kit.js`; the guides are PDFs
under `/guides/` built from `scripts/guides/` by `build.js`, with the
screenshots retaken from the sandboxes by `shots.js` (the sample workspace
shows as "Your Company", so no public guide names a tenant). The office's
guide is `/guides/Omega-Logic-App.pdf`, the Omega Logic app guide: getting
the app on a phone or a computer, signing in, the hub, customers, orders,
sites, and the customers' own app. The build also writes it as the old
`Omega-Logic-Office-App.pdf`, which the app's Help menu and links already
sent still open.

0. **Commission the subscriber** from *Subscribers & commissioning*
   (`/logic-admin.html`, the ClearSky group of every office menu, or the
   directory's *Manage* link). One form: company email domain (the tenant
   key), name, hosts, owner email, tier, platform name and attribution,
   deposit and due terms, ClearSky fee. It writes the tenant record, the
   subscription (omega-logic + whitelabel add-ons, 30-day trial when the
   tier is trial), the office terms (not activated — QuickBooks gates that),
   the public sign-in mirror for every host and the owner's account, and
   hands back a one-time set-password link (or emails it, if you tick the
   box). It refuses public email providers, a second record for the same
   domain and a hostname another tenant holds. The same page is the control
   panel afterwards: tenant record and hosts, status, subscription (tier,
   add-ons, tool allowlist, overrides, dates, amounts, payment link), white
   label, storefront copy / flags / limits / cost basis, people (invite,
   role, disable, set-password link), hosts and keys, data counts, the
   **hand-over export** (every collection as CSV + JSON with a README —
   uploaded documents, ClearSky settlement, QuickBooks identifiers and
   storefront keys are not in it) and the admin audit trail. Owner-only:
   `api/logic-admin.js` refuses everybody but the verified ClearSky owner
   account, the same gate as the directory.
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

- **Dashboard.** The hex hub (Today in the middle; Sales, Customers,
  Plant, Deliver, Stock, Money around it) beside a **Today** list: company
  POs to review, the CRM follow-ups that are due (*Open* goes to the
  account's Activity, *Done* takes it off), customer requests, orders to
  fix or price. Sales, Money and Today scroll to this page's own sections;
  Customers, Plant, Deliver and Stock open their pages. Then the five
  stages with counts (requests & quotes → awaiting
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
- **Customers** (`/portals/customer/admin.html`) — the CRM. The follow-ups
  due across every account sit at the top. Opening a customer opens the
  ACCOUNT in sections, the way QuickBooks' customer hub does: **Overview**
  (orders, invoiced, received, balance, open requests, the follow-ups, the
  latest on the timeline, Editor Lite), **People & contacts** (the logins —
  approve, turn off, make owner, invite, add — and the contacts who never
  log in: add, edit, archive, *Log* against one), **Activity** (log a call,
  email, meeting, note or task, with a contact, an order and a follow-up
  date; *Done* on any open one — a task with no date is on Today until
  done), **Documents** (upload up to 2 MB of PDF, PNG, JPEG, XLSX, DOCX, CSV
  or TXT; *Share* shows it to the customer, *Stop sharing* hides it; open a
  PDF or a photo, save anything; what the customer uploads from their app
  is here, marked *from them*), **Orders & POs** (every order on the
  account, and *Enter a PO* with the company chosen), **Sites** (their
  sites and shipped units, each to its passport), **Timeline** (everything
  on the account, newest first — what the customer did in their app
  included) and **Details** (company, delivery address, email domain,
  access, terms). `?customer=<id>#activity` opens an account straight on a
  section; the dashboard's Today links there. Terms set here win for that
  customer's future orders. Nothing is deleted: a contact or a document is
  archived (an administrator's action).
- **Shipping & receiving.** Destinations, shipment legs with carrier and
  tracking, serials on each load, pickup, delivery and receiving condition.
  An order with more than one destination is shipped leg by leg.
- **Fleet register.** The spreadsheet: one row per serialized unit, at the
  plant or beyond — seller, buyer, reseller, end customer, site and
  position, order and customer PO, load, carrier and BOL, shipped /
  delivered / received / installed / commissioned dates, warranty and SLA
  with their dates. Search any column, filter by status, product or site,
  sort by any header, show or hide column groups, export the visible rows
  to CSV. Click a cell to edit it: Enter saves and steps down, Tab steps
  across, Escape cancels. Reseller, end customer, position, installer and
  notes save as they are; choosing a **Site** assigns the unit and typing
  an **Installed** or **Commissioned** date records that move — through the
  same rules as everywhere else, so a cell no move applies to is not
  editable. Tick rows to assign them to a site, or give them a
  destination, in one go. The serial opens the passport.
- **Sites & custody.** Every shipping unit after it leaves the plant: who
  holds it, which end site it is bound to, and the warranty or SLA that
  binds. *Where the fleet is* counts units by status and lists what **the
  customer says** — each unit they placed at a site from their phone, with
  a *Confirm* button — and what is *going to* a site before it arrives. The
  *unit passport*
  shows one serial's custody, coverage, every event and plant scan, and
  offers only the moves that apply (receive, assign, installed,
  commissioned, in service, RMA, returned, decommissioned), a side state
  (damaged, lost, quarantined, scrapped) and, for an open RMA, the
  replacement — which takes the site and the remaining coverage term. *Sites*
  are end locations with their interconnection details (utility, account and
  meter numbers, point of interconnection, service voltage and kW, agreement
  reference). The *scan session* takes a gun or the camera: *Receive a load*
  checks each scan against the load Shipping planned and names shorts and
  overages; *Assign to a site* binds each scan to the chosen site. *Import*
  takes the customer's or installer's spreadsheet: columns matched by name,
  the plan shown row by row, nothing written until commit, a second run of
  the same sheet changes nothing. *Exceptions* is what loses a warranty
  claim. *Coverage templates* per product: a warranty or SLA term and what
  starts it (ship, delivery, commissioning, or the earliest of commissioning
  and ship plus a cap); a unit's coverage is worked out from these every
  time it is shown and is *pending* until the unit is bound to a site.
  Design and the honest list: `docs/LOGISTICS-CUSTODY.md`.

### The office app (`/office/app`)

**The Omega Logic app** — ClearSky's app, with your company as the
workspace inside it (QuickBooks is the app, your company is what you sign
into): its name and icon are Omega Logic on every phone, and the workspace
name shows under it once signed in. Every Omega Logic customer downloads the
same app: you sign in to Omega Logic (Google, a sign-in link by email, or a
password) and it opens your company; if you work for more than one, you
choose, and **Switch** on the company line of the header changes it. It is
laid out the way QuickBooks lays out its app:
five tabs — **Home, Orders, Customers, Sites, Menu** — and a Menu that holds
everything else. The Menu has a search box, a row of *frequently used*
circles (Orders, PO loads, Customers, Sites, Stock, Invoices, Register,
Plant), and panels that open to their list: Sales, Customers, Plant,
Deliver, Stock, Money, Setup, Help & guides. A screen the app has opens in
the app; the rest open their page. The screens:

- **Home** — the **hex hub**: **Today** in the middle; **Sales** (orders to
  price, POs to review, open requests), **Customers** (follow-ups due,
  people asking to join), **Plant** (units on hold), **Deliver** (units to
  ship, placements the customer declared that you have not confirmed),
  **Stock** (parts short) and **Money** (invoices to issue, overdue) around
  it. A badge is what needs a person; a hub whose data has not arrived shows
  no badge rather than a zero. Under the hub, a tile per hub: tap a cell or
  a tile and its panel opens under it — what is in that hub now (the orders,
  the follow-ups, the people waiting, the work orders, the units, the parts,
  the invoices), then *Work it*, the screens and pages that run it. Tapping
  Today goes to **Needs a person**: company POs to review, the CRM
  follow-ups due (a task with no date is here until done; *Done* right on
  the row, or tap it for the account's Activity), orders with an open
  customer request, orders that need attention, orders to price. Then the
  stage counts, money (invoiced, received, outstanding, deposits awaiting,
  invoices to issue and overdue, purchase list value) and the plant (open,
  late, with holds, ready).
- **Orders** — every order with **All / Needs attention / To price /
  Awaiting deposit / In build / Ready · shipped / Customer requests**
  filters; each card carries the customer, lines, total and balance, and the
  work order's built % when it is on the floor. Tap one: lines, money and
  invoices, build progress and the units assigned from stock, shipment, and
  the customer's requests — **answer & close** a request here. On a
  tenant-billed order: record an invoice **issued** (number, date, and your
  own **pay link** if you have one — https only), add, change or remove the
  pay link of an invoice already issued, and record a **payment received**.
  *Verify ready · invoice the balance* is on an order in production;
  pricing, acceptance, shipment and wires stay on the desktop, next to the
  QuickBooks evidence.
- **Money** (Menu → Invoices) — every invoice with money owed on it, in
  three groups: **To issue** (billed on your paper and not issued yet),
  **Overdue** (past the order's terms from the day it was issued) and
  **Open**, each with its pay link or *Add pay link*, each opening its
  order.
- **POs** — PO loads: choose the company (or add one), the billing contact,
  paste the lines — same sheet as Company POs — and *Enter these purchase
  orders*. The company's uploaded POs under review and its orders are
  listed beneath.
- **Customers** — the CRM. A customer is a COMPANY ACCOUNT with its people
  on it (Amperage Capital: Shannon and his colleagues), so each card is a
  company — how many people, the owner, the deposit, anyone *asking to
  join* — with a search box and *Load more*. Open one and it opens in
  sections:
  - **Overview** — invoiced, received, balance and open requests across the
    whole account; quick actions (log a call, add a contact, upload a
    document, enter a PO); the follow-ups; the latest on the timeline;
    **Their app** — the customer app link to send, and the desktop link; the
    **company email domain** (people who sign in from it ask to join; saving
    it changes nothing else); the terms for the whole account.
  - **People** — each login, their role and whether they have signed in:
    *Approve* someone who asked to join, *Turn off* someone who left (never
    the last owner), *Invite*; **Add a person** (their work email, user or
    owner — a colleague who already signed in on their own is moved onto the
    company when that account is empty). Then the **contacts** who never log
    in — site leads, accounts payable, engineers — with *Call*, *Email*,
    *Log* and *Edit*.
  - **Activity** — log a call, an email, a meeting, a note or a task: a
    subject, what was said, when, with which contact, about which order,
    and a follow-up day. A follow-up is on Today from its day, a task with
    no day at once, until *Done*.
  - **Documents** — upload from the phone (the camera roll or files; PDF,
    PNG, JPEG, XLSX, DOCX, CSV or TXT, up to 2 MB), choose what it is, tick
    *Share with the customer* to put it in their app; *Open* a PDF or a
    photo, *Save* anything else; share or stop sharing later. What the
    customer uploads from their app is here, marked *theirs*.
  - **Orders** — every order on the account and who it is billed to, and
    **Enter a PO for** the company (the PO sheet with the company chosen;
    *Back* returns to the account).
  - **Sites** — the account's sites and shipped units, each opening its
    passport.
  - **Timeline** — everything on the account, newest first: orders placed,
    priced, invoiced, paid and shipped; POs; requests asked and answered;
    people who joined; documents both ways; logged activity; units received,
    assigned and commissioned; sites; designs; the design tool's trial or
    subscription. Nothing on it is typed twice.

  What a login may press follows its role in the workspace: a **viewer**
  reads the CRM and sees no forms; a **member** logs, uploads and keeps
  contacts, and opens an account with its logins read-only — approving
  people, changing terms and the domain, recording invoices and payments and
  answering requests are an **administrator's**, and archiving a contact or
  a document is an administrator's too. The endpoints refuse the rest
  whatever is drawn.
- **Stock** — finished units by product with **assign to an order** on each
  available serial, the parts short for the open work, and the supplier
  purchase orders still open.
- **Sites** — mirrors *Deliver → Sites & custody* on the desktop: **the
  customer says** (each unit the customer placed at a site from their
  phone, with *Confirm*), **going to** (destinations named before arrival),
  **receive a load** (choose the load Shipping planned, scan with the camera
  or type each serial, intact or damaged; shorts and strays are named),
  the **unit passport** (custody, who confirmed, coverage, history, and only
  the moves that apply: received, assign to the site, going to, installed,
  commissioned, in service), the sites with their unit counts, and the
  exceptions. Imports and coverage templates stay on the desktop.

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

### Two ways an order is billed

*Settings → How orders are billed.* **ClearSky invoices from QuickBooks**
(the default): approving the price queues the deposit invoice in ClearSky's
QuickBooks, payments are reconciled there, and the ClearSky processing fee
is added to the customer's total. **The OEM invoices on its own paper**
(tenant-billed): the OEM sends its own invoice from its own bank; the office
records *invoice issued* (number, date) and each *payment received* (amount,
date, bank reference) on the order, on the desktop or in the Office app. A
stage is paid when what was received covers what was invoiced; release to
the plant, ready and shipment then follow exactly as they do from a
QuickBooks receipt. No processing fee is added to the customer's total;
ClearSky's charge to the OEM is a separate line. The customer sees the
invoice number, the date it falls due on their terms, and its status on
their order and in their **Pay** hub. Record the invoice with your own
**pay link** (your bank's or your processor's payment page for that
invoice, https only) and the customer's Pay hub opens it; add, change or
remove it later from the order (the same number and date, a new link — an
empty field removes it). No link: the customer is told you will send
payment instructions. QuickBooks is not needed.

**Bringing an order in from the paperwork.** `scripts/intake-order.js`
runs one order through the same endpoint code the office uses — product on
the catalog, company account and terms, the order with its PO, the approved
price, the invoices issued and payments received, the serials on the works
order, the sites once addresses arrive — as a dry run first (nothing
written; every refusal named), then `--apply`. `docs/order-intake-template.json`
is the shape; the filled-in file stays out of the repo.

### Cash flow

Invoiced, received and outstanding are what QuickBooks has recorded on the
orders shown; a recorded payment is not bank clearance. Deposits awaiting is
what accepted orders still owe before release. Purchase list value is what
the materials plan says you still have to buy. The table under it lists the
orders with a balance and which invoice they are waiting on.

## 4. The plant, by screen

### The plant board (`/plant/manager`)

The plant manager's desk, in five views (the *On this page* links):

- **Plant overview** — **Today** (scans advanced, units reached Ready,
  refusals and test fails today, open work orders with late/held counts,
  finished stock, where the units are), **Needs a person** (units stuck at
  one bench past a threshold, units on hold with the reason, NCR and how
  long, benches that have not scanned in a working day, routing exceptions
  and unheld failed tests) and **The line** (the station map with dwell
  times and the bottleneck).
- **Work orders** — the board's rows (stage, line, priority, target, built
  %, ready units, next operation, assignee) with a search and stage filter;
  *Manage* edits line, priority, target date, assignee and notes (audited)
  and shows materials, services and every unit's step progress.
- **Quality** — holds, failed machine tests, stuck units and routing
  exceptions, each linking to the serial record where a disposition is made.
- **Stations & devices** — every paired tablet, rig and roaming phone with
  when it last reported (quiet benches flagged), plus **Pair a new device**:
  choose the operation (or *Roaming phone*), the line and a label; the token
  is shown once.
- **All units** — filter by station and hold; how long each unit has been at
  its bench; test result; link to the serial record.

Thresholds: stuck = 24 h at one bench, quiet bench = 8 h without a scan
(`GET /api/logic-plant?page=attention&stuckHours=…&silentHours=…`).

### The plant app (`/plant/app`)

Open it once from the office link, then **Add to Home Screen**. Five tabs:

- **Today** — today's scans, units finished, refusals and test fails; what
  **needs a person** (held, stuck, unheld failures, quiet benches — tap a
  unit to open it); **my work** (work orders assigned to you) or what is up
  next; *Scan at a bench*.
- **Work** — open work orders from the board (late first, then urgent, then
  by target date) with **All / Mine / Late / Holds / Ready** filters and each
  one's built %, ready units and next operation. Tap one: stage, target,
  assignee, built %, ready units, holds, next operation, where its units
  are, what it is **short of**, every unit with its station and step
  progress. *Scan at a bench* opens the scanner. A unit shows its bench, the
  next bench, the steps open at this bench, its last test and work order.
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

## 5. The customer portal and the customer app

The customer's account, on a computer (`/portals/customer/?org=<org>`) and
on a phone (`/portals/customer/app?org=<org>`), in the supplier's name. Both
open on the same **hex hub**: **Fleet** in the middle — every unit on the
account, where it is and the site it runs at — and **Size · Design · POs ·
Pay · Shipping · Warranty** around it, a badge only where the account is
needed (a unit to receive, place or commission; an invoice to pay; a load
on its way; a warranty pending until its unit has a site; a PO the supplier
asked about; the design subscription's payment due). Under the hub:
**Arriving**, **To pay** and **Needs you**. Everything the customer does
here is on the account in the supplier's CRM as it happens.

**Size a system.** *One site* — quick size against the supplier's own
catalog (kW and hours, sized on the platform, with *Lay it out* and *Send
as a PO*), or the supplier's battery sizer from the site's address and
utility data. *Portfolio* takes a ZIP, CSV or XLSX of many sites —
site list, bills, interval files, drawings — matches every document to a
site by ID then address, and screens and sizes each site on its own with the
data it actually has: a detailed size from a full year of interval data, a
preliminary size from twelve bills, a screening range from a peak or annual
figure, and an exact request for what is missing otherwise. Every number
carries where it came from. Results export to CSV, an executive report and
per-site reports; a sized site can be added to the customer's projects and
opened in Design Studio. Design, statuses and the honest list of what is not
built: `docs/PORTFOLIO-SCREENING.md`.

**Design** — Site Map · Editor Lite: its status (a trial from the supplier
to a date, subscribed, or payment due), a new site plan from an address,
every site plan to reopen, and the **subscription**: monthly or yearly at
the supplier's prices (the yearly saving is shown), paid by card on
Stripe's secure page, for everyone on the account. The page it comes back
to says so once. **Manage subscription** (the account owner, or whoever
subscribed) opens Stripe's billing page to change the card or cancel; a
failed payment shows *Update payment*.

**Pay** — every open invoice on the account, overdue first: its number,
amount, the date it falls due on the account's terms, and **Pay** — the
supplier's own payment page when there is one, QuickBooks' invoice page for
a QuickBooks-billed order, otherwise *your supplier will send payment
instructions*. Invoices being prepared and the paid ones below. Nothing is
charged in the app.

**Shipping** — the loads on their way (carrier, tracking, where each was
last confirmed), orders getting ready with their ship-by date, and what was
delivered.

**Warranty** — coverage per unit, from when to when, *pending* until the
unit is bound to a site; *Ask about this warranty* puts a warranty question
on the unit's order, and the supplier's answer shows on the unit.

**Orders** — each order with its six-step milestone, lines with the
warranty date, order total and invoices by number, destinations and loads,
documents, the requests and answers, and **Request a change or ask a
question** (delivery address or date, a question, a change, a warranty
claim). Requests and the tenant's answers stay on the order.

**POs** — PO loads: paste the sheet (`PO number, SKU, qty, ship-to name,
address, city, state, ZIP, requested date, notes`) and *Send these purchase
orders*; each is received for pricing and nothing is charged. A PO number
that already exists is named, never overwritten; fifty per day from a
customer login. **Upload a PO document** (a signed PDF, a scan or a
spreadsheet) — it lands on the account for the supplier to enter. Beneath:
the POs under review (with the supplier's note where it asked for
information) and the orders the POs became, with loads.

**Fleet** (*Fleet & sites* on the desktop) — their sites (with the point of
interconnection) and every unit on their orders with where it is and its
warranty or SLA; *Going to* — name the site while the unit is still in
transit, and receiving it binds it there; *Received* (in good order or
damaged), *Assign* to a site, *Commissioned* (date and by whom), *Add a
site*. What the customer places is marked *awaiting your supplier's
confirmation* until the office confirms it, then *confirmed by your
supplier* with the date.

**Account** — account number, company, rep, the account's orders; the
terms the supplier set; **People on this account** — the OWNER adds a
colleague at the company's own email domain, approves someone who asked to
join, and turns access off and on; their own details; **Documents** — what
the supplier shared with the company and what anyone on it uploaded, in two
lists, with an upload (PDF, PNG, JPEG, XLSX, DOCX, CSV or TXT, up to 2 MB;
twenty a day for the account); agreements; how to install the app. On the
desktop, Documents and Terms & agreements are their own views.

### One account, three apps

A tenant is one record (`omega_orgs/{org}`) and its three apps share it:
the plant app builds the unit, the office app ships it and confirms where it
went, the customer app is where the customer says it is going and places
it. Each app's Today (and the customer's Account) links to the others, and
a serial opened in any of them is the same record — the plant app's unit
view shows *After the plant* once the unit has shipped, with a link to its
custody passport.

### The customer app (`/portals/customer/app`)

The same account on a phone, with five tabs — **Home** (the hub), **Orders**,
**POs**, **Fleet**, **Account** — and the other hubs reached from Home, each
with a way back. It signs in the way the portal does (email link or Google;
the link comes back into the app), loads no workspace runtime, and reads the
same customer endpoints as the desktop portal; it computes no price, size,
coverage or eligibility itself.

Everyone on a customer's account sees the same orders, sites, units and
documents: the account is what is shown, not the person. Someone signing in
for the first time from the email domain of a company the office set up asks
to join it and sees *Almost there* until the owner or the office approves
(*Check again* opens the account the moment they do). A stranger at no known
company gets an account of their own, as its owner. The customer surfaces
print the supplier's *Powered by …* line when the contract keeps ClearSky's
name (`whiteLabel.attribution`, default on).

## 6. Build notes — what landed in this pass, and what did not

Built on `claude/white-label-cleancell-usa-st5trq` after PR #45 (commits
newest last): supplier records and prices · stations do the work (steps and
parts per bench, issued on scan; check steps; roaming phones) · one office
chrome with sign-out, the dashboard, settings, inventory with assignment,
customer financials · the plant map · customer requests and warranty, bulk
PO entry · the plant app · then the **office app** and the **customer app**
(Editor Lite first, PO loads), one manifest endpoint for all three apps
(`api/app-manifest.js?app=`), one bulk-PO parser (`omega-po-bulk.js`) shared
by the PO inbox and both apps, the batch PO path opened to a customer login
for its own company, and Clean Cell's office and customer icons
(`scripts/make-tenant-icons.js` renders a tenant's `<app>-icon.svg` set);
then **custody**: the status machine and coverage engine
(`api/_lib/custody.js`), Sites & custody in the office, Sites & equipment
in the customer app, receipt and shipment hooks in the logistics ledger;
then the **ecosystem** (`docs/OMEGA-LOGIC-ECOSYSTEM.md`): the hex hub on
both apps and both desktops, the CRM (`api/crm.js` — contacts, activity and
follow-ups, documents both ways, the derived timeline), the customer's
documents (`api/my-files.js`), the supplier's pay link on a tenant-billed
invoice, and the customer's Editor Lite subscription
(`api/customer-subscribe.js`, the Stripe webhook's grant).

Tests: `npm test` (the plant chain runs `test-plant-work`, `test-plant-stats`,
`test-office-ops`, `test-app-manifest`; the logic chain `test-po-bulk`,
`tests/tappsandbox` — which fails when `app-sandbox/` is not what
`npm run build:sandbox` produces — `test-crm` and `test-customer-subscribe`);
`npm run check:pages` renders the office dashboard, settings, inventory,
materials, catalog, plant board and map, the bench (tablet and roaming
phone), the plant app, the office app, the customer app (both at phone and
desktop width), the desktop CRM, the customer portal and the three
sandboxes (sign in, change something, reload) in Chromium, and fails on a
page error, a console error or an `/api/` call the sample does not answer.

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
- Push notifications to the phones; the apps poll when opened.
- Pricing, acceptance, shipment and wire settlement from the office app
  (desktop only, on purpose: the QuickBooks evidence is there).
- Editor Lite's canvas on a phone (the app opens it in the browser; it lays
  out at desktop width and folds below 760 px, but it is a drawing tool).
- Paying the supplier its share of a customer's Editor Lite subscription
  (Stripe Connect): checkout runs on ClearSky's Stripe account at the
  supplier's prices. Design access while that subscription is past due.
- Paying a tenant-billed invoice by card or ACH inside the apps (the Pay hub
  opens the supplier's own payment page).
- Email or calendar sync into the CRM (calls and meetings are logged by
  hand), rescheduling a follow-up, a daily upload cap for the office.
- A workspace member opening a customer account on the desktop CRM
  (`api/buyers.js` GET is an administrator's; the Omega Logic app opens it
  for a member from the company record, logins read-only).
- Icons for tenants other than Clean Cell (each needs a mark of its own).
- Time per step (the map times stations from arrival to arrival; issues are
  logged with a time but not yet summarised per step).
- A warranty claim process. Coverage is derived (template or product years
  against the custody dates, bound to a site) and never stored; a claim
  starts from the customer's warranty request on the order, and an RMA is
  recorded on the unit under Sites & custody.
- Containers and pallets, lots, an installer login, onward resale between
  tenants, site-level SLAs, photos or GPS at commissioning, carrier webhooks
  and offline scanning (`docs/LOGISTICS-CUSTODY.md` has the list).
- Merging two customer accounts that both have history (orders, sites,
  designs). Only an EMPTY stray login moves onto its company, from the
  office's *Add a person*; a real merge is a reviewed script that has not
  been written (`docs/CUSTOMER-PORTAL.md` §2).
- A supplier-branded sign-in email for customers (the login link comes from
  Firebase's project-wide template).
