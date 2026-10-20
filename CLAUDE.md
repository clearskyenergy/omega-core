# ClearSky-OMEGA — omega-core

Multi-tenant SaaS for BESS, EV charging, solar, microgrid and data-center
project development. ONE codebase serves every tenant. Read this file before
touching anything.

## Non-negotiable constraints

- **No build step, no bundler, no transpiler.** Tool files and the shared
  `omega-*.js` runtime are ES5 (`var`, `function`, callbacks/promises) so
  they run in every embedded/kiosk browser a field rep might have. Some
  core pages (projects.html, marketplace.html) and `omega-sso.js` already
  use ES2015 (`const`/`let`/arrows/async); match the file you are in and
  never introduce syntax that needs compiling (JSX, TypeScript, ESM
  imports that require bundling).
- **Single-file HTML tools.** Each tool is one `.html` with inline CSS/JS,
  optionally one companion `-logic.js`. No build step. No bundler.
- **Hosting:** GitHub → Vercel. Static files + `api/` serverless functions.
  One Vercel project, wildcard domain `*.clearskyomega.com` plus attached
  customer domains. Tenant is resolved from `location.hostname`.
- **Backend:** Firebase project `clearsky-portal`. Firebase Auth (Google +
  email) and Firestore. This is the ONLY database.
- **Tenant key:** `orgId` = the user's email domain, lowercased
  (`concordenergyusa.com`). This never changes. All data is scoped by it.
- **Firestore rules are the security boundary**, not the client. Anything
  the client hides must also be denied by rules.

## Clean core / extension model

```
/                       core pages (index, editor, projects, marketplace,
                        account-settings) + ALL tool pages at the root, because
                        omega-tools.js registers them by root path
/omega-*.js             shared runtime: sso, brand, TENANT (new), WHITELABEL
                        (new), tools, terms, assets, delivery, legal,
                        capacity-ledger…
/embed/                 the PUBLIC, unauthenticated storefront: one iframe-able
                        page + the loader a tenant pastes on their own site.
                        No Firebase SDK, no sign-in, no platform name.
/api/                   Vercel serverless; api/_lib/admin.js is the shared auth
/admin/                 master index (tools.csebuilders.com) — admin-console.js
/console/               ops console (alpha.clearskyomega.com)
/portals/finance/       financing marketplace (own product surface)
/shells/<vertical>/     dashboard shells per vertical (thin wrappers)
/tenants/<slug>/        tenant-specific extensions ONLY: custom index.html
                        shell (osa, solela), <tool>-ext.js, logos, tenant.json
                        seed, legacy config.js (fallback only)
/scripts/               audit + seed + backfill (never deployed)
/docs/                  design notes from the legacy repos
/workers/               Cloudflare worker (ComEd proxy)
```

Rules:
- Core files are never edited for one tenant. If a tenant needs different
  behaviour, add an extension point to core and put the behaviour in
  `/tenants/<slug>/`.
- A tenant folder may contain: a custom `index.html` shell, tool files,
  logos. It may NOT contain copies of core files.
- Extension points are registered in Firestore, not hardcoded.

## Firestore data model (control plane)

The live rules are in `firestore.rules` and `storage.rules` at the repo
root. They are ~1,000 lines with reasoning in the comments. READ THEM
before proposing any collection; most of what a feature needs already
exists. Never paste a second copy of a helper — every helper name is
unique and several (isAdmin, myRole, isPartner, pRole, tRole) look alike
and mean different things.

Control plane is built ON existing collections, not beside them:

```
omega_orgs/{orgId}                    # THE tenant record (existed; extended)
  name, slug, domains[], logoUrl, colors{}, exportBrand{}
  vertical: 'oem' | 'developer' | 'epc' | 'installer'
  shell:    'default' | '<vertical>' | '<tenantSlug>'
  status:   'pending' | 'active' | 'suspended' | 'cancelled'
  receivesFullBom: bool
  defaultLayout, createdAt, approvedAt, approvedBy
omega_orgs/{orgId}/billing/current    # ClearSky writes, tenant reads
  tier, addons[], toolOverrides{}, trialEndsAt, subscriptionDue,
  amountDue, lastPaidAt, paymentProvider, stripeCustomerId,
  paymentLink, autopay
omega_orgs/{orgId}/members/{uid}      # in-org roles
  email, name, role: owner|admin|member|viewer, status, toolAccess[]
omega_orgs/{orgId}/layouts/default    # org-level starter dashboard

tools/{toolId}        (existed)  + minTier, addon, category, verticals[]
widgets/{widgetId}    name, description, minTier, verticals[], enabled
verticals/{v}         label, defaultWidgets[], defaultTools[]
equipment/{sku}       (existed)  + vendorOrgId, category

opportunities/{id}                    # editor-generated, anonymous parent
opportunities/{id}/private/contact    # identity; vendor reads after reveal
rfqs/{id}                             # customer's full BOM
rfqs/{id}/recipients/{vendorOrgId}    # each vendor's slice + quote

omega_orgs/{orgId}.whiteLabel         # what the PLATFORM is called here
omega_orgs/{orgId}/storefront/config  # published products + copy + cost basis
omega_orgs/{orgId}/storefront/counters# the durable daily order limit
embed_keys/{omega_pk_…}               # a publishable key = ONE installation
embed_configs/{id}                    # a designer's published quote, snapshot
orders/{id}                           # tenant sells, ClearSky fulfils
customer_quotes/{qt-…}                # a seller's proposal to its own customer (Admin SDK only)
hosting_cache/{id}                    # published hosting capacity per point (Admin SDK only)
```

Already-existing role/identity collections — use, don't duplicate:
- `omega_staff/{uid}` — ClearSky roles (admin | rep). isOmegaStaff().
- `org_members/{emailLower}` — cross-org grant for an OUTSIDE person to
  act in one tenant. canActInOrg(). Not the same as omega_orgs/members.
- `referrals` — human-initiated quote request (FENECON inbox). Stays.
- `omega_users`, `omega_partner_orgs`, `deals`, `verifications` — the
  PARTNER PORTAL. Separate product surface; `p`-prefixed helpers.
- `fin_*`, `mkt_*`, `vdc_*` — financing, distribution, VDC marketplaces.

Rules for new collections: `firestore.rules.control-plane.addendum`
(three paste-in blocks: helpers, omega_orgs replacement, new
collections). Apply, deploy, then grep the LIVE rules for
`isTenantAdmin` and `opportunities`.

Existing data collections (do NOT rename or restructure): `projects`,
`team_members` (id `<orgId>__<email>`), `dashboard_layouts`
(id `<orgId>__<uid>`), `fin_projects`, `intake_projects`, `equipment`,
`toolData`, `termsAcceptances`, `legal_acceptances`, `prefs`,
`project_tasks`, `sites`, `capacityAllocations`, `circuitCapacity`.

Org aliasing: `orgAlias()` in BOTH rules files folds fenecon.de/.us →
fenecon.com. Clients that filter on orgId (omega-capacity-ledger.js,
clearsky-sitefinder.html, omega-referrals.js) mirror it. Adding a tenant
alias means editing all of them; core must expose ONE alias map that
those clients import.

**An individual on a personal address** (2026-10-14, Tommy: "it needs to be
able to link tenants to a domain but if there is an individual that is just
them they need to be able to do that"): a company stays keyed by its domain;
a workspace for a person on a public provider (gmail.com…,
`api/_lib/public-domains.js`) is keyed by its host SLUG (`personal: true`,
`ownerEmail` on the record) because one keyed gmail.com would hold every
Gmail user. The person is HOMED to it by the `orgId` custom claim that
`api/set-role.js` mints through `logic-members.change()` (set for the
tenant's own domain or a personal address, `A.isPersonalEmail`, never a
staff or partner address). ONE order everywhere, the claim then the email
domain: `userOrg()` in BOTH rules files, `admin.js authenticate()`,
`verify-token.js`, `omega-tenant.js` `homeOrg` (read off the token before
entitlements), the editor's `_projOrgId`, the editor gate, projects.html
and `omega-tools.orgFromUrl`. The console's New tenant takes an ADDRESS in
the domain field: `GET /api/set-role?email=` (staff) says whether it is
personal, the three documents are written, then set-role makes the person
the owner (the account is made if there is none). A workspace owner or
admin may add a personal address on Team and set-role the same way.
`scripts/tests/thomeclaim.js` holds all of it.

## Access rules (summary)

| Doc                              | tenant owner | tenant admin | member | ClearSky staff  |
|----------------------------------|--------------|--------------|--------|-----------------|
| omega_orgs/{org} branding fields | write        | write        | read   | write           |
| omega_orgs/{org} status/vertical | read         | read         | read   | write           |
| billing/current                  | read         | read         | read   | write           |
| members/*                        | write (any)  | write (≤admin, not owner) | read | write |
| layouts/default                  | write        | write        | read   | write           |
| tools, widgets, verticals        | read         | read         | read   | write           |
| opportunities (as vendor)        | quote        | quote        | read   | all             |
| opportunities/*/private          | after reveal | after reveal | —      | all             |
| rfqs/*/recipients (as vendor)    | quote        | quote        | read   | all             |

Roles: Firestore `members` doc today; Firebase custom claims (`role`,
`orgId`) via `api/set-role.js` once it lands, so Storage rules and
`api/` functions can check them too. Tenant `status` gates sign-in in
`omega-sso.js` first; wiring `tenantActive()` into `/projects` read is a
SEPARATE deploy after `omega_orgs` is seeded for every live tenant.

## Tool gating

Effective tools for a user =
  tools where `billing.tier >= tool.minTier`
  ∪ tools where `tool.addon ∈ billing.addons`
  ∪ `toolOverrides[toolId] === true`
  − `toolOverrides[toolId] === false`
  ∩ `member.toolAccess` if set
`omega-tools.js` computes this on boot. Rules enforce the same on each
tool's data collections.

The editor's internal fallback requires a literal `emailVerified === true`
from its Firebase user and the `clearsky-usa.com` domain. An existing billing
record still wins. Packaging has one server catalog (`api/_lib/modules.js`) and proposed,
disabled price book (`api/_lib/pricebook.js`). `api/package-catalog` returns
authorized projections and server quotes. Packaged records use the server access projection introduced in Phase 2;
unpackaged records keep legacy gates. Do not enable packaged billing before
full editor, server-engine, write-rule and billing lifecycle validation. See `docs/PACKAGING-ROADMAP.md`.

Phase 4 adds private signup billing profiles, reviewed staff package activation,
server-priced sandbox invoices and paid reconciliation. New trials start at
approval, once per organization and at most 14 days. Annual prepay uses the
10-month price (two months free) without transformation credit. Packaged billing/profile writes
are Admin SDK only. API and rules enforce the recorded access deadline;
legacy tier edits cannot modify a packaged subscription. An owner or
administrator of an ACTIVE client manages its own plan and billing without
the email link (`admin.clientAdmin`, 2026-09-27, Tommy: "this verified email
thing makes no sense"): plan-change, billing-profile, the Stripe card door,
package-catalog (the priced menu), tenant-package and a proposal's accept.
Everything else still asks for the link: creating a workspace (it claims a
domain), a member, the packaged tools (`package-access`), Omega Logic,
`tenantReader()`, a buyer's portal, staff. Staff authentication
requires a literal verified ClearSky domain even with an old role claim.
Flags remain off by default; see docs/PACKAGING-PHASE-4-VALIDATION.md before
any sandbox enablement or release.

Phase 5 separates what a tenant BOUGHT (`billing/current.subscription`) from
what is switched on (`billing/current.modules`); `POST /api/plan-change` is
the one door for a tenant's own additions (pay first, prorated; a $0 addition
inside a paid tier switches on at once). Phase 6: the Subscription Proposal
(`subscription-proposal.html`, `proposal.html`, `api/subscription-proposal.js`
on `api/_lib/subscription-proposal.js`) and the signup discovery in
`start.html` share ONE set of questions, ONE recommendation and the price
book; `subscription_proposals` is Admin SDK only; accepting a proposal never
prices anything — signup, plan-change or activation do. `api/_lib/deck-brand.js`
is the one brand-of-a-deck rule (Pro Forma and proposal). Phase 7:
`api/_lib/usage.js` is the ONE usage counter (`omega_orgs/{org}/usage/{cycle}`,
Admin SDK only, idempotent by client id): a metered deliverable is counted
where it is produced (`POST /api/usage` from the browser tools, server-side
in `rfq.js`), the allowance is included + packs, overage is billed on the
recurring invoice, and packs and auto top-up go through `plan-change`. It is
an honest billing counter, not a security boundary. Phase 8: **Omega Logic
follows the package.** A packaged tenant (`billing.packaged`) is judged by
`modules[]` alone — Office is `logic-office`, the parts are `logic-plant`,
`logic-materials`, `logic-logistics`, `logic-customer` — and the grant must be
live (`package-access.live`, the editor's own rule). `logic-access.authorize(c,
org, write, part)` refuses a part not bought; `parts(ctx)` is what the office
endpoint (`access.parts`), the front door and the customer-portal gate
(`buyer-accounts.context`) report, and what the chrome, the hex hub, the
dashboard and the Omega Logic app draw. A legacy tenant (addon `omega-logic`)
is unchanged and holds every part; one without it holds the parts it bought
by card as add-ons while they are paid (`addons.live`, below); absent means
"everything", a present list is the package. Showing a link is never access. Phase 9: a door that is not
a member's (the bench and rig tokens, a tenant admin's hold/release) runs
`requirePartIfPackaged(org, 'plant')` — a packaged workspace must hold the
part, a legacy or unrecorded one keeps its own rule — and `firestore.rules`
compares a sign-in email lower-cased in the team blocks, `termsAcceptances`
and `isAdmin()` (`scripts/tests/tsigninemail.js`), as `admin.js` does.
Phase 10A: **one system, QuickBooks.** A company signs up, pays its first
invoice by card on QuickBooks' page and is in; `GET /api/offerings` is the
public price list; signup's pay-now runs the engine's own `activate` with the
caller marked `selfServe` (recorded in history and audit); "I've paid" is
`plan-change.reconcileNow` (one look per eight seconds), from the signup
page (`check-payment`) and the billing bar (`reconcile-now`) alike. The
flow as sold is a GUIDED RUN on a stepper (2026-09-27, Tommy: "less
questions … a guided system or that they can skip … flawless … fun"):
account (login.html) → *What does your team do?* (the twelve questions as
one screen of tiles, `short`/`hint` on each question in
`api/_lib/subscription-proposal.js`; a tapped tile is "this quarter"; a
dock shows the server's own recommendation, priced, as they tap; or Skip,
which sends no answers) → *Your system* (the one menu, priced live by the
server; Monthly, or Yearly at ten months of twelve; the first-year service
fee named as the server priced it) → *Confirm email*, only while the
address is unconfirmed → *Billing & pay* (the short form,
`OmegaBillingProfile.render(…, { compact: true })`: the optional fields
folded under More billing options) → pay. A package named by the offerings
page (`?modules=`, `?plan=`) or a proposal skips the question screen. There
is no company screen (2026-09-28, Tommy: "i want whats in the slide show"):
a signed-in visit goes straight into the run, and the workspace is named
after the billing form's Legal company name; only a proposal link and a
server without packaging keep that form. **Create an account IS the signup
page** (2026-09-28, Tommy: "when we click create new account it should go
to the page that is the start and helps them purchase and buy an account
and pay for it and create their account"): login.html has no account form
and makes no account; its button goes to `/start.html`, whose FIRST step
makes the account (work email and password, or Google; a personal address
is refused before one is made; an address that already has an account
signs in from the same button, so the verification link and a proposal
link open the page in any browser), and the address typed on the sign-in
page is carried in this browser only (`omega:signup-draft`), never in a
link. Making the account signs it in and the hub routing on the page takes
it from there (a colleague of an existing workspace goes in). The options
and quotes open before the email link is clicked, and only creating the
workspace (Subscribe, the trial, or the reviewed request when packaged
signup is off) needs the verified address: its step moves on by itself,
and the draft keeps the taps, the system and the step, so the link
reopening the page resumes there. A signed-in person with no `omega_orgs` record,
grant or access request, not a named tenant, and without both accepted
terms and a project under the company, is sent there too instead of a
derived workspace; `scripts/render-signup.js` (in `check:pages`) holds it.
Annual prepay is `annualPaidMonths` = 10 in the book.
`api/_lib/packaging-mode.js` is the ONE rule for where packaging bills:
SANDBOX (`QBO_ENV=sandbox`) or LIVE (`PACKAGING_LIVE=true` AND
`QBO_ENV=production`, both literal), and neither is refused everywhere; the
engine guard, `qbo-items.guard` (every QuickBooks write), the price book,
signup, the runner and both scripts read it — never a second copy. A book
whose version ends in `-proposed` is never production; sign-off is renaming
`VERSION`. Signup and every activation mark the organization `packaged: true`
(the live runner's query). The card button on a QuickBooks invoice is
QuickBooks Payments, not Stripe: `docs/PAYMENTS-BROWSER-SETUP.md`.

Phase 10C (2026-09-27): **Stripe is the rail Tommy chose** ("a customer
creates an account, they add billing and that's all done through Stripe, and
once they do that it needs to allow them to use what they paid for"),
switched on by `PACKAGING_PROVIDER=stripe` (literal; unset keeps QuickBooks,
because production was already taking pay-now signups through QuickBooks and
a merge must never move a live money path). `packaging-mode.js` now answers
per provider: Stripe is SANDBOX on a test key and LIVE only under
`PACKAGING_LIVE=true` with a live key; QuickBooks keeps its `QBO_ENV` rule
above. `api/_lib/billing-driver.js` is the ONE place that
says which rail a workspace bills through (its customer record decides, so a
QuickBooks-billed workspace stays there) and what its records are called;
the engine, plan-change and the billing profile never name a provider.
`api/_lib/stripe-billing.js` answers the same `customer`/`invoice`/
`reconcile` as `qbo-billing.js` with server-priced invoice items on a
`send_invoice` Stripe invoice (Stripe's hosted page is the card page), and
`api/stripe-webhook.js` answers an OMEGA package invoice FIRST by running the
engine's own reconcile, so paid means open within seconds; the runner and
"I've paid" are the same reconcile. A legacy Stripe tier's
`stripeCustomerId` never binds a package. QuickBooks-rail tests set
`PACKAGING_PROVIDER=quickbooks`; the Stripe rail is
`scripts/test-stripe-billing.js` on `scripts/_lib/stripe-double.js`.
Runbook and what is not built (autopay, instant refund events, tax):
`docs/PAYMENTS-STRIPE.md`. Where a deployment stands is read from OUTSIDE,
with no credentials: `npm run check:production` (`scripts/check-production.js`,
`scripts/tests/tcheckproduction.js`) reads the rail off `/api/offerings`
(`signup.payWith`), the seeded book against the code's `VERSION`, that the
billing routes are deployed and guarded, and that the billing pages served
hash to the tree; `--expect-stripe` is the go-live check (2026-09-28).

Billing review rules (2026-09-27, adversarial review of both rails; each is
pinned by a test that fails without it): a reversed cycle is superseded by
a LATER cycle paid in full, and any paid invoice (cycle or add-on) that is
reversed tells a person once; reconcile READS an invoice issued under an
earlier price book (only issuing needs the current `VERSION`), pages the
runner by document id, and keeps a newer verdict over a stale read; the
runner (`scope()`) bills when either provider is open and live when either
is live, and `packagedLive` follows the workspace's own provider; under
`PACKAGING_LIVE=true` a test key is closed, never a sandbox, and a Stripe
test-mode grant is never honoured. A cancel never leaves a second payable
invoice beside the first: on Stripe it voids the invoice; on QuickBooks the
same request the same day revives the cancelled change or add-on on its
invoice and another id is refused while that invoice is open. A paid
change or add-on on the billing day waits for the renewal. A package binds
only its OWN Stripe customer (`legacyStripeCustomerId` keeps the tier's),
the webhook's tier path never writes to a packaged workspace (it flags an
old subscription still charging), and a paid package invoice with no OMEGA
record is answered 500 and flagged, never absorbed. A partial refund stays
paid with a review; a dispute is decided by its outcome (lost reverses).

Plan & billing's Payment method is **linked to Stripe** (2026-09-27, Tommy:
"This payment method should be linked to the stripe payment system we built
with quickbooks. Stripe collects and takes the payment"): `POST
/api/stripe-customer` on `api/_lib/stripe-customer.js` is the ONE door for
a workspace's card and, for a plan billed outside the engine (not
`paymentProvider: 'quickbooks'`), the amount ClearSky set as due. Add a card
links the legacy tier's own `stripeCustomerId` once (a Stripe TEST key
only for a `packagingSandbox` workspace, because the one database is
production's; a binding made in the other mode is never overwritten) and
opens the portal's add-a-payment-method flow, back to `/workspace#billing`;
the card is read back from Stripe, never stored. What you owe on a legacy
plan is the TIER (ClearSky's `amountDue`, or the invoice Stripe already
holds open for it: hand-made, or the one Pay with Stripe made) beside the
MODULES bought by card (the engine's unpaid add-on records); an invoice the
engine made on Stripe (`/api/stripe-invoices` `omega`) is judged by its own
record, never by Stripe's status, never listed twice, and never stands in
for the tier, and `pay` never mistakes it for the plan's invoice (Concord,
2026-09-28: a withdrawn $500 opt-in read as what was owed and the $1,299
plan vanished; a purchase withdrawn before anything was paid is not
history). Pay $X with Stripe is one
`send_invoice` invoice per due date and amount (`metadata.omegaDue`),
recorded once by the webhook (answered before the tier path) or I've paid;
`subscriptionDue` stays ClearSky's. A package keeps the engine's rules.
An owner or admin of an ACTIVE client needs no verified email here either
(`admin.clientAdmin`, as on `plan-change`). Stripe → QuickBooks is the Connect to Stripe app, never OMEGA (that would
book it twice). `scripts/test-stripe-customer.js`.

**A negotiated tier price** (2026-09-28, Tommy: "the cost of the account
should then reflect in the page in my admin console but i can override it
if they are on a tier otherwise they pay for what they add"): staff may set a
plan tier's (Field, Pro) monthly price by hand, with a reason, on the Package
panel — `priceOverride: { plan, amountCents, listCents, reason, by, at }` on
`billing/current`, written only by approve/activate (`tenant-package`,
`tenant-approve`, staff) and cleared by an activation without one. In
`subscription-pricing.js quote()` it replaces THAT tier's list price and
nothing else: Omega Logic, extra logins, the credit and the floor stay as the
book has them (they pay for what they add); Lite + modules is never
overridden; on any other plan it does not apply; under `plan: 'auto'` the
tier competes at its negotiated price. Every re-quote reads it off the RECORD
(`Policy.invoice` for the first invoice and each renewal, `displayAfter`,
`plan-change` quote/apply/summary, a customer's own `package-catalog` quote);
a customer body never names one (`package-catalog` accepts it from staff
only; `plan-change` refuses the field). The plan line reads "Field
(negotiated)" and keeps `listCents`; the account page's Payment card and the
panel's standing strip say who set it and when. A legacy plan's terms
(Amount due, Next payment…) already are its override. Held by
`scripts/test-subscription-pricing.js`, `test-package-activation.js`,
`test-plan-change.js`, `test-package-catalog-api.js`.

Module display names are Omega-branded (2026-09-27): `lite` reads Omega
Design, the Logic parts Logic Office/Plant/Purchasing/Logistics/Customer App;
`name`, `shelfLabel` (Core · Add-on · Plus · Advanced · By the piece · Omega
Logic) and `mark` (the card letter) live ONLY in `api/_lib/modules.js`, and
every page reads them off the record — never a page's own shelf map. Keys and
plan names (Lite + modules, Field, Pro) are unchanged; the table is in
`docs/VALUE-LADDER-PACKAGING.md`.

Packaged editor presentation uses the server catalog through OmegaCaps.
**Bought = visible** (2026-09-27): under a package the package is the only
thing that hides a tool. The project type (OmegaWorkspaces) puts its tools
and guided build first and hides nothing; "All tools" and the per-user
toggle are retired; Designer/Pro and the retired Compute mode do not apply
(the editor is always the full owned ribbon, a saved Designer choice is not
applied, and the legacy choice comes back if the package goes). The plan is
re-read in place (`OmegaCaps.refresh`) when the window regains focus, every
ten minutes and at `accessUntil`, so what is paid for opens and what lapses
closes without a reload; The Ladder has "I've paid" (reconcile-now) and
Show me, and the editor shows the server's billing notice. A LEGACY
workspace's modules tell the truth: `OmegaWorkspaceHub.moduleState` measures
a module by its standalone tools AND what the editor opens of it
(`api/_lib/modules.js` `legacyGates`, read off the real editor by
`scripts/render-legacy-gates.js`, asked of the editor's own ladder through
`OmegaWorkspaceHub.legacyCtx` on `OmegaCaps.canWith` / `capsFor`: the ONE
legacy rule, below); no legacy access changes. One legacy
narrowing, the owner's call (2026-09-27): Search tools (Ctrl+K) and Ask
Jarvis run only what `OmegaCaps.allowedElement` allows, which on a legacy
plan is every `data-cap` from the tab in to the command (a tier gates whole
tabs), and Jarvis names and opens only `OmegaCaps.tabOpen` tabs
(`render-legacy-gates.js`). So nothing is stranded behind a hidden tab,
Omega Design's drawing tool Move System lives on Draw on every plan, where
a package puts it: `LITE` in the Compute tab's mover, held to the catalog by
`scripts/tests/tlegacygates.js`. **Trace Boundary and Fence & Tie are Omega
Compute's** (2026-10-13, Tommy: "trace boundary and fence & tie is in the
draw panel but is made for the compute that should be moved"): `IDS.compute`
in `api/_lib/modules.js`, on the Compute tab's Site and Design groups on
every plan, behind the tab's `compute` gate on a legacy tier, and the
"Draw Site Area" and second Fence & Tie twins the tab once carried are gone
(`render-legacy-gates.js`, `tlegacygates.js`).
Omega Storefront (`whitelabel`, no tools, no editor commands) is held where
the public storefront's own gate opens it, never on the tier:
`api/_lib/storefront.js` `storefrontEntitled`, which `api/_lib/embed.js`
asks (a `toolOverrides` switch either
way, else the `whitelabel` add-on or the staff-written `whiteLabel.enabled`
on the tenant record); `OmegaWorkspaceHub.storefront` is its twin, run case
for case against it by `scripts/tests/tworkspacehub.js`.
**Opt in where the plan stops** (Tommy, 2026-09-27: "if there is something
that they don't have, it shouldn't be blank on the panel. It should say opt
in and then allow them to add that as a purchase ... linked to the module
... linked to the payment ... updates their bill"). A ribbon tab the plan
opens nothing on, where a module for sale has commands, is never removed
and never an empty ribbon: `OmegaCaps` marks it `data-optin="<modules>"`
in the strip AND the phone's tab menu (the page's own module first, by the
same `owners()` rule that hides; `markTabs` legacy, `layout()` packaged),
and `OmegaPackageMenu.optIn()` shows those modules, the server's price and
**Opt in** in its place. Opt in is the one purchase each plan already has:
a package opens The Ladder on the module (plan-change quote/apply, on when
paid); a legacy plan buys it as an add-on (`addOnDialog` →
`addOnControl`: addon-quote, addon-buy, QuickBooks' card page, I've paid;
monthly on its own invoice beside the plan). Paid, the plan is re-read
(`OmegaCaps.refresh`) and the tab fills; a member is told who to ask
(`GET /api/plan-change` `canManage`). The mark is an offer, never access:
the tab's commands stay shut and `tabOpen` still refuses it. A shut tab
with nothing for sale leaves the phone menu too (`data-tab-shut`); a
product mode (bess-lite) or Designer still hides a tab. Held by
`render-legacy-gates.js` (every tier, a bought add-on, a 390px phone) and
the packaged render checks.
The shared omega-package-menu.js renders catalog features and server-formatted
prices. Staff package previews are read-only server projections, never tenant
impersonation or billing edits. Legacy layout modes apply to unpackaged records.

## Self-serve signup (policy decided 2026-09-06)

Hub host `app.clearskyomega.com` serves `/start.html`. Sign in → if
`omega_orgs/{emailDomain}` exists, route to its hostname (colleagues
auto-join as `member`); else the form → `POST /api/tenant-signup` creates
the tenant `status: 'pending'` with a signup trial capped in code at 14 days.
The Phase 0 cap applies only to new signups; existing trial dates are preserved.
Packaging Phase 4 moves the one organization trial to approval, with first
billing at trial end (see `docs/PACKAGING-ROADMAP.md` §10). Work email only —
public providers in `api/_lib/public-domains.js` are refused. ClearSky
approves via `POST /api/tenant-approve` (master console button). A pending
tenant's users see a "being set up" screen from `omega-tenant.js`. Never
let a browser create `omega_orgs` directly.

Launch hardening (2026-09-26): **where a person is sent is ONE rule**,
`api/_lib/kit.js` `home(org, { wildcard })`: an attached hostname, else the
open host `silmarillion.clearskyomega.com`, and a `<slug>.clearskyomega.com`
host only under `TENANT_WILDCARD_LIVE=true`, because no wildcard record
exists; the slug host is only reserved on the record. `/start` runs the
hub routing on every host and never leaves the origin outside a hub. The
billing engine's own bookkeeping never cuts access: a reconcile error only
flags `reconciliationRequired` (401/403/429 and the guard are retried), the
live runner finds tenants by `packagedLive` and runs hourly, a paid
invoice mails the tenant (`paid`) and ClearSky (`paidAlert`), the driver
refuses to invoice while QuickBooks' custom transaction numbers are off.
`SUPPORT_EMAIL` (mail.js) and its literal twin in `omega-tenant.js` are the
only support address; csebuilders.com is never written again. See
`docs/PACKAGING-PHASE-10A-VALIDATION.md` (Launch hardening).

## Tenant resolution order (omega-brand.js)

1. Firestore `tenants/{orgId}` matched by hostname → `domains[]`
2. `window.CLEARSKY_CONFIG.tenant` from `/config.js` (legacy fallback)
3. Email-domain derivation on sign-in (zero-config)
Legacy `config.js` fallback stays until every tenant is migrated.

## Verticals

| key         | label                          | examples          |
|-------------|--------------------------------|-------------------|
| oem         | OEM & technology channel       | Fenecon, Joules   |
| developer   | Developers, owners & capital   | Walters, NextNRG  |
| epc         | EPC & engineering services     | CIR               |
| installer   | Installers & sales channel     | SunESol, Concord  |

New accounts boot with `verticals/{v}.defaultWidgets` (4–6 max). Users add
more from the palette; tenant admin can set an org-level default layout.

## Partner routing

- Placing a SKU with `vendorOrgId` in a project writes an `opportunity`
  with anonymised `public{}` only.
- "Request for Quote" in the BOM tool writes one `rfq`; recipients =
  every vendor with a SKU in the BOM (their lines only) + tenants with
  `receivesFullBom` (whole BOM).
- Identity is revealed only when the customer accepts a quote.
- Notifications via `api/notify.js` on write.

## White label

`omega-whitelabel.js` owns ONE question: what is the platform called here, and
what carries its mark? It wraps `OmegaBrand.platformName` and loads directly
after `omega-tenant.js`. A `whiteLabel` block on `omega_orgs/{orgId}` drives
it; `api/_lib/whitelabel.js` is the ONE allowlist of keys that may cross into
world-readable `tenant_public` (the login page has to paint before there is a
user). Do not add a second copy of that list — see what three copies of
`orgAlias()` already cost.

- `whiteLabel` is **staff-written**. It decides whether our name appears on a
  product we operate, which is a contract line item, not a tenant preference.
  `attribution` defaults to `'powered-by'` so removing our name is always a
  decision somebody made.
- `/embed/` is served to the PUBLIC with no token. Its gate is a publishable
  key plus an origin allowlist — **accounting and hygiene, not a security
  boundary.** What holds instead: nothing confidential is reachable, pricing
  and sizing are server-side and return results never inputs, an order is a
  request with `status` pinned to `new` that a human confirms, and there are
  rate limits. Read the header of `api/_lib/embed.js` before changing any of
  it.
- The site study (`api/embed-layout.js` + `_lib/site-fit.js`) is the one
  public call that COSTS MONEY — `api/parcel.js` reaches metered Regrid. It is
  gated on a named lead (an enquiry receipt), capped per org per day in a
  transaction, and a cache hit never spends the allowance. It is NOT
  `api/site-plan.js` and must not become it: that one demands a surveyed
  parcel and a confirmed service wall and would return `needs_input` to every
  visitor. A parcel record's owner name and APN are never echoed to the
  public page.
- A tenant's cost basis (`storefront.capexPerKwh`/`capexPerKw`) must NEVER be
  in the repo. `scripts/seed-omega-orgs.js` throws if a `tenant.json` carries
  either.
- A tenant's product list is imported with `scripts/import-products.js` from a
  CSV (`docs/product-list-template.csv` is the sheet to send them). It refuses
  a cost-basis column outright, converts `dimUnits` (datasheets print mm) and
  refuses an implausible footprint rather than drawing it, and REPORTS blank
  integration flags instead of taking them as "external".
- **ONE product list per tenant**: `omega_orgs/{org}/storefront/config.products`
  feeds the public storefront, the site study's footprints AND the editor's
  BESS Guided Build (`omega-bess-products.js` merges it into `BESS_CATALOG`).
  Its ENGINEERING fields — `inverter`, `transformer`, `disconnect`,
  `usableKwh`, `integrates{}` — are read only by the signed-in product;
  `api/embed-config.js` builds the public response key by key, which is the
  only thing keeping them private. Never replace that with a spread.
  The merge is ADDITIVE and namespaced by org: a saved project references a
  catalogue key, so a shipped entry is never removed or overwritten.
  - A row may be `kind: 'component'` — what a product is MADE OF, with a
    `bom[]` on any product or component (`api/_lib/materials.js`). It is
    never published, drawn, picked or ordered; every one of those surfaces
    drops the kind by name. The materials plan (`api/logic-materials.js`)
    explodes open demand through the bills and nets it against stock counts
    held under `fulfillment/`, which is closed to browsers; purchase orders
    (`purchase_orders/`, equally closed) move quantity on-order → on-hand
    through the same audited endpoint. A buy price lives ONLY in
    `fulfillment/suppliers` (supplier records + per-part prices, entered by
    the tenant's office through that endpoint): never in the catalog, never
    in a CSV — `import-products.js` refuses the column in both sheets — and
    never in a public projection.
- `orders` is read from Firestore and written ONLY through `api/orders.js`:
  "only ClearSky may price, but the tenant may always cancel their own" is a
  commercial arrangement and does not belong in a rules file.

- **The storefront is the taste; the designer is the next sale.** Size, site
  study and product order are open to anybody. The EDITOR is not:
  `omega-editor-gate.js` requires a signed-in user of an ACTIVE tenant, and
  the storefront only PITCHES the designer (a lead in the same `orders` queue,
  marked `interest:'platform'`). Do not add a public link into `/editor`.
- That gate **fails OPEN on a missing `omega_orgs` record**, exactly as
  `tenantActive()` does in the rules and for the same reason — every legacy
  tenant has no record until the seed runs. Only an explicit
  pending/suspended/cancelled, or `toolOverrides.editor === false`, refuses.
  Getting this backwards locks out every paying customer.
- The gate is a COMMERCIAL control, not the security boundary;
  `firestore.rules` already scopes every project read and write by orgId.
- `omega-storefront-handoff.js` still pre-configures the designer from
  `/editor?k=&sku=&qty=&addr=` for somebody who HAS an account. The gate
  decides, not the link.
- `editor.html` gets its white label from `OmegaWhiteLabel.hydrate()`, which
  reads `omega_orgs/{org}` directly. It deliberately does NOT load
  `omega-tenant.js`: that would bring the hostname lock to a page that
  currently boots anywhere. The lock is a real control and a SEPARATE,
  separately-tested change. hydrate() adds branding and removes nothing.

- `?wlpreview=<orgId>` paints a signed-in page as one tenant, for staff only.
  It exists because `orgId` IS the email domain, so nobody here has an account
  that resolves to a customer's workspace and a white label was otherwise
  unviewable by the people who sold it. **It changes the paint and never the
  scope** — `hydrate()` pins `CLEARSKY_CONFIG.tenant.orgId` to the signed-in
  org and copies only presentation keys off the previewed record. The gate is
  Firestore (`isAdmin()` on `omega_orgs/{other}`), not the JavaScript. Not
  sticky: URL only, with a banner. `scripts/test-wl-preview.js` mutation-tests
  the one line that would turn it into impersonation.
- `whitelabel-setup.html` is the staff last mile: it turns `tenants/<slug>/`
  into a live storefront from the browser, using only writes the rules already
  grant a verified `@clearsky-usa.com` token. It does NOT write `tenant_public` — that
  needs the one allowlist in `api/_lib/whitelabel.js` and stays with
  `scripts/seed-omega-orgs.js`, which remains canonical for a bulk seed and
  for rotating, re-scoping or disabling an embed key.
- **The second sale is a TWO-TOOL PRODUCT, not the whole editor.** What Clean
  Cell resells is Site Map (`editor`) + Grid Atlas (`gridatlas`), white-labelled
  and reached from their own site. That is `billing/current.toolAccess =
  ['editor','gridatlas']` — an allowlist that wins over the tier, the addons,
  `toolOverrides`, `requiredTools` and `unlockedTools`. No new gating code: the
  master console has written this field for a while.
  - `omega-tenant.js` read only `members/{uid}.toolAccess`, so the org-level
    allowlist held on `index.html` (which carries its own copy of the merge)
    and nowhere else — a colleague who auto-joined got all 41 tools. It now
    reads both and **intersects**: a member list may narrow the product, never
    widen past what the org bought (`members/*` is tenant-admin-writable).
  - **Absent ≠ empty.** `null` means "whatever the plan includes"; a present
    array is authoritative at any length, including `[]` = nothing. That is
    what `api/fiber-screen.js`, `api/compute-lease.js` and `effectiveTools()`
    already did; `omega-tools.js` was the outlier and showed a tile that the
    endpoint then refused with a 403.
  - `scripts/tests/ttoolaccess.js` asserts the product against the REAL
    `OMEGATools.catalog()`, so tool 43 cannot quietly join it.
- One product list, one mapping. `scripts/import-products.js` converts a
  manufacturer's CSV and is the ONLY place the column names, the unit
  conversion (datasheets print mm) and the footprint sanity check live. Its
  `--out` artifact, `tenants/<slug>/products.json`, is what the setup page and
  the local preview read — so no second parser exists in a browser.

Design and the honest list of what is NOT built: `docs/WHITE-LABEL.md`.
Demo runbook for the Clean Cell account: `docs/DEMO-CLEANCELL.md`.

## Omega Logic — the office and the plant

The manual for the people who use it: `docs/OMEGA-LOGIC-MANUAL.md`. Keep it
current when a screen changes; its last section is the honest list of what
is not built.

- **One front door, no company in the address.** You sign in to Omega Logic
  (like QuickBooks), then open your company: `/office/app` on a phone (short
  address `/logic`) and `/omega-logic` on a computer both open on
  `omega-logic-signin.js` (Google or email + password, as on the dashboard;
  the phone app passes `linkUrl` and offers a sign-in link by email first, as
  the app guide shows), and `api/logic-workspaces.js` lists where this person
  may go — judged by
  the SAME `logic-access.authorize` every office endpoint runs (their email
  domain's workspace, an `org_members` grant; the ClearSky owner sees all).
  One company: straight in; several: pick; none: said plainly. A person
  whose own workspace is open but holds no Omega Logic is told it is not on
  the plan (`reason: 'notOnPlan'`). An owner or administrator gets *Add Omega
  Logic to your plan*, which opens the Modules card `/workspace#module-logic-office`
  (the one Opt-in). Anyone else is told to ask them. A closed or lapsed
  workspace still says to contact ClearSky (2026-10-17). The phone
  remembers the choice and forgets it on sign-out; `?org=` in an old link
  only preselects. `/office/app.webmanifest` is the one office manifest.
  An app installed on an iPhone home screen signs in THROUGH ITS OWN HOST
  (the `/__/auth` proxy in vercel.json), and on silmarillion — whose
  handler IS registered with Google — so does every Omega Logic sign-in,
  installed or not: `config.js` decides that, because
  `omega-tenant.js` starts Firebase the moment it loads and the first start
  fixes the auth domain. Google needs `https://<host>/__/auth/handler` on
  the OAuth client's redirect URIs; `api/auth-check.js` asks Google whether
  it has it, and until it does the installed app offers email and password
  (no emailed link: that opens Safari) instead of Google's error page.
  The phone header is the guide's: Omega Logic over "Company · email"
  (the email ellipsizes), Switch as a small link on that line for someone
  with more than one company, a round ↻ and a Sign out pill — it fits a
  360px phone (`check:pages` office-app-header).
- **One chrome.** `OmegaLogicTheme.chrome()` in `omega-logic-theme.js` paints
  the header (name · who · Sign out) and the left menu on EVERY office page.
  The menu is the hub: eight places named as the hex hub names them (Today,
  Sales, Customers, Plant, Deliver, Stock, Money, Setup). The place you are
  in shows its pages, and a caret opens any other. A page never builds its own menu; it calls
  `chrome({org, current, owner, brand, who, local})` after its API response.
  Website, installation and the URL generator are ClearSky's and show only
  for a ClearSky owner (`ownerFlag` remembers the answer for pages whose
  endpoint does not say; showing a link is never access).
- **One path for every order** (2026-10-17, Tommy: "really clean up omega
  logic and make it less complicated all streamlined just like we did with"
  Omega Prime). Price → Deposit → Build → Final payment → Ship → Deliver →
  On site → Complete is `api/_lib/office-stage.js path()`, the ONE rule. It
  gives the step, the verdict and the one next action with whose it is,
  built on `stageOf`/`actions` (D1 unchanged), the invoices, the delivery
  legs and the units' custody (On site = every shipping unit bound to a
  site). `api/logic-office.js` sends it on every order with `path` and
  `pipeline`. The desktop home (`omega-logic.html`) is three views under the
  bar: Today (`What needs you`, Start here first), Orders (`#orders`, the
  guided order: bar, verdict, the one control, More about this order) and
  Numbers (`#cash`); ClearSky's forms are `#clearsky`. The office app draws
  the same bar and an inline guide, and opens `?org=&order=` links (Omega
  Prime's Omega Logic button). The guide (`OmegaLogicTheme.guide`) never
  offers a button the server refuses: someone else's step says whose.
  Price, accept and ship stay on the desktop. `scripts/test-office-stage.js`
  holds the rule.
- **Stations do the work.** A BOM line may carry `station` (routing key) and
  `step`; the routing may carry `checks[]` per operation. `api/_lib/plant-work.js`
  (pure) turns those into the steps a bench shows for a unit, `judgeScan`
  refuses the NEXT bench while any step is open, and `api/mes-scan.js`
  `issue` / `step-done` take the part off `fulfillment/materials`, onto the
  unit (`work{}`) and the works order (`issued{}`), idempotent by scanId. The
  materials plan nets `issued` and `readyCounts`. A station record with
  `station:'*'` is a ROAMING phone: the operator names the bench per scan
  and every scan records both.
- **The map is derived.** `api/_lib/plant-stats.js` reads `startedAt`,
  `done{}` and `arrivedAt` off unit records. No second log, no invented
  numbers: a station with under three timed units has no time.
- **A customer writes exactly one thing onto an order:** `requests[]`, via
  `api/my-orders.js` POST. The office answers with `logic-office`
  `request-resolve`. The change itself goes through the control that owns
  it. Warranty on the portal is DERIVED (product `warrantyYears` × ship
  date), not stored.
- **Many POs at once** go through `api/po-intake.js` `submit-many`, the same
  order shape the one-at-a-time convert writes; an existing PO number is
  skipped and named, never overwritten.
- **Assigning a finished unit** to an order is `api/logic-plant.js`
  `allocate`: the whole assembly moves, the works order builds one fewer.
- **Three phone apps, one pattern, one manifest endpoint.** `plant/app`
  (the builders), `office/app` (the office) and `portals/customer/app` (the
  buyer, Editor Lite first) are each one installable page with a bottom tab
  bar, a shell service worker scoped to its own path (network first; `/api/`
  never cached), and a manifest from `api/app-manifest.js?org=&app=` built
  per app. **Omega Logic is ClearSky's product and a tenant is a workspace
  in it** (QuickBooks is the app; the company is what you sign into): the
  office app (the Omega Logic app) and the plant app always wear ClearSky's
  name, colours and icon (`icons/omega-logic.svg` →
  `scripts/make-omega-logic-icons.js`), with the workspace name shown
  inside, and so does the desktop office header (`chrome()`; the brand
  helper's `workspace`). Only the CUSTOMER app wears the tenant's name, ink
  and `appIcon.customer` (validated paths under `/tenants/<slug>/icons/`;
  OMEGA icons as the fallback): it is what the tenant's own customers use,
  one install per supplier (manifest id carries the org), and it prints the
  contract's "Powered by …" line (`api/_lib/whitelabel.js` `attributionLine`,
  the server twin of `omega-whitelabel.js` `attribution()`). Office pages mark
  their header `data-product-name`, which `OmegaLogicTheme.apply()` never
  touches; only customer pages use `data-brand-name`. The office does not
  wear the tenant's colours; those are for its customers' surfaces. A
  tenant's icon set lives in its folder and its `tenant.json`
  (`scripts/make-tenant-icons.js <slug>` renders every `<app>-icon.svg`);
  the seed copies `appIcon` onto the record. Never a script URL in a
  manifest. The customer app loads NO `omega-tenant.js`, like the portal
  and for the same reason. The apps add no endpoint of their own: pricing,
  acceptance, shipment and wires stay on the desktop.
- **The sandboxes are a build output.** `app-sandbox/` is the four pages
  (three apps and the bench) with `sandbox.js` in place of Firebase and
  `/api/`: `scripts/_lib/logic-fixtures.js` (ONE sample tenant; also what
  `check:pages` renders against) and `scripts/_lib/app-sandbox-shim.js`,
  bundled with the pure libraries by `scripts/build-app-sandbox.js`, which
  asserts every rewrite. Never edit the folder; `npm run build:sandbox`
  and `scripts/tests/tappsandbox.js` fails `npm test` when it is stale.
  Nothing in it is real and nothing in it reaches the network.
- **PO loads, one sheet, one parser.** `omega-po-bulk.js` is the ONLY
  parser of the pasted PO sheet (PO inbox, office app, customer app);
  `api/po-intake.js` `submit-many` takes what it returns from the office
  (any company, a named billing contact, 200/day) and from a customer login
  (its own company, the caller as billing contact, 50/day,
  `poIntake.source: 'customer-bulk'`). Both doors create the same order
  awaiting pricing; neither accepts or charges.
- **Custody is built ON the unit record, not beside it.** Where a shipped
  unit is, which end site it is bound to and what warranty or SLA that binds
  is `plant_units/{org__serial}.custody{}` plus an append-only
  `custody_events/` subcollection; sites are `omega_orgs/{org}/sites/`;
  coverage templates are `coverage[]` on the catalog product (with
  `warrantyYears` as the default) and a unit's coverage is DERIVED at read
  time, never stored — `pending` until the unit is bound to a site.
  `api/_lib/custody.js` is the ONE status machine, coverage engine, CSV
  mapper and receiving reconciliation; `api/logic-custody.js` (office) and
  `api/my-sites.js` (customer, verified email) only read and write through
  it, and the logistics ledger and the workflow's ship step record ship,
  deliver and receive through the same `apply`. Every custody path is
  Admin-SDK-only in the rules. `ship` is never recorded from the custody
  page: the load is the record of what left. The customer DECLARES where a
  unit went (`declaredBy: 'customer'`, or a `destination` named before it
  arrives) and the office CONFIRMS (`confirm`); coverage binds on the
  declaration, confirmation is the office's check and never a gate on the
  warranty. `logic-register.html` is the spreadsheet view of all of it
  (`registerRow()` / `REGISTER_COLUMNS` in the library, `?view=register`):
  a cell edit is either a `detail` (reseller, end customer, installer,
  notes — links, never moves) or a move through the same `judge`/`apply`.
  A PO's list of sites (pasted or uploaded, on the customer portal and app
  and the office's *Many sites at once*) is read, matched by address and
  spread by the pure `parseSiteList` / `matchSites` / `spread` in the
  library, and written only as sites plus one `destination()` per unit by
  the four list actions on `api/my-sites.js` and `api/logic-custody.js` —
  the server recomputes the plan, the preview is the confirmation.
  **A bought-in unit's warranty is the maker's, recorded on the unit**
  (2026-10-17, Tommy approved the design: owners and administrators only,
  the maker's word required): a battery the workspace buys in and has not
  published (Omega Prime's `procure`; `custody.boughtIn(order, sku)` is the
  ONE test, prime-order's own, so a `{reference:true}` line alone is a
  maker's own unpublished unit, never bought in; `boughtInUnit` lets an RMA
  replacement off another order through the unit it replaced) has no
  catalog template, and publishing it would put it on the public
  storefront. The office's
  owner or administrator records `custody.makerWarranty` (terms, the
  maker's HTTPS document or confirmation, who and when; never a status) on
  the passport through `api/logic-custody.js` `maker-warranty`
  (`custody.makerWarranty`, one unit or `scope: 'order'`, a custody event
  each, one audit row); `templatesOf(product, unit)` reads it as one more
  template (id `maker`) after the catalog's, so every coverage reader, Omega
  Teleios included, sees it with no reader of its own; `replace` carries it
  to the replacement. The customer sees the warranty and its document,
  never the maker's confirmation.
  Design and what is not built: `docs/LOGISTICS-CUSTODY.md`.
- **An order's freight plan is DERIVED, and Accept plans through the
  ledger's own planner.** `api/_lib/freight.js` (pure, ES5, bundled) reads
  the units' sites (`custody.siteId`, else `plannedSiteId`), groups them into
  lanes by ONE fixed state→region map (lane keys are words, never a state
  code: they are in the load ids a carrier reads), orders stops nearest-first
  from the ship-from (`fulfillment/config.freight.origin`, straight-line
  miles) and
  builds the master list and the carrier's quote request — the ONLY place
  their columns live; the carrier's sheet carries no customer, PO or price.
  Quotes are `omega_orgs/{org}/freight_quotes/` (closed in the rules, never
  on the order a member may read), append-only: amounts never change, only
  status; a lane's key covers each site's ADDRESS, so a corrected address
  makes a price stale and Accept refuses it. "Ready" is the pickup gate's
  (`logic-policy.ready`, components included), and a blank load id is
  `F.nextLoadId` — the one rule the Accept step previews. `freight-accept`
  calls `L.planLeg` (`api/_lib/order-lifecycle.js`)
  once per stop in one transaction — the SAME function the `plan` action
  calls — so a lane is one leg per stop; a leg carries the quote id, never
  the amount. Catalog shipping fields (`weightLb`, `heightFt`,
  `freightClass`, `stackable`, `handlingNote`) have ONE validator,
  `api/_lib/shipping-fields.js`; a missing one reads "not on file", never a
  guess, and none is ever public. Office admins only (the ledger's gate).
  Design and what is not built: `docs/LOGISTICS-CUSTODY.md` (*Freight plan*).
- **A customer is an ACCOUNT with people on it**, not an email. Each
  workspace's customers are `omega_orgs/{org}/customers/{id}` with
  `users/{email}` and the `customer_index` pointer; `api/_lib/buyer-accounts.js`
  is the ONE reader of an account's orders (`accountOrders`: its customerId,
  or billed to one of the people it ADMITTED (`B.admitted`) — never an order stamped for another
  account) and the ONE writer of people (`addUser`, `setUser`, `joinRequest`).
  Every active person on an account sees the account's orders, POs, sites and
  units. `customers.domain` is only what the office typed; a first sign-in
  from it joins as `pending` until the owner or the office approves or
  declines; only an owner of an office-verified company adds colleagues, at
  that domain; a new order is stamped only for an admitted person
  (`B.stampableAccount`); nobody is deleted and nobody removes an account's
  last active owner. The office's Customer hub
  (`api/buyers.js ?customerId=`, the Omega Logic app's Customers tab,
  `portals/customer/admin.html`) opens the ACCOUNT. Custody and QuickBooks
  follow the account too. Design and what is not built:
  `docs/CUSTOMER-PORTAL.md` §2.
- **Two ways an order is billed.** `fulfillment/config.accounting` is
  `'quickbooks'` (ClearSky invoices from its QuickBooks, fee added, payments
  reconciled there) or `'tenant'` (the OEM invoices on its own paper: the
  office records `invoice-issued` and `payment-received` on the order via
  `logic-workflow.issueInvoice/recordPayment`, no fee on the customer total,
  no QuickBooks; release, ready and ship follow from the recorded payment).
  `scripts/intake-order.js` runs one order from the paperwork through the
  real endpoint code (dry run on the double, `--apply` live); the order file
  is never committed (`docs/order-intake-template.json` is the shape).
- **Where everything lives is ONE list**: `api/_lib/kit.js` (apps, pages,
  sandboxes, PDF guides, per audience, with the address for a workspace).
  `logic-kit.html` + `api/logic-kit.js` (owner-only) show it per subscriber
  with a ready message and log each send under `omega_orgs/{org}/kit_sends`
  (Admin-SDK-only). Jarvis reads `/api/logic-kit?org=`. The guides are
  built by `scripts/guides/build.js` into `/guides/*.pdf` (served; `docs/`
  is not) from screenshots `scripts/guides/shots.js` takes of the sandboxes
  (tenant names neutralised: a public PDF names no tenant); the office's is
  `guides/Omega-Logic-App.pdf`. Add an app there, not in a page.
- **A release that changes a screen retakes the guides.** `shots.js`
  records, per screenshot, the sha256 of every page file the shot loaded
  (`shots/manifest.json` `sources`; a sandbox page counts as its source
  page, and the sandbox runtime as `app-sandbox/sandbox.js`, so a change
  in a library that works out what a screen shows counts too); `build.js`
  records which screenshots, guide words and builder each PDF was made
  from (`scripts/guides/built.json`) and leaves a PDF whose inputs did not
  change as it is (`--force` rebuilds). `scripts/tests/tguides.js` (in `npm test`)
  fails when a photographed page changed since its shot, or a PDF was not
  rebuilt from the current shots. The fix is `npm run guides` (shots, then
  build) and committing `scripts/guides/`, `guides/`; never an edit to the
  manifest or `built.json`. A new screen gets a shot and a line in the guide
  that teaches it.
- **ClearSky commissions and controls Logic subscribers from
  `/logic-admin.html`** (`api/logic-admin.js`, owner-only through
  `logic-access.requireOwner`). It owns only what no other endpoint did —
  the structural tenant fields, storefront copy and cost basis,
  commissioning, members, the hand-over export — and the page posts billing,
  status and white label to `tenant-billing`, `tenant-approve` and
  `tenant-branding` so each allowlist stays in its one file.
  `api/_lib/whitelabel.js` now also holds `publicRecord()`, the ONE builder
  of a `tenant_public` document; every mirror uses it. Every admin write
  lands in `omega_orgs/{org}/admin_audit` with what changed and what it was.
  Tests: `scripts/test-logic-admin.js` on the shared
  `scripts/_lib/firestore-double.js`.
- **Price and accept follow who bills (D1).** A workspace's owner or an
  administrator (an active `omega_orgs/{org}/members` owner|admin) approves
  the price of, and accepts, an order the workspace bills itself
  (`fulfillment/config.accounting === 'tenant'`, or the order's own billing
  once priced: `office-stage.billingOf`); ClearSky, the logic-access owner,
  prices whatever goes through its QuickBooks and may act on any order.
  `logic-access.requirePricer` is the gate inside the workflow's `price`
  and `accept`; `office-stage.actions()` gives each order `can{price,accept}`
  and `waitingOn`, which the desktop pane, the app, Today and the Sales hub
  follow (an order waiting on someone else is listed and named, never
  counted). Each price and acceptance keeps who and when
  (`logic.pricedBy` / `acceptedBy`, the event history). Shipment and wires
  stay ClearSky's.
- **A workspace runs its own Team (D2).** `api/_lib/logic-members.js`
  `change()` is the ONE writer of `omega_orgs/{org}/members`:
  `logic-team.html` → `api/logic-team.js` (the tenant's owner or admin),
  `api/logic-admin.js` (ClearSky) and `api/set-role.js` all go through it.
  An admin never makes or touches an owner; the last active owner is never
  disabled or demoted (re-read inside the transaction); nobody is deleted;
  every change is an `admin_audit` row with who, was and now. A person
  outside the workspace's domain needs an existing `org_members` grant —
  Team never writes one. The rules let a browser write a member record only
  to join as a member or change its own name (ClearSky staff aside), and `tenantReader()` keeps a disabled
  member (or an unverified email) out of orders and plant records.
- **A test result by hand goes through the rig's gate (D3).** When the EOL
  rig cannot post, an owner or administrator records Pass or Fail with a
  note (5+ characters) on the Plant app's unit or the serial record:
  `api/mes-test-result.js` `manual: true` runs the same `record()` and
  `plant.judgeMachineResult` as the rig, which now takes the open steps, so
  no pass, machine or manual, skips a step still open (PLANT-03). It is
  stored on `unit.test` and in `plant_scans` with `source: 'manual'`, by,
  at and the note, audited as `plant-manual-test`; a fail holds the unit.
  The rig stays the normal way, and a rig token may not use a `manual_`
  scan id.
- **The ecosystem is one map**: `docs/OMEGA-LOGIC-ECOSYSTEM.md` (who uses
  which app, the hubs, the API contracts, what is not built). Both apps and
  both desktops open on the HEX HUB (`omega-hexhub.js`, `OmegaHexHub.render`;
  items[0] is the centre): the office's Today ringed by Sales · Customers ·
  Plant · Deliver · Stock · Money, the customer's Fleet ringed by Size ·
  Design · POs · Pay · Shipping · Warranty. The supplier's CRM is
  `api/crm.js` on the ACCOUNT (contacts, activity and follow-ups on Today,
  documents, a timeline DERIVED from the records by `api/_lib/crm.js`,
  never stored); the customer's side of the same documents is
  `api/my-files.js`; the customer's design subscription is
  `api/customer-subscribe.js` (metadata `org`, never `orgId`, so it cannot
  reach the tenant's billing), or the supplier INCLUDES Editor Lite for
  every customer at no charge (`billing/current.editorLite.customersIncluded`,
  ClearSky's owner only through `logic-onboard` `customer-editor-included`;
  `buyer-design.entitlement` reads it as `included`, no expiry, checkout
  refused; 2026-10-16, Tommy, of FENECON; `docs/CUSTOMER-PORTAL.md`); a tenant-billed invoice's pay link has ONE
  check, `api/_lib/portal.js tenantPayLink`. All Admin SDK; the rules deny
  browsers. The sample tenant in `scripts/_lib/logic-fixtures.js` answers
  every one of these routes, so `check:pages` and the sandboxes exercise
  them.
- **Scanning is `omega-scan.js`.** The office app, the bench and the
  desktop Sites page read labels (QR, Data Matrix, Code 128) through it:
  the browser's own BarcodeDetector where it reads all three, else ZXing
  (barcode-detector + zxing-wasm, MIT/Apache) self-hosted under
  `/vendor/zxing/<version>/` — Safari has no BarcodeDetector, so every
  iPhone takes that road. No CDN at scan time. `check:pages` feeds a fake
  camera a printed label and requires the passport and the bench to open.
- Chromium render checks for all of it: `npm run check:pages`.

## Omega Workspace — the home (2026-09-26)

`workspace.html` is the hub-first home of a signed-in workspace: index.html
sends a signed-in visit on once the entitlements say where home is. A
tenant keeps the classic dashboard with `omega_orgs/{org}.shell = 'classic'`
(a partner-type workspace keeps it too), a browser with `?home=classic`
(`?stay=classic` for one visit), and `OmegaWorkspaceShell.homeOf()` is the
ONE rule index.html, the workspace and the legacy pages read. The dashboard
fixtures say `shell: 'classic'` for that reason. `omega-workspace-shell.js` is the one
chrome (rail, topbar, switcher, the website's blueprint grid, side panel,
toast, phone tab bar); a page never builds its own rail. The hub is
`omega-hexhub.js` drawn from `omega-workspace-hub.js`, which composes the
six cells from `OMEGATools.isUnlocked()` — showing a cell is never access —
and `scripts/tests/tworkspacehub.js` asserts every key it names against the
real catalogs. Every tool tile is Live, Locked or Soon by that same rule;
a locked tile explains, never hides. Today is `omega-workspace-today.js`
(pure, ranked, `scripts/tests/tworkspacetoday.js`): the account, to-dos,
both ends of the Quote Desk, the referral inbox, projects ready, stalled or
unsized. Never a second copy of those rules in a page. A legacy plan more
than fifteen days past its due date with the figure still owed (Tommy,
2026-09-28: "over 15 days past due it says that on the dashboard to pay
their account") is `OmegaTenant.pastDue`, the ONE rule (`omega-tenant.js`,
cut out of the source by `scripts/tests/tpastdue.js`): the runtime's bar
says it on every signed-in page, the home carries the notice and Today
lists it first after read-only, paying on the invoice Stripe holds open for
it, else ClearSky's link, else Plan & billing; a packaged workspace is the
engine's own notice (grace, then past_due_lite or read-only). A legacy
tier wears the PRICE BOOK's plan word (Tommy, 2026-09-28: "the tier needs
to match"): `omega-tenant.js` `TIER_LABEL` (`OmegaTenant.tierLabels`) reads
standard as Field and deluxe/pro as Pro, the keys unchanged; the editor's
`omega-editor-plan.js` carries the same map (`teditorplan.js` holds them
together). The plan's own Stripe invoice is dated the day it was DUE
(`/api/stripe-invoices` `dueOn`, the card door's `omegaDueDate`), never the
day Stripe made it, and while that payment is owed the NEXT invoice on a
legacy plan is the following month's (`nextInvoice`, `monthAfter`), never
the same date again. The home is the BOARD: the hub and Today, then In flight and Around you
(feed, People, the Omega pulse, Partners, what Customize keeps on); All
tools, Modules, Team (People and Partners) and Feed (the feed and the
pulse) are their own pages (`data-view`; Tommy, 2026-09-27: "feed and team
do nothing" when both opened the same Around you), each page showing its
panels whatever the board keeps. The Omega pulse is `GET /api/pulse`
(`api/_lib/pulse.js`, pure, `tpulse.js`): platform-wide COUNTS ONLY from
the most recent rows, never a name. **Modules are paid services of the editor** (Tommy, 2026-09-27). The
Modules page (`#modules`; `#module-<key>` lands on one card, `#plans` on the
plans shelf) lists every module for every workspace, and the module cards
live there, never on the home (Tommy, 2026-09-27: "i dont want them to be
taking up so much dashboard space"; `check:workspace` fails on a module
card drawn on the home). Every card — the Modules page and Plan & billing's
*Changes in progress* — reads ONE rule,
`OmegaWorkspaceHub.moduleCard(m, ctx, billing, summary, opts)` on top of
`moduleState`: one status (Live · Live, always included · Opting out ·
Waiting for payment · Bought, not on yet · Opt-in requested · Partly
included · Not on your plan) and at most one action. The words are **Opt
in** (confirmed as **Opt in and pay**, or **Turn it on** for a $0
addition), **Opt out** and **Cancel request** (never Subscribe, Ask, Add to
plan or Keep module); each opens the ONE menu (`omega-package-menu.js`,
"The Ladder") with `{ single, intent }`, which states the money before
anything is written. A packaged Opt in is `plan-change` quote → apply (paid
on the invoice's own page, Stripe or QuickBooks as the summary's `payWith`
says); a packaged Opt out queues for the quarterly review with the fee
before → after and the review date; Cancel request withdraws any of it.
Activation resolves a legacy plan's recorded requests (activated /
declined / done).

A LEGACY plan (billed outside the engine) opts in BY CARD where its plan
can switch the module on exactly, and BY RECORDED REQUEST everywhere else
(Tommy, 2026-09-27: "buy them immediately and not email clearsky … add to
plan and then charge their credit card or saved payment method"). The card
says Opt in either way; the menu asks `plan-change` `addon-quote` first.
By card is an ADD-ON beside the legacy plan, whose own tier, price and
billing are never touched: `api/_lib/addons.js` through `plan-change`
`addon-quote` / `addon-buy` / `addon-cancel` / `withdraw-addon-cancel`
(owner, admin or verified staff; an owner or admin of an ACTIVE client
needs no verified email, `admin.clientAdmin`: the role a person granted
vouches, and a Team invitation makes its account unverified), the book's
list price (the five Logic parts as the bundle), its own QuickBooks invoice
paid by card on QuickBooks' page (or the card saved there) — **Opt in and pay**, the billing contact
asked once first if there is none — then *Waiting for payment* with Pay,
*I've paid* (reconcile-now) and Cancel request (`addon-cancel {addOnId}`,
only while unpaid); Live when `package-billing.reconcile` sees it paid; the
hourly runner renews it monthly on the add-on billing day (a renewal due
reads Waiting for payment with Pay); off after an unpaid renewal's grace.
**Opt out** of a card add-on is `addon-cancel {remove}` (dry run first): it
stays on to the end of the month paid for and is not renewed
(`addOns.ending`; the billing day drops it from the renewal and takes its
grants back), no refund, and the price of what stays is stated; Cancel
request is `withdraw-addon-cancel`. The recorded opt-out refuses a card
add-on. Bought is `billing/current.addOns.modules`, on is `addOns.live`; on
means what the legacy readers already honour — a Logic part through
`logic-access`, a module's tools as `toolOverrides` (and the `toolAccess`
allowlist), editor capabilities as the legacy add-on keys `omega-caps`
reads — and `addOns.granted` makes switching off take back exactly that. It
is sold only where it switches on EXACTLY (`addons.exact`, Tommy's decision
2026-09-27): a legacy editor opens Site Map a whole tab at a time, so a
module that would come on only in part, or switch on part of another, is
not sold by card; the quote says why (`request: true`) and the menu offers
**Request opt-in**, the RECORDED request (`plan-change` `opt-in` /
`opt-out`, dry run first, on `billing/current.optIns` / `optOuts`, history,
audit, ClearSky mailed; the tier is never touched; Cancel request is
`withdraw-opt-in` / `withdraw-opt-out`; an opt-out's dry run carries a
`previewId` the apply must match). Card payments not yet open (the
engine guard; flags are off by default) answer `request: true` too, so a
legacy Opt in never dead-ends. A REQUEST (`plan-change` `opt-in` /
`withdraw-opt-in` / `opt-out` / `withdraw-opt-out` / `request-removal` /
`withdraw-removal`) grants and charges nothing, so an owner or
administrator files one on the ROLE alone (a missing org status reads
active; pending, suspended or cancelled refuse); the record, the audit
row and ClearSky's mail say whether the email was verified
(`emailVerified`); pricing, paying, switching on, add-on stops and the
summary need a verified email or `admin.clientAdmin`. A legacy tier opens Site Map a whole tab at a
time (`data-cap`), so the editor opens a live add-on's OWN commands instead,
wherever they sit, and nothing else on their tab (`omega-caps`
`addOnOpens`/`addOnLayout`, from `GET /api/package-access`'s legacy answer),
and `exact()` simulates exactly that (`moduleEditor` `editorModules`): every
editor module is exact on every legacy plan, and a tab the plan stops at says
Opt in and buys the module there. Every Omega Logic department is exact on
every plan. Add-ons bill on the WORKSPACE'S rail (`addons.rail()`, 2026-09-28,
Tommy: "integrated with stripe so people can buy and opt into new
products"): QuickBooks where its add-ons already have a QuickBooks customer
or ClearSky invoices the plan there, else the deployment's rail, so under
`PACKAGING_PROVIDER=stripe` a legacy plan buys on its OWN Stripe customer —
the one Plan & billing's card door links (`stripe-customer.link`, the one
writer of it), never a second customer — on a `send_invoice` invoice beside
the plan, reconciled by the same `package-billing.reconcile` the webhook and
the runner run; the renewal is issued there too; a cancel voids the Stripe
invoice (QuickBooks' stays open for staff); `package-billing.guard(c,
rail)` is the gate; an add-on's Pay reads the add-on's own `payWith`, never
the package's. Stripe's hosted page needs no billing form (the customer
carries the payer's email and the workspace's name), so Opt in on Stripe
never asks for one first; QuickBooks still does, prefilled from what is
known (the workspace, the person, the company type on record).
`scripts/test-addons.js` §6d holds it on the Stripe double. **With a card
on file it is charged** (2026-09-28; Tommy: "charge their credit card or
saved payment method"): the customer's default payment method for invoices,
the one *Add a card with Stripe* saves, pays an opt-in the moment *Opt in
and pay* is pressed and each renewal on its date —
`stripe-billing.invoice(…, { charge })`, asked for ONLY by `addons.js` (a
package never asks while the book's `policy.savedCardEnabled` is off); the
purchase runs the same reconcile at once and answers on, a refusal leaves
the invoice on Stripe's page with Stripe's own words for the cardholder,
and a paid invoice is never mailed as unpaid. §6e holds it, each piece
failing its test when removed.
`OmegaPackageMenu.addOnControl` is the same legacy path for a page's own
control; `scripts/test-addons.js` and `check:workspace` (legacy-add) hold
it. A workspace with no `omega_orgs` or billing record cannot be billed and
is told so.

**The ONE legacy rule** (the Modules page, Plan & billing, the
marketplace's locks, the editor's plan chip, the admin Package tab and the
server's add-on check all ask it): `moduleState` holds a module when
everything it carries is open — its standalone tools AND its commands in
Site Map, the catalog's `legacyGates` (read off the real editor by
`scripts/render-legacy-gates.js`) asked of `canCap` from
`OmegaWorkspaceHub.editorCtx(caps, billing, who)`, the ONE mirror of the
tier Site Map runs (the record wins, a missing tier is trial, `capTier`
caps, the JV by org, add-ons widen, a verified ClearSky address with no
record is internal). It is pure over `OmegaCaps.canWith` and never sets
the library's state; `legacyCtx` builds a whole legacy ctx once and
`capsFor` is its no-person form. Omega Design (`lite`) is always held and a
card-bought add-on counts as held. **The editor shows how the workspace
pays**: `omega-editor-plan.js` puts a plan chip in `#portal-nav` (plan,
modules in Site Map and elsewhere, the monthly figure and next invoice from
`GET /api/plan-change`, read-only notice with the pay link and *I've paid*;
links to `/workspace#billing` and `#modules`); a failed billing read keeps
navigation and hides producing controls ("unchecked", `OmegaCaps.retry()`,
and the editor strip's Try again), and the gate honours a legacy
`billing.toolAccess` without `editor`. In flight is
`OmegaWorkspaceToday.board` (what needs something, then what was touched
last, never online, a finance-marketplace deal riding on its project) and
Assign merges only the owner fields onto `projects/{id}`. **Pipeline capex
is what Site Map's Run costed** (2026-09-29, Tommy: "project capex should
reflect the costs that are calculated by the run function in the project
site map editor"): `omegaRunRollup()` in `editor.html` captures the run's
own totals (Total install `_COST_TOTAL`, `_INC_TOTAL`, `_YR1_REV`, the
placed fleet) and `saveProject()` carries them through its allowlist as the
record's `capex`, `incentive`, `annualRevenue`, `bessKwh`, `bessKw`,
`capexAt`, `capexSource: 'site-map'` — the ONE set the workspace
(`omega-workspace-today.js`), the dashboard rollup (`index.html`) and the
asset book (`omega-assets.js`) read; a priced run saves at once
(`omegaRunSave`, read-only and unchecked plans wait); a run that priced
nothing writes nothing and erases nothing, and a field the run did not
produce (revenue with no streams, a battery not placed) is left out, never
zeroed. `scripts/tests/tcostrollup.js` holds it end to end. **In flight
reads the work done on the design** (2026-09-29, Tommy, over eight Level 2
jobs reading "No battery size yet · 0%": "these are all l2's … if they
have been designed and run then they are 100%"): `OmegaWorkspaceToday.progress`
(designed = equipment or conduit on the site map, run = Site Map's Run
costed it, else a figure reads priced; 50 and 100; a project past
candidate reads the further of that and its stage) is the card's bar and
its why, and `kinds` / `kindLabels` / `wantsBattery` read the record's
type, scopes and the EV wizard's mark through `omega-workspaces.js`, the
ONE type table (workspace.html loads it; its ribbon hooks are no-ops
there): a battery belongs only on a kind whose focus carries storage or on
a record with no kind, so a Level 2, compute or building job is never
asked for a battery size, it is asked for a design (ONE Today row,
`design`, opening the oldest). `tworkspacetoday.js` §10 holds it.
**A capital partner's home is the finance marketplace** (2026-09-29, Tommy,
of Helios: "in the good morning and in the omega pulse information about
the financing opportunities and they can then click on them and it takes
them into the opportunities and deal room"): a person whose own
`fin_profiles/{uid}` is an approved `partner` has the workspace read
`fin_projects` the four ways the rules grant a partner (open, firstLookUids,
awardedTo, `room.forOrgId` = the profile's `orgId`) plus their own
`offers/{uid}`; `OmegaWorkspaceToday` `capital` ranks it (a first look ending
in two days, a room deal with no offer, an award, what opened this week as
ONE row), puts the room on In flight and the fourth number, and
`/api/pulse` `finance` adds the platform's open deals and megawatts (counts
only). Every row, card and pulse link is `OmegaWorkspaceToday.dealHref`
(`/finance#deal=<id>&tab=room|market`, `#room`, `#market`) — the ONE
address, which the portal's `readLink()` reads once, clears and opens in the
drawer when the listeners return the deal (a deal the account cannot read is
said once, never guessed). The sponsor's rows use it too. Held by
`tworkspacetoday.js` §11, `tfinancelink.js` (the portal's reader cut from the
page, against the producer), `tpulse.js` and `check:workspace` `capital`. Plan & billing is
a page (`#billing`), phone first: the subscription, what is owed and when
with the invoice's own Pay, the payment method as a card (linked to Stripe
for a plan billed outside the engine: the card read back, Add a card with
Stripe, Invoices and receipts, Pay $X with Stripe, all `POST
/api/stripe-customer` on Stripe's own pages in this tab; QuickBooks' page
where ClearSky invoices through QuickBooks; a card is never entered on our
pages), changes in progress and the history. A workspace with a billing
record never reads "No billing account yet". `GET /api/plan-change` is
readable by any verified member and by an active client's owner or admin
(invoices shown read-only), changes stay with an owner or admin. The shell's button reset
is `:where()` (zero specificity) so a styled button keeps its face, and
`omega-splash.js` hears link clicks last, so a link the page handles itself
never raises the mark. Opt-in panels live on
`dashboard_layouts/{org}__{uid}.workspace`. `npm run check:workspace`
renders it as four tenants on the Firebase double; run it and
`check:dashboard` after any change to the page, the shell or the runtime.
It CLICKS EVERY CONTROL on every view (`scripts/_lib/click-sweep.js`, one
level into each drawer), and on Projects and the store, and fails on an
error, a dialog put into the page flow instead of over it, a reload in
disguise, an overlay Escape leaves open, a link, new tab or held page the
site does not serve, or a control something covers (`--only sweep` runs
just those; `check:dashboard` sweeps index.html the same way). A rail or
tab link to the page you are on scrolls to its top (the shell's
`stayHere`, for pages that do not route their own links), and the store
judges modules against the BOUND workspace, never `resolveWorkspace()`'s
email stand-in, whichever answer lands first. `omega-newproject.js` owns its overlay (it once borrowed
`.modal-bg` from index.html and landed at the foot of the workspace), and
a `/workspace#view` link is a view change, never a reload.
**`marketplace.html` is the TOOLS catalogue again** for every workspace
(kept for now; it may be phased out): every tool, categories, search and
pinning, wearing the workspace chrome where the workspace is home
(`OmegaWorkspaceShell.wear()`). It sells nothing: a locked tool names the
module that carries it (the package's catalog, else `GET /api/offerings`)
and links to `/workspace#module-<key>`; on the classic home it opens the one
menu on that module in place. `/marketplace.html#<module>` and `#plans`
forward to the Modules page. Enterprise is "Contact for pricing":
`/api/offerings`, the price page and the Modules page's plans shelf publish
no Enterprise figure (the book keeps it for the contract). Design, launch
order and the honest list of what is not built: `docs/OMEGA-WORKSPACE.md`.

## Portfolio & Assets (2026-10-11)

`portfolio.html` is the register of a workspace's energy SITES
(`omega_orgs/{org}/sites`, Admin SDK only; `api/site-crm.js` is the ONE
door, `site-crm.html` the one record). Both pages wear
`omega-workspace-shell.js` (Portfolio is on the rail; `currentKey()` marks
them) and boot the marketplace's way: sign-in, then
`OmegaTenant.onEntitlements`, the address as the fallback. Never start
Firebase a second time on a page that loads `omega-tenant.js`: that throw
is what left the register on "Loading…". A site's figures are its STORED
scenario, `latestProforma`, written only by `proforma-run` /
`proforma-bulk` (`latestOf`): the register, the side panel, the CSV and
the finance hand-off read it and never recompute. The selection's actions
are the endpoint's, per site, idempotent on the hand-offs: `send-to-editor`
makes ONE project per site (`siteId` ↔ `projectId`, the shape
`omega-newproject.js` writes, `siteScopes` from the tags and the sizing);
`send-to-finance` makes ONE `fin_projects` deal per site in the portal's
own shape, `open` with the investor capital as the ask only when a scenario
is on file, else `draft`. **The compute IRR and its presentation are the IRR
tool's** (2026-10-11, Tommy: "this is the most important … print out an IRR and
give us a similar presentation like we get from the IRR tool … it needs to
match the style"): `site-model` maps the record to the Compute Site Pro
Forma by ONE rule (`api/_lib/site-model.js inputFor`: the service on record,
the chargers from the nameplate, the usage, the power price as a flat rate,
the pods from the pod pro forma or the screening; a ZIP, a service figure or
a pod count that is missing is NAMED, never defaulted), runs
`compute-site.js model` behind the compute pro forma's own gate (Omega
Compute / the tier, `computeAccess`), stores the engine's whole answer under
`sites/{id}/models/{id}` and its figures as `latestModel` (`summaryOf`:
after-tax IRR, total project cost = sources and uses, equity, debt, the
three structures, the verdict). The site record's *Investor deck & capital*
tab draws the SAME deck with `proforma-logic.js` (`OmegaProformaReport`)
from `GET …&model=1` and prints it; the register's IRR column is that IRR
once it has run (the pod case until then). **The capital request is the
total project cost** (`askOf`): `send-to-finance` sends it as the deal's
`ask` with `capitalRequest{}` on the deal, and the register reads the deal
LIVE (`capitalJoin` → `site.capital`): open with offers, or FUNDED once a
partner's offer is accepted (`awarded`). **The compute model runs by itself on the Site Map design**
(2026-10-13, Tommy: "all the data based on the site zipcode, the map that we
made, those details should auto input into the compute site pro forma … I
don't want to have to open up the site and input the details … it's the
Omega Core skid … as much as possible is done for the user from the drawing
and our tools"): `api/site-crm.js designModel()` runs `site-model` whenever
the design is read onto the site (a GET, the register's Sync Site Map, the
editor's own save through `omegaSiteDesignPush` → `design-sync`) and the
design or the facts changed, under the compute pro forma's gate (no Omega
Compute: not modelled, no error), marked `auto` on `latestModel`, with what
stopped it kept as `designModel`. The ZIP is read off the address
(`site-bridge.zipFromAddress`, the ONE reader). A design whose compute is
Omega-Core skids and nothing else is the SKID'S own case (`site-model
.skidInput`): its own meter (`service.own`, `load.none` in
`compute-site.js`), its R60 inside its price, 48 H100 at the public spot
reference and the skid's operating figures off `omega-compute-model.js`,
the skid as recorded ($639,000 + the $125,000 controller), rent from the
record else the market reference; a mixed design runs the host's case.
**The capital request is the WHOLE project** (2026-10-14, Tommy: "the
compute IRR reflects the total ask of the project … the cost of that system
now with the cost of the compute system and the payback on that"): the
host's own solar and storage beside the skid are in the case as MONEY,
never dispatch (`site-model.hostOf` → `compute-site input.host`: the Run's
lines on their asset classes, unscaled; the solar sold under the PPA on the
site record — `ppaRatePerKwh`, `ppaEscalatorPct`, `ppaTermYears`, Topanga's
executed PPA $0.2250/kWh, 2.5%, 28 years; since 2026-10-15 the contract AS
WRITTEN wins: `ppaPriceSchedule[]`, the executed PPA's price per contract
year (NextNRG's tables compound 2.0% a year, not the one-pagers' 2.5%), and
`ppaYear1Kwh`, its expected first-year production, read by the ONE reader
`proforma-engine.js ppaPrice()`; `itcEnergyCommunity` / `itcDomesticContent`
build the §48E rate in the engine, never a typed percentage; an assumed
escalator, a missing table or a yield in place of the contract's
production is a named warning — else the Run's revenue, else a named
warning with the cost still in the ask), so `totalProjectCost`,
`computeCapex` and `host.capex` are read by the register, the panel and
the hand-off. **The host's battery earns** (2026-10-15, Tommy, over a 12%
whole project whose $1.5M battery had no revenue: "give the host's battery
its revenue in the whole-project compute case through the platform's own
dispatch (demand charges, VPP, grid services)"): `compute-site.js
hostStorage()` runs the ONE dispatch (`vpp-sim.js`) on the host's meter —
the usage on record (`annualUsageKwh`, else the typical load for the host
type, said so as `HOST_LOAD_ASSUMED`), the host's solar, the tariff book
for the ZIP, the grid programmes open there — and the project is paid
`HOST_STORAGE.sharePct` (80%) of the bill savings as a storage service fee
plus the published owner share of the grid earnings, one revenue line
(`hoststorage`) rising with inflation and fading with the battery;
`host.storage` on the result and the summary carries the figure, its
parts, the streams with their tiers and the load it ran on; the panel, the
record's headline and the deck's assumptions print it; `input.host
.storage.dispatch: false` switches it off. A screening dispatch, never an
operator's quote; the site's own bills make it the site's own figure. **The
term is ten years and its own figure rides beside the headline**
(2026-10-15, Tommy: "over a ten year span … verified by the bank"): a host
PPA past year 10 is a terminal value in year 10, and `irrExTerminal` (the
ten years alone, no terminal value) is on the deal, `latestModel`
(`terminalValue` beside it), the site page, the register's drawer and CSV;
a changed fact under the same design runs the automatic model again
(`latestModel.inputHash`, carrying a chosen chipset, pods and structure). **The deal follows the model** (2026-10-15, Tommy: "push it to the
finance portal and get someone to purchase and fund it"): `send-to-finance`
sends `askOf()` whole — the ten years alone, the terminal value, the cost
split, the contract the PPA is priced on, the lease, the compute price
basis — as `capitalRequest`, and `runModel` refreshes an OPEN portfolio
deal with no offer and no award (ask, cost basis, `proformaSummary`,
`sourceModelId`; `dealRefreshed` on the answer); a deal with an offer, an
award or a sponsor-set status is left alone. **The utilisation typed is
the utilisation sold** (`compute-site.js shapeScale`): the diurnal shape is
scaled so its clipped mean is the figure typed; 85% sold is 85% of
GPU-hours, so gross compute is GPUs × price × 8,760 × sold × availability. The pod pro forma runs by itself on the design too
(`designProforma`, once per design) on the skid's recorded price, and each
engine states its convention (the pod case 60 months pre-tax unlevered
alone; the compute model after tax, the whole); the assumption set IS the
iQGen / CoreWeave baseline. The pod pro forma prices a skid as recorded. **The Run
total carries the skid** (2026-10-14, Tommy: "the compute pod is like 639k
plus the nextnrg microcontroller is another 125k"): `editor-cost.js` lines
`omegaCore` at `PRODUCT.systemCostUsd` a skid (no contingency, never ITC
energy property), the record's `capexLines.omegaCore` names it and
`site-model.hostOf` takes it back out of the host's case, so the whole
project counts it once. **Solar is priced at the DOE/NREL Q1 2025 book**
(`BENCH.pv*`, modeled market price: residential under 25 kW $2.95/Wdc,
commercial to 20 MW $1.98, utility $1.12; a canopy $2.75), and a rectangle
array is stamped with its module like a traced one, so an array built with
NextNRG's EAGLE G7B (the default) is NextNRG's and priced at its $1.98/W
solar rate (`omegaSolarIsNextnrg`: the stamp, else the project's module);
the generic 550 W module in Solar Assumptions is the benchmark road. A
traced area lays out with the preset of its MOUNT (a select on the modal,
starting from the ribbon's Solar choice) so a traced roof and the roof
rectangle agree; a roof's rows are 2-up landscape at 10° on a 12.5 ft pitch
(`GM_TABLE.rooftop` 7.5 ft deep, the rooftop preset GCR 0.60; Tommy,
2026-10-14: "it should be at 12.5 for roof mount"), and an array's kW-DC can be SET BY HAND on Array — Edit
Size / Capacity (`kwOverride`, `kwAuto` kept beside it, Clear restores;
`_derApplyKwOverride` runs at every recompute). Nothing a tenant reads names the source
workbook; it is the Omega-Core skid. `docs/OMEGA-CORE.md`. Grid Atlas opens at the site's
address (`/grid-atlas.html?q=`). The Site SPV term sheet is
`api/_lib/site-agreement.js` (`compose` reads, never invents; `render`
is pdf-lib, DRAFT on every page) behind `GET …&agreement=1`; it is never
stored as a fact. **The register** (`api/_lib/portfolio/register.js` +
`register-ext.js`, folded in from the asset-manager draft PR #286 on
2026-10-11, mounted on the same door by `REG.owns(req)`): imports with a
field-level diff, conflicts on reviewed facts and undo (the EVCS intake by
its header signature, the EVCS model package that enriches and never
creates, the generic list), facts with cell provenance and review, saved
views, portfolios, CSV export, agreements / equipment / tasks, power
evidence (headroom contract, PUE once, shared envelopes in a transaction,
interval coverage, BESS energy budget), bills and their review queue,
versioned results with stale propagation, scenarios on the one engine
(`economics.legacyPod` runs `proforma.js monthlyFlows`; XIRR discloses
no-root and multi-root; IQGEN is a separate set), finance packages with
server-side gates and ONE private submission, the CRM pipeline and the
widget. ONE collection set: the register's facts, flags, revision and
lifecycle live on the CRM's `sites/{id}` record beside the flat fields
(`site-bridge.js` normalize / flatten is the one bridge; `address` is one
object, `addressLine()` reads either shape), its own records beside it as
`site_*` (all stated in the rules), every write in `omega_audit`. ONE EVCS
importer: the intake profile through import-preview / import-commit and
`scripts/seed-evcs-portfolio.js` (dry run offline; `--apply` refuses
without the org and `--confirm-org`); the data.json script is gone. The
site record's *Power & bills* tab and the package on the capital tab are
its UI; `portfolio.html` sends a workbook through the previewed import and
ranks POSITIVE IRRs first (Tommy, 2026-10-11: "the point is to get positive
IRRs"). **Terra Energy is the solar partner** (`api/_lib/partners.js`,
`send-to-partner`): the site's facts, the compute case and the links mailed
to the address in `TERRA_ENERGY_EMAIL` or `fin_settings/dealroom.orgs.terra`
(never a constant; none → refused, nothing mailed), the sender in copy,
recorded on the site (`partners.terra`) and in `partner_requests`, 25 a
workspace a day; Terra funds its own package and is a partner, not the
capital request. Held by `scripts/test-site-crm.js`, `npm run
test:portfolio` (the draft's T01–T35 re-homed; T26 pinned offline) and the
workspace render check's portfolio flow. `docs/PORTFOLIO-ASSET-MANAGER-PLAN.md`
carries the fold-in status and the go-live steps (deploy the rules by hand
first; verify the EVCS org exists before seeding; no accounts are made).

## Helios Intake (2026-09-30)

**Helios Energy Advisors' first-pass checklist, filled from the project and
sent from the editor** (Tommy: "help the client fill this out and autofill
as much as possible and then send to the email address for helios"). The
Output tab's *Helios Intake* (`omega-helios-intake.js`, ES5, on the `export`
cap beside Apply for Financing) gathers what the session knows — the
drawing, the parcel lookup, Grid Atlas, the substation lookup, the terrain
sample, the project mode and drawn POI, the imported bill, the Viability
Workflow's answers read off `localStorage` — and `POST /api/helios-intake`
is the ONE door: `draft` composes the answers with a source under each
(`api/_lib/helios-intake.js compose()`: read, never invent; a question the
platform cannot answer stays BLANK, never "Unknown"; a screening figure says
so in the sentence), `preview` fills Helios's OWN PDF by field name
(`forms/helios-first-pass.pdf`, pdf-lib server side from `vendor/pdf-lib/`,
as the EV workbook
fills United Illuminating's form) and hands it back, `send` stores it under
`projects/{id}/` in Storage, mails it to Helios with the sender and ClearSky
in copy (`mail.send` now carries `cc`/`attachments`), attaches a site-map
JPEG when asked, and records `projects/{id}.heliosIntake` plus
`intakes/{sendId}`. Text is transliterated to what the form's Helvetica
prints (`toWinAnsi`), measured as drawn, wrapped, shrunk and, only then,
cut, and `issues` says what was cut or changed before anything is sent.
Drafting follows the projects READ rule (never an `org_members` grant) and
the caller's plan (Omega Capital in a package; the editor's `export` or
the finance add-on on a legacy plan, `addons.judge`); sending is the
project's own workspace only, a record not pending/suspended/cancelled, no
personal domain, not a viewer, a verified email or `admin.clientAdmin` or
staff, five a project and twenty-five a workspace a day on counters no rule
opens, and a `sendId` claimed in a transaction so a retry never mails twice.
The editor's default BTM is not a choice and is never reported. Helios's
address is `HELIOS_INTAKE_EMAIL`, else
`fin_settings/dealroom.orgs.helios`, never a constant; unset means the
dialog says so and nothing is mailed. `scripts/tests/thelios.js` pins the
form's field names and the door. Design and the not-built list:
`docs/HELIOS-INTAKE.md`.

## Grid panel — Grid Atlas inside Site Map (2026-10-16)

**The FENECON demo flow is how the product works** (Tommy: "that's how the
Grid Atlas should work, and we should have the Grid Atlas built into the
editor"; `docs/GUIDED-SITE-FLOW.md`). Analyze › Grid Check
(`rb-grid-panel`, Omega Grid's, beside Grid Atlas) is `omega-grid-panel.js`:
the project's site point and the BESS Guided Build's unit (never typed),
the nearest substation from the Grid Atlas service the pre-screen already
calls (`OmegaGridPrescreen`, `/api/grid-atlas`), then the serving utility
and the circuit at the parcel from the national door Omega Prime asks
(2026-10-17: `GV.hosting` → `POST /api/hosting-capacity` with the point,
the unit and that substation; National hosting capacity, below), NET of the
queue where the utility publishes one beside a gross figure, and the
verdict — Fits / Fits only smaller / Needs a study, and the substation's
chip — in the same answer from `api/_lib/grid-verdict.js` (gated as
`/api/grid-atlas` is; every threshold is server-side). Every coverage case
is drawn as Prime draws it (the utility's name, every candidate when the
territory is not confident, where the power comes from, the provenance and
the door's request log, the utility's own map), the queue and side words
follow the answer (`queueNetted`, `basis`, a null `queuedKw` is "not
published", never 0), the panel names no utility of its own, and the
editor no longer loads `omega-comed-layers.js` (the Site Finder's). A door
that does not answer is said and records nothing. `S.grid` carries the
service's measurement plus `substation`, `circuit` and `verdict`
(`GV.fromHosting`, the record Prime writes), rides `saveProject()`'s
allowlist (with `savedBy`), is restored on load, and the pre-screen keeps
the panel's answer when it re-measures the same point.
`scripts/tests/tgridverdict.js` (the real door on a fake network: ComEd's
sentence byte for byte, Mesa AZ). **Site Plan's Grid Atlas layer**
(`omega-editor-v2-grid.js` in `editor-v2.html`) asks the same door the same
way: no routing by state in the browser (Illinois outside ComEd is asked
too, where it once was not), its card's lines drawn from the answer with
the utility's own map as an https link, and `editor-v2.html` no longer loads
the ComEd module; `scripts/tests/tgridlayer.js` runs it on the real door.
`scripts/render-grid-panel.js` (in `check:pages`) holds both in Chromium:
Site Map's Grid Check at ComEd, Mesa and on a 390 px phone, and Site Plan's
layer at its Phoenix sample. The standalone Grid Atlas and Site Finder stay for
prospecting many sites. Both the panel and Omega Prime ask through ONE
client, `omega-grid-verdict.js` (the national door, `/api/grid-verdict`,
the coverage words `COVERAGE`, and the `grid.*` record shape). **Omega
Prime sets up the real project** (2026-10-16,
Tommy: "it does the set up and system like the artifact sandbox"), and
**carries it all the way to Omega Teleios** (2026-10-17, Tommy: "print a
quote … cleancell's bess specs … remove fenecon … when we open in site map
editor it needs to transfer over what we drew … save this process … send a
simple proposal out that matches the tenant's details … track them … if it
gets approved then it goes to omega logic to be fulfilled and when it is
fulfilled … Omega Teleios (which means complete)"). `omega-prime.html` runs
Site → Grid Atlas → Circuit → Load → Design → Proposal → Track. **Prime's
own drawing (Design) is what the proposal is priced from**; Site Map is the
detailed engineering editor a design is sent to, never its design of record
(2026-10-20, Tommy: "this should come from the prime editor we used … the
site map editor is for our detailed engineering drawings"). A site with no
proposal out and no order can be deleted from *Continue a site*; the guide
panel moves (kept per browser, docked on a phone):
- **Units.** `omega-prime-project.js units()`: the workspace's own products
  (a `PLACEHOLDER SPEC` row dropped), then Clean Cell's Rev H reference units
  biggest first (LG JP-2, Smart Module, CC290/125, through
  `omega-cleancell-catalog.js entries()`), then the CleanCell R60 (`PP.R60`,
  pinned figure by figure to editor.html and `api/_lib/omega-core.js`).
  FENECON's Industrial XXL only in FENECON's own workspace, first. EV
  charging, Solar, Compute and Microgrid (main #348) list the editor's own
  catalogs through `PP.forType`; a unit that is not a battery
  (`PP.screenable`) is quote required, sized in Site Map: named utility,
  nothing judged, priced or built as a battery. A unit whose maker has
  not released its footprint is drawn at its REFERENCE size (2026-10-20,
  Tommy: "it does it for fenecon unit but not on cleancell get that
  fixed"): the CC290/125's reference cabinet, a 20 × 8 ft container where
  the brochure names one (LG JP-2, Smart Module), `footprint: 'reference'`,
  said to be confirmed on the submittal everywhere it shows; the rep's
  typed submittal size replaces it; a unit with no figure at all stays a
  marked point. **A proposal quotes only a unit the list offers**
  (2026-10-20, from the ClearSky workspace: Preview on a site set up on the
  XXL before 2026-10-17 answered "not in your workspace’s list any more;
  choose it again in Omega Prime", and a started site has no picker): a
  site keeps the unit it was drawn with (`PP.unitFor`), but
  `PP.offered(list, unit)` (the list's entry by key, else the same SKU, its
  own figures) is the ONE rule the quote door's preview, save and send and
  the order hand-off (`prime-order`) resolve it by. `GET
  /api/customer-quote?projectId=` returns `unit {offered, choices}` and
  Prime's Proposal step then asks for the unit to quote from that list,
  Preview, Save and Send held, the drawing kept (area, unit point, service
  point, conduit; the gear placed for the new unit, the circuit asked again
  for it), patched with `unitChanged`; a proposal saved on the old unit then
  reads as changed and is saved again before it goes out.
- **The record.** The project is CREATED at Start (`projectDoc`) and the
  address becomes `/omega-prime?id=`; every change after is one debounced
  dotted `patch()` (`prime.*`, `grid.<part>`, `load`; never a drawing key;
  `updatedAt`/`bessList` only until Site Map has saved), flushed before Site
  Map, the Run or the proposal door read it. `restore()` resumes the whole
  session; Site Map's Push to Prime / Push to Logic
  (`?addr=&project=&step=logic`) resumes a project Prime made as itself
  (`step=logic` is Track) and otherwise starts Prime on its address, never
  attaching to a drawing it did not make. A footprint the maker has not
  RELEASED (`dimensionsStatus`) is unknown until the rep types it.
  `prime.layout` is v2 (`arrange()`: the unit long axis east–west,
  its transformer then disconnect in a row east of it, 5 ft clear, a gear the
  unit integrates not drawn; `conduitPath()`/`pathFt()` = editor.html
  `_groundPolyFt`; FNV-1a `hash`), `prime.run` keeps the Run's input
  (`runInput()`, the ONE price-site input browser and server compute).
- **Circuit.** `GV.hosting` → `POST /api/hosting-capacity` (national hosting
  capacity, below); the page names no utility of its own. The Load step asks
  `/api/utility-rates` with the territory's `eia` and `name`.
- **Open in Site Map** builds Prime's drawing in the EDITOR, exactly as drawn
  (`omega-prime-handoff.js` on `omega:project-rendered`, which `doRender`
  dispatches last): a `zonebox` for the BESS area, `_evAdd` evgear
  bess/xfmr/disco/service at Prime's centres and true footprints,
  `autoWireConduit` pad legs and the service run PVC-UG trenched on Prime's
  L, one `omegaHistBatch`, then `saveProject()` (so `savedBy` rides); the
  save adds only `prime.builtAt`/`prime.builtHash`. Never twice, never over a
  drawing, never without a live map; the Guided Build is only the fallback
  (`from=prime`, nothing placed). `_ppCollectFleet` carries `catalogKey`, so
  the Run prices the R60 by its key. `scripts/tests/tprimetransfer.js`.
- **Proposal.** `customer_quotes/{qt-…}` (Admin SDK only) through
  `api/customer-quote.js` on `api/_lib/customer-quote.js`: the price is re-run
  on the server from the project's own `prime.layout` and unit through
  price-site `_helpers`; the rep sets a margin % (default 20) or a total, never
  a body total; the customer view is an allowlist (never cost, margin or
  markup). The seller's letterhead is `deck-brand.brandOf` plus
  `omega_orgs/{org}.company` (written through `/api/tenant-branding`,
  `deck-brand.cleanCompany`; never in `tenant_public`; `billing/profile`
  when absent). `omega-quote-deck.js` is the ONE renderer (Prime's Proposal,
  the Quote Desk's Print, the public `quote.html`): no money arithmetic, the
  site plan in Web Mercator on Esri World Imagery export layers with the
  drawing on top ("Imagery © Esri"), proved aligned by `tquotedeck.js`.
  THREE PARTS of one record (Tommy: "send a site map and a proposal"):
  `opts.part` 'proposal' (all of it), 'quote' (the priced summary, no plan)
  or 'sitemap' (the drawn plan on its own page with what is on it, no
  money); Prime and the Desk print each, the customer's one link opens on a
  Proposal · Quote · Site map bar (`#sitemap` from the email's second link),
  `scripts/tests/tquotedeckparts.js`.
  Send follows the Helios door (own workspace, verified or `clientAdmin`,
  `sendId` claimed in a transaction, 5 a quote and 50 a workspace a day,
  each send a new 48-hex key, only its sha256 stored); a white label without
  a verified `mailFrom` sends a link only. `quote.html` is public like
  `proposal.html` (no tenant runtime, no Firebase, no-referrer): view (counted
  in the door, sent → viewed), approve (the snapshot the customer saw),
  decline, ask. Editing a sent quote returns it to draft and kills the link.
- **Approved → Omega Logic.** `api/_lib/prime-order.js` makes ONE order in the
  SELLER's own workspace (the quote's orgId; Tommy: "take us to the logic
  function of the tenant I'm in"): `prime_<key>`, status `new`, awaiting the
  office's price — never priced or accepted automatically. The line is
  checked by `order-lifecycle.po` against the seller's published products;
  a battery the seller has not published rides as `{reference:true, mfr}`
  with `procure {mfr, sku, model}` (bought in). A seller not on Omega Logic
  gets `handoff.error` in plain words; POST `handoff` retries.
- **Track.** `api/_lib/teleios.js ladder()` (derived at read time from
  `office-stage`, `portal.milestoneOf`, custody/coverage; no price): Proposal
  (saved, sent, viewed, approved) → Omega Logic → Delivery → **Omega
  Teleios** (on site, every warranty live: at least one on file for every
  unit). A bought-in battery with none is held and named in `need {serial,
  sku, mfr}`; Track's Omega Teleios card opens that unit's passport
  (`/logic-custody.html?org=&serial=#passport`), where the office records
  the maker's warranty (custody, above). Its Omega Logic link is
  `/omega-logic?org=<the workspace you are in>&order=<id>#orders`. The Quote
  Desk's third tab, Customer quotes (`rfq.html#customer`,
  `#customer-<id>`), lists them on `GET /api/customer-quote?list=1`; Today
  ranks them (79 approved waiting, 71 viewed no decision, 48 expiring, 41
  never opened; fourth KPI "Quotes out").
- **Connected everywhere it is listed** (Tommy: "when I open a project and it
  was made in Prime, I should be able to access what I had made in Prime, and
  the quotes I had sent out … this is so vital"): a project with `prime`
  carries an Omega Prime chip (`/omega-prime?id=`), its proposal's standing
  from the server's mirror `prime.quote` (linking to
  `/omega-prime?id=&step=track&quote=`) and its order in this workspace's
  Omega Logic, on the Projects list (`projects.html primeCell`, with a "Made
  in Omega Prime" filter) and the In flight cards (`workspace.html
  primeRow`); Site Map shows the way back for a Prime-made project.
  `scripts/tests/tprimelinks.js` and the Projects sweep.
Held by `scripts/tests/tomegaprime.js`, `tprimetransfer.js`, `tquotedeck.js`,
`tquotedesk.js`, `tteleios.js`, `scripts/test-customer-quote.js`,
`test-prime-order.js` and `scripts/render-omega-prime.js` (in `check:pages`:
the real doors on the doubles, resume, a 390 px phone, and Mesa AZ).

**National hosting capacity** (2026-10-17, Tommy: "it should not just run
comed information if its outside of comed it needs to look via api for the
utility details"; IL FL GA NJ AZ CA CT MA RI). `api/_lib/hosting-sources.js`
is the ONE registry (server-only; the browser gets the answer and
`GET /api/hosting-capacity?coverage=1`, never a URL or field name): every IOU
and large public system in the nine states, `verified` (ComEd, Ameren IL,
PSE&G, JCP&L, ACE, Rockland, PG&E, SCE, SDG&E, LADWP, Eversource CT and MA
through Envelio's JSON with the legacy maps as fallback, UI, National Grid
MA, RI Energy), `account` (Georgia Power, Unitil) or `none` with the
utility's own process named. ComEd is read only through `comed-service.js`.
`api/_lib/utility-territory.js` names the candidates (state layers, the
EIA-861 national layer, Census places); the wire is the candidate whose
published map answers at the point; overlaps are never answered with
confidence (`ISLANDS`: SRP's boundary encloses APS and City of Mesa islands;
a city's own utility stays a candidate when the point is inside the city).
`POST /api/hosting-capacity` judges with `grid-verdict` in-process (a null
queue is "not published", a netted queue is not subtracted twice, a
generation-only figure for a battery says so; a side that did not answer is
said not to have answered, never "not published"). Only strong candidates
are probed, and the answer is confident only when every other strong
candidate's own map was asked and came back empty (a co-op or city with no
map beside an IOU is never ruled out). Queue rules per source: `subtract`
(ComEd, ACE — after which ACE's restriction cap applies), `netted` (PSE&G),
`context` (a section figure beside a feeder queue: PG&E, SCE, SDG&E, National
Grid, Eversource, RI, UI, JCP&L, Ameren, Rockland). `hosting_cache/` is Admin
SDK only and keeps only WHOLE answers: 7 days a hit, 24 h an empty, 1 h a
stand-in copy read after the primary failed; never an error, a timeout or a
partial reading (a layer, join or season that did not answer); SDG&E is
never cached.
`scripts/tests/thostingsources.js`; `npm run check:hosting` is the live check.
The **hosting scout** (`.claude/agents/hosting-scout.md`, Tommy: "if you need
to you can build a bot to do this") re-verifies the registry and the
territory layers against each utility's live maps, finds a moved or newly
published map, and opens a DRAFT PR with dated corrections; it never touches
the verdict engine and never merges.
Terms: the reads are public services; legal sign-off on each `termsNote`
before relying on them commercially.

## VPP Earnings Simulator (2026-09-29)

`vpp-earnings.html` (`vppsim`, Finance cell) is INCLUDED WITH EVERY ACCOUNT
(Omega Design, every tier from trial; Tommy: "base function … we can upsell
this"; its Take it further card sells Omega Storage). It simulates what a
managed VPP (the DividendVPP model) could stack at a site from a ZIP and an
8760, 12–24 months of bills, or nothing. The math is `api/_lib/vpp-sim.js`
behind `POST /api/vpp-estimate`; `api/_lib/vpp-provider.js` is the ONE seam
for a live operator quote (`DIVIDENDVPP_API_URL`/`_KEY`, Vercel only), which
rides BESIDE the simulation, never blended. Bills go through `bess-tariff.js`
and PJM capacity through `value-stack.js` — never a second copy. Every stream
is computed, published or planning. `docs/VPP-SIMULATOR.md`,
`scripts/tests/tvppsim.js`.

## Compute Site Pro Forma and the Edge Site Screen (2026-09-30)

`compute-proforma.html` (`computeproforma`, Omega Compute; Finance hexagon
right after the VPP simulator, and the Compute hexagon) answers "can this
building's existing service carry GPU pods beside its EV chargers, a battery
and its own load, and what does it return?" — the metro-edge model Laitent
publishes (pods on power built for EV charging). The math is
`api/_lib/compute-site.js` behind `POST /api/compute-proforma` (options,
context, screen, model, optimize): 8,760 hours on one service limit, placed
in contract priority (building, firm compute, charging, then the battery and
on-demand GPUs by a monthly demand-target search, the battery reserving for
firm overloads); loads, tariffs and bills through `vpp-sim.js` `site.*` and
`bess-tariff.js`, and the returns, IRR build, sensitivities and deck through
the ONE finance engine (`proforma-engine.js`: yearly `schedule` lines, the
`refresh` block, `bess.mode: 'site'`) and `proforma-logic.js` (`opts.title`,
`flow`, `terms`) — never a second copy. Own / infra / lease are priced side
by side; Laitent's published figures are cited, never its data. The editor's
Compute › Size › Site Screen (`rb-site-screen`, `OmegaSiteScreen`) posts
`screen` from the drawing and links to the page. *Run the example* (and
`?example=1`) loads an illustrative tight 400 A site that shows every part of
the balance. `docs/COMPUTE-PROFORMA.md`, `scripts/tests/tcomputesite.js`,
`npm run check:compute`.

## Omega-Core (2026-10-02)

**ClearSky's edge-compute skid on a charging site, on its own meter, paying
the host** (Tommy: "use the land lease offering from this unit to provide
payment on charging sites to help increase the profitability of the site").
One 336 × 87 in skid: Solela Edge Compute (75 kW) + CleanCell R60 (61.44 kWh,
60 kW Sol-Ark 60K, Clean Cell's datasheet Rev A), $639,000 (2026-10-13; $450,000
before; the R60 alone is $24,000, in the server price book), 5-year minimum,
then removed with the meter turned off or bought by the host at fair market
value. Draw › Data Ctr › Omega-Core Skid is `DC_CATALOG.dc_omegacore`; the
placed `derdc` carries `omegaCore: true`, and EVERY reader of host load, host
cost, host battery and site type skips it (one 75 kW skid otherwise read as
~$8M of data centre and a "compute campus") while the legend, the Results
rail, the BOM and the spec sheet count it as itself. `BESS_CATALOG['CC-R60']`
is the R60 as a battery (integrated PCS: the catalog's own `_inc*` word wins
over the size rule; `evSkid` keeps it out of the auto-sizer). Output ›
Omega-Core (`openOmegaCore`, `data-cap="compute"`, owned by Omega Compute as
`derSetDc` is) is `omega-core-qualify.js`: it reads the Run, the drawing, the
service/transformer and the site point, fans out through
`OmegaComputeLease.evidence`, and posts to `POST /api/omega-core` on
`api/_lib/omega-core.js` — three gates (power for a new 480 V service; a
charging site, zoned, located; fiber = compute-lease's `gateFiber`, the hard
gate), skids priced on what the power carries, the lease, the host's payback
before/after off the Run, and the FMV band — never in the browser. **The
rent is per kW of compute per month** (2026-10-15, Tommy: "we pay $225/kW
… 75 × 12 × $125"; "the lease is paying $150–450 per kW"): annual rent =
kW × $/kW-month × 12; `RATE_CARD.perKwMonth` is $150 / $150 / $450 and
`monthlyPerSkid` is DERIVED at `computeKwPerSkid` (75), read off the
colocation wholesale band (CBRE ~$196/kW-month) over the cell-tower floor
(`RATE_CARD.sources`, shown with it); the card opens at the floor and is
never an offer until a rent is typed for the site (`rep.leaseMonthly`,
`rep.leaseEscalatorPct`; out of range is set aside and said). A portfolio
site prices `commercial.rentMonthly` (wins), else `commercial.rentPerKwMonth`
× 75 kW × skids × 12, else the floor, escalated by `commercial.rentEscalatorPct`,
plus `commercial.revenueShare` of gross compute (`site-model.js skidInput`;
the site record's Facts tab). The lease and the compute price are one
decision: above the floor the site wants a contracted GPU-hour rate, not
spot. When ClearSky changes the band, the card and its version move. **The skid's own economics** (Tommy, 2026-10-05,
the iQGen 75 kW cash-flow workbook, "white labeling it Omega Core Skid …
customer facing version … show bankability"): `api/_lib/omega-compute-model.js`
is that workbook, pure and server-side — chipset library with CoreWeave's
public $/GPU-hr, the CMDC 75 kW CAPEX range, the 60-month levered cash flow,
every chipset side by side, the sensitivity grid — returned as `compute` on
the same answer, priced on the skids proposed, with the host's rent as a cost
of the skid, bankability (min DSCR vs target, debt capacity at the target,
IRR) and a customer view; the build-up is staff-only; its figures are pinned
by `tomegacore.js`. The default CAPEX is the recorded skid price, $639,000
(Tommy, 2026-10-13; the default was set to the recorded price 2026-10-06); the
workbook's container range stays a choice. Compute is
priced at CoreWeave's public SPOT rate by default (Tommy, 2026-10-06: "use spot
as the default"); on-demand, inference and a typed $/GPU-hour stay choices. A legacy plan must open
the compute cap (`addons.judge`), as the button does. `S.omegaCore` rides on
the project. **No false results** (Tommy, 2026-10-02): a firm answer either way
only on a confirmed fact — Qualified / Qualified with conditions / **Needs
further qualification** (anything resting on the drawing, the public record or
a missing answer; its lease is marked indicative, not an offer, or withheld
while fiber or zoning only looks unlikely) / Does not qualify (a declined
will-serve, the utility's own kW under one skid, zoning the rep entered).
`docs/OMEGA-CORE.md`, `scripts/tests/tomegacore.js`.

## NextNRG Microgrids (2026-10-13)

**NextNRG's module, storage and controller are sold through the platform**
(Tommy: "use their specs … label them as nextnrg product … the cost is
125k/unit … auto built into the omega core skid … utility equipment for the
draw function … increase the efficiency of energy on a site by 7%").
`api/_lib/nextnrg.js` is the ONE record: the brochure's figures, the
controller's price ($125,000 a unit, ClearSky's) and the dispatch uplift
(the brochure's 6–8% modelled ROI uplift, carried as 7%). A battery wears the
NextNRG name ONLY off that spec sheet (the four Saft blocks it names, no kW
it does not publish) or from NextNRG's own product list; nothing is invented.
*NextNRG Solar — Custom* (Draw › Power Gen) traces with their module and the
array carries `product`/`mfr`/`sku`, named everywhere. The controller is
first under Controls in the Draw › Utility list. The page's catalogs
(`DER_PV_MODULES`, the NextNRG group in `BESS_CATALOG`, `UTILITY_CATALOG.mgc`,
`DC_CATALOG.dc_omegacore.controller`) carry the SPECS only and
`scripts/tests/tnextnrg.js` holds them to the record; never a price in a
browser. Draw › Power Gen › Solar draws with the EAGLE G7B by default (the
module decides W/ft², the string sizer's watts and the 3D pattern; the
Module choice is in Solar Assumptions). The NextNRG Microgrid Controller is
Draw › Utility, priced on the Run by `editor-cost.js` (`counts.mgc`: utility
shapes placed for the host, never the skid's), a Controls line on the BOM,
and built into every Omega-Core skid: the skid's system cost is $639,000 +
$125,000 = $764,000 (`PRODUCT.systemCostBreakdown`; the outlay, the FMV band
and the compute cash flow follow it). The uplift is applied once, by the ONE
dispatch (`vpp-sim.js`, `input.controller`), to the dispatch-decided bill
streams only, each stream saying so, with the brochure's caveat on the
`controller` summary; `/api/value-stack` passes the flag in and the summary
out; the editor sends it when a controller is on the host's drawing. The RFQ
routes a NextNRG line by brand: `tenants/nextnrg/tenant.json brands`, copied
by the seed. **NextNRG's solar is $1.98 per W-DC installed and NextNRG's storage is
$6.00 per W of rated power installed, EACH ITS OWN LINE wherever it stands**
(settled 2026-10-14 after four tries; `nextnrg.js SYSTEM_RATE`. Tommy:
"make sure for solar that the pricing per kW dc is industry standard", so
the solar is the DOE/NREL Q1 2025 commercial rate; "the battery at 1.5m
which is probably accurate", so the storage is $6.00 a rated watt; a system
rate per watt of solar with the battery inside charged 350 kW of solar
alone $1.98M: "its showing 1.9m for 350kW of solar"). No contingency,
energy property; NextNRG's Topanga one-pager ($1,780,063 for 315 kW DC +
300 kW / 1.8 MWh + controller) stays on the record as what they quoted a
whole system at, never as the rate. An array stamped NextNRG's, a battery of the catalog's
NextNRG group, and in NextNRG's own workspace every array and battery
(`vendorOrg`, stamped by `cost-rollup.js` off the caller). The Run's lines
ride the record (`capexLines`). `docs/NEXTNRG-MICROGRID.md`.

## Event Layer — usage telemetry (step one, 2026-09-23)

Runbook and catalogue: `docs/EVENT-LAYER.md`. `omega-events.js` (injected by
`omega-brand.js`, tagged on the finance portal) → `api/events.js` → Pub/Sub
`omega-events` → the twin's `eventsIngest` → `twin_events`.

- **Identity is stamped server-side.** The browser names the event; the
  endpoint takes uid, orgId and host from the verified token and the request.
  Never add a body field that says who or which tenant.
- **Three gates, all fail closed:** the user's `termsAcceptances` version must
  equal `TERMS_VERSION` (kept equal in `api/_lib/events.js`; `tevents.js`
  asserts it), `event_config/current.enabled`, and no `event_exclusions` doc
  for the org or `host:<hostname>`. Signed-agreement tenants (Fenecon, the
  OSA JV) sit in exclusions until counsel clears them — a clickwrap bump does
  not amend a signed MSA.
- **The catalogue is an allowlist** (`api/_lib/events.js`). A new event is a
  line there plus a reason it serves Site Map math, financing throughput or
  gamification; anything else does not belong.
- **It must never break a page.** Instrument with
  `window.OmegaEvents ? OmegaEvents.run(tool, calc, inputs, work) : work()` —
  `run()` returns the work's own result or rethrows its own error.
- Bumping `TERMS_VERSION` again means bumping it in `api/_lib/events.js` too,
  or every event is refused.

## Sales agent and the sales database (2026-09-27)

Design, setup and the not-built list: `docs/SALES-AGENT.md` (§11).
ClearSky's own book is `sales_*` in Firestore (prospects by work domain,
harvested candidates, one activity log, suppressions, config, counters),
Admin SDK only, closed explicitly in `firestore.rules`. `api/_lib/sales.js`
is the ONE rule (pure, `scripts/tests/tsales.js`); `api/sales.js` the one
door (a verified ClearSky person, or ClearSky's ADMIN machine key with
`sales:*` through `agent-auth.staffOrAgent`, which `api/growth.js` shares
for `growth:read`); `api/_lib/growth-board.js` the one join both boards
read. `POST /api/demo-request` is the website's public form (honeypot, rate
limits, stored before "Received", mailed to dev@clearsky-usa.com). The
server, not the agent, refuses: a stage moved backwards or to won/lost by
the key, a draft to the off-limits floor or a suppressed address, a cold
draft before `sales_config` has a clearsky-usa.com sender and a postal
address (warmth is READ from the records), a price in a LinkedIn post
(`lintPost`: the website may show the price list; LinkedIn may not). The
agent is `.claude/agents/sales-agent.md` + `/sales`; it drafts in Gmail and
never sends, posts or approves. JARVIS runs the same agent and draws the
same data (mission.html › Sales, `npm run check:sales`).

## Silmarillion 2.0 — joint development

The OMEGA operating system is named **Silmarillion 2.0**. Today it is an
internal codename: it appears in rules comments, this file, and the admin
console, and it is deliberately NOT on a tenant-facing page or a public
domain yet. (Single words and titles are not copyrightable and trademarks are
class-scoped — the Palantir/Anduril precedent — but publishing is a nearer
class to a book title than defense is, so keep the decision explicit rather
than accidental.)

What it names: co-development across orgs, on ONE project.

```
projects/{id}.orgId              the OWNER. never moves.
projects/{id}.orgsInvolved[]     the JDA roster. additive. owner+staff write it.
project_tasks/{ownerOrg__id}     ONE board per project, keyed by the OWNER's org
  flow[].tasks[].assigneeOrg     which org owns the task
  flow[].tasks[].assignee        a person, own-org only (see below)
Storage projects/{id}/{file}     document exchange, gated on the same roster
```

Rules that matter:
- `orgsInvolved[]` is array-contains, matching `deals.orgsInvolved` — one
  clause, one index, and it survives the seventh partner. Every read uses
  `.get('orgsInvolved', [])`; a bare reference fails the WHOLE evaluation on
  documents written before the field existed.
- A collaborator may READ and UPDATE the project but must hand back `orgId`
  and `orgsInvolved` unchanged. Otherwise a partner adds themselves to any
  project they can see. Same trap `deals` guards with `touchesAttribution()`.
- DELETE is not extended to collaborators. A partner leaving a JDA must not
  take the project with them.
- Storage `projects/**` is the first cross-service rule in that file — it
  reads the roster out of Firestore. Read is NOT `signedIn()` the way
  `fin_projects` is: a financing marketplace wants browsers, a JDA does not.

Assignment is to an ORG, not a person, across a JDA. `team_members` is
readable only for your own org, so this page cannot enumerate a partner's
staff; an org-level assignee needs no extra read because the roster is already
on the project. Person-level cross-org assignment needs a `team_members` read
widening that has not been designed yet — do not fake it with an empty
dropdown.

## Migration safety

- Data does NOT move. All repos already write to `clearsky-portal`.
- Before any cutover: run `scripts/audit-counts.js` and save the per-orgId
  counts. Re-run after. Counts must match.
- Run `backfill-orgid.html` first; older `projects` may lack `orgId`.
- Cut over one tenant at a time by repointing DNS. Old repos stay deployed
  until every tenant is on core.

## IP protection — where logic lives

Browser code is public. Anything shipped as HTML/JS can be read by any
tenant. Treat it that way.

- **Pricing, scoring, dispatch, eligibility, and financial modeling logic
  runs in `/api/`**, never in the browser. Tool HTML collects inputs,
  calls the function, renders results. Examples that must be server-side:
  unit-rate bands and eligibility rules (EV workbook), value-stack dispatch
  and revenue math, site viability scoring, pro forma / investment analysis
  math, BOM → partner routing rules.
- Every `/api/` function verifies the Firebase ID token, resolves `orgId`,
  and checks `billing/current` before doing work. A hidden link is not a
  gate; a function that refuses is.
- **ClearSky staff is a VERIFIED `@clearsky-usa.com` address.** csebuilders.com
  was retired as a staff domain on 2026-09-24 (the legacy repo's domain; no
  accounts): never add it back, and never add a domain nobody uses — if it
  lapsed, whoever registered it could verify an address and be staff.
- **Staff by email domain needs a VERIFIED email** (`email_verified`
  is the literal `true`; absent is not verified). A Firebase password account
  can be opened on any address without proving it. One rule in four places:
  `verify-token.js` `verifyIdToken()`, `admin.js` `authenticate()` (an old
  `role: 'staff'` claim cannot bypass verified-domain identity), `isAdmin()` in
  `firestore.rules`, `isAdminDomain()` in `storage.rules`. Never decide staff
  with `isStaffEmail()` on a caller; read `caller.staff`.
  `scripts/tests/tstaffverified.js` holds it.
- When reconciling or touching any tool, identify logic that belongs in
  `/api/` and move it. Record the move in `MERGE.md`.
- `omega-sso.js` refuses to boot unless `location.hostname` matches a
  domain on a `tenants/{orgId}` doc (or the staging/preview allowlist).
- Shipped JS is NOT minified: there is no build step (see the first
  constraint), so every page ships as readable source with its comments.
  Obfuscation would be a speed bump, not a control — never rely on it.
  What protects the IP is (1) the math living in `/api/`, (2) the Terms
  (`omega-legal-docs.js` §5: no retention, reverse engineering or derivative
  development; transmission to a browser is not publication) and (3) the
  notice on every shipped file, held by `scripts/tests/tcopyright.js`. The
  owner named in a notice is the LLC, literally — never `brandName()`, which
  is the tenant's white label. `docs/EDITOR-IP-AUDIT-2026-10-12.md` is the
  inventory of what still runs in the editor's browser code and the order
  to move it.
- Every source file carries the header:
  `© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.`
- Never commit secrets. Firebase Admin credentials, Stripe keys, and API
  keys live in Vercel environment variables only. The Firebase web config
  (apiKey etc.) is public by design and may be committed.
- `/tenants/osa/` is JV-partner territory governed by the JV agreement.
  Partner contributors have write access to that folder only (CODEOWNERS).

## Working conventions

- Never delete a Firestore document in a migration script. Flag, don't drop.
- Before editing `editor.html`, read `MERGE.md` — it records which build is
  canonical, what still has to be ported, and the decisions pending.
- `omega-tenant.js` MUST load directly after `omega-brand.js` on every page
  that signs users in. It wraps OmegaBrand.resolve.
- `omega-terms.js` opens ONE blocking modal per page (a second request
  waits on it), and a refused Accept reads `termsAcceptances/{uid}` back
  before it says so: the version already recorded (a second tab, a modal
  left open) IS the acceptance; a refusal that stands is tried once on a
  fresh token and then named plainly, never as a missing rule
  (`scripts/tests/tterms.js`).
- `omega-splash.js` loads FIRST in `<head>` on every page that signs users
  in (`scripts/tests/tsplash.js`): the OMEGA mark until the page is known
  (`omega:auth` signed out, `omega:entitlements`, `OmegaSplash.done()`, or
  the 4 s cap) and again the moment a link is followed or the page is left.
  A page that shows its own thing before auth answers holds (`data-hold`)
  and calls `done()`; the dashboard keeps its boot splash (`data-boot="no"`).
  Never a flash of another page or the sign-in card. `docs/LOADING-SCREEN.md`.
- Test as a tenant using `adminDomains` preview, not by editing their data.
- **A drawing is written only by an editor that says who saved it**
  (2026-10-15, the third "it reverted to an old map"): the editor's own
  transaction and live watch (2026-10-14) hold a tab running THAT code; a
  tab left open from before it shipped has neither and autosaves the old
  map while reading "Saved". So `firestore.rules` `drawingWriteAllowed()`
  refuses a `projects` update that touches the drawing keys without a fresh
  `savedBy { tab, at }`, which every drawing write in `editor.html` carries;
  a patch that leaves the drawing alone (Assign, a validation record, a
  rollup) needs nothing. A refused save loses nothing: the drawing is still
  in that tab, and the person reloads. Rules deploy by hand
  (`firebase deploy --only firestore:rules`). `scripts/tests/tsaveguard.js`.
- **Equipment is drawn from its footprint in feet, by ONE pass** (2026-10-17,
  found by the Prime transfer: the rescale had never run). The anchor
  engine's `run()` (UNIFIED ANCHORING) calls `omegaRescaleElementsOnce` once
  per frame, about each centre, on the floor the unit was placed with
  (`minW/minH`, else Insert's `OmegaInsert.floorPx`); OmegaGeo leaves
  anything `omegaElementFootprint` claims. Code that sets a unit's size by
  hand records it in feet (`lf/wf`) or the next pass undoes it. What has no
  footprint stays OmegaGeo's, stamped at the scale it was DRAWN at (on
  `zoom_changed`, before anything resizes; 2026-10-20), and the anchor engine
  centres on `_elRenderSize`, as every stamper does.
  `standDown()` replaces `window._geoReprojectAll` at boot and every wrapper
  hung on it before then goes with it (that is how the rescale, and the
  orphan sweep, were lost): a pass that must follow the map belongs in
  `run()`. `npm run
  check:element-zoom` zooms the real editor on `scripts/_lib/gmaps-double.js`;
  `scripts/tests/telementzoom.js`.
- Parcel layers: `omega-parcel-sources.js` is the ONE list of public county
  and state parcel services. The editor's View › Parcel Lines draws them on
  the map and `api/parcel.js` asks the same counties for a point; a county
  that moves its layer is fixed there, never pasted into a page
  (`scripts/tests/tparcellines.js`). Every other county comes from Regrid's
  tiles through `api/parcel-tiles.js` (REGRID_TOKEN with a Tileserver
  subscription; the token never reaches a browser, a monthly HMAC ticket
  does, so Vercel's edge caches one copy of a tile for everyone;
  `scripts/tests/tparceltiles.js`). Google's Maps API has no parcel layer.
- `npm run check:dashboard` renders the tenant dashboard (`index.html`) in
  Chromium, signed in, with the Firebase compat SDK replaced by
  `scripts/_lib/firebase-double.js` and four tenants from
  `scripts/_lib/dashboard-fixtures.js` (a new trial behind the terms modal, a
  paying legacy Standard tenant with a locked tile, a workspace awaiting
  approval, and a PACKAGED tenant on Lite alone whose `/api/package-access`
  answer is the real projection: Lite's tools open, every other tile
  locked, the starter set drawn from Lite), on a desktop and a 390px phone.
  `applyToolLocks` reads a present `toolAccess` array as the allowlist at
  any length (absent ≠ empty), which is how a package reaches the tiles.
  Phase 10B: the Account panel's Billing & plan has a packaged section
  (`renderPackagedBilling`: facts from `billing/current`, the priced figure
  and `invoices[]` from `GET /api/plan-change`, *I've paid* = reconcile-now)
  and **The Ladder** ("build your own experience and pay for what you need";
  each Omega Logic department its own opt-in): `OmegaPackageMenu.open(key,
  { view, onChanged })` is the ONE menu, handed the page's own package view
  where `OmegaCaps` is absent, and `OmegaTenant.refreshPackage()` re-asks
  the server after a change. A locked tile on a packaged workspace offers
  its module by name and price and opens the Ladder on it; a legacy tenant
  (no packaged record: NextNRG, prepaid) keeps the old request and sees no
  Ladder. **Your modules** (`renderModuleCards`, above My Applications) is
  one card per module: held ones Live in shelf order, bought-not-on ones
  named, up to three unheld rungs dashed with + Add opening the Ladder on
  them; the catalog and prices are the server's, never a second list.
  Scenarios lite-ladder, awaiting and legacy-enterprise hold it; their five
  screenshots are committed evidence, rewritten only by `--evidence` (a plain
  run writes nothing into the repo; `--shots DIR` puts every shot in DIR).
  The master console (`admin/admin-console.js`) reads a packaged tenant
  by its state machine: `_standing` has a key per state, plan and module
  keys become the price book's words from `GET /api/offerings`
  (`STATE.priceBook`, fetched at boot, never a copy), and Client Inventory
  carries the book above the legacy roster tiers
  (`scripts/tests/tadminstanding.js`). **ONE PAGE PER ACCOUNT**
  (2026-09-28, Tommy: "i should click an account and it opens a page for
  them so i can manage them and edit them and see if they paid and etc. and
  edit their account or remove it etc. other wise its so disorganized"):
  `/admin/account.html?org=` (`admin/account.js`) is where an account is
  managed, and every row on the console (Tenants, Pending signups, Access
  requests) links there; the console's inline Manage drawer
  (`openTenantDetail`) is gone. Its header answers what the account is,
  whether it is on and whether it has paid (standing); the Account card
  holds Approve / Suspend / Reactivate / Cancel (tenant-approve `reject`:
  status cancelled, hostname released, nothing deleted — `omega_orgs` is
  never deleted) and Message; the Payment card holds the packaged facts
  with *Look at the payment now* (`plan-change` reconcile-now, staff) or
  the legacy terms; the Package panel (`admin/package-panel.js`) is mounted
  on the page; the controls the drawer had (commercial terms, identity and
  branding, the relationship and shared projects, the dashboard profile,
  the people and their accounts, the Omega Logic bundle) moved there
  UNCHANGED, posting where they always did. What both pages read is
  `admin/admin-shared.js`, loaded before each (`ADMIN_EMAILS`/`accessFor`,
  `_standing`, `_tnStatusChip`, the book's words, `tenantAction`,
  `openBroadcast`, `_accountHref`, the signup in progress) — never a copy in
  a page. A domain with no record shows the SIGNUP IN PROGRESS: `POST
  /api/tenant-signup {action:'progress'}` keeps one `access_requests/{uid}`
  row per account from the moment it is made on `/start.html` (source
  `signup`, the stage, the system chosen so far PRICED BY THE SERVER, the
  email's verified state; identity from the token; an unverified address
  may report; a declined or approved row is never revived; a domain with a
  workspace records nothing) and marks it `converted` when the workspace is
  made, by Subscribe, the trial or the reviewed request. The console's
  Access requests card reads it as "in signup" with the stage and the
  system (`_reqSignupLine`), the account page opens it by domain with Set
  up (`/admin/?setup=<id>` fills the New tenant form) and Decline; login
  sends an unfinished signup back to `/start.html` (`inSignup`), and the
  dashboard's pending strip says *Finish your signup* with the way back
  instead of "with the ClearSky team" (`tpending.js`). Held by
  `scripts/render-admin-account.js` (in `check:pages`: the real page and the
  real console on the Firebase double, the real endpoints on the Firestore
  double) and `tadminstanding.js`. It fails on an error, an unanswered
  `/api/` call, a stray write, sideways scroll, or a lock overlay outside its
  tile. `check:pages` does not cover the dashboard; run this after any
  change to `index.html` or the runtime it loads. The double's own test is
  `scripts/tests/tfirebasedouble.js`; like the real SDK it hands back the
  existing app for a second `initializeApp` with the same options (it used
  to throw, which killed projects.html in every render check). The
  dashboard's click sweep clicks every control as four tenants, and
  `starter-remove` holds that Remove on a starter tile keeps the rest (the
  first pin change starts from the starter set, `_STARTER`).
- The sales agent's board is `GET /api/growth` (staff only, read-only;
  `api/_lib/growth.js` is the pure judgement, `scripts/tests/tgrowth.js`
  pins it). It knows stages and next actions, never prices or modules: the
  catalog and the price book are the packaging build's, in one place each.
  Design and rungs: `docs/SALES-AGENT.md`.
- Branding assets: OMEGA mark is white-on-transparent; verify on the navy
  topbar, never by opening the PNG directly.
- Staging: Vercel's own `*.vercel.app` preview URLs. They are on the
  `PREVIEW_SUFFIXES` allowlist in `omega-tenant.js` and they resolve.
  `staging.clearskyomega.com` and `next.clearskyomega.com` are on that
  same allowlist but have never had DNS records — they are reservations,
  not hosts, so do not send a tool or a teammate at either one. The public
  front door is `silmarillion.clearskyomega.com`. Tenant docs may carry
  `preview: true` to canary a build.
