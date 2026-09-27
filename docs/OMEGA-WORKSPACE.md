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
  open invoices for a Stripe-billed plan); *Payment method* (a Stripe plan
  opens the Stripe Customer Portal through `POST /api/stripe-portal` for
  the card and autopay; a QuickBooks plan saves the card on QuickBooks'
  own invoice payment page with Autopay; card details are never entered
  on our pages); *Billing history* (the engine's invoices from
  `GET /api/plan-change`, which every verified member may read; a Stripe
  plan's from `POST /api/stripe-invoices`). Additions waiting (a legacy
  opt-in with its price, a packaged change waiting for payment) are listed
  between them.
- **Opt in and Opt out** are on the Modules page, one card and one action
  per module, through the one menu; see *Modules, opt in and opt out*
  below. A legacy plan's requests are recorded with their price and
  ClearSky moves the workspace onto a package; self-serve conversion of a
  legacy plan is NOT built (below).
- **Your modules on the home** (the demo's row): Live modules, then what is
  on its way in or out, then up to three to opt in to, compact cards from
  the same `moduleCard` as the Modules page; "All modules ›" is the page.
- **The login lands on the workspace.** `login.html`'s workspace route and
  a tenant's own host both go to `/workspace`; the workspace sends a
  classic choice (`?home=classic`, `shell: 'classic'`, a partner-type
  workspace) to the classic dashboard by the same `homeOf()` rule, so the
  two never bounce each other. `check:workspace` asks for the workspace by
  name (`?home=workspace`) because its fixtures say `shell: 'classic'`.
- **The way back.** The classic dashboard carries "Open Omega Workspace"
  beside Edit Dashboard and a Home section in Account settings; both are
  `/?home=workspace`, which flips the browser's choice.
- **Modules** (`#modules`) lists EVERY module of the catalog in shelf
  order, for every workspace, then the plans shelf (`#plans`).
  `OmegaWorkspaceHub.moduleState` decides what a workspace holds (a
  packaged one what its projection lists; a legacy one when its tools open
  and Site Map grants its capabilities on the tier; Omega Logic by the
  `omega-logic` add-on) and `moduleCard` turns it into the card. A packaged
  workspace's prices are `/api/package-catalog`'s; a legacy one's the
  public price list's (`/api/offerings`). Change plan on the plan strip
  opens the page for every workspace.
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

## Modules, opt in and opt out (2026-09-27)

Tommy, 2026-09-27: "the opt in and opt out stuff you need to make that
make sense ... the modules are paid services tied directly to the editor,
and you need to make sure the editor is linked to how a tenant pays and
what their modules are". Modules are bought on the workspace's **Modules**
page, never in the marketplace.

**One card, one status, one action.** `OmegaWorkspaceHub.moduleCard(m,
ctx, billing, summary, opts)` (pure, ES5, `tworkspacehub.js` §6) decides
every card the Modules page, the home row and Plan & billing show. First
match wins:

| state | pill | action | when |
|---|---|---|---|
| included | Live · always included | none | Lite, the floor |
| awaiting | Waiting for payment | Pay (QuickBooks), Cancel request | a change invoice for it is open (packaged) |
| bought | Bought · not on yet | Pay now | in the subscription, not on until the invoice is paid |
| removing | Opting out | Cancel request | packaged: queued for the quarterly review; legacy: an opt-out request with ClearSky |
| live | Live | Opt out | on the plan |
| requested | Opt-in requested | Cancel request | a legacy opt-in waiting on ClearSky |
| part | Partly included | Opt in | some of its tools / Site Map features are on the plan |
| available | Not on your plan | Opt in | the rest |

A member (not an owner or administrator) and a staff preview see the status
and "An owner or administrator of … changes modules", no button (a member
may still open a Pay link). A workspace awaiting approval opens nothing.

**Every action is the one menu** (`omega-package-menu.js`, "The Ladder")
opened on that module with `{ single: true, intent }`: it skips the first
click and states the money before anything is written.

- Packaged **Opt in** → `plan-change` `quote` (today, then, activation) →
  "Opt in and pay" (`apply`, a QuickBooks invoice; on when paid) or "Turn it
  on" for a $0 addition inside a paid tier.
- Packaged **Opt out** → `request-removal` dry run → "You keep X, and keep
  paying for it, until your review on <date>. From then your monthly fee
  goes from $A to $B. No refund for time already billed." → Request opt-out.
  The review date is the subscription's start plus whole 90-day periods
  (`book.policy.reviewDays`).
- Legacy **Opt in** → `opt-in` dry run (priced from the book) → Request
  opt-in, recorded on `billing/current.optIns`.
- Legacy **Opt out** → `opt-out` dry run ("Your plan's price is set by your
  agreement, so nothing changes today …") → Send opt-out request, recorded on
  `billing/current.optOuts`; the tier, add-ons and toolAccess are never
  touched. Office takes every Omega Logic department with it when the
  workspace holds the add-on.
- **Cancel request** → `cancel` (a pending change), `withdraw-removal`,
  `withdraw-opt-in` or `withdraw-opt-out`: "Nothing about your bill changes."

Every write is history plus `admin_audit`; opt-outs and removals mail
ClearSky (`optOutAlert`, `removalAlert`). Moving a legacy workspace onto a
package (the admin Package tab, preselected on what it holds plus its
opt-ins minus its opt-outs) marks each opt-in activated or declined and each
opt-out done.

**The Modules page agrees with Site Map.** A legacy plan holds a module
only when its tools open AND the editor grants its capabilities on the tier
it runs (`OmegaCaps.editorCan(effectiveTier(tier, capTier), cap)`,
`omega-caps.js` loaded on the workspace). A module says where it lives:
"Inside Site Map, the editor" (twelve of nineteen) or where else (White
Label, Site Finder, the Omega Logic departments).

**Site Map shows how the workspace pays.** `omega-editor-plan.js` draws a
plan chip in the editor's `#portal-nav`: the plan (· Read-only / · Payment
due), a popover with the modules in Site Map and elsewhere, the monthly
figure and next invoice (`GET /api/plan-change`; a failure shows the plan
without figures), changes in progress, the read-only notice with its pay
link and *I've paid* (reconcile-now, then re-apply), and links to Plan &
billing and Modules in a new tab. A failed billing read leaves the plan
"unchecked": navigation stays, producing controls are hidden, Retry
re-checks without a reload.

## The marketplace is the tools (again)

Tommy, 2026-09-27: "the marketplace should be the old tools that we had,
we are going to maybe retire that or phase it out but for now keep it".
`marketplace.html` is the tool catalogue for every workspace: every tool,
the categories, search and pinning, in the workspace chrome where the
workspace is home (`OmegaWorkspaceShell.wear()`) and in its own sidebar on
the classic home. It sells nothing. A locked tool names the module that
carries it (a packaged workspace's own catalog, else `GET /api/offerings`)
and **See module ›** goes to `/workspace#module-<key>`; on the classic home,
which has no Modules page, it opens the one menu on that module in place.
Old store links forward: `/marketplace.html#<module>` → `/workspace#module-
<key>`, `#plans` → `/workspace#plans`. The plans shelf lives at the end of
the Modules page.

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
| rail, any page | Marketplace | `/marketplace.html`, the tools catalogue in the whole workspace chrome; a locked tool names its module and links to its card on Modules |
| rail, any page | Quote Desk | `/rfq.html` |
| rail, any page | Team · Feed | `/workspace#team`, the Around you page alone |
| rail, any page | Plan & billing | `/workspace#billing`, the Plan & billing page |
| rail, any page | Settings | the side panel on `/workspace` (`#settings`) |
| Plan & billing | Manage card and autopay (Stripe) | the Stripe Customer Portal in a new tab |
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
| Modules page | Opt in · Opt out · Cancel request | the one menu on that module, the money stated first: a packaged workspace quotes and pays on QuickBooks' page or queues an opt-out for the review; a legacy one records the request with its price (`plan-change` `opt-in` / `opt-out`) for ClearSky to confirm |

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
- **Self-serve conversion of a legacy plan.** A workspace billed outside
  the package engine cannot pay for a module by card until it is on a
  subscription package. Its Opt in is RECORDED with the server's price
  (`billing/current.optIns`, history, `admin_audit`, a mail to ClearSky)
  and the admin Package tab opens preselected on what it holds plus the
  request; ClearSky activates, and the addition lands on the monthly
  invoice. A one-click "move me onto a package and invoice the first
  month" needs the engine to accept a legacy record as the start of a
  quote.
- **A saved card shown by brand and last four.** The page says where the
  card lives (Stripe's portal, QuickBooks' payment page) and never holds
  one; reading the brand and last four back from Stripe or QuickBooks
  Payments is not wired. `billing/current.autopay` is shown when staff set
  it.
- The projects page keeps its own TOPBAR (tenant chip, tabs, avatar) and
  its own page layout; only its rail, ground and home link are the
  workspace's. The marketplace wears the whole chrome (`wear()`); giving
  the projects page the same is the next consistency pass.
- The plans shelf's cards are the price list's facts: moving a packaged
  workspace to another plan from a plan card (through `plan-change` with a
  `plan`) is not wired; the menu's steer on a module quote is the way today.
- **The review date's anchor.** A packaged opt-out lands at the first
  review on or after today counted from the subscription's start in whole
  90-day periods; whether it should instead follow approval or calendar
  quarters is Tommy's call.
- **The plan chip in Editor Lite.** Editor Lite hides `#portal-nav`, so
  the chip is on Site Map only.
