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

## Access rules (summary)

| Doc                              | tenant owner | tenant admin | member | csebuilders.com |
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

## Self-serve signup (policy decided 2026-09-06)

Hub host `app.clearskyomega.com` serves `/start.html`. Sign in → if
`omega_orgs/{emailDomain}` exists, route to its hostname (colleagues
auto-join as `member`); else the form → `POST /api/tenant-signup` creates
the tenant `status: 'pending'` on a 30-day trial. Work email only —
public providers in `api/_lib/public-domains.js` are refused. ClearSky
approves via `POST /api/tenant-approve` (master console button). A pending
tenant's users see a "being set up" screen from `omega-tenant.js`. Never
let a browser create `omega_orgs` directly.

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
  grant an `@csebuilders.com` token. It does NOT write `tenant_public` — that
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

- **One chrome.** `OmegaLogicTheme.chrome()` in `omega-logic-theme.js` paints
  the header (name · who · Sign out) and the left menu on EVERY office page,
  in the order the business runs. A page never builds its own menu; it calls
  `chrome({org, current, owner, brand, who, local})` after its API response.
  Website, installation and the URL generator are ClearSky's and show only
  for a ClearSky owner (`ownerFlag` remembers the answer for pages whose
  endpoint does not say; showing a link is never access).
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
  Design and what is not built: `docs/LOGISTICS-CUSTODY.md`.
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
  is not). Add an app there, not in a page.
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
- Chromium render checks for all of it: `npm run check:pages`.

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
- When reconciling or touching any tool, identify logic that belongs in
  `/api/` and move it. Record the move in `MERGE.md`.
- `omega-sso.js` refuses to boot unless `location.hostname` matches a
  domain on a `tenants/{orgId}` doc (or the staging/preview allowlist).
- Shipped JS is minified in the Vercel build step; source in the repo stays
  readable. Obfuscation is a speed bump, not a control — do not rely on it.
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
- Test as a tenant using `adminDomains` preview, not by editing their data.
- Branding assets: OMEGA mark is white-on-transparent; verify on the navy
  topbar, never by opening the PNG directly.
- Staging: Vercel's own `*.vercel.app` preview URLs. They are on the
  `PREVIEW_SUFFIXES` allowlist in `omega-tenant.js` and they resolve.
  `staging.clearskyomega.com` and `next.clearskyomega.com` are on that
  same allowlist but have never had DNS records — they are reservations,
  not hosts, so do not send a tool or a teammate at either one. The public
  front door is `silmarillion.clearskyomega.com`. Tenant docs may carry
  `preview: true` to canary a build.
