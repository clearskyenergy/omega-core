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
/omega-*.js             shared runtime: sso, brand, TENANT (new), tools, terms,
                        assets, delivery, legal, capacity-ledger…
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
- Staging: `staging.clearskyomega.com`. Tenant docs may carry
  `preview: true` to canary a build.
