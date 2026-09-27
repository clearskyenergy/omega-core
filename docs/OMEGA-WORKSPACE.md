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
- **All tools** is the catalog by category, each tile Live, Locked or Soon by
  the one rule (`OMEGATools.isUnlocked` on the merged workspace; nothing opens
  while approval is pending). Locked tiles fold under "N more on other
  plans" per category; a locked tile explains which plan or module carries
  it and points at the Marketplace. The plan strip says what the workspace
  holds and how many tools are open.
- **In flight** lists projects (own org plus `orgsInvolved`), stage, owner
  and a progress bar from the stage index.
- **Around you**: the workspace feed (messages and project saves), People
  (`team_members` presence: in the workspace under 15 minutes, seen within a
  day, else last seen), Partners on your projects (the other orgs on
  `orgsInvolved`), Guides. Each is an opt-in kept on
  `dashboard_layouts/{org}__{uid}.workspace`.
- **Plan & billing** and **Settings** are side panels reading
  `OmegaTenant.billing`, the package projection and the person's
  `team_members` profile (display name is editable there).

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
  carries is open (Omega Logic when the `omega-logic` addon is held; a
  capabilities-only module on Enterprise), "Partly on your plan" with the
  count, else "Ask ClearSky to add it", an email to the upgrade address
  naming the module and its price. Nothing is charged here; ClearSky
  switches a legacy tenant on.
- `/marketplace.html#<module>` lands on and marks that module; a locked
  tile on the workspace links there when it knows the module.
- A tenant on the classic home (`shell: 'classic'`) keeps the tool
  catalogue, its categories and "+ Add to dashboard".

Nothing in the browser prices or grants anything. `check:workspace`
renders the store for a packaged workspace (quote → pay → waiting for
payment, the deep link) and for a legacy tenant (every module priced from
the price list, some on its plan and some to ask for, the plans first, the
catalogue folded away, the whole chrome on desktop and phone).

## The journey, mapped

Every door and where it leads once the workspace is home. One rail, one
ground, one home; the session travels same-origin on every hop.

| From | Click | To |
|---|---|---|
| Sign-in (`login.html`, `index.html` card) | signs in | `index.html` sends on to `/workspace` once the tenant's shell is known, unless it is `classic`, the workspace is a partner portfolio, or the browser asked for the classic page |
| `/workspace` hub | Today | scrolls to Needs you |
| `/workspace` hub | Projects · Design · Grid · Finance · Sales · Market … | the side panel for that area: its pages and tools, locked ones marked; Open goes to the tool (`OMEGATools.hrefFor`) or opens the New Project dialog for Site Map and the sandbox |
| `/workspace` hub | Team | scrolls to Around you |
| `/workspace` hub | Orders · Plant · Deliver (a workspace holding Omega Logic) | the panel, then `/omega-logic`, `/plant/…`, `/logic-logistics.html` |
| rail, any page | Home | `/workspace` |
| rail, any page | Projects | `/projects.html`, wearing the same rail with Projects current; a row opens the editor |
| rail, any page | All tools | `/workspace#tools` |
| rail, any page | Marketplace | `/marketplace.html`, the store in the whole workspace chrome: the plans and the modules with the server's prices; a packaged workspace subscribes, any other asks ClearSky |
| rail, any page | Quote Desk | `/rfq.html` |
| rail, any page | Team · Feed | `/workspace#team` |
| rail, any page | Plan & billing · Settings | the side panels on `/workspace` (`#billing`, `#settings`) |
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
- The projects page keeps its own TOPBAR (tenant chip, tabs, avatar) and
  its own page layout; only its rail, ground and home link are the
  workspace's. The marketplace wears the whole chrome (`wear()`); giving
  the projects page the same is the next consistency pass.
- The store's plan cards are the price list's facts: moving a packaged
  workspace to another plan from a plan card (through `plan-change` with a
  `plan`) is not wired; the subscribe control's steer on a module quote
  is the way today.
