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
  numbers are projects in flight (the board's own set, every project not yet
  online; new this week, else how many are past candidate), awaiting your
  review, pipeline capex (what Site Map's Run costed: the editor's
  `omegaRunRollup` writes the run's Total install, incentives, year-one
  revenue and placed battery onto the record as `capex`, `incentive`,
  `annualRevenue`, `bessKwh`/`bessKw` with `capexAt`/`capexSource`, saved
  at once; a figure entered by hand or backfilled stands until a run prices
  the site; online sites apart; a project nobody priced is counted as "not
  priced yet", never as $0, and a pipeline with nothing priced reads "—";
  `scripts/tests/tcostrollup.js` holds both ends), and a fourth that fits the workspace:
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
  invoices with their pay links, worded for the rail each is on
  (`payWith`: Stripe or QuickBooks), the next invoice, paid through,
  *I've paid* = reconcile-now for an owner or admin; Stripe's open
  invoices for a Stripe-billed legacy plan; and, for a plan billed outside
  the engine on the Stripe rail, **Pay $X with Stripe** for the amount
  ClearSky set as due: one Stripe invoice per due date and amount, paid on
  Stripe's hosted page with the card on file or a new one, then its page
  and **I've paid** until the webhook or the check records it once);
  *Payment method* (**linked to Stripe**, Tommy 2026-09-27: "This payment
  method should be linked to the stripe payment system we built with
  quickbooks. Stripe collects and takes the payment and sends it to
  quickbooks which is our account". Every plan billed outside the package
  engine that ClearSky does not invoice through QuickBooks, and a package
  on the Stripe rail, has its card with Stripe: `POST /api/stripe-customer`
  on `api/_lib/stripe-customer.js` reads the card on file back from Stripe
  (brand, last four, expiry; never stored), **Add a card with Stripe**
  links the workspace's one Stripe customer the first time and opens the
  portal's add-a-payment-method flow (the card becomes the default for
  invoices), and **Invoices and receipts** is the portal; each is Stripe's
  own page in this tab, back to `/workspace#billing`. A QuickBooks plan
  saves the card on QuickBooks' own invoice payment page with Autopay;
  card details are never entered on our pages, and a workspace with a
  billing record never reads "No billing account yet". The books:
  Stripe's payments reach ClearSky's QuickBooks through the Connect to
  Stripe app, never through OMEGA; `docs/PAYMENTS-STRIPE.md`); *Billing
  history* (the engine's invoices from `GET /api/plan-change`, which every
  verified member, and an active client's owner or admin, may read; a
  Stripe plan's own from `POST /api/stripe-invoices`, whose rows say who
  made each: one made by hand in the dashboard or the amount due paid by
  card is the plan's; one the engine made there is listed once, from its
  own record, never by Stripe's status; and a purchase withdrawn before
  anything was paid is not history). What a legacy plan owes is its TIER
  (ClearSky's `amountDue`, or the invoice Stripe already holds open for
  it) beside the MODULES it bought by card (the engine's unpaid add-on
  records); an engine-made invoice left open on Stripe never stands in for
  the tier (Concord, 2026-09-28). *Changes in progress* (a
  packaged change waiting for payment or queued for the review, a legacy
  add-on waiting for payment or ending, a recorded opt-in or opt-out, each
  with when and by whom it was asked) are listed between them, read from
  the same `moduleCard` as the Modules page, so a request the plan has
  already answered is never shown.
- **Opt in and Opt out, never Ask.** Every module not held carries **Opt
  in** and every optional held one **Opt out**: one card and one action per
  module on the Modules page, through the one menu; see *Modules, opt in
  and opt out* below. A packaged workspace pays the server's quote on the
  invoice's own page. A workspace on a legacy plan (billed outside the
  package engine: a tier on Stripe's or ClearSky's paper, often a contract)
  opts in BY CARD where its plan can switch the module on exactly (Tommy,
  2026-09-27: "these should allow me to buy them immediately and not email
  clearsky it should allow them to add to plan and then charge their credit
  card or saved payment method"): the module joins the plan as an ADD-ON,
  its own monthly line on its own QuickBooks invoice, and the plan
  underneath and its billing stay exactly as they are (see *Opt in by card
  on a legacy plan* below). Everywhere else a legacy Opt in or Opt out is a
  request recorded with its price that ClearSky confirms. Self-serve
  conversion of a whole legacy plan onto a package is NOT built (below).
- **A request is filed on the role alone** (Tommy, 2026-09-27: "i want it
  to opt in and out, this needs to work"). A request grants and charges
  nothing, so an owner or administrator files one without a verified
  email: `POST /api/plan-change` `opt-in`, `withdraw-opt-in`, `opt-out`,
  `withdraw-opt-out`, `request-removal` and `withdraw-removal` check the
  role and the workspace (a missing org status reads active; pending,
  suspended or cancelled refuse), and the record, the history and
  `admin_audit` rows and ClearSky's mail say whether the email was
  verified (`emailVerified`). Quoting, paying, switching on, add-on stops
  and the summary need a verified email, or an owner or administrator of
  an active client (`admin.clientAdmin`, below). A member is told who
  files them. A legacy opt-out's dry run carries a `previewId`; applying
  a different one is refused ("review the opt-out request again"), so
  what was confirmed is what is recorded.
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
  opting out, or bought and waiting on the invoice) first, then the rest to
  add, each in shelf order on one grid, so a shelf of one never leaves a
  row empty; the plans shelf closes the page (`#plans`; Enterprise reads
  *Contact for pricing* with **Contact ClearSky** and no figure, as
  `/api/offerings` and the price page do). A card is the
  letter on its shelf's colour and its status, the name with its price
  line, three things it does, where it lives, the tools inside as chips,
  what it needs, then the note with its one action. Every word fits its
  card: the name wraps and the price drops under it, a chip wraps inside
  the card; `check:workspace` measures every card from 1366px to a 360px
  phone and fails on anything outside or clipped.
  `OmegaWorkspaceHub.moduleState` decides what a workspace holds (the ONE
  rule, below) and `moduleCard` turns it into the card. A packaged
  workspace's prices are `/api/package-catalog`'s; a legacy one's the
  public price list's (`/api/offerings`), each asked once. Change plan on
  the plan strip opens the page for every workspace.
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
  it and offers Opt in on that module and its card on Modules. The plan
  strip says what the workspace holds and how many tools are open.
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
- **Around you**: the workspace feed (messages, project saves and
  assignments), People (presence from the later of `team_members.lastSeen`
  and the person's last message: in the workspace under 15 minutes, seen
  within a day, else last seen), Partners on your projects (the other orgs on
  `orgsInvolved`), Guides. Each is an opt-in kept on
  `dashboard_layouts/{org}__{uid}.workspace`. The feed names a person only
  where the record says who (2026-09-27: the feed said "js moved Sunnyside
  to Candidate 11d ago" while People said js was last seen 27d ago). A
  project save records when, not who (no project writer sets `updatedBy`),
  so it is the project's own line ("Sunnyside was saved · Candidate"),
  never its owner "moving" it; an Assign made here records `assignedBy`
  and is credited ("You assigned Quarry Road to Raj Patel"). The plan's
  chips under the hub name the modules the one card rule calls Live, never
  raw add-on keys.
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
| included | Live · always included | none | Omega Design (`lite`), the floor |
| awaiting | Waiting for payment | Pay, Cancel request | a change invoice for it is open (packaged; paid on the invoice's own page, Stripe or QuickBooks as its `payWith` says), or the add-on invoice that buys it (legacy, by card; paid in QuickBooks) |
| bought | Bought · not on yet | Pay now | in the subscription, not on until the invoice is paid |
| removing | Opting out | Cancel request | packaged: queued for the quarterly review; legacy: an opt-out request with ClearSky; a card add-on: on until the end of the month paid for, not renewed |
| live | Live | Opt out | on the plan (a card add-on says "Add-on · paid by card, renews on …"; while its renewal waits for payment it reads Waiting for payment with Pay, and opts out once that is paid) |
| requested | Opt-in requested | Cancel request | a legacy opt-in waiting on ClearSky |
| part | Partly included | Opt in | some of its tools / Site Map commands are on the plan |
| available | Not on your plan | Opt in | the rest |

A member (not an owner or administrator) and a staff preview see the status
and "An owner or administrator of … changes modules", no button (a member
may still open a Pay link). A workspace awaiting approval opens nothing.
`card.via` says whose path a change takes: `package` (the engine), `addon`
(a legacy plan's card add-on) or `request` (a legacy plan's recorded
request).

**Every action is the one menu** (`omega-package-menu.js`, "The Ladder")
opened on that module with `{ single: true, intent }`: it skips the first
click and states the money before anything is written. Pay words follow
the rail the invoice is on (`billing-driver` `payWith`: "Pay in Stripe" or
"Pay in QuickBooks"); an add-on's Pay reads the add-on's own `payWith`,
which is always QuickBooks, never the package's.

- Packaged **Opt in** → `plan-change` `quote` (today, then, activation) →
  "Opt in and pay" (`apply`, an invoice on the workspace's rail; on when
  paid) or "Turn it on" for a $0 addition inside a paid tier.
- Packaged **Opt out** → `request-removal` dry run → "You keep X, and keep
  paying for it, until your review on <date>. From then your monthly fee
  goes from $A to $B (both as priced on the review day, with Y already
  leaving then too). No refund for time already billed." → Request opt-out.
  The review date is the subscription's start plus whole 90-day periods
  (`book.policy.reviewDays`). Both figures are priced at the end of the
  review day, so a transformation credit counts only if it still runs then,
  and "after" takes out every opt-out already queued for that review
  (`alsoLeaving` names them); the staff `removalAlert` carries the same.
- Legacy **Opt in** → `addon-quote` first: the server says whether the
  module can be bought by card now. `canBuy` → the quote (today, then,
  activation, "Also adds X, which M needs."), the billing contact once if
  there is none (the signup form, `/api/billing-profile`), then "Opt in and
  pay" (`addon-buy`: the QuickBooks invoice, its payment page opened on the
  click) or "Turn it on" when it is included. `request` (not exact, or card
  payments not open yet) → `opt-in` dry run (priced from the book, with the
  server's reason) → Request opt-in, recorded on `billing/current.optIns`.
  Anything else shows the server's reason and Not now.
- Legacy **Opt out** of a module its plan includes → `opt-out` dry run
  ("Your plan's price is set by your agreement, so nothing changes today …
  Omega Design stays.") → Send opt-out request, recorded on
  `billing/current.optOuts`; the tier, add-ons and toolAccess are never
  touched. Office takes every Omega Logic department with it when the
  workspace holds the add-on. The recorded opt-out refuses a card add-on.
- Legacy **Opt out** of a card add-on → `addon-cancel {remove}` dry run
  ("X stays on until <date>, the end of the month you paid for, and is not
  renewed. Your add-ons then cost $A (now $B). No refund for time already
  paid.") → Opt out; Office takes the add-on departments that need it.
- **Cancel request** → `cancel` (a pending change), `withdraw-removal`,
  `withdraw-opt-in`, `withdraw-opt-out`, `addon-cancel {addOnId}` (an add-on
  purchase still unpaid) or `withdraw-addon-cancel` (keeps a card add-on it
  was stopping): "Nothing about your bill changes." A legacy withdrawal is
  priced first by its own dry run, which names everything it takes back: an
  opt-in cancelled takes the requests that need it AND the prerequisites it
  pulled in (`asked: false`); an opt-out cancelled keeps what that module
  needs.
- A legacy **Opt out** of a module whose opt-in is still open (ClearSky met
  it with a tier or add-on edit and never answered it) closes that opt-in
  in the same write; the dry run says so (`closes`).
- **ClearSky answers a legacy request by hand** from the admin Package tab
  (`plan-change` `resolve-opt-in` / `resolve-opt-out`, staff only): an
  opt-out done or declined, an opt-in activated or declined, recorded with
  who and when, history and audit. Activation answers every open request
  at once. A trial's preselection there is Omega Design plus what it asked
  for; any other legacy tenant's is what it holds and partly uses (its card
  add-ons included), plus its opt-ins, less its opt-outs and the add-ons it
  is stopping.

Every write is history plus `admin_audit`; opt-outs and removals mail
ClearSky (`optOutAlert`, `removalAlert`). Moving a legacy workspace onto a
package (the admin Package tab) marks each opt-in activated or declined and
each opt-out done.

**The Modules page agrees with Site Map: ONE legacy rule.** A legacy plan
holds a module when everything it carries is open on its plan: its
standalone tools AND its commands in the editor — the catalog's
`legacyGates` (the data-cap each command sits behind, read off the real
editor by `scripts/render-legacy-gates.js`, pinned by
`scripts/tests/tlegacygates.js`) asked of `canCap` from
`OmegaWorkspaceHub.editorCtx(caps, billing, who)`, the ONE mirror of the
tier Site Map runs (`OmegaCaps.resolve`: the record wins, a missing tier is
trial, `capTier` caps it, the JV by org, add-ons widen, a verified ClearSky
address with no record runs internal). It is pure over `OmegaCaps.canWith`
and never sets the library's own state. `legacyCtx` builds the whole ctx
once (the tools the org can see, the add-ons on now, the editor's half)
and `capsFor` is its no-person form; the Modules page, Plan & billing, the
marketplace's locks, the editor's plan chip, the admin Package tab and the
server's add-on check (`api/_lib/addons.js`) all ask it, so none of them
can disagree. Omega Design is always held, a card add-on on now is held,
an Omega Logic department is held by the `omega-logic` add-on or its own
card add-on, and a module with nothing to measure is held where the plan
opens everything. Some of it on is Partly, said by `moduleNote` from both
halves. A module says where it lives: "Inside Site Map, the editor"
(twelve of nineteen) or where else (Omega Storefront, Omega Sites, the
Omega Logic departments).

**Site Map shows how the workspace pays.** `omega-editor-plan.js` draws a
plan chip in the editor's `#portal-nav`: the plan (· Read-only / · Payment
due), a popover with the modules in Site Map and elsewhere, the monthly
figure and next invoice (`GET /api/plan-change`; a failure shows the plan
without figures), changes in progress, the read-only notice with its pay
link and *I've paid* (reconcile-now, then re-apply), and links to Plan &
billing and Modules in a new tab. A failed billing read leaves the plan
"unchecked": navigation stays, producing controls are hidden, Retry
re-checks without a reload (`OmegaCaps.retry()`; the editor strip's Try
again is `OmegaCaps.refresh`). The editor also re-reads the plan in place
on focus, every ten minutes and at `accessUntil`, so a module paid for
opens and one that lapses closes without a reload.

## The marketplace is the tools (again)

Tommy, 2026-09-27: "the marketplace should be the old tools that we had,
we are going to maybe retire that or phase it out but for now keep it".
`marketplace.html` is the tool catalogue for every workspace: every tool,
the categories, search and pinning, in the workspace chrome where the
workspace is home (`OmegaWorkspaceShell.wear()`) and in its own sidebar on
the classic home. It sells nothing. A locked tool names the module that
carries it (a packaged workspace's own catalog, else `GET /api/offerings`,
judged by the same `moduleState` on `legacyCtx`) and **See module ›** goes
to `/workspace#module-<key>`; on the classic home, which has no Modules
page, it opens the one menu on that module in place. Old store links
forward: `/marketplace.html#<module>` → `/workspace#module-<key>`, `#plans`
→ `/workspace#plans`. The plans shelf lives at the end of the Modules page.

## Opt in by card on a legacy plan (add-ons)

`api/_lib/addons.js`, through `plan-change` (owner, administrator or
verified ClearSky staff; a member reads). An owner or administrator of an
ACTIVE client needs no verified email, here, on `billing-profile` and on
the Stripe card door `stripe-customer`
(`admin.clientAdmin`, Tommy, 2026-09-27: "to opt in, we shouldn't need to
verify email... they are already a client and customer"): the role on
`members/{uid}` vouches, because only a person grants it, and a Team
invitation makes its account unverified. A plain member still reads only
with a verified email; a pending or suspended workspace, or one with no
record, still needs one; staff are unchanged. The card says Opt in; the
menu asks `addon-quote` and, where the plan can switch the module on
exactly, sells it as an ADD-ON (built as "Add to plan", #177). One engine,
the package engine's own parts: the book, the synced QuickBooks items
(`module:<key>`, `logic-bundle`), the QuickBooks driver,
`package-billing.reconcile` and the hourly runner; the engine's guard
decides whether a card can be taken at all (a closed engine says "Card
payments are not open for this workspace yet", staff see why, and the
quote answers `request: true` so the menu falls back to the recorded
request instead of a dead end).

- **Priced by the server**: the module and what it needs, at the book's
  list price, the five Omega Logic parts as the bundle once complete; the
  first purchase starts a monthly add-on cycle that day, a later one is
  prorated to it.
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
  is one), what ClearSky used to do by hand; its Site Map commands by the
  module itself: the editor opens exactly a live add-on's own commands,
  wherever they sit (`omega-caps.js` `addOnOpens`, from the legacy answer of
  `GET /api/package-access`: the add-ons on and the catalog's ribbon), and
  a legacy key only where another reader honours one (`addons.LEGACY`: the
  storefront's; never an editor key, which opens a whole tab).
  `addOns.granted` remembers what was written so switching off takes back
  exactly that, never a value staff set.
- **Never sold twice**: the server asks the pages' own rule
  (`OmegaWorkspaceHub.moduleState` on the tools catalog and the editor's
  own ladder, `omega-caps.js`, with the same `canCap` and `visible` the
  pages pass) before it prices, and live add-ons count as held there (a
  recorded opt-in never asks for one again, nor for what it needs).
- **Sold only when it switches on exactly** (Tommy's decision, 2026-09-27):
  a legacy editor opens Site Map a whole tab at a time (`data-cap`), so a
  legacy key would open every module on the tab (the Compute tab carries
  Intel's and Engineer's commands) or leave part of the bought one shut.
  The editor opens a live add-on's OWN commands instead and nothing else on
  their tab (`addOnLayout` hides the rest), and `addons.exact()` simulates
  exactly that on the pages' rule (`moduleEditor` with `editorModules`):
  every module bought must be held after, and no other module (Omega Design
  aside) may gain anything. So every editor module is exact on every legacy
  plan. What is still not exact (the storefront: nothing to switch on beside
  the plan, a reseller addendum) is not sold here: the quote says why
  (`request: true`) and the control offers **Ask ClearSky to include it**,
  the recorded request (`plan-change` `opt-in`: priced, on record, ClearSky
  told, nothing charged). Every Omega Logic department is exact on every
  plan (`logic-access` reads `addOns.live` itself).
- **Opt in in the editor** (Tommy, 2026-09-27: "it shouldn't be blank on
  the panel. It should say opt in and then allow them to add that as a
  purchase"): a ribbon tab the plan opens nothing on, where a module for
  sale has commands, is an Opt in in the strip and the phone's tab menu
  (`data-optin`); opening it shows those modules with the price and Opt in
  (`OmegaPackageMenu.optIn`), never an empty ribbon. On a legacy plan Opt in
  opens this purchase for the module (`addOnDialog` → `addOnControl`); on a
  package it opens The Ladder on it. Paid, the plan is re-read and the tab
  fills (`OmegaCaps.refresh`); a member is told who to ask (`canManage` on
  `GET /api/plan-change`).
- **The rail is QuickBooks** (`addons.RAIL`), whatever the package rail:
  under `PACKAGING_PROVIDER=stripe` a packaged workspace bills through
  Stripe (`billing-driver`), but a legacy plan's add-ons are still
  guarded, invoiced and reconciled as QuickBooks' (each record names its
  `provider`; each pending invoice, quote and purchase answers
  `payWith: 'QuickBooks'`), and a legacy Stripe tier's own customer and
  `paymentProvider` are never rebound. Add-ons on Stripe need a customer
  binding of their own (not built).
- **One purchase waits at a time**; a waiting purchase can be cancelled
  (Cancel request, `addon-cancel {addOnId}`; the QuickBooks invoice stays
  open until staff void it; a payment after a cancel or after its period
  is honoured and flagged for a person, as is one paid after the workspace
  moved onto a package).
- **Opt out stops it at the end of the month paid for**: `addon-cancel
  {remove}` (dry run first) records `addOns.ending[key]`; it stays on,
  the renewal on the add-on billing day leaves it out, and that day
  `settle` takes its grants back (history and audit
  `addon-ended-<date>`). No refund for time already paid. Stopping one
  Omega Logic part out of the five-part bundle re-prices the rest at list,
  so the dry run states the monthly figure before and after. Refused while
  a renewal is unpaid (pay it first). Cancel request before that day is
  `withdraw-addon-cancel`, which keeps it and what it needs.
- **Renewal**: the runner (`packagedLive` in production, `packagingSandbox`
  in the sandbox; the first purchase marks the organization) issues one
  invoice on the add-on billing day for everything bought and still kept;
  Autopay on QuickBooks' page charges it to the saved card. With nothing
  left it issues none.
- **Not here**: a legacy plan with no `omega_orgs` record or no billing
  record cannot be billed (the quote says so); a packaged workspace uses
  the Ladder; moving the whole workspace onto a package stays ClearSky's
  (the admin Package tab, which now also lists the add-ons). Built since:
  opening exactly one bought module's Site Map commands on a legacy plan
  (above), which made every editor module exact on every plan.

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
| Plan & billing | Add a card with Stripe · Change card | Stripe's add-a-payment-method page (the customer portal's flow), in this tab, back to `/workspace#billing`; the first time it links the workspace's Stripe customer |
| Plan & billing | Invoices and receipts · Manage card and invoices (Stripe) | the Stripe Customer Portal, in this tab, back to `/workspace#billing` |
| Plan & billing | Pay $X with Stripe | Stripe's hosted invoice page for the amount ClearSky set as due, in this tab; then its page and *I've paid* |
| Plan & billing | Pay · Open the payment page (QuickBooks) | the invoice's QuickBooks payment page, where the card is saved and Autopay turned on |
| In flight | Assign · Reassign | the side panel of the workspace's people; a pick writes the project's owner |
| tools grid | a Live tile | the tool, scoped to the org |
| tools grid | a Locked tile | the side panel naming the module that carries it, with Opt in (the one menu on that module, for an owner or administrator) and its card on Modules (`/workspace#module-<key>`); a tool no module carries offers the plans and an email to ClearSky |
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
| Modules page | Opt in · Opt out · Cancel request | the one menu on that module, the money stated first: a packaged workspace quotes and pays on the invoice's own page (Stripe or QuickBooks) or queues an opt-out for the review; a legacy one opts in by card where its plan switches the module on exactly (`plan-change` `addon-quote`, `addon-buy`: QuickBooks' page, a new card or the saved one, Live when paid; its Opt out stops it at the end of the month paid for) and otherwise records the request with its price (`plan-change` `opt-in` / `opt-out`) for ClearSky to confirm |

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
  plan buys exact modules as add-ons beside its plan (opt in by card,
  above) and records a request for the rest;
  moving the whole workspace onto a subscription package (re-pricing what
  its tier holds today) stays ClearSky's, from the admin Package tab,
  which opens preselected on what it holds plus its recorded opt-ins, less
  its opt-outs (`billing/current.optOuts`, no figure: a legacy price is
  the agreement's). Neither request changes access or a charge by itself.
- **One-click charge of a saved card from the workspace.** The card is
  charged on QuickBooks' own page (a saved card there pays in one click;
  Autopay pays renewals). Charging it from our server needs the QuickBooks
  Payments permission on a reconnect (roadmap §10.5 Step B).
- **A saved card shown by brand and last four from QuickBooks Payments.**
  Stripe's half is built (`POST /api/stripe-customer` reads the card on
  file back, never stored); a QuickBooks plan's page says where the card
  lives (QuickBooks' payment page) and never holds one. Reading it back
  from QuickBooks Payments is not wired. `billing/current.autopay` is
  shown when staff set it.
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
