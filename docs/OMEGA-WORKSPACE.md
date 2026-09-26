# Omega Workspace — the home of a workspace

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

`workspace.html` is the new home for a tenant: what Omega Logic's front door
is for the office, this is for the whole platform. It replaces the dashboard
(`index.html`) one tenant at a time. Design decided 2026-09-26.

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

## The journey, mapped

Every door and where it leads once the workspace is home. One rail, one
ground, one home; the session travels same-origin on every hop.

| From | Click | To |
|---|---|---|
| Sign-in (`login.html`, `index.html` card) | signs in | `index.html` sees `shell: 'workspace'` (or the browser's `?home=workspace`) and sends on to `/workspace` |
| `/workspace` hub | Today | scrolls to Needs you |
| `/workspace` hub | Projects · Design · Grid · Finance · Sales · Market … | the side panel for that area: its pages and tools, locked ones marked; Open goes to the tool (`OMEGATools.hrefFor`) or opens the New Project dialog for Site Map and the sandbox |
| `/workspace` hub | Team | scrolls to Around you |
| `/workspace` hub | Orders · Plant · Deliver (a workspace holding Omega Logic) | the panel, then `/omega-logic`, `/plant/…`, `/logic-logistics.html` |
| rail, any page | Home | `/workspace` |
| rail, any page | Projects | `/projects.html`, wearing the same rail with Projects current; a row opens the editor |
| rail, any page | All tools | `/workspace#tools` |
| rail, any page | Marketplace | `/marketplace.html`, same rail; "+ Add to dashboard" pins a tool, which the workspace lists under Pinned |
| rail, any page | Quote Desk | `/rfq.html` |
| rail, any page | Team · Feed | `/workspace#team` |
| rail, any page | Plan & billing · Settings | the side panels on `/workspace` (`#billing`, `#settings`) |
| tools grid | a Live tile | the tool, scoped to the org |
| tools grid | a Locked tile | the side panel naming the plan or module that carries it, with the Marketplace and an email to ClearSky |
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

## Launch — how a tenant gets it

1. Merge and deploy. `/workspace` is served on every host at once; nothing
   routes to it yet.
2. Try it: `?home=workspace` on any signed-in visit sticks for that browser
   (`localStorage.omega_home`); `?home=classic` undoes it. Staff and a
   friendly tenant first.
3. Flip a tenant: set `omega_orgs/{org}.shell = 'workspace'` (the console's
   structural field). `index.html` sends that tenant's signed-in visits to
   `/workspace` (`OmegaWorkspaceShell.wantsWorkspace`, the one rule), the
   legacy pages point Dashboard at it, the session travels same-origin.
4. When every live tenant is flipped, `index.html` becomes the sign-in card
   and nothing else. Not yet.

Render check: `npm run check:workspace` (four tenants on the Firebase
double, desktop and phone). Run it, and `check:dashboard`, after any change
to the page, the shell or the runtime they load.

## Not built (honest list)

- The **marketplace as the package store**: `marketplace.html` still lists
  tools to pin. The plan is modules from `api/package-catalog` with server
  prices, "Add to plan" through `plan-change` for a packaged tenant.
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
- The projects and marketplace pages keep their own TOPBAR (tenant chip,
  tabs, avatar) and their own page layout; only their rail, ground and home
  link are the workspace's. Adopting the shell's topbar there is the next
  consistency pass.
