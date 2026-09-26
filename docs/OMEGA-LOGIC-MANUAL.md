# Omega Logic — the manual

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Written for the four people who run a white-label tenant's business (the
Clean Cell account is the first) and for ClearSky staff who set them up.
Kept current with the build: every screen named here exists on `main`, which
is what silmarillion.clearskyomega.com serves; anything not built is in the
last section, by name. The people who use each app have a PDF guide of
their own under `/guides/` (section 2).

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
Screen** (iPhone: Safari, **•••** at the end of the address bar or the menu
button at its left → Share → Add to Home Screen; Android: Chrome's
Install), and sign in inside the installed app once: it keeps its own
sign-in. On an iPhone Home Screen none of the three offers an emailed
sign-in link (it would open in Safari); Google goes by redirect through
this site, or it is email and password. The Omega Logic app and the Plant app are ClearSky's and wear
Omega Logic's name and icon on every workspace's phone, with the workspace
named inside; only the customer app wears the tenant's own name and icon
(`omega_orgs/{org}.appIcon`, or a set under `appIcon.customer`), because the
tenant's customers use it. Each opens offline and says so — the shell is
cached, the data never is; the office app keeps what was already on screen,
marked as possibly out of date, and nothing is saved until the connection
is back.

**Both apps open on the hex hub** (`omega-hexhub.js`): seven cells in a
honeycomb, the way the Ω in the app icon holds seven lit cells — one hub of
the business in the middle, six around it, a red badge where a person is
needed, and under it a panel per hub listing what is in it now. The office
dashboard and the customer's desktop portal show the same hub at the top of
their home page. The map of who uses what, and the endpoints behind it:
`docs/OMEGA-LOGIC-ECOSYSTEM.md`.

Sign out is top right on every office page (it goes to the Omega Logic
sign-in and comes back to the page). The left menu runs in the order the
business runs: **Run the business** (Dashboard, Orders, Company POs,
Customers, Office app) → **Build** (Work order board, Work orders &
registration, Plant board, Stations & tablets, Plant app) → **Stock &
supply** (Inventory, Materials plan, Purchase orders, Vendors & prices) →
**Deliver** (Shipping & receiving, Sites & custody, Fleet register, Quality
& holds) → **Money** (Cash flow, Accounting) → **Setup** (Products & bills,
Team — for the owner and administrators — and Settings). Website,
installation and the URL generator are ClearSky's to maintain and appear
only for ClearSky.

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
sites, scanning a label with the camera, a customer's list of sites,
Accounting's Payment box, price & accept, Team, and the customers' own app.
The build also writes it as the old `Omega-Logic-Office-App.pdf`, which the
app's Help menu and links already sent still open.
`Omega-Logic-Plant-App.pdf` is the builders' (the bench, typing or scanning
a serial, a test result by hand, registering serials, signing in to the
installed app); `Omega-Logic-Customer-App.pdf` is the one a supplier sends
its customers (signing in to the installed app, Home and the five tabs, POs
from a spreadsheet, Fleet and Sites from a list) and names neither Omega
Logic nor ClearSky; `Omega-Logic-Phone-Apps.pdf` is the three back to back.

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
   account, the same gate as the directory. After commissioning, the
   tenant's owner or an administrator adds and disables its own office and
   plant staff on **Team** (section 3); ClearSky still grants a person from
   another company.
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
   panel (ClearSky); per-customer terms under Customers → the account →
   Terms (Overview in the Omega Logic app).
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
  Customers, Plant, Deliver and Stock open their pages. A price or an
  acceptance is counted only for someone who may take it; an order waiting
  on ClearSky or on an administrator is listed and named, never counted.
  Then the six stages with counts, from the server's stages (requests &
  quotes → awaiting deposit → in build → ready to ship → shipped → needs
  attention), cash flow (invoiced, received, outstanding, overdue and to
  issue — Accounting's own totals — then purchase list value and payment
  exceptions) and the floor (open work orders, units on the floor, on hold,
  finished on the shelf). Every tile is a link, and a link with a section
  (`#orders`, `#cash`, an order's `?order=`) lands on it.
- **Orders.** Select an order to work it: lines, commercial summary,
  invoices, plant release, shipment. **Customer requests** appear on the
  order the moment the customer sends one from their portal (an address
  change, a question, a change, a warranty claim): make the change through
  its own control, then *Answer & close* — the answer appears on the
  customer's portal.
- **Company POs.** A fleet customer's purchase orders. One at a time with
  the PDF, or **Enter many POs at once**: paste one line per product per PO
  (`PO number, SKU, qty, ship-to name, address, city, state, ZIP, requested
  date, notes`); lines with the same PO number are one PO to one place (a
  later line may leave the address blank or repeat the ship-to name). A PO
  number with two addresses is stopped: give each address its own PO number,
  or ask the customer to send it with *One PO to several sites*, which then
  arrives under review. A ZIP a spreadsheet shortened (2134 for 02134) gets
  its zero back in the states whose ZIPs start with 0. Each
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
- **Freight plan** (*Shipping & receiving*, under the ledger; an
  administrator's): when one order goes to many sites and each needs a
  freight price. Open it from the order (*Freight plan →*), from the Omega
  Logic app's order (*Freight plan on the desktop*) or after *Many sites at
  once* (*Next: price the freight for this order*).
  1. **Give the units their sites** first (*Many sites at once*, below).
     Units with no site are listed under *No site yet*, with a link back.
     A unit already on a load (or shipped) without a site is listed apart,
     *On a load without a site*, with its load: nothing to do there.
  2. **Set the ship-from** once for the workspace (*Set the ship-from
     address*: the plant or yard the loads leave from, contact, dock hours,
     notes for carriers). It is found on the map when it can be; then the
     stops in each lane run nearest-first from it, in straight-line miles.
     Without a pin they go in state order.
  3. **Read the lanes.** One row per region (Northeast, Mid-Atlantic,
     Southeast, Great Lakes, Central Plains, South Central, Mountain,
     Pacific; Alaska, Hawaii and Puerto Rico on their own): stops, units to
     ship and booked, estimated weight, the best price so far, status. Open
     a lane for its stops: site, ref, address, receiving contact, miles from
     the previous stop, units, SKUs, serials, weight and floor area, and
     whether they are ready (a stop not yet ready shows the plant's date).
     *Ready* means what pickup will accept: at Ready, tested and passed, no
     hold, and its components the same — a unit without a passing test
     says *Awaiting test*. Weights, sizes, freight class and stacking come
     from the product list; a product without them says *not on file*, by
     SKU, and is never guessed.
  4. **Download the sheets.** *Download master list*: one row per unit —
     serial, SKU, product, build status, lane, stop, site and address,
     contact, weight, dimensions, class, load, carrier, order and PO.
     *Download quote request*: one row per stop that still needs freight,
     the sheet to send to logistics partners — no customer name, PO or
     price on it. *Export master list* on the order saves the first one
     without opening the plan.
  5. **Record each price** on its lane: carrier, amount in USD, transit
     days, valid until, their reference, a note. The lowest open price is
     marked *best*. A price is never edited or deleted: record a new one
     that *Replaces* it, or *Withdraw* it with a reason. A lane whose units
     or sites changed since a price was recorded flags it *lane changed*;
     one past its date says *expired* (a price is good through the end of
     its *valid until* day). If a site's address is corrected after a
     price, the price says so — the address it was priced for and the
     address now — and cannot be accepted: record a new price for the lane.
  6. **Accept.** *Accept…* opens a second step on the page listing the loads
     it will plan — one per stop, `FRT-<order>-<lane>-1-S1`, `-S2`, …
     (the lane is a word such as `NORTHEAST`, never a state's letters), the
     ids the ledger will give them, each stop at its address as it is now —
     with the booking reference filled from the price. *Plan N loads* puts
     them on the ledger with the carrier; if any unit has since moved,
     shipped or gone onto another load it is named and nothing is planned.
     The lane then links each load to the ledger, where pickup, delivery and
     receiving are recorded as before. Units the price did not cover stay
     open. Nothing is booked with the carrier or emailed: do that as usual.
  Design and the honest list: `docs/LOGISTICS-CUSTODY.md` (*Freight plan*).
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
- **Many sites at once** (*Sites & custody* → *Many sites at once*): when a
  customer's PO lists its sites in an email or a sheet.
  1. **Choose the customer account.** Its sites and its orders that have
     units show; a closed account says so and takes no sites.
  2. **Paste the list** as it came (one address per line, `Street, City, ST
     ZIP`; bullets are fine; `Store 12: …` names a site; ` x4` or
     `(4 units)` at the end sets its units), or choose a .csv, .tsv or .txt
     file (a sheet with a header row works too), and press **Preview the
     list**.
  3. **Check the sites.** One row per line: a tick, the name (change it
     here), the address, the units, and *new*, *already a site* or
     *problem* with the reason; a pin when the address was found on the
     map (the office has a daily allowance of map lookups; past it, new
     lines show without a pin and are created all the same). Greetings are
     listed as left out. A line whose street has no house number in front —
     usually the sender's own address in the email signature — is marked
     *to check* and starts **unticked**; tick it only if it really is a
     site. An unticked line is not created and not ticked in step 4. Fix a
     problem in the paste box and preview again: the names you typed and
     the ticks are kept. A sheet row pasted without its header (Street,
     City, State, ZIP in columns) and a CSV that quotes every address both
     read. Press **Create N sites** — pressing it again creates nothing;
     sites already on the account are used, not copied.
  4. **Assign the order's units.** The order is chosen; the list's sites are
     ticked in list order with the list's counts. A blank box takes an even
     share of the rest (the grey number); the first sites take the one
     extra. **One per site** puts 1 in every ticked box — for an order
     whose units each go to their own site while the addresses are still
     coming in: this list's sites get one unit each, lowest serials first,
     the rest of the order stays without a site, and the next list's sites
     take the next serials (units already going to a site are left where
     they are). The total says how many of the order's units can go to a site
     (units still being built count; received ones are assigned when they
     arrive). A site's number counts the units already there, so the
     list's own numbers can add up to more than that total on a re-run —
     Preview is never blocked for it, and says what would change. Tick
     *Also move units…* only to move units already going to other sites
     (one the numbers do not use stays where it was going, and the preview
     says so). A unit on another customer account is left out, with the
     reason. Press **Preview** to see the serials per site, lowest first,
     then **Assign**. Nothing asks again: the preview is the check.
  5. **Download CSV** — one row per unit: serial, site, site ref, address,
     city, state, ZIP, order, PO, status (a ZIP like 07022 keeps its zero
     in Excel). Each unit's passport now says *going to* its site, and
     receiving it binds it there.
  Running the same list and numbers again changes nothing; lowering a
  site's number keeps its lowest serials and clears the rest.

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
Plant), and panels that open to their list: Sales (with *Price & accept*
for someone who may), Customers, Plant, Deliver, Stock, Money, Setup
(Products & bills, *Team* for the owner and administrators, Settings), Help
& guides (the three PDF guides). A screen the app has opens in
the app; the rest open their page. The screens:

- **Home** — the **hex hub**: **Today** in the middle; **Sales** (orders the
  person may price or accept — one waiting on ClearSky or an administrator
  is listed and named, never counted — POs to review, open requests), **Customers** (follow-ups due,
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
  *Verify ready · invoice the balance* is on an order in production.
  Approving a price and accepting an order stay on the desktop (Menu →
  Sales → *Price & accept*, shown only to someone who may; see *Pricing and
  acceptance* below), and so do correcting money (Accounting) and recording
  a shipment or a wire (ClearSky's). A priced order says to accept it on
  the desktop, or who it is waiting on.
- **Money** (Menu → Invoices) — every invoice with money owed on it, in
  three groups: **To issue** (billed on your paper and not issued yet),
  **Overdue** (past the order's terms from the day it was issued) and
  **Open**, each with its pay link or *Add pay link*, each opening its
  order. A payment to void, an invoice to edit or a release on PO is done in
  **Accounting** on the desktop.
- **POs** — PO loads: choose the company (or add one), the billing contact,
  paste the lines — same sheet as Company POs — and *Enter these purchase
  orders*. The company's uploaded POs under review and its orders are
  listed beneath.
- **Customers** — the CRM. A customer is a COMPANY ACCOUNT with its people
  on it (Acme Fleet: Jordan and his colleagues), so each card is a
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
    the last owner), *Invite* (it reads *Share app link*, and opens the
    phone's share sheet, when the workspace sends no invitation email);
    **Add a person** (their work email, user or
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
  the **unit passport** (a serial, then *Open* or *Camera*: custody, who
  confirmed, coverage, history, and only the moves that apply: received,
  assign to the site, going to, installed, commissioned, in service), the
  sites with their unit counts, and the exceptions. **Camera** reads a QR,
  Data Matrix or Code 128 label on an iPhone as well as Android
  (`omega-scan.js`); the first time the phone asks to use the camera, and a
  camera refused in Settings says where to allow it. Imports, coverage templates and a customer's list of sites
  (*Many sites at once*, linked from the tab) stay on the desktop.

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

- **Quality & holds** (Plant board) and the **serial record** (Work orders
  page): look up any serial for its trace, tests, genealogy and scan
  history; place or release a quality hold with a reason. A failed test
  needs a passing retest — from the rig, or recorded by hand (below); the
  bench that refuses the unit says so. A hold stops every scan until
  released. Correcting a mistyped COMPONENT serial takes the typo out of
  its assembly, so the cabinet still assigns and ships.
- **A test result by hand.** The EOL rig is the normal way. When it cannot
  post, an owner or administrator records **Pass** or **Fail** on the unit
  (serial record, or the Plant app's unit) with what was tested and with
  what (at least 5 characters). It is kept as the unit's test evidence with
  `source: manual`, who and when, audited, and goes through the same gate
  as the rig: a pass by hand (or by the rig) never takes a unit past a step
  still open at the bench it is leaving. A fail by hand holds the unit; its
  failure code is letters, digits, dot, dash or underscore (spaces become
  underscores: "low insulation" is LOW_INSULATION). Members see who records
  one.
- **Plant board → The line.** Each station in order with what is on it
  now, how long units sit there (median, average, p90), the oldest unit
  waiting, the bottleneck, finished per week and lead time. The steps each
  station carries come off the bills.

### Pricing and acceptance — who may

The order's pane shows **Approve price & accept order** (or *Approve price
only*, then **Accept order**) only to someone who may use it:

- an order **your workspace bills itself** (the OEM invoices on its own
  paper): the workspace's **owner or an administrator** — an active member with that role. A member or viewer
  sees *Waiting on your workspace owner or an administrator*.
- an order **billed through ClearSky's QuickBooks**: **ClearSky**. The pane
  says *Waiting on ClearSky … billed through ClearSky's QuickBooks*.

ClearSky may act on every order. Every price and acceptance records who and
when on the order (*Price approved by … on … · Accepted by … on …*) and in
its event history. The server enforces the same rule
(`logic-access.requirePricer`, inside the workflow's one writer), so a
hidden button is never the only gate. Recording a shipment and settling a
wire stay with ClearSky. The Omega Logic app shows the same *waiting on*
words and sends a price to the desktop.

### Team — your people (owner or administrator)

*Setup → Team* (`/logic-team.html`), also in the app's Menu. The workspace's
owner or an administrator adds office and plant staff (their work email at
the workspace's domain, a name, a role), changes a role, and **disables**
someone who left (and enables them again). Roles: **owner** (everything,
including making owners), **administrator** (prices and accepts what the
workspace bills itself, records money, runs the plant, adds and disables
people up to administrator — never an owner), **member** (works orders,
customers, POs, stock and the benches), **viewer** (sees, changes nothing).
Nobody is deleted, and the last active owner can never be disabled or given
another role. A person from another company needs ClearSky's access grant
first; Team never widens who may sign in. A new person is emailed a link to
set a password (or told how to), never handed to the administrator. Every
change is logged — who, what it was, what it is now — under *Recent
changes*. A role change asks first (making someone an owner, or taking
administration away, says so), and your own role is changed by another
owner or administrator, never from your own row. A disabled person can no
longer open the workspace's office, plant app or orders (the database
refuses them too, not only the pages). Members and viewers see the list and
change nothing. (ClearSky's console, `logic-admin.html`, and the old
`/api/set-role` use the same one member writer; no browser writes a
member record directly.)

### Two ways an order is billed

How a workspace's orders are billed is set by ClearSky (the desktop
office's settings panel); *Settings → Omega Logic bundle* says which one
applies. **ClearSky invoices from QuickBooks**
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

### Accounting — is the money in?

*Money → Accounting* (`/logic-accounting.html`), or *Correct or void in
Accounting →* on a tenant-billed order: every invoice on every order, what
was invoiced, what has really been received, what is late and by how much
(the aging), per customer ACCOUNT, with Status / Customer / Overdue filters
and *Export CSV*. Every figure is the server's (`api/logic-accounting.js`
over `api/_lib/receivables.js`); the page never sums money. The workspace's
owner or an administrator makes the changes, on the orders it bills itself;
an order billed through ClearSky's QuickBooks is shown read-only (payments
reconcile there). Tap an order and its invoice opens with the **Payment**
box on top:

- **Received** (green) or **Not received yet** / **Part received**, with the
  last payment's amount, date and bank reference or what is still to come.
- **Mark as received** opens *Record payment received* with the balance
  filled in: the amount, the day it landed and the bank's own reference
  (at least 4 characters). More than the invoice is refused. A recorded
  payment is what accounting has seen, not bank clearance.
- **Mark as not received** (with several payments: *Last payment not
  received*, or *Void* on any one in the list) voids a payment: why, in at
  least 5 characters. **Voiding keeps it** — the payment stays on the
  invoice, struck through, with who voided it, when and why, and the invoice
  goes back to what has really been received. When the order is already in
  the plant on that payment the office must choose: **Keep building on the
  PO** (records a release on the customer's PO: the plant carries on, the
  deposit shows as open) or **Hold the order** (the plant's scans refuse it
  until the payment is recorded or it is released on the PO). Either way,
  shipment still needs the money recorded. A voided reference is recorded
  again only with *This money has really landed* ticked and a reason.
- **Record invoice issued** (number, date, an optional due date), **Edit
  invoice** (number, invoice date, due date — blank follows the order's
  terms — with a reason; amounts come from the approved price and are never
  edited here), **Release on PO** (start the plant before the deposit, with
  the PO number and a reason) and, where the workspace keeps its own books
  in QuickBooks or Stripe, push, link and sync.

Every change goes through the one writer of order money
(`api/_lib/logic-workflow.js`, by way of `api/logic-office.js`) and is kept
on the invoice's history with who and why.

### Cash flow

Invoiced, received, outstanding, overdue and to issue are the receivables
ledger's own totals — the figures Accounting prints, for the orders shown:
an invoice counts once it is issued, *To issue* is billed but not on an
invoice yet, voided payments are not counted, and a recorded payment is not
bank clearance. Purchase list value is what
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
- **Stock** — finished units by product (available, held, assigned,
  building — counted over every unit, not a first page) and the parts
  short for the open work, with purchase list value. Bill lines no bench
  issues are listed there too.
- **Quality** — units on hold; open one to release the hold or place one,
  or to record a test result by hand (owners and administrators).

Installed on a phone it signs in through the same Omega Logic sign-in as
the office app (Google by redirect on an iPhone, or work email and
password); signing out forgets the company.

### The bench screen (`/plant/station.html`)

Paired once per device. **Scan the unit's label**: it arrives at this bench,
or is refused with the reason (out of sequence, on hold, not finished at the
previous bench, wrong line). If this bench has work for the product, the
**steps** appear: each part with the quantity for this unit and an *Issue*
button; each check with a *Done* button. **Scan the part's label** (SKU or
supplier part number) or tap Issue; type the supplier lot if you have it.
When every step is done the screen names the next bench; until then the
next bench refuses the unit and says what is open. Offline, scans queue and
send when the signal returns; each is idempotent. A damaged label, or a
phone with no scanner: **Type a serial**, type it, **Go** (the scan box
itself never raises a keyboard, so a gun does not). A bench opened from
the Plant app has *‹ Plant app* to go back; pairing has a Cancel, and
unpairing asks first.

Bill lines **no bench issues** (no station, or one the routing does not
have) come off the shelf when a shipping unit reaches **Ready**, onto the
works order's issued totals, so on-hand does not stay inflated. The
materials plan and Products & bills flag them; on a component (a
sub-assembly) nothing takes them, so count those by hand or give them a
station.

A **roaming phone** shows a bench picker top right: choose the bench you are
at, then scan. Every scan records the phone and the bench it named.

### Registering serials

Work orders page → *Register serials* (each work order has its own):
paste the real serials off the labels, one per line, against the chosen
work order — nothing is chosen for you while a work order waits for
serials. Components go in as rows of fields. Serials are never invented;
the label printer's sheet is the source. A serial registered by mistake
that the floor has not scanned yet can be **voided** or **corrected** (an
owner or administrator, with a reason): its slot is freed, any components
move to the right serial, and the typo's record is kept, marked void, and
refused at every bench.

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
address, city, state, ZIP, requested date, notes`) — rows copied straight
from Excel or Google Sheets (tab-separated, a header row skipped) or typed
with commas (an address with a comma in "double quotes") — and *Send these
purchase orders*; each is received for pricing and nothing is charged. The
line under the box says how many POs and lines it read, or what to fix and
where; a PO number with more than one address, or more than one requested
date, is not sent (*One PO to several sites* is the way). A PO number
that already exists is named, never overwritten; fifty per day from a
customer login. **Upload a PO document** (a signed PDF, a scan or a
spreadsheet) — it lands on the account for the supplier to enter. Beneath:
the POs under review (with the supplier's note where it asked for
information) and the orders the POs became, with loads.

**Fleet** (*Fleet & sites* on the desktop) — their sites (with the point of
interconnection) and every unit on their orders with where it is and its
warranty or SLA; *Going to* — name the site while the unit is still in
transit, and receiving it binds it there; *Received* (the day it arrived,
in good order or damaged), *Assign* to a site, *Commissioned* (date and by
whom), *Add a site*. In the app the Fleet tab's page is headed *Sites &
equipment*; each unit card says what happened on its own line; once a unit
is at a site its select shows that site and the button reads *Move*, and
Received and Commissioned ask before they record the date (today unless
another day is chosen). A date the customer gives must be one that can be true
— not in the future, not before the unit shipped (a receipt) or arrived (a
commissioning) — and the server refuses any other, because that date starts
the warranty or SLA. What the customer places is marked *awaiting your supplier's
confirmation* until the office confirms it, then *confirmed by your
supplier* with the date.

**Sites from a list** — for a PO whose units go to many places. On the
desktop it is the card at the top of *Fleet & sites*; in the app, Fleet →
**Sites from a list** (the Fleet tab stays lit; *‹ Fleet* goes back).
1. **Add your sites from a list**: paste the addresses as they came in the
   email, one per line (a bullet in front is fine; `Name: address` names a
   site; ` x4` or `(4 units)` at the end says how many units go there), or
   upload a .csv, .tsv or .txt file; **Preview the sites**.
2. **Check**: how many are new, already yours, to fix and to check; each
   line with a tick, its name (change it before creating), its address and
   its units; lines that are not addresses are listed as left out. A line
   whose street has no house number in front (often your own office in the
   email's signature) is *to check* and starts unticked — tick it only if
   it is a site; an unticked line is not created and gets no units. Fixing
   the list and previewing again keeps the names you typed and the ticks.
   **Create N sites**.
3. **Send units to your sites**: the order (chosen for you when there is
   one), the list's sites ticked with its numbers, a blank box sharing the
   rest evenly and a total against the units that can be sent (a site's
   number counts the units already there, so Preview decides). **One
   each** (the portal's **One per site**) sends one unit to every ticked
   site and leaves the rest of the order for your next list.
   **Preview**
   shows the serials going to each site; **Send N units to M sites** marks
   each one *going to* its site — nothing else asks. **Download CSV** gives
   the list of serials with each site's address (ZIPs keep a leading zero
   in Excel). Each site in Fleet then
   says *N units going here*; when a unit arrives and is recorded received,
   it is tied to that site and its warranty starts. Running the same list
   again creates and changes nothing.

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
with a way back. It signs in in the supplier's name: email link, Google, or
email and password (*First time here? Create a password*; a new password
sign-in confirms its address first). Installed on an iPhone Home Screen the
emailed link is not offered — it would open in Safari, and the app keeps
its own storage — so it is Google (by same-site redirect) or the password,
with one line saying why. To install on an iPhone: Safari, **•••** at the
end of the address bar → Share → Add to Home Screen → Add. It loads no
workspace runtime, and reads the
same customer endpoints as the desktop portal; it computes no price, size,
coverage or eligibility itself.

Everyone on a customer's account sees the same orders, sites, units and
documents: the account is what is shown, not the person. Someone signing in
for the first time from the email domain of a company the office set up asks
to join it — which needs the office to have typed that **Company email
domain** on the account (Customers → the company → Overview; without it a
colleague's first sign-in opens a new, empty account of their own, so set
it before the app link goes out) — and sees *Almost there* until the owner or the office approves
(*Check again* opens the account the moment they do). A stranger at no known
company gets an account of their own, as its owner. The customer surfaces
print the supplier's *Powered by …* line when the contract keeps ClearSky's
name (`whiteLabel.attribution`, default on).

## 6. Build notes — what landed in this pass, and what did not

What has landed on `main`, newest last: supplier records and prices · stations do the work (steps and
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
(`api/customer-subscribe.js`, the Stripe webhook's grant); then **many sites
at once**: a PO's list of sites pasted or uploaded, the sites created in one
go and the order's units spread over them (`api/_lib/custody.js`
`parseSiteList` · `matchSites` · `spread`, the four list actions on
`api/my-sites.js` and `api/logic-custody.js`, the customer portal's and
app's *Sites from a list*, the office's *Many sites at once*); Accounting's
**Payment** box (received or not, changed in one tap, a void kept on the
invoice); **the camera on every phone** (`omega-scan.js`, ZXing served from
this site for Safari); every installed app's Google sign-in going through
silmarillion itself; then the **2026-09-24 review pass**: a workspace's
owner or an administrator prices and accepts the orders it bills itself
(`logic-access.requirePricer`), **Team** (`api/logic-team.js` over the one
member writer, `api/_lib/logic-members.js`), a **test result by hand**
through the rig's own gate (`api/mes-test-result.js` `manual`), the Plant
app's and the customer app's installed sign-in, *Type a serial* at the
bench, registering serials by paste with void and correct, Stock counted
over every unit, bill lines no bench issues taken off the shelf at Ready,
the PO sheet read straight from a spreadsheet, the customer kit and sandbox
kept to the customer's side, and the three PDF guides rebuilt from those
screens; then the **freight plan**: an order's units against their sites,
grouped into lanes by region, the master list and the quote request,
carrier prices recorded append-only, and Accept planning the loads through
the ledger's own planner (`api/_lib/freight.js`,
`api/_lib/shipping-fields.js`, `L.planLeg` in
`api/_lib/order-lifecycle.js`, four actions and a GET on
`api/logic-logistics.js`, the *Freight plan* panel on Shipping &
receiving).

Tests: `npm test` (the plant chain runs `test-plant-work`, `test-plant-stats`,
`test-office-ops`, `test-app-manifest`; the logic chain `test-po-bulk`,
`tests/tappsandbox` — which fails when `app-sandbox/` is not what
`npm run build:sandbox` produces — `test-custody`, `test-site-list`,
`test-freight`, `test-crm`, `test-customer-subscribe`, `test-logic-pricing`,
`test-logic-team`, `test-office-chrome`, `test-customer-surfaces` and
`tests/tdiscreet` — no served file names a tenant's customer; the plant
chain also `test-plant-evidence`);
`npm run check:pages` renders the office dashboard, settings, inventory,
materials, catalog, plant board and map, the bench (tablet and roaming
phone), the plant app, the office app, the customer app (both at phone and
desktop width), the desktop CRM, the customer portal and the three
sandboxes (sign in, change something, reload) in Chromium — and a pasted
site list end to end on the portal, the customer phone sandbox and Sites &
custody, and the freight plan (both downloads, two prices, Accept) — and fails on a page error, a console error or an `/api/` call the
sample does not answer.

**Needs a person with credentials**

- Deploy `firestore.rules` together with `/api/logic-team` (a tenant's
  owner or administrator no longer writes member records from a browser;
  a disabled member, and an account whose email is not verified, lose
  direct reads of orders and plant records), and `firestore.indexes.json`
  (a new index behind the Plant app's Stock counts).
- Switch on email/password sign-up in the Firebase project so the customer
  app's *First time here? Create a password* works, and try the installed
  customer app's and Plant app's sign-in once on a real iPhone.
- Import Clean Cell's real product and BOM sheets with stations and steps;
  publish the production flow with its check steps; pair the tablets and
  the two phones.
- The customer app's icon comes from `omega_orgs/{org}.appIcon` (paths
  under the tenant's folder, copied by the seed or the master console);
  Clean Cell's is live. A new tenant's customer app shows the OMEGA
  fallback until its set is seeded. The Omega Logic app and the Plant app
  always wear the Omega Logic icon.

**Not built, on purpose or not yet**

- Landed cost, inventory valuation, a second stock location, finite-capacity
  scheduling, an RFQ to a supplier.
- Carrier booking or live tracking (shipping is a manual evidence ledger).
- In the freight plan: a carrier API, rate shopping or emailing carriers,
  road miles or route optimisation, one multi-stop bill of lading (a lane
  is one load per stop), pallet or trailer fit, editing an order's
  destinations, catalog-page fields for weight and class (they come from
  the product CSV), hazmat inference, prices in the phone app, and
  withdrawing an accepted price (`docs/LOGISTICS-CUSTODY.md` has the list).
- Cash settlement from a bank (QuickBooks records are the source; wires are
  recorded, not sent).
- Push notifications to the phones; the apps poll when opened.
- Approving a price or accepting an order inside the Omega Logic app (its
  *Price & accept* opens the desktop, on purpose: the paperwork is there);
  Accounting's corrections inside the app (it records *Issued* and
  *Received* on an order; voids, edits and releases on PO are desktop
  only); a tenant pricing an order billed through ClearSky's QuickBooks, or
  recording a shipment or settling a wire (ClearSky's, on purpose).
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
- From a site list: the order's delivery destinations and loads (the list
  says where each unit is going; Shipping still plans the loads), an .xlsx
  (save it as CSV), more than 200 sites (or 100 KB) at a time, a map pin
  for more than 40 new sites in one preview or past the day's map-lookup
  allowance (the site is created without one), a pin re-found after an
  address is edited (the old pin is dropped), a signature that starts with
  a house number being caught (untick it by eye).
- A customer changing or retiring a site it already added: `api/my-sites.js`
  takes an edit, but neither the customer portal nor the app offers one
  yet — the customer asks the supplier, who edits it under Sites & custody.
- Merging two customer accounts that both have history (orders, sites,
  designs). Only an EMPTY stray login moves onto its company, from the
  office's *Add a person*; a real merge is a reviewed script that has not
  been written (`docs/CUSTOMER-PORTAL.md` §2).
- A supplier-branded sign-in email for customers (the login link comes from
  Firebase's project-wide template).
- Adding somebody from another company on Team: they need ClearSky's
  cross-company grant first (`org_members`, from ClearSky's console); Team
  never writes it.
- A confirmed test, on a real iPhone, of the installed customer app's and
  Plant app's sign-in. What is built: no emailed link there (it would open
  in Safari), Google by redirect through this site, email and password,
  and *First time here? Create a password* on the customer app, which also
  needs email/password sign-up switched on in the Firebase project.
- A test result by hand at a test station other than EOL (the routing's
  machine stations today are EOL only).
- At the bench: a part scanned offline after a unit that also arrived
  offline is queued as a unit and refused later; pairing still means
  copying a long token by hand (no QR pairing, and the Plant app and this
  manual name the desktop's Work orders page while the plant board has
  *Stations & tablets* too); a unit scanned a second time at the same bench
  shows no steps; the bench page itself is not kept for offline use (its
  scan queue is).
- Shrinking a phone photo to fit the 2 MB document limit: a full-size
  photo is refused, and the person sends a smaller copy.

**Omega Logic follows the package (2026-09-26, packaging Phase 8).** A
workspace on a package sees only the parts it bought: Office runs the
business, the money and the setup; Plant adds Build, Inventory and Quality;
Materials & Purchasing adds the materials plan, purchase orders and vendors;
Logistics & Warranty adds Shipping & receiving, Sites & custody, the fleet
register and the app's Sites tab; Customer App opens the customer portal and
app to the workspace's customers. A page of a part not bought says so in one
sentence ("Materials & Purchasing is not in your Omega Logic package"); the
Package tab and Your plan are where a part is added. A workspace on the
older Omega Logic subscription holds everything, as before. The bench, the
test rig and a quality hold or release check the Plant part too (packaging
Phase 9): a paired station of a workspace whose package lost Plant stops
scanning with "Plant is not in your Omega Logic package".
