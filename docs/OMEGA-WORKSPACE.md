# Omega Workspace — the home of a workspace

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

`workspace.html` is the home of a signed-in workspace: what Omega Logic's
front door is for the office, this is for the whole platform. It replaces the
dashboard (`index.html`), which a tenant keeps only by saying so. Design
decided 2026-09-26.

## What it is

- **One chrome.** `omega-workspace-shell.js` paints the navy rail (Home ·
  Projects · All tools · Marketplace · Quote Desk · Team · Feed; Joint
  development and Administration when other shells reveal them; Omega Logic
  when the workspace holds it; Plan & billing · Settings), the white topbar
  with the company switcher, the website's blueprint grid behind everything,
  the side panel, the toast and the phone tab bar. The projects and
  marketplace pages call `OmegaWorkspaceShell.theme()` for the ground and the
  home link, and once the workspace is home their rail becomes the
  workspace rail with the page marked current (`adopt()`), keeping the ids
  `omega-jd-nav.js` reveals.
- **The hub.** `omega-hexhub.js` draws it (the same component as the Omega
  Logic app). `omega-workspace-hub.js` decides the six cells around Today
  from what `OMEGATools.isUnlocked()` says the person may open: Projects
  first, Team last, the rest by priority (Omega Logic's Orders · Plant ·
  Deliver, then Design · Grid · Finance · Sales · Market · Compute · Permits
  · Operate). An area with nothing open earns no cell. `scripts/tests/tworkspacehub.js`
  asserts every tool and module the table names against the real catalogs.
  Showing a cell is never access.
- **A hub cell or a rail item opens the side panel** with that area's pages
  and tools, locked ones marked and last, and the full page one click further.
- **Today** is derived and ranked by `omega-workspace-today.js` (pure;
  `scripts/tests/tworkspacetoday.js` pins every rule): read-only, awaiting
  approval, a trial ending, the person's overdue and due-soon to-dos
  (`team_todos`), requests for quote waiting for this workspace's price
  (`recipients` where it is the vendor), vendors who answered its own
  requests (`rfqs` it sent), new referrals in the inbox, projects carrying a
  next action, a site package ready to submit, a project in flight that has
  not moved in 14 days, a candidate with no size when Battery Sizer is open,
  a request nobody answered in five days. Six rows, highest first. The four
  numbers are projects in flight (with new this week), awaiting your review,
  pipeline capex (online sites apart), and a fourth that fits the workspace:
  quotes back of sent, requests to price, new quote requests, or sites
  online. The referral inbox itself stays on the classic dashboard;
  `?stay=classic` visits it once without changing the browser's home.
- **The home is the board** (2026-09-27, after a day as hub-and-Today
  alone: "where did all this cool shit go?"). The hub and Today, then In
  flight and Around you — the feed, People (+ Invite, Share a project),
  the **Omega pulse** and Partners on your projects (joint development
  partners and the vendors who answered this workspace's requests for
  quote, each with Open). Only the catalogue pages leave the home: All
  tools (`#tools`) and Modules (`#modules`) are their own pages inside
  `/workspace`, drawn by `data-view` on the content; `#flight`, `#team`
  and `#feed` open that part alone with a "‹ Home" link. `go()` switches
  the view and marks the rail and the tabs.
- **Omega pulse** is `GET /api/pulse` (`api/_lib/pulse.js`, pure and pinned
  by `tpulse.js`): what the whole platform did this week as COUNTS ONLY —
  projects saved, requests for quote sent, projects at finance or beyond,
  designers active, companies building — an eight-week line of project
  saves, and one sentence of insight (the median battery duration of the
  week's sized projects, as a band; the reader's own latest sized design
  placed in, above or below it). The endpoint reads the most recent rows
  (capped at 500 each) with the Admin SDK; nothing in the answer names a
  company, a person or a project. A failed read says the pulse is resting.
- **Plan & billing is a page** (`#billing`, 2026-09-27: "a way to securely
  put in their payment details … billing history … active subscriptions …
  what they owe and when"). Four cards, none priced in the browser:
  *Your subscription* (plan, modules bought and switched on, the monthly
  figure, the billing day, since, access through); *What you owe* (unpaid
  invoices with their QuickBooks pay links, the next invoice, paid
  through, *I've paid* = reconcile-now for an owner or admin; Stripe's
  open invoices for a Stripe-billed plan); *Payment method* (a package on
  Stripe opens the Stripe Customer Portal through `POST /api/stripe-portal`;
  a plan ClearSky bills outside the engine and not in QuickBooks, a legacy
  tier such as Concord's Standard, is **Stripe**: *Pay $X by card* and
  *Add a card* open Stripe's Checkout in a new tab through
  `POST /api/stripe-checkout` (what is owed is the server's reading of
  `billing/current.amountDue`), the card on file is named from
  `/api/stripe-invoices` (brand and last four, never stored), and *Manage
  card* opens the portal once there is one; a QuickBooks plan saves the
  card on QuickBooks' own invoice payment page with Autopay; card details
  are never entered on our pages); *Billing history* (the engine's invoices from
  `GET /api/plan-change`, which every verified member may read; a Stripe
  plan's from `POST /api/stripe-invoices`). Additions waiting (a legacy
  opt-in with its price, a packaged change waiting for payment) are listed
  between them.
- **Opt in, never Ask.** Every module not held carries a way to buy it,
  never an email. A packaged workspace opts in on the one menu
  (`omega-package-menu.js`): a server quote, "Subscribe and pay", a
  QuickBooks invoice with the card button. A workspace on a legacy plan
  (billed outside the package engine: a tier on Stripe's or ClearSky's
  paper, often a contract) carries **Add to plan** (Tommy, 2026-09-27:
  "these should allow me to buy them immediately and not email clearsky
  it should allow them to add to plan and then charge their credit card
  or saved payment method"): the module joins the plan as an ADD-ON, its
  own monthly line, and the plan underneath and its billing stay exactly
  as they are. The one control (`OmegaPackageMenu.addOnControl`) asks
  `POST /api/plan-change {action:'addon-quote'}` for the server's price
  (the module and what it needs, at the book's list price, the five Omega
  Logic parts as the bundle once complete; the first purchase starts a
  monthly add-on cycle that day, a later one is prorated to it), asks for
  the billing contact once if there is none (the signup form,
  `/api/billing-profile`), then **Pay $X now** (`addon-buy`) issues the
  QuickBooks invoice and opens QuickBooks' payment page on the click: a
  new card, or the card saved there. The card waits with the pay link,
  **I've paid** (`reconcile-now`) and Cancel; the moment QuickBooks shows
  it paid, it is Live. `api/_lib/addons.js` is the one engine; see *Add to
  plan* below. Old recorded requests (`billing/current.optIns`) still show
  on Plan & billing.
- **The module cards live on Modules, not the home** (Tommy, 2026-09-27:
  "i love the way the modules are but i dont want them to be taking up so
  much dashboard space"). The home is the hub, Today, In flight and Around
  you; `check:workspace` fails if a module card is drawn there.
- **The login lands on the workspace.** `login.html`'s workspace route and
  a tenant's own host both go to `/workspace`; the workspace sends a
  classic choice (`?home=classic`, `shell: 'classic'`, a partner-type
  workspace) to the classic dashboard by the same `homeOf()` rule, so the
  two never bounce each other. `check:workspace` asks for the workspace by
  name (`?home=workspace`) because its fixtures say `shell: 'classic'`.
- **The way back.** The classic dashboard carries "Open Omega Workspace"
  beside Edit Dashboard and a Home section in Account settings; both are
  `/?home=workspace`, which flips the browser's choice.
- **Modules** (`#modules`) lists EVERY module of the catalog, for every
  workspace, marked by whether it is used or given (Tommy, 2026-09-27), in
  the compact cards that used to sit on the home: **Your modules** (Live,
  or paid for and waiting on the invoice) first, then **Add to your plan**,
  each in shelf order on one grid, so a shelf of one never leaves a row
  empty. A card is the letter on its shelf's colour and its state, the name
  with its shelf (held) or its price, three things it does, the tools
  inside as chips, what it needs, then the note with Opt in / Opt out.
  Every word fits its card: the name wraps and the price drops under it, a
  chip wraps inside the card; `check:workspace` measures every card from
  1366px to a 360px phone and fails on anything outside or clipped. `OmegaWorkspaceHub.moduleState` is the ONE rule,
  shared with the marketplace store and pinned by `tworkspacehub.js`: a
  packaged workspace holds what its projection lists; a legacy one holds a
  module when everything it carries is open on its plan: its standalone
  tools AND its commands in the editor (catalog `legacyGates`, asked of the
  editor's own ladder, `OmegaCaps.canWith`; "the store tells the truth",
  2026-09-27). Omega Logic by the `omega-logic` add-on; a module with
  neither tools nor editor commands on Enterprise. Partly on it with the
  count, else asks. A packaged workspace's prices
  are `/api/package-catalog`'s (asked once) and + Add opens the ONE menu
  (`omega-package-menu.js`) on that module; a legacy workspace's are the
  public price list's (`/api/offerings`, asked once) and Ask is the store
  on that module (`/marketplace.html#<module>`), where ClearSky is asked to
  switch it on. Change plan on a packaged plan strip opens the page.
- **View as a customer** (staff): `/workspace?viewas=lite` (a starter key
  or a comma list of module keys) paints the signed-in workspace as a
  packaged customer holding those modules, through the same server
  projection the editor's staff preview uses (`POST /api/package-access`
  `previewModules`, refused to anyone but verified ClearSky staff). Paint,
  never scope: the org stays your own, nothing is billed, a quote is
  refused, a banner says so and Exit is the plain address. `check:workspace`
  scenario `viewas`.
- **All tools** is the catalog by category, each tile Live, Locked or Soon by
  the one rule (`OMEGATools.isUnlocked` on the merged workspace; nothing opens
  while approval is pending). Locked tiles fold under "N more on other
  plans" per category; a locked tile explains which plan or module carries
  it and points at the Marketplace. The plan strip says what the workspace
  holds and how many tools are open.
- **In flight is the board** (`OmegaWorkspaceToday.board`, 2026-09-27: "a
  combo of anything that was done last, any undone projects, or anything
  we have sent to the finance marketplace and need to follow up"): what
  needs something first (offers waiting on a deal, a next action, a
  package to submit, a stalled project), then what was touched last; a
  site that is online is off it. A deal the person sent to the finance
  marketplace (`fin_projects` where `developerUid` is them, with its
  `offers`) rides on its project's card as a chip, or is a card of its
  own. Every card says why it is there, who has it, and carries
  **Assign** (or Reassign): the workspace's people from `team_members`,
  and one merge of `ownerEmail`, `ownerName`, `assignedBy`, `assignedAt`
  onto the project (the rules allow a same-org update that leaves `orgId`
  and the roster alone).
- **Needs you** adds the finance marketplace (offers waiting for an
  answer, a review at ClearSky older than a week, an awarded room not
  finished, a draft, an open deal with no offer in ten days) and folds
  every unsized candidate into ONE row. The whole row is the target.
- **Around you**: the workspace feed (messages and project saves), People
  (`team_members` presence: in the workspace under 15 minutes, seen within a
  day, else last seen), Partners on your projects (the other orgs on
  `orgsInvolved`), Guides. Each is an opt-in kept on
  `dashboard_layouts/{org}__{uid}.workspace`.
- **Settings** is a side panel reading the person's `team_members`
  profile (display name is editable there) and the classic-home switch.

## The store (every workspace whose home is the workspace)

`marketplace.html` is what is for sale, not a tool catalogue: the tools,
live or locked, are All tools on the workspace (Tommy, 2026-09-27: "the
marketplace is different than the modules and packages they can buy to
upgrade their systems"). Once the workspace is home the page wears the
whole workspace chrome: `OmegaWorkspaceShell.wear()` takes its own sidebar
and topbar off and mounts the rail, the topbar with the company switcher,
the phone tab bar and the side panel around the page's `#main`; the markup
stays in the file for the classic home, which is what the sidebar tests
compare. What omega-jd-nav.js revealed stays revealed.

The page shows, in order: a compact head with a search box that narrows
the shelves in place; the plan strip (plan, modules held, tools open, and
for a packaged workspace the monthly price, the next invoice and changes
waiting for payment); the **Plans** shelf from the public price list
`GET /api/offerings` (Lite, Field, Pro, Enterprise with the service fee;
the starter packages by what you do; the logins, the annual and the trial
notes); then every module on its shelf (Included with every plan · Add-ons
· Standard · Premium · Deliverables · Omega Logic) with its price, features
and tools.

- A PACKAGED workspace (`billing.packaged`) prices from
  `api/package-catalog` and opts in and pays here: a held module reads
  "In your plan"; any other carries the shared subscribe control from
  `omega-package-menu.js`: Subscribe asks `plan-change` for a quote
  (today, then, activation), "Subscribe and pay" applies it by its
  previewId, and the card then waits for payment with the QuickBooks link
  and a cancel. A $0 addition inside a paid tier switches on at once. Only
  an owner or admin manages; a member is told to ask.
- Any other workspace reads the public price list and is judged against
  its legacy tier: a module reads "On your plan" when every tool it
  carries AND every editor command it has is open (the same rule as the
  Modules page; Omega Logic when the `omega-logic` addon is held) or when it
  was added to the plan, "Partly on your plan" with what is on of both
  halves, else it carries **Add to plan**, the same control as the Modules
  page (the server's price, QuickBooks' card page, Live when paid). An
  owner or administrator buys; a member is told to ask one.
- `/marketplace.html#<module>` lands on and marks that module; a locked
  tile on the workspace links there when it knows the module.
- A tenant on the classic home (`shell: 'classic'`) keeps the tool
  catalogue, its categories and "+ Add to dashboard".

Nothing in the browser prices or grants anything. `check:workspace`
renders the store for a packaged workspace (quote → pay → waiting for
payment, the deep link) and for a legacy tenant (every module priced from
the price list, some on its plan and the rest with Add to plan, no mail to
ClearSky, the plans first, the catalogue folded away, the whole chrome on
desktop and phone), and walks a legacy Enterprise plan buying Office
(scenario legacy-add): the server's quote, QuickBooks' page opened on the
click, the waiting card, I've paid, Office Live and Omega Logic on the rail.

## Add to plan (a legacy plan's add-ons)

`api/_lib/addons.js`, through `plan-change` (owner, administrator or
verified ClearSky staff; a member reads). One engine, the package
engine's own parts: the book, the synced QuickBooks items (`module:<key>`,
`logic-bundle`), the QuickBooks driver, `package-billing.reconcile` and the
hourly runner; the engine's guard decides whether a card can be taken at
all (a closed engine says "Card payments are not open for this workspace
yet", and staff see why).

- **Bought and on are two records**, as for a package:
  `billing/current.addOns.modules` is what was bought (a paid purchase
  adds, a reversed one takes back), `addOns.live` is what is on, derived
  from the add-on invoices (`kind: 'addon'`, a purchase or a monthly
  renewal): on through the paid period plus the book's grace, off after a
  renewal stays unpaid past it. The plan's own tier, amount due, pay link
  and payments are never written.
- **On means what the legacy readers already honour**: an Omega Logic part
  through `logic-access` (`parts()`, so the office, the apps, the
  customer portal and the bench doors follow); a module's tools as
  `toolOverrides[tool] = true` (and the `toolAccess` allowlist when there
  is one), what ClearSky used to do by hand; the editor's capabilities by
  the legacy add-on keys `omega-caps.js` reads (`addons.LEGACY`, the same
  map as the Package tab prototype; `test-addons.js` pins it to the
  catalog). `addOns.granted` remembers what was written so switching off
  takes back exactly that, never a value staff set.
- **Never sold twice**: the server asks the pages' own rule
  (`OmegaWorkspaceHub.moduleState` on the tools catalog and the editor's
  own ladder, `omega-caps.js`, with the same `canCap` and `visible` the
  pages pass) before it prices, and live add-ons count as held there.
- **Sold only when it switches on exactly** (Tommy's decision, 2026-09-27):
  a legacy editor opens Site Map a whole tab at a time (`data-cap`), so an
  add-on key can leave part of a module off (Omega Storage on Standard: its
  tools, not its Analyze-tab commands) or switch on part of another (Omega
  Engineer's key opens Grid's and Storage's commands too). `addons.exact()`
  simulates the grants and judges them by the pages' rule without the
  add-on shortcut: every module bought must be held after, and no other
  module (Omega Design aside) may gain anything. What is not exact is not
  sold here: the quote says why (`request: true`) and the control offers
  **Ask ClearSky to include it**, the recorded request (`plan-change`
  `opt-in`: priced, on record, ClearSky told, nothing charged). Every Omega
  Logic department is exact on every plan (`logic-access` reads
  `addOns.live` itself); on today's ladder Omega Sites is exact on
  Standard and Omega Capital on Deluxe, and Enterprise already holds
  every editor module.
- **The rail is QuickBooks** (`addons.RAIL`), whatever the package rail:
  under `PACKAGING_PROVIDER=stripe` a packaged workspace bills through
  Stripe (`billing-driver`), but a legacy plan's add-ons are still
  guarded, invoiced and reconciled as QuickBooks' (each record names its
  `provider`), and a legacy Stripe tier's own customer and
  `paymentProvider` are never rebound. Add-ons on Stripe need a customer
  binding of their own (not built).
- **One purchase waits at a time**; a waiting purchase can be cancelled
  (the QuickBooks invoice stays open until staff void it; a payment after a
  cancel or after its period is honoured and flagged for a person).
- **Renewal**: the runner (`packagedLive` in production, `packagingSandbox`
  in the sandbox; the first purchase marks the organization) issues one
  invoice on the add-on billing day for everything bought; Autopay on
  QuickBooks' page charges it to the saved card.
- **Not here**: a legacy plan with no `omega_orgs` record or no billing
  record cannot be billed (the quote says so); a packaged workspace uses
  the Ladder; moving the whole workspace onto a package stays ClearSky's
  (the admin Package tab, which now also lists the add-ons). **Not built:**
  opening exactly one bought module's Site Map commands on a legacy plan
  (the editor's legacy gate by command ownership, as a package's is), which
  would make every editor module exact on every plan.

## The journey, mapped

Every door and where it leads once the workspace is home. One rail, one
ground, one home; the session travels same-origin on every hop.

| From | Click | To |
|---|---|---|
| Sign-in (`login.html`, `index.html` card) | signs in | `index.html` sends on to `/workspace` once the tenant's shell is known, unless it is `classic`, the workspace is a partner portfolio, or the browser asked for the classic page |
| `/workspace` hub | Today | the side panel listing what needs you (the Today card's rows) |
| `/workspace` hub | Projects | the side panel: In flight, All projects, recent projects |
| `/workspace` hub | Design · Grid · Finance · Sales · Market … | the side panel for that area: its pages and tools, locked ones marked; Open goes to the tool (`OMEGATools.hrefFor`) or opens the New Project dialog for Site Map and the sandbox |
| `/workspace` hub | Team | the side panel: Team, Feed |
| `/workspace` hub | Orders · Plant · Deliver (a workspace holding Omega Logic) | the panel, then `/omega-logic`, `/plant/…`, `/logic-logistics.html` |
| rail, any page | Home | `/workspace` |
| rail, any page | Projects | `/projects.html`, wearing the same rail with Projects current; a row opens the editor |
| rail, any page | All tools | `/workspace#tools`, the All tools page alone |
| rail, any page | Modules | `/workspace#modules`, the Modules page (the Ladder as a quick view for a packaged workspace) |
| rail, any page | Marketplace | `/marketplace.html`, the store in the whole workspace chrome: the plans and the modules with the server's prices; a packaged workspace subscribes, any other asks ClearSky |
| rail, any page | Quote Desk | `/rfq.html` |
| rail, any page | Team · Feed | `/workspace#team`, the Around you page alone |
| rail, any page | Plan & billing | `/workspace#billing`, the Plan & billing page |
| rail, any page | Settings | the side panel on `/workspace` (`#settings`) |
| Plan & billing | Manage card · Manage card and autopay (Stripe) | the Stripe Customer Portal in a new tab |
| Plan & billing | Pay $X by card · Pay now · Add a card (a plan ClearSky bills) | Stripe Checkout in a new tab (`POST /api/stripe-checkout`); back from Stripe on `/workspace?paid=`/`?card=` `#billing`, which confirms the session |
| Plan & billing | Pay · Open the payment page (QuickBooks) | the invoice's QuickBooks payment page, where the card is saved and Autopay turned on |
| In flight | Assign · Reassign | the side panel of the workspace's people; a pick writes the project's owner |
| tools grid | a Live tile | the tool, scoped to the org |
| tools grid | a Locked tile | the side panel naming the plan or module that carries it, with the Marketplace opened on that module (`#<module>`) and an email to ClearSky |
| In flight | a project card | `/editor.html?id=…&org=…` |
| In flight | + New project | the one New Project dialog (`omega-newproject.js`); created projects open in the editor |
| Around you | Post | writes `team_messages` as the signed-in person |
| Around you | Invite a colleague | the panel: the @domain rule and the sign-in link |
| Customize | a toggle | `dashboard_layouts/{org}__{uid}.workspace`, re-rendered at once |
| topbar | the company | the switcher: this company (and any grant listed), "here now" |
| topbar (phone) | ☰ | the rail as a drawer; Escape or the scrim closes it |
| phone tab bar | Home · Projects · Tools · Team · Me | the same five destinations |
| rail | Sign out | ends the session, `/login.html` |
| Settings panel | Classic dashboard | `/?home=classic`, the old home on this browser |
| classic dashboard | Open Omega Workspace · Account settings › Home | `/?home=workspace`, back to the new home on this browser |
| Plan & billing | Change modules | `/workspace#modules` |
| Modules page | Opt in · Add to plan | a packaged workspace: the one menu, a server quote and a QuickBooks invoice; a legacy one: Add to plan, the server's quote, Pay now opens QuickBooks' page (a new card or the saved one), Live when paid (`plan-change` `addon-quote`, `addon-buy`, `reconcile-now`) |

## Launch — home by default

1. Merge and deploy. A signed-in visit to `/` goes on to `/workspace` on the
   same origin (`index.html`, once the entitlements say where home is).
2. A tenant that keeps the classic dashboard says so on its record:
   `omega_orgs/{org}.shell = 'classic'` (the console's structural field).
   A partner-type workspace (a cross-org portfolio) keeps it too.
3. A browser keeps it with `?home=classic` (sticky; `?home=workspace` flips
   back) or visits it once with `?stay=classic` (the referral inbox).
4. `OmegaWorkspaceShell.homeOf()` is the one rule: `index.html` sends on,
   the legacy pages point Dashboard at the same home and wear the workspace
   rail, and nothing decides before the tenant's shell is known.

Render check: `npm run check:workspace` (four tenants on the Firebase
double, desktop and phone). Run it, and `check:dashboard`, after any change
to the page, the shell or the runtime they load.

## Not built (honest list)

- **Project-scoped tools from the hub.** The Cost Estimator (and the pro
  formas) open standalone as they do today; a `?project=` they preload from,
  and an Estimate action on the project card, is a change to those tools.
- **The switcher's list.** It shows the company this sign-in belongs to. A
  general "every company I may open" endpoint does not exist;
  `api/logic-workspaces.js` answers only for Omega Logic.
- **Omega pulse** (community counts from the Event Layer): no aggregate
  exists yet, so no panel.
- **Phone install** (manifest, shell service worker, an entry in
  `api/_lib/kit.js`, a guide): the page is responsive with the tab bar; the
  install pattern is the next pass.
- **Self-serve conversion of a legacy plan onto a package.** A legacy
  plan buys modules as add-ons beside its plan (Add to plan, above);
  moving the whole workspace onto a subscription package (re-pricing what
  its tier holds today) stays ClearSky's, from the admin Package tab.
- **One-click charge of a saved card from the workspace.** The card is
  charged on QuickBooks' own page (a saved card there pays in one click;
  Autopay pays renewals). Charging it from our server needs the QuickBooks
  Payments permission on a reconnect (roadmap §10.5 Step B).
- **A saved card shown by brand and last four.** The page says where the
  card lives (Stripe's portal, QuickBooks' payment page) and never holds
  one; reading the brand and last four back from Stripe or QuickBooks
  Payments is not wired. `billing/current.autopay` is shown when staff set
  it.
- The projects page keeps its own TOPBAR (tenant chip, tabs, avatar) and
  its own page layout; only its rail, ground and home link are the
  workspace's. The marketplace wears the whole chrome (`wear()`); giving
  the projects page the same is the next consistency pass.
- The store's plan cards are the price list's facts: moving a packaged
  workspace to another plan from a plan card (through `plan-change` with a
  `plan`) is not wired; the subscribe control's steer on a module quote
  is the way today.
