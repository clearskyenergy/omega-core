# MERGE.md — how omega-core was assembled from 16 legacy repos

## Sales compute screening parity (2026-10-03)

Sales Parcel Screening calls the same OmegaSiteIntel intake/gridScore engine
as the Site Map Parcel Screening Register. It now also calls the existing
Firebase-authenticated `/api/network-proximity` service for precise addresses,
with its existing billing/module checks. Fiber reach, route diversity and
connectivity-only data-center suitability remain separate from the power
score. Missing connectivity produces Verify; unfavorable connectivity holds
a compute candidate. A favorable power score cannot hide that gate.

The server adapter carries mapped circuit and pipeline evidence into the
existing grid engine. No new grid/fiber score formulas are introduced.
Pursuit gating and evidence normalization run in `api/_lib/compute-screening.js`;
the browser only requests provider results and renders/export them. Planning
MW from the existing voltage/acreage heuristic is explicitly not approved
utility capacity. Carrier bandwidth also remains unconfirmed.

Network failures retain the row, erase older connectivity evidence and mark
Verify. Address changes invalidate network evidence. CSV, print and site
review include the separate connectivity result. No new data collections,
credentials, tile subscriptions or tenant-specific core behavior.

## Sales Screening (2026-10-02)

The Sales hex now includes the Screening subject, with Parcel Screening and
BESS Portfolio Screening at `/screening.html`. The parcel tool reuses the
editor engine for single addresses and portfolios. BESS imports XLSX/CSV
portfolios, reproduces the supplied CSK full/half rubric, ranks every row,
and keeps missing evidence and unsupported sizes marked Verify.

Scoring and sizing run only in `api/_lib/portfolio-screening.js`, through
token, billing, organization, member and module checks. Parcel Screening is
owned by Omega Intel; BESS Screening by Omega Storage. Existing tool
allowlists and packaged read-only states remain authoritative. No new
collections or migrations are needed. Portfolios export as JSON or CSV.

Grid Atlas mutable request state is now isolated per invocation so
concurrent portfolio lookups cannot share another site's evidence.


Measured on 2026-09-06 against the sixteen repository snapshots. Every
"canonical" pick below is the SUPERSET build unless stated; nothing was
hand-merged inside a multi-megabyte file. Items under **TODO** are the
ports Claude Code does next, in order.

## Canonical picks

| file | taken from | why |
|---|---|---|
| `editor.html` | **ogisolar** (162,782 lines, OMEGA v4.24) | superset: osa = ogisolar −28 OGI-only functions; salesdemo = ogisolar −8. Joules/NextNRG/omega/sunesol/walters family (145,666 lines) is ogisolar −17,785 lines. |
| `index.html` | **joules.ai** (312 KB) | superset of cir (+6), concord/ogisolar (+217); zero tenant strings. Loads omega-brand + omega-tenant. |
| `projects.html` | **nextnrg** (52 KB) | +434/−84 vs the 7-way shared build. Hardcoded `nextnrg.com` fallback REPLACED with config/email-domain resolution. |
| `marketplace.html` | **nextnrg** (62 KB) | +341/−101 vs shared. Hardcoded WORKSPACES literal demoted to `LEGACY_WORKSPACES` fallback. |
| `omega-tools.js` | **clearsky-portal** (39.9 KB) | largest registry; nextnrg/sunesol carry a 19.6 KB subset. Added `catalog()` alias. |
| `omega-brand.js`, `omega-terms.js`, `omega-sso.js` | identical across 7–10 repos | byte-identical; verified by hash. |
| `omega-assets.js`, `omega-delivery.js` | joules/cir/walters | identical where present; treated as core optional modules. |
| `omega-legal.js`, `omega-legal-docs.js` | salesdemo | signing gate; core module. |
| every other `*.html` tool | largest copy across repos | see `git log` for the per-file source. |
| `api/*.js` (legacy 11) | largest copy across repos | `score.js` from osa, `validation.js` from nextnrg, rest from clearsky-portal. |

## What moved where

2026-09-21 pricing boundary: `omega-cost-model.js` and `omega-value-stack.js`
engines moved to `api/_lib/cost-model.js` and `api/_lib/value-stack.js`.
The root cost module now contains display labels/default duration and quote
badges only; the root value-stack file contains no engine. The estimator and
Site Finder request Firebase-authenticated `/api/price-site` results, including
accuracy bounds and financial outputs. Saved Site Finder estimates retain the
server response through `OmegaSiteSaves`; packet export waits for pricing.
Supplier/installer edits must be saved before the estimator can price them.

| destination | contents | from |
|---|---|---|
| `/admin/` | tools.csebuilders.com hub + `admin-console.js` (the MASTER INDEX) | clearsky-portal |
| `/console/` | alpha.clearskyomega.com ops console + intake + ops-data | omega-main |
| `/portals/finance/` | financing portal (fin_* collections) — separate product surface | finance-main |
| `/tenants/osa/` | JV partner portal, whole repo, own shell | osa-main |
| `/tenants/solela/` | ComEd pipeline shell (index.html) + IL data | solela-main |
| `/tenants/joules/` | omega-fleet.js, fleet.html, commission.html | joules.ai |
| `/tenants/tremco/` | tremco-netzero.js, preview (tremco-patches.js retired: the locked-tile Upgrade fix is in core `index.html`) | tremco |
| `/tenants/spatco/` | spatco-ev-estimate.html | SPATCO |
| `/tenants/cir/` | intake.html, queue.html (CIR's variants) | cir |
| `/tenants/<others>/` | logos + legacy `config.js` (kept for the fallback path) | each repo |
| `/docs/` | all README/INTEGRATION/PRICING/etc. markdown | clearsky-portal, salesdemo |
| `/workers/` | `comed-proxy-worker-v10.js` only (v2–v9 dropped) | clearsky-portal |
| `/scripts/` | backfill-orgid, check-rules, build_ilshines + NEW audit/seed | mixed |

Dropped: nine superseded Cloudflare worker versions, `_test_overlay.js`,
`overlay-demo.html`, duplicate PDFs/PPTX/XLSX binaries (kept in `/docs/`
where referenced), `sunesol-portal.zip`, `demo-clearskyomega.zip`.

2026-09-30 edge compute: the Compute tab's new Site Screen (editor patch
"EDGE SITE SCREEN", `rb-site-screen`) carries no logic of its own. It
gathers the drawing's chargers (`evChargerTotals`), battery
(`omegaBessFleet`), solar, the BTM panel's service inputs and the Battery
Sizer's bills, and posts them to `/api/compute-proforma` `screen`; the
hourly load balance was born server-side in `api/_lib/compute-site.js`.

## NEW in omega-core

**Self-serve signup (decided 2026-09-06):** `start.html` on the hub host
`app.clearskyomega.com` → `api/tenant-signup.js` creates the tenant
PENDING (work email only; public providers refused via
`api/_lib/public-domains.js`); `api/tenant-approve.js` (staff) flips it
live. Second person from the same domain auto-joins as member.
`omega-tenant.js` handles hub routing and the "being set up" screen.
`config.js` at the root is the ONE platform config (no tenant block).

- `omega-tenant.js` — hostname → `tenant_public/{host}` → `CLEARSKY_CONFIG.tenant`; post-auth entitlements from `omega_orgs/{org}` + `billing/current` + `members/{uid}`; hostname lock; suspension gate; wraps `OmegaBrand.resolve`.
- `omega-whitelabel.js` — what the PLATFORM is called for a white-labelled
  tenant. Wraps `OmegaBrand.platformName` the way `omega-tenant.js` wraps
  `resolve`. Loads directly after it on all nine pages that sign users in.
- `api/_lib/admin.js`, `api/set-role.js`, `api/opportunity.js`, `api/rfq.js`, `api/stripe-create.js`, `api/stripe-portal.js`, `api/stripe-webhook.js`, `api/tenant-branding.js`.
- `scripts/audit-counts.js`, `scripts/seed-omega-orgs.js`, `tenants/*/tenant.json`.
- `firestore.rules` / `storage.rules` with the control-plane blocks applied and `tenant_public` added.
- `vercel.json` hostname rewrites (alpha → console, tools → admin, osa/solela → tenant shells).

**Demoing and standing up a white label (2026-09-19).** Two gaps that were not
code problems but made the feature unusable by the people who sell it.

*Nobody could look at it.* `orgId` IS the email domain, so no ClearSky account
resolves to `cleancell.us` and a white label was invisible to its own vendor.
`?wlpreview=<orgId>` paints a signed-in page as one tenant, staff only. The
whole design is one distinction — **paint, never scope**:
`OmegaWhiteLabel.hydrate()` copies presentation keys off the previewed record
and pins `CLEARSKY_CONFIG.tenant.orgId` to the signed-in org.
`omega-bess-products.js` gained `catalogOrg()` for the same reason, kept
separate from `orgId()` so the split is legible in the code rather than in a
comment. `scripts/test-wl-preview.js` (71 assertions) mutation-tests the one
line — `{ orgId: mine || org }` — that would turn a branding feature into an
impersonation feature on `editor.html`, the page where `tenant.orgId` is born.

*Standing one up needed a service-account key.* `whitelabel-setup.html` writes
the four control-plane documents from a staff browser, using writes the rules
already grant an `@csebuilders.com` token. It refuses a cost basis, never
touches `tenant_public` (the one allowlist lives in `api/_lib/whitelabel.js`
and a browser cannot `require()` it), and reuses an existing active embed key
rather than minting a second. `scripts/seed-omega-orgs.js` stays canonical for
a bulk seed and for `tenant_public`; `scripts/seed-embed-key.js` stays
canonical for rotating, re-scoping and disabling keys, and its header now
records the second minting path rather than silently contradicting it.

*One mapping, three surfaces.* `tenants/<slug>/products.json` is the importer's
`--out` artifact, committed, and read by both the setup page and
`npm run demo`. No CSV parser exists in a browser. The committed Clean Cell
ladder is four PLACEHOLDER capacity slots — every row says so in `notes`, the
setup page warns on any row that does, and `test-wl-preview.js` asserts they
declare themselves, because a footprint drawn to scale on somebody's own lot is
the most convincing kind of wrong.

Runbook: `docs/DEMO-CLEANCELL.md`.

**White-label storefronts (2026-09-18, for Clean Cell USA).** Three surfaces:
the signed-in workspace renamed (`omega-whitelabel.js` + a `whiteLabel` block
on `omega_orgs`, mirrored through `api/_lib/whitelabel.js`'s allowlist to
`tenant_public`); a PUBLIC, unauthenticated, iframe-able storefront
(`embed/storefront.html` + `embed/loader.js`, authorised by a publishable
`embed_keys` key through `api/_lib/embed.js`); and an order spine (`orders`,
`embed_configs`, `api/embed-order.js`, `api/order-link.js`, `api/orders.js`,
`orders.html`). Full design, runbook and the list of what is NOT built:
`docs/WHITE-LABEL.md`.

### Logic moved server-side (CLAUDE.md § IP protection)

| what | from | to | why |
|---|---|---|---|
| public BESS sizing | would have been in `embed/storefront.html` | `api/embed-size.js` → `_lib/bess-engine.js` | The caller is a stranger on the open internet. Returns kW/kWh/duration; **never** `capexPerKwh`/`capexPerKw` or `paybackYr` derived from them — the sweep needs the cost basis to choose a recommendation, and one division inverts it back to the tenant's buy price. The sensitivity band is REBUILT with the capex column dropped rather than forwarded. |
| item price on an order | would have been the posted body | `api/embed-order.js`, re-read from `storefront.config.products` by SKU | A browser that could set `listPrice` could order 4 MWh for a dollar and hold a document saying we agreed. Quantity is the only number the customer chooses. |
| order pricing and lifecycle | — | `api/orders.js` | "Only ClearSky may price, but the tenant may always cancel" is a commercial arrangement. It cannot be expressed in `firestore.rules`, and it should not be, because the people who negotiate it will never read that file. |
| storefront catalogue publication | `equipment where vendorOrgId ==` (the obvious query) | explicit `storefront/config.products` | Those rows are the tenant's INTERNAL catalogue and carry cost on some of them. A "safe fields" filter is a list somebody has to remember to update, and the failure is silent and public. |
| tenant attribution on editor exports | hardcoded `poweredByLine()` | reads the white-label block | The proposal a designer hands their customer is the highest-value leak in the estate. |
| yard fit geometry | would have been in `embed/storefront.html` | `api/embed-layout.js` → `_lib/site-fit.js` | The placement sweep, the setback raster and the packing rules are the METHOD. Shipped to the browser, any tenant reads how OMEGA decides what fits where — the same reasoning `api/site-plan.js` already gives for itself. |
| address → point | inline in `api/greenfield.js` | `api/_lib/geocode.js` | One copy, now shared. Not IP (both sources are keyless and free) — it is server-side because the POINT is what authorises a metered parcel lookup, and a browser that geocoded for itself could ask us to bill a lookup for a place it invented. |
| tenant BESS products | nowhere — `BESS_CATALOG` was hardcoded in `editor.html` and no tenant could add to it | `omega-bess-products.js`, reading `storefront/config.products` | Not an IP move: an extension point. A white-labelled MANUFACTURER whose own guided build laid out a competitor's container is the failure this fixes. Additive and namespaced by org, because a saved project references a catalogue key. |
| parcel lookup chain | was only reachable from `api/parcel.js`'s handler | exposed via its `_helpers` seam | Cook County moved its layer in 2026. A second copy of the source order, timeouts and county extents would have drifted, and the drifted one would have been the one serving the public. |

## TODO — Claude Code sessions, in order

1. **Port the AHJ research block into editor.html.** The Joules family has
   `renderAhj, research, pass1, pass2, mergeResearched, ask, byTemplateKey,
   sysLine, toKeys` (≈ lines 23,800–24,300 of joules.ai/editor.html);
   ogisolar's build does not. Port it verbatim; do not rewrite.
2. **Extract OGI-only functions** from `editor.html` into
   `tenants/ogisolar/ogi-ext.js`: `root_OGI, ogiPanel, tierGate, snapTier,
   typologyAuto, siteParcel, siteSolarMwAc, siteStructures,
   siteSubstationKind, selectGen, hourFive, infraGap, retrofitCost,
   scheduleRisk, exitValue, conversion, unverified` and the 8 salesdemo
   deltas (`button, coverageOf, create, drop, links, picks, rating, update`).
   Add an extension hook in editor.html that loads `/tenants/<slug>/*-ext.js`
   when `OmegaTenant.tenant.shell` names it.
3. **Joules placeholder buttons** (`omegaJoulesSoon`, two ribbon buttons)
   → `tenants/joules/joules-ext.js` via the same hook.
4. **Diff the older editor builds** — SPATCO (73 K lines), iqgen (82 K),
   tremco (110 K), cir (140 K) — against canonical and list any function
   present there and absent in canonical. Expect none; confirm.
5. **Wire `verticals/{v}.defaultWidgets`** into the index dashboard palette
   (the `dashboard_layouts` code at index.html ≈ line 5150–5215) and add
   `omega_orgs/{org}/layouts/default` as the org-level starter.
6. **Opportunity/RFQ client hooks**: in editor.html, on SKU placement call
   `POST /api/opportunity`; in the BOM panel add "Request for Quote" →
   `POST /api/rfq`. Add the Opportunities/RFQ inbox widget (reads
   `collectionGroup('recipients')` and `opportunities` where vendorOrgId).
7. **account-settings.html** → branding form (logo upload to
   `tenants/{org}/`, `POST /api/tenant-branding`), members table with role
   dropdown (`POST /api/set-role`), "Manage billing" (`POST /api/stripe-portal`).
8. **admin/admin-console.js** → point the client inventory at `omega_orgs`;
   add a PENDING SIGNUPS queue (`omega_orgs where status == 'pending'`)
   with Approve/Reject buttons calling `/api/tenant-approve`; tier/addon
   editors, subscription-due, Stripe create.
9. **Move pricing/scoring logic server-side** per CLAUDE.md IP section:
   ev-cost-workbook unit-rate bands, valuestack dispatch. (Proforma math:
   done 2026-09-24 — `api/_lib/proforma-engine.js`, see the entry below.)
10. **Consolidate the orgAlias map** into one exported constant imported by
    the four clients (rules stay hand-mirrored).
11. **White-label `editor.html`.** ⚠ It now has an ACCESS GATE
    (`omega-editor-gate.js`) — signed-in user of an active tenant, failing
    OPEN on a missing record the way `tenantActive()` does. Anything added
    here must not turn that into a fail-closed check.
     Its export attribution and its BESS product
    catalogue are done (`poweredByLine()` reads the white-label block;
    `omega-bess-products.js` merges the tenant's own products into
    `BESS_CATALOG` and leads the dropdown with them; both are defensive and
    no-op when the tenant has nothing configured). **The head block is now DONE** (2026-09-20):
    `OmegaWhiteLabel.paintHead()` rewrites `apple-mobile-web-app-title`,
    `application-name`, `og:site_name`, the `description`, both icon links
    and the inline manifest from the tenant record, on every page that loads
    `omega-whitelabel.js`. It rewrites rather than find-and-replaces, so a
    head edited later needs no second pass, and it is a no-op for a tenant
    with no white label. Verified in Chromium; the `<title>` was already
    handled by the `brand()` block.
     **The count was wrong.** A full line-by-line read of all 175,813 lines
    found **45** user-visible branding strings, not ~29. The undercount was
    two families a grep for "ClearSky" cannot see: nine DXF/SCR/GeoJSON/PPTX
    export-provenance strings saying `Omega Site Pro` / `Omega Editor`
    (≈ lines 63014, 63405, 63942, 63952, 105755, 108768, 114869, 122125,
    123737) and four CRM-integration modal strings (≈ 2354, 72917, 72960,
    72145). Grep for `Omega` as well as `ClearSky` when finishing this.
     Still ClearSky-branded after the head fix: those two families, five PDF
    export headers (≈ 30628, 32039, 32078, 32104, 32412), three
    `createdBy:'ClearSky'` seed records (≈ 32770, 32824, 32843), and its OWN
    brand resolver (`CS_TENANTS` / `CS_BRAND` / `brandName()`, ≈ line 69840)
    which predates `omega-brand.js` and does not consult it.
    ⚠ NOT a ride-along on another change. The page loads neither
    `omega-brand.js` nor `omega-tenant.js`; adding them brings the HOSTNAME
    LOCK to a page that currently boots on hosts nobody has registered, so it
    needs its own test pass. Convert the strings with
    `<span data-omega-platform>` as you go — see `docs/WHITE-LABEL.md`.
12. **Editor → order link button.** `api/order-link.js` works and is callable;
    nothing in `editor.html` calls it. One button in the BOM panel: POST the
    placed SKUs and the system size, show the returned customer URL.
13. **Fold `api/greenfield.js`'s remaining inline helpers into `_lib/`.** Its
    geocoder now delegates to `_lib/geocode.js`; its county-slug FIPS map and
    listing parser are still inline. Low priority — it has no test, which is
    why the geocoder extraction was kept to three lines.
14. **Promote a site study into a real layout.** `_lib/site-fit.js` works in
    the same local-feet frame as `scripts/site-agent/example-site.json`, on
    purpose: a concept a customer accepted can be handed to
    `_lib/site-agent-planner.js` without reinterpreting its axes. What is
    missing is the evidence the planner demands — the confirmed service wall
    above all. That is a signed-in workflow, not a public one.

## Decisions made (2026-09-06)

- New workspaces go live only after ClearSky approval (`status: pending`).
- Work email required; personal providers are refused at signup.
- Same-domain colleagues auto-join as `member`.
- Trial length: 30 days (`TRIAL_DAYS` env, default 30).

## Decisions pending (Tommy)

- [x] Remove `sunesol.com` / `ogisolar.com` from `isConsoleViewer()`? — **done
      2026-09-18.** It is `isAdmin()` now. Forced by the OSA own-only inbox:
      every non-staff user that feature admits is at one of those two domains,
      so its guarantee rested on a browser filter while the rules said
      otherwise. JV members still reach a project by owning it
      (`orgId == userOrg()`) or by being on its roster (`isCollaborator()` —
      `userOrg()` in `orgsInvolved[]`); `tenants/osa/ingest-data.js` queries
      both and merges. ⚠ NOT LIVE UNTIL `firebase deploy --only firestore:rules`.
- [ ] Flip legacy `fin_projects/{projectId}/{file}` Storage write to `if false`?
- [ ] Same for `mkt_projects/` Storage write?
- [ ] Delete the deprecated `intake_requests` rules block (confirm collection empty first)?
- [ ] Which terms gate survives: `termsAcceptances` or `legal_acceptances`?
- [ ] OSA: sign-in domain / orgId for `tenants/osa/tenant.json`.
- [ ] Verify every hostname in `tenants/*/tenant.json` (they were inferred from the recipe `<n>.csebuilders.com` / `<n>.clearskyomega.com`).

## Verification before first deploy

```
npm install
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npm run audit > audit-before.json
npm run seed:dry            # read tenants/*/tenant.json, print the plan
# review, then:
npm run seed:apply
firebase deploy --only firestore:rules,storage      # from this repo
# Firebase Console → Authentication → Settings → Authorized domains: add
#   app.clearskyomega.com and *.clearskyomega.com (each tenant host)
# Vercel: add app.clearskyomega.com + wildcard *.clearskyomega.com
# grep the LIVE rules for isTenantAdmin, opportunities, tenant_public
vercel --prod               # to next.clearskyomega.com first, NOT a tenant host
# sign in as each tenant via adminDomains preview; compare project counts
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npm run audit > audit-after.json
node scripts/audit-counts.js --diff audit-before.json audit-after.json
```

## IP: logic that is still in the browser  (2026-09-06)

CLAUDE.md: *"Pricing, scoring, dispatch, eligibility, and financial modeling
logic runs in `/api/`, never in the browser"*, and it names **site viability
scoring** among the examples that must be server-side. Three engines added or
touched this session do not yet comply. Recorded here rather than fixed
quietly, because each is a real move with a blocker attached.

- [ ] **`computeInterconnectScore()` and the Project Intelligence panel
      (editor.html) — the site screen and the investability score.** Added to
      this list 2026-09-14 while fixing what they reported. The five factor
      weights (0.28 / 0.24 / 0.20 / 0.16 / 0.12), every scoring ladder behind
      them (hosting-capacity ratio bands, substation distance bands, permit-day
      bands, queue-month bands, parcel-fit bands), the 45/35/20 investability
      blend, the PURSUE / ADVANCE / HOLD thresholds and the economics term
      `rev / cost × 650` are all in the page. That is site viability scoring and
      financial modelling, both named in the rule.
      **The split:** the readiness checklist stays client-side — it only asks
      what the open project contains, and it needs no secrets. `/api/site-score`
      takes the ZIP, the state, the system size and whatever of `_SITE_DATA` is
      real, and returns the factors, the score and the decision. **Blocker:** the
      editor is expected to work with a dead network, so the API needs a
      graceful answer the page can render as "score unavailable" rather than a
      silent fall back to a local copy of the model, which would defeat the move.

- [ ] **`omega-site-intel.js` — the grid score.** The whole model ships to the
      browser: the 35/25/15/15/10 component weights, the voltage-to-MW capacity
      ladder, the distance bands and the hazard setback formula. Any tenant can
      read the screening methodology in devtools.
      **The split:** parsing, feature classification and geodesy stay
      client-side — they are mechanical, and the KMZ never leaves the machine.
      Only `gridScore()` moves, to `/api/site-score`, behind a token check and
      a `billing/current` read.
      **Not blocked.** `api/_lib/verify-token.js` (added this session) verifies
      a Firebase ID token against Google's public certificates and reads the
      caller's own billing record through the Firestore REST API, so this needs
      no service account. It is the reason the tool can be sold at Deluxe at
      all: a `data-cap` panel is an upsell, not a gate.

- [ ] **The permitting engine (`editor.html`, OMEGA PERMIT).** Templates, the
      review-type planning bands and the CPM pass are all client-side. Lower
      priority than the grid score — the code references are public and the
      jurisdiction packs are the asset — but the bands and the trigger logic
      are the product.

- [x] **BOM → partner routing.** Already correct. `api/rfq.js` owns the routing
      rule and `firestore.rules` refuses `create` on `rfqs` and its
      `recipients` subcollection to everyone else, so a browser cannot route
      its own BOM. The editor posts the whole BOM and the server decides the
      slices. **Blocked on `FIREBASE_SERVICE_ACCOUNT`** — this one needs to
      write, and the rules deny the caller that write by design, so the
      read-only path above cannot substitute.

- [x] **AI render (`api/render.js` + OMEGA AI RENDER in `editor.html`)**
      (2026-09-12). The function took any POST that passed CORS and spent the
      shared `GOOGLE_AI_KEY`; it now runs `authenticate()`, refuses a
      non-active tenant and honours `billing.toolOverrides.render === false`
      (staff bypass, degraded mode passes a verified identity through). The
      editor sends the ID token, tries the server FIRST and only falls back to
      the tenant's browser-held Gemini key when no service answers, retries
      only on a real 404 (never on a timeout, which could bill twice), and
      renders the result as a DOM node after a data-URL/https check.
      **Still open:** the response is base64 PNG inside JSON and can exceed
      Vercel's 4.5 MB reply limit at high quality — re-encode to JPEG or
      return a Storage URL. The browser-held Gemini key (`clearsky_gemini_key`,
      Settings › AI Keys) is an app-wide posture, not a render-specific one.

## Also outstanding  (2026-09-06)

- [ ] `/omega-settings.js` 404s on seven tools; `/omega-intake.js` on one.
      Nothing references `OmegaSettings` anywhere, and
      `interconnection-study.html` carries a "deploy it alongside this tool"
      fallback — so the module was planned and never written. Build it or drop
      the feature; it is a product call, not cleanup.
- [ ] No Storage rule for `referrals/{orgId}/{referralId}/{file}`. Attachments
      fail with `storage/unauthorized` and the block degrades to links-only, as
      its own footer documents. The documented rule lets any signed-in user
      write 25 MB under that path — widen `storage.rules` deliberately or not
      at all.
- [ ] Two CRM rows both named Fenecon (`c-1785202116727` "building",
      `c-1786550295378` "up"). The DUPLICATE RECORD badge is correct. Which one
      to delete is a data decision.
- [ ] `capTier: 'trial'` still to be set on `chileasing.com` — Tenants & Users
      → Manage → Editor cap → "designer only", signed in as clearsky-usa.com.

## The sidebar is written three times  (2026-09-06)

- [ ] `index.html`, `marketplace.html` and `projects.html` each implement the
      left nav separately. They have already drifted twice in ways that
      shipped: the My Applications toggle fought `style.display` on two of the
      three while the CSS collapsed with an `.open` class, and `projects.html`
      carried the submenu populator without `omega-tools.js`, so that list
      could never have had anything in it.

      Both are fixed, and a third bug of the same shape is available whenever
      somebody touches one page and not the others. The nav wants to be one
      shared partial or one `omega-nav.js`, the way `omega-brand.js` and
      `omega-tenant.js` already are — the marketplace copy's own comment
      explains that it was written separately to avoid depending on five of
      the dashboard's private internals, which is the right instinct and the
      wrong conclusion: the fix is a public API, not a third copy.

## Site Map Pro autopilot  (2026-09-11)

`editor.html` gained one inline module, `OmegaAutopilot` (after the Patch 55
OmegaSiteLocation block), that reads a URL contract and sequences functions
the page already had. Nothing in it runs unless `?address=` and `?auto=` are
both present.

    /editor.html?address=<urlencoded street address>&auto=bess|map
                [&mw=<n>&mwh=<n>][&mode=BTM|FOM][&from=jarvis|sms][&req=<id>]

`?id=`/`?project=` wins over `address` (the loaded project keeps its map).
Steps: geocode via `fetchMap()` → `POST /api/parcel` `{lat,lng}` with the
Firebase ID token (ring becomes a closed polyline pushed as `finishPolyline()`
does, then `_geoStampAll()` + `OmegaSite.setBoundary()`) → one Overpass query
for `way[highway]` + `way[building]` imported through `OmegaGIS.importText` as
`osm-context` (roads named `road <name>` so omega-site-intel classifies them)
→ the BESS guided build seeded exactly as Build > Solar + Storage seeds it,
driven through `_bgbStartPlacing` / `placeBgbAt` / `_bgbFinishRun` along the
axis from the parcel centroid to the road → `OmegaGridPrescreen.run` +
`saveToProject` + `feedSiteScore` → `openScorePanel()` → `saveProject()`.
Reports to `window.opener` as `{type:'OMEGA_AUTOPILOT', …, stoppedAt}` on the
same origin, only when `from=jarvis`. A fixed HUD (`#ap-hud`, bottom left)
shows each step and carries a Stop button; `window.__omegaAutopilot` is the
state for the console.

Two stops are human by design and stay that way: the system size when the
URL carries no `mw`/`mwh` (the guided-build modal opens; `stoppedAt:'size'`)
and the utility point of interconnection (the build pauses in `drawtrench`
at the meter; `stoppedAt:'poi'`). No catalogue unit is ever picked —
`BGB.cfg` stays the `GENERIC-BESS` placeholder and `S.bessList` is untouched.

Also in this change:

- **Parcel lookup moved server-side.** The Site Data Layers "Parcels" checkbox
  no longer writes the 2.4-acre "Sample Holdings LLC" stub with a DATA badge;
  `toggleDataLayer('parcel', on)` asks `OmegaAutopilot.parcel(lat, lng)` →
  `POST /api/parcel` (Bearer ID token; Regrid when `REGRID_TOKEN` is set,
  else the Cook/DuPage/Lake ArcGIS layers from the worker registry). The
  function ships separately; until it is deployed the row stays empty rather
  than invented.
- **`_siteScoreRefresh()` defined** (once, beside `renderScorePanel`). It was
  called behind `typeof` guards from the Grid Atlas pre-screen and
  OmegaSiteContext and defined nowhere, so an atlas result never repainted
  the Site Score panel.
- **`saveProject()` payload carries `autopilot`** (`S.autopilot`: request,
  address, size, parcel, roads, grid score, verdict, `stoppedAt`), so a run
  opened from a text message — no opener to report to — still leaves its
  result on the project record.
- **`_bgbState()` / `_bgbCurKind` exported.** The EV/BESS block is wrapped
  (`(function(){ 'use strict';` at ~57566), so `var BGB` is not a global.
  An accessor rather than `window.BGB` on purpose: fourteen `typeof BGB`
  guards outside that block (9189, 10709, 13197, 14924, 42645, 42657, 70845,
  79493, 79926 — the Solar + Storage seeding — 83731, 88885, 88939, 88956)
  have been dead since the wrap, and a global by that name would switch all
  of them on at once. Whether they should be live is a separate decision.

Pre-existing gaps noted, not fixed here (each contradicts CLAUDE.md's
"scoring in /api/" and "every /api function verifies the token"):
`computeInterconnectScore()` weights live in the browser (~28834);
`api/grid-atlas.js` checks only `GRID_ATLAS_KEY`, not a Firebase token, and
its default CORS list omits silmarillion (same-origin there, so not in play).
The design named the save function `_saveProject`; the file has `saveProject`
(async, wrapped on `window` twice) — `scripts/tests/tautopilot.js` checks
every name the module calls so the next rename is caught in node, not on a
site.

## Editor, battery sizing and fiber optimization — 2026-09-13

The editor in this snapshot incorporates the supplied September 12
`OMEGA-editor-full-pass.html` before applying this pass. The repository ZIP
remains the integration baseline for all other files.

- Native Site Visualizer changes operate on the existing drawing state:
  selection, move, rotation, uniform scale, model height/elevation/color,
  a native rectangular model block, and existing undo/redo controls.
  No Blender export is included. See `docs/OPTIMIZATION-REVIEW.md` for scope.
- Rectangular equipment uses its actual rendered height for 3D centering;
  shape outlines/table positions follow the same translation and scale as 2D.
  Overlap detection reports conflicts instead of hiding potentially real objects.
- The dedicated editor BESS engine moved from browser code to
  `api/_lib/bess-engine.js`. The standalone Battery Sizer's optimization,
  dispatch, economics, and associated report calculations moved to
  `api/_lib/battery-tool-engine.js`. Both use `POST /api/bess-size` with
  Firebase authentication and billing access matching the Battery Sizer's
  existing Standard tool tier. Deploy the API and both HTML pages together.
- Legacy claim-checking and ancillary finance calculations elsewhere in the
  editor/other finance tools are outside this pass. The pre-existing broader
  browser-logic migration backlog above is not marked complete.
- Grid Atlas includes licensed/imported routes in nearest terrestrial fiber
  analysis. GeoJSON import, source health, stale-response guards, fiber-specific
  OSM tags, and an authenticated same-origin licensed proxy were added/fixed.
  No national licensed route dataset is bundled. Existing Grid Atlas heuristic
  scoring remains a separate migration/validation item; proximity is not serviceability.

Run `npm run test:optimizer`. No database migration, live deployment, or
production writes were performed. Live browser and carrier-source acceptance
remain required. The older finance-portal copy of Battery Sizer is unchanged.
## Site agent v0.1 installed  (2026-09-12)

The bundle from `~/Desktop/omega-site-agent` is now in core: subagent in
`.claude/agents/`, planner in `api/_lib/site-agent-planner.js`, MCP server
and editor bridge in `scripts/site-agent/`, test in `scripts/tests/`.
Checksums verified before the copy. Offline tests pass from the repo.

**IP placement.** The planner went to `api/_lib/` and not the browser,
per the IP section above: placement search, clearance enforcement and the
A* conduit route are site-layout logic. `scripts/` is in `.vercelignore`,
so the MCP server and Playwright never deploy; the planner does, as a
library. It is not yet behind an HTTP endpoint with a token and a
`billing/current` read — it is called in-process by the local MCP server.
Wrapping it as `/api/site-plan` is the move that makes it tenant-safe.

**Two edits to the bundle as shipped.**
- `server.js` hard-required a `/editor.html` pathname. `vercel.json` sets
  `cleanUrls`, so the live editor 308s to `/editor` and the check refused
  it. Both spellings now pass.
- The README's host, `staging.clearskyomega.com`, is NXDOMAIN. `.mcp.json`
  points at `silmarillion.clearskyomega.com` instead. Either restore the
  staging DNS record or retire the hostname from CLAUDE.md and the README.

**Measured against the real deliverable.** `SAMPLE — 800 Progress Dr`
(Frederick MD, Gotion Grid 3.42 MWh / 1.71 MW, 480 V 3Ø) is a 12-sheet
permit set OMEGA already exports from a drawn site: cover, plot plan,
enlarged plot, demolition, one-line, signage, POI signage, equipment and
conduit schedule, BESS and gear pad details, grounding, fencing. The
sheets are not the bottleneck. The layout is, and that is what the agent
automates. What it does not yet reach on that sample:

| the sample has | the planner does |
|---|---|
| 4 equipment elements (BESS, switchgear/MDP, revenue meter, utility POI) | 2 (battery, switchgear) |
| 3 conduit runs (86 ft feeder, 15 ft metering, 26 ft service) | 1 |
| 127.3 ft of trench across those runs | one corridor, one surface |
| transformer and PCS nodes on the one-line | neither is placed |

So the v0.1 gap is not accuracy, it is topology: a meter and a POI node,
and a route graph over more than two endpoints. Those two extensions turn
the agent from a demo into the thing that drafts this set.

**Still unproven.** No signed-in editor run has happened. Geocoding, map
alignment, `_evAdd` placement, read-back and save are untested against the
live editor. Do that on a surveyed site before anyone relies on it.

## Trench lengths measure the ground, and undo leaves the scale alone  (2026-09-15)

Site designs came back with trench runs near double what Google Earth
measures on the same parking row (Menachem, 160 S Main St). Drawn runs
(`S._trenches`) were measured as `_polyLen(pts) / S.pxPerFt` in three
places (right panel, BOM civil lines, BOM summary), and `S.pxPerFt` was a
cache: refreshed on `zoom_changed`, rolled back by undo and by a tab switch
to whatever zoom the snapshot was taken at. One zoom level between two undo
points is exactly 2x on every length that followed, until the next zoom.

- `_trenchRunFt(t)` (beside `_polyLen`) measures a run from its `_geoPts`
  by haversine, same radius as `spherical.computeLength`, so a run and the
  conduit laid in it agree; falls back to pixels over `_viewPxPerFt()`.
- `_viewPxPerFt()` asks the live map for its scale and re-runs
  `_gmapAutoScale()` when the cache disagrees. Frozen plot and uploaded
  photo keep the cached value: there it is the record, not a derivation.
- `_dcfcConduitAlongRun`, `_connectToEms`, `_trenchToEms` and
  `_trenchUtilityToBess` take the view's scale, and a leg along a run takes
  its ground length the moment its anchor is cut.
- `undoLast` (FIX 6 core) and `_restoreCanvas` no longer overwrite a
  map-owned scale (`_viewOwnsScale()`); a calibrated photo still undoes.
- `scripts/tests/ttrenchft.js` covers all of it from the page's own code.

Not changed: the dimension tool already measures from the ground when the
map is live; on a committed plot it divides pixels by the scale fixed at
capture, which is correct as long as the scale is never rolled back, which
is what this closes.

**Trench once, cable many times** (same day, from the 160 S Main St sheet).
The legend read "Trench (panel→EVSE) 6 runs · 247.2 ft" and "Trench 138.5 ft ·
3 shared corridors" for a run Google Earth measures at 86 ft. The first is
materials and was right: six legs, each its own length back to the panel,
each carrying its own conduit and cable. The second was the excavation and
was wrong: `trenchTotals()` ran the corridor pass first, and two chargers
side by side make two coinciding legs, so each pair counted as its own dig
(10 + 45 + 86). The drawn-run pass now runs first: a run is one excavation,
the longest leg along it plus any lateral out to a device that was dragged
off it; coinciding legs already inside a run add nothing; hand-drawn
corridors and solo legs count as before. The legend now says "of conduit ·
in trench" on the material rows and "dug once · 6 conduits share it" on the
excavation line, and the permit sheet measures drawn runs through
`_trenchRunFt`. `_evTakeoff` already took `min(trench, dug)` for the cost
sheet, so the EV estimate follows without change.

**The interior feed is conduit, not a dig.** The Level 2 feed from the
service to the panel is `L2-INT` (EMT, inside the building) but it rides a
drawn run, so its 7 ft sat in the trench total, the drawn-trench footage on
the right panel and the BOM, and the permit sheet's corridor count. One rule
now, `_condIsIndoor(c)` (type contains INT, or the label says interior or
indoor), read by `trenchTotals`, the legend, and `_evFeetFromCanvas` (which
adds EMT for pricing, since EMT is never buried). `_trenchRunDugFt(t)` is
zero for a drawn run whose every leg is interior; the right panel, both BOM
figures and the permit sheet measure drawn runs through it. The trench line
is now what was asked for: the panel to the EVSE units, dug once.

**And it does not count at all.** The build stamped every leg it laid with
`route:'trench'`, the interior feed included, so the schedule printed
"TRENCH, IN-GROUND" for it, the callout said TRENCH, the permit notes'
trenching schedule and the PE CSV summed it, `conduitEstimate` bucketed it as
in-ground trench, and the sheet drew an excavation band under its run.
`_dcfcConduitAlongRun` now routes an interior conduit as `surface` (no
`trenchIn`); `_normalizeConduitRoutes()`, run from `updCondStat`, moves legs
saved with the old default the same way, leaving hand-drawn conduits and
any route the user cycled by hand (`routeExplicit`, set in
`cycleConduitRoute`) alone; `_dcfcRenderTrenches` paints no band under a
run whose only conduit is interior. Every consumer that keys on the route
is right without being touched.

**One trench, one line.** Only the two legs of a charger pair coincide
vertex-for-vertex, so only they formed a corridor in
`renderTrenchCorridors`, and banking them 9 px apart drew every run as two
parallel cyan lines with the other four legs hidden underneath ("it's like
you ran two lines", 145 West St). A corridor whose members are all legs of
a drawn run (`evRun`) is skipped: the run's own band is the trench, the
legs draw on its centreline, and `renderConduit` paints no per-leg band
for them. A hand-drawn conduit that coincides with a run's leg still
banks. Not yet on the live site: silmarillion still serves the build from
before this branch, which is where the 138.5 ft and 315.9 ft screenshots
came from.

## Financing portal: commission per partner, offers priced by the server, a deal room for every partner  (2026-09-16)

What was asked: when a capital partner buys a deal through the portal,
ClearSky's commission — a finders fee at milestones (Amperage Capital, 2.5%
at NTP and 2.5% at COD), a transaction fee built onto the price (Budderfly,
1% of the offer), both, or waived — is set per partner by a ClearSky
administrator, and a partner entering an offer sees the total price with it
applied. Every partner gets a deal room when their account is created; every
deal that reaches the portal is reviewed by ClearSky and pushed either to one
partner's room or to the marketplace. `finance.csebuilders.com` is to be this
repository's portal.

- **`omega-fees.js`** (root, ES5, UMD): `normalize`, `price`, `describe`. The
  one implementation; loaded by the portal and required by `/api/offer`.
- **`fin_orgs/{orgKey}.fees`** is the schedule. Admin-only: `tierHeld()` in
  the rules now pins `fees`, `feesSetBy`, `feesSetAt` on a partner's own
  writes, and a self-created org record may not carry fees. Set from
  Organizations → Set fees, or via `fees` on `POST /api/provision-partner`.
- **`POST /api/offer`** prices and files an offer. It re-asserts the rules'
  gate (partner, approved, not suspended; deal not awarded; open and unlocked,
  or held for them with a live window, or delivered into their room), reads
  the schedule off the org record, never the request, and stamps `pricing`,
  `feesApplied`, `feesSet`, `pricedAt`, `pricedBy`. The rules refuse every
  client any write to those keys (`noPricingKeys()`, `pricingUntouched()`).
  `dryRun` prices without writing; `reprice` lets ClearSky price an offer
  filed while the server was down.
- **The portal** shows the total price as the partner types (`#ofPricing`),
  sends the offer to `/api/offer`, and on 503/404/network files it directly
  with `pricingPending:true` — visible, never silent; an administrator
  prices it from the offer card. Offer cards show the fee block to the
  partner who owes it and to ClearSky, never to the sponsor.
- **Routing.** `fin_settings/intake.gateAll` (default true) stops every
  filed deal in Review. The approve dialog routes to ANY partner with an
  approved account, for a window or until released (`firstLookIndefinite`,
  stored as a hold a century out so the rules' live-window test still holds),
  and stamps `room.forOrg / forOrgId / state / deliveredAt`. Open deals can be
  pushed to a partner from Review. Partners land on a **Deal room** tab
  (held, delivered or awarded to them) with their fee schedule at the top.
  Approving a partner under People writes `fin_orgs/{orgKey}` and `orgId`
  on the profile — the room the rules can match.
- **Routing the host.** `vercel.json` rewrites `finance.csebuilders.com` and
  `financing.csebuilders.com` to `/portals/finance` (and `/dealroom`,
  `/battery-sizer`). Attaching the domains to the omega-core project is the
  manual step; `docs/finance-partner-setup.md` §6.
- **Not done here:** e-mailing a partner when a deal lands in their room
  (`/api/dealroom-send` exists but requires a data-room link); invoicing at
  NTP/COD (the milestone amounts are on the offer for whoever raises the
  invoice); a Cloud Function to sweep expired holds without a client open.
- Tests: `scripts/tests/tfees.js`. Rules changes need a deploy from the
  repo root before the portal's fee editor and `/api/offer` are honoured.


## Network proximity is a service, and Grid Atlas answers before the client gives up  (2026-09-17)

Two reports from the deployed editor on the Jersey Power Site, same morning:
the Parcel Screening Register said "Grid Atlas could not be reached" for a
parcel with 206 published substations inside 25 km, and the Network Proximity
button died on `PDB_ROUTE_FACTOR is not defined`. Thomas's ask on top: the
screen has to say whether there is fiber to support a data load, and the
network-proximity tool "needs to be perfect and access as much fiber data as
possible".

**Grid Atlas was not down. It was slow, and the client was impatient.** The
HIFLD host lost its substation service weeks ago (already noted in the file),
so every site fell through to the OpenStreetMap bundle — which in a dense
metro ran `out geom` over every power line in a 50 km box, 504'd on
overpass-api.de, and then, because the caller's 40 s budget applied to EVERY
mirror, could run 120 s against a 60 s function ceiling. Measured: 51 s to a
200 for the NJ point. The screen aborted at 35 s. Fixes in `api/grid-atlas.js`:

- Substations come from the ArcGIS mirrors `grid-atlas.html` always used
  (`SUB_SOURCES`, first answers in 0.3 s with NAME/STATUS/MAX_VOLT/LINES),
  tried before OSM. `HIFLD_SUBSTATIONS` still wins if set; an EMPTY answer
  from a mirror falls through rather than being believed.
- The Overpass bundle asks for power lines `out center`, geometry only for
  substations, pipelines and plants. OSM lines are read for `circuits` by
  voltage class, which needs no geometry; `nearestOnWay()` already falls
  back to the centre.
- `overpass()` gives the caller's budget to the first mirror only; the
  fallbacks get 6 s each, as its own comment always claimed.
- `screenCurrent()` waits 55 s, under the 60 s ceiling, for both services.

**Network proximity moved to `/api/network-proximity.js`** — the fiber half of
the same question, and the first implementation of the scoring rather than a
second one. `grid-atlas-national.js` computed a fiber score in the page from
PeeringDB/FCC/plant; `editor.html` computed facility distance from `PDB_FAC`,
a 136 KB static PeeringDB snapshot, using a constant inside a wrapped block.
The function asks six sources in parallel, each time-boxed and each reporting
ok / empty / failed / skipped with its elapsed time: PeeringDB facilities and
exchanges (live, keyless); FCC BDC business fiber at the point through
broadbandmap.com (`FCC_BB_KEY`, else "not checked" — never "no fiber");
OpenStreetMap telecom features by centre; the verified municipal/state plant
layers; an ArcGIS Online harvest of fiber feature services whose OWN metadata
extent contains the site (AGOL's bbox filter returned Broward County for New
Jersey); and the InterTubes long-haul conduit subset as a direct-line
estimate. Out of it: `fiber.score` (weights identical to the page's
`scoreFiber()` so the two agree), `fiber.verdict` — likely / plausible /
uncertain / unlikely with the reasons that earned it — a lateral estimate to
the nearest hard evidence with a $45k–$250k/mile construction band, and RTT
to the nearest carrier hotel. Smoke-tested live: Rockford found the city's
own conduit at 0 mi; the NJ point found 132 facilities within 80 mi and 60
Hudson at 0.08 ms; Frio County answered "uncertain, 52 mi to the nearest
carrier", which is the honest word for it.

Wired in three places: `OmegaGridAtlas.network()` in the shared client (sends
the signed-in user's ID token — the function requires one, via
`verify-token`, no service account); the Network Proximity panel, which now
renders the response and prints the route factor the service used; and the
screening register, where `mergeFiber()` carries the verdict on the intake as
`fiber`, a Fiber column, a detail block, nine CSV columns and a report tile +
fact line. The verdict sits BESIDE the grid score and is never averaged into
it. `scripts/test-network-proximity.js` (35 checks) is in `npm test`.

Left alone on purpose: `PDB_FAC` and `omegaNetworkProximity()` stay in
editor.html because the self-test at ~164930 calls them; delete both together
once that check is rewritten against the service. `grid-atlas.html` still
scores fiber in the page — pointing it at this function is the same "worth
doing, not urgent" note that file already carries for `/api/grid-atlas`.
`FCC_BB_KEY` is not set in Vercel; until it is, "service at the point" scores
its not-checked middle value and the verdict says so.

---

## Compute land lease — a second proposal tool, and its model in `/api/`

`sales-proposal.html` sells a PPA: we own the equipment, the customer buys the
output, and every number on the document argues about the customer's bill.
Distributed compute sells the opposite trade — the host owns nothing, buys
nothing and saves nothing; they rent us space, power and a fiber path and we
pay them. A fourth model button on that tool would have meant one document
arguing both directions, so this is a separate tool: `compute-proposal.html`,
registry key `computelease`, tier STANDARD to match `sales`.

**The logic moved to `/api/compute-lease.js` before it was ever written into a
page.** Per CLAUDE.md's IP rule, the four gates, the tranche classifier and the
lease rate card are in the function; the page collects inputs, calls three
evidence services, posts what they said, and renders the answer. There is no
pricing arithmetic in the HTML. The rate card is the commercial position of the
business — what ClearSky is willing to pay a host per kW and per acre — and
shipped in a single-file tool it would be readable by every tenant, by every
host a proposal is sent to, and by anyone who opens the network tab.

Disclosure is gated inside the function rather than at the registry: every
entitled caller gets the offer range, because a rep cannot negotiate without
it, and that is the whole point of the tool. The BANDS behind it are
staff-only, and so is `offer.components` — which discloses $/kW-year by
division just as surely as the card does. A tenant caller gets the number to
say in the room and the `rateCard.version` that produced it, marked
`disclosed: false`.

**The page fans out; the function only scores.** The obvious shape would have
been for `/api/compute-lease` to call `/api/grid-atlas`, `/api/network-proximity`
and `/api/parcel` itself. It deliberately does not. `network-proximity` is
time-boxed at 55 s against six external sources, under the 60 s ceiling;
nested inside another function that puts two timeouts in series under one
ceiling, the outer one dies first, and the rep is told nothing rather than
told about the two gates that did answer. So the three lookups run in parallel
from the browser — each gate visibly fills in as its source lands, which is
better to watch anyway — and the evidence is posted to the model. That makes
the evidence caller-supplied, which is the same trust boundary `api/score.js`
already documents: the tenant's own rep is not an adversary, and the thing
worth protecting is the rate card, not a distance anyone can measure on a
public map.

Three behaviours are load-bearing and asserted in
`scripts/test-compute-lease.js` (94 checks, in `npm test`):

- **Fiber is a hard gate and does not average.** A site that fails it is
  disqualified and NO offer is priced — `offer` is null, not a small number. A
  number on the page is a number a rep says out loud, and a rep must not be
  able to quote rent on a site that is not a compute site. Perfect power does
  not rescue it; the Illinois five-acre site is the precedent.
- **Unanswered is UNCONFIRMED, never zero.** The same distinction
  `api/grid-atlas.js` makes for a layer that did not answer. An unasked
  question drops the site to *indicative* and lands on the `asks` call list
  rather than counting against it — an empty site comes back incomplete with a
  full call list, not disqualified.
- **An unclassified tranche prices at the Tranche 1 floor, never the premium.**
  Not asking can cost us upside; it can never over-commit the rep in the room.

Grid Atlas rides in as a *secondary* signal on the power gate — a fifth of the
weight, and it can never turn an unconfirmed will-serve into a confirmed one.
That is the same warning `omega-grid-atlas-client.js` carries in its header:
substation proximity is not hosting capacity, and presenting the first as the
second is how a site gets sized against a line it is not connected to.

The proposal defaults to showing the host **the opening number alone**. The
band is three positions in a negotiation, not three estimates of the site, and
printing low–high hands the host the ceiling before anyone has said anything.
The whole band is a labelled option for an internal review copy.

⚠ **The rate card is a seed, not a comp set.** The bands are a defensible
build-up — pad rent as commercial ground, capacity rent per kW-year, a
narrow quality adjustment, a tranche premium, and the amortised fiber lateral
capped at a third of gross — but they are not verified comparables. Replace
them with real comps and bump `RATE_CARD.version` before they are quoted as
ClearSky's position. The version rides on every response so any proposal in
somebody's inbox is attributable to the numbers that produced it.

The sales-side counterpart is `docs/COMPUTE-SITE-QUALIFICATION.md` — minimum
site requirements, the tranche mapping with the three questions that settle it,
the discovery field set and the FAQ baselines. It is deliberately the same
model the function runs; change one and change the other in the same pass,
because a rep will trust whichever they read last.

Still open, and said plainly in that doc rather than implied: the 32-category
deep assessment is not in Omega and should be scoped off Ravi's merged
spreadsheet rather than invented, and this tool saves one site per org through
the standard `toolData` contract — there is no multi-site register on it yet.

### Land lease in the editor, and the proposal a tenant can send

Two things followed the tool: the Compute panel wanted the same screen on the
site already on the drawing, and the proposal had to carry the TENANT's name
rather than ClearSky's. Neither is a feature on its own — both are the same
problem, which is that a second surface now renders this document.

**`omega-compute-lease.js`** is that surface's other half, and the tool's. It
holds the fan-out (Grid Atlas, Network Proximity, the parcel record — parallel,
independently failable, each reporting its own progress) and the four-page
proposal. `compute-proposal.html` was refactored onto it in the same pass and
is ~340 lines shorter for it. The argument is the one
`omega-grid-atlas-client.js` already makes about the scoring model, only worse
here: two copies of a proposal generator means two hosts getting two different
offers from the same company in the same week.

Nothing in the client scores or prices. The gates, the tranche rule and the
rate card stay in `/api/compute-lease.js`.

**Branding is resolved server-side**, in the function, off the caller's own
`omega_orgs` record — `brand: { name, logoUrl, accent, tagline, resolved }`.
Not in `omega-brand.js`, because that file is not on editor.html's script list
and adding a sign-in-path module to the largest page in the repo to fetch four
strings is the wrong trade. Not in each page, because then each page decides
for itself what a blank field means and the two documents disagree. Staff read
their org too, skipping only the entitlement checks — a branding bug that only
shows up for tenants is a branding bug nobody at ClearSky ever sees. An unset
field comes back `''` and the page falls back to its own wordmark: deriving a
name from the orgId would put "concordenergyusa.com" on a customer's desk.

A logo is drawn on a white chip on the dark cover and page headers. That is
not decoration — `sales-proposal.html` carries a long note about exactly this
failure: a mark that is black-on-transparent vanishes on a navy footer, the
export looks right on screen, and it ships with an invisible logo. A white
chip works for every mark without needing a second white-variant file.

**Patch 130 (`OmegaLeasePanel`)** puts a Land Lease button in the Compute
tab's "3 · Size & Cost" panel, beside Compute Cost — which prices what we
build, where this prices what we pay to stand it somewhere. It injects next to
`rb-compute-cost` and Patch 114's PLAN moves it into the panel, the same way
every other compute tool gets there. The site comes from `_npxSiteLatLon()`
first, then `S`, then the map centre: the same three fallbacks in the same
order the Network Proximity panel uses, so the two panels can never disagree
about which point they are looking at. Evidence is fetched once and survives
closing the modal; every answer the rep types re-scores against it and never
re-runs a 55-second fiber lookup.

The parcel record prefills zoning and owner, and only where the rep has typed
nothing — their value wins, because they are looking at the site and the county
layer is looking at a database that was right in 2019. Parcel ACREAGE is
deliberately not prefilled into the leased-area field: we lease a carve-out,
not somebody's whole industrial park, and a number that looks agreed is worse
than a blank.

**The proposal opens in a window, and falls back to an overlay.** `window.open`
is tried first because a separate window is nicer — the rep keeps the proposal
beside the drawing. It is not relied on: a popup blocker eats it silently, it
was eaten in the first browser this was tested in, and a rep who presses "Open
the proposal" and gets an alert about pop-up settings has been handed a support
ticket instead of a document. The fallback is a full-screen overlay with the
document in an iframe — `srcdoc`, so there is nothing to revoke and no origin
to get wrong — printing through the iframe's own `contentWindow`, which prints
the four pages and leaves the host page's print rules out of it. The document
suppresses its own toolbar in that mode (`bare`), because two Print buttons a
centimetre apart is the kind of thing that gets clicked wrongly under time
pressure.
## 2026-09-17 · A national fiber map, and "how much fiber is here"

### What was wrong

`grid-atlas.html` had a `backbone` layer pointing at `/data/intertubes-backbone.geojson`
— **a file that was never built**, so the layer had been silently empty since
it was written. `grid-atlas-national.js` carried its own 53 city pairs and
routed them through OSRM's public demo server at runtime, twelve per site
analysis. `/api/network-proximity` carried the same 53 pairs as **straight
chords**. Three surfaces, three different answers, and the one a tenant sees
first was blank.

Underneath that, the tool could say how far the nearest carrier hotel was and
could not say the two things a data-center developer actually asks: *how much
fiber is here*, and *is there a second path*.

### What is here now

**`data/us-longhaul-fiber.geojson` — 317 corridors, 54,639 corridor miles.**
Built by `scripts/build-fiber-backbone.js` from the tables in
`scripts/fiber-corridors.js`, **routed over the road network at build time**.
That is the point: the central finding of InterTubes (Durairajan, Barford,
Sommers & Willinger, SIGCOMM 2015) is that US long-haul fiber is laid in
transportation rights-of-way, so the driving route between two cities is a far
better proxy for where conduit runs than the chord between them. All 317
routed on the first build; zero straight-line fallbacks.

Two provenance tiers, and they never draw the same:
- `src:'intertubes'` (53) — carries the paper's citation and its count of
  carriers sharing the conduit. Drawn solid and hot.
- `src:'corridor'` (264) — asserts that long-haul capacity runs this way and
  **asserts nothing about which carrier is in which ditch**. Drawn cooler.
  Carrier-on-segment is licensed data and belongs in `api/fiber-proxy.js`.

**`data/us-datacenters.geojson` — 3,885 US facilities**, merged and deduped by
`scripts/build-fiber-facilities.js` from Compute Atlas (CC BY 4.0), the Global
Data Center Map (credit required) and the CYBR capstone; 1,124 duplicates
collapsed. An operating facility is the strongest free evidence that
carrier-grade fiber was pulled to an address. **`facilityType` is load-bearing
and not cosmetic**: Compute Atlas tracks the generation built to feed these
campuses, so 113 of these rows are wind farms and gas peakers. They are
counted under `generation`, never as "nearest operating compute" — the first
build had a site in Tunica reporting a data center 13 miles away that was a
turbine field.

**`data/us-fiber-carriers.json` — 24 carriers**, from the Telecom Ramblings
network-map index, normalised to who actually answers the phone today
(CenturyLink and Level 3 are both Lumen; Sprint wireline is Cogent; Windstream
is Uniti; Masergy is Comcast). A call list with links to each carrier's own
published map — not geometry, and not a claim of presence.

### Logic that moved to `/api/` (per CLAUDE.md)

`/api/network-proximity` (`network-proximity-v2`) gained three things, all
server-side because the weights are the part worth anything:

- **`longhaul()`** now measures against the routed corridors and returns
  *every* corridor within 50 mi, plus **route diversity** — corridors folded
  to a 180° axis and counted once, so two readings of the same I-80 conduit
  30 miles apart is one path, not two. That is how a single backhoe takes out
  a "redundant" site.
- **`capacity()`** — the "how much fiber is here" answer: class (backbone /
  regional / metro / edge), route diversity, carrier presences, lit service,
  a **strand planning band** and the carriers to call. The band travels with
  its caveat attached in every surface, because a number without it gets
  quoted as a measurement within a week.
- **`dcSuitability()`** — the connectivity half of a data-center read, scored
  on corridor 30 / diversity 25 / carriers 20 / exchange 10 / comparables 15,
  and it says `CONNECTIVITY ONLY` in its own `scope` field. Power, water, land
  and tax are not in it.

The long-haul component of `score()` was also changed: half of it is now the
*second* independent path rather than proximity alone, because a site on a
stub was scoring as though it were on a ring.

### Wired in four places

- **`grid-atlas.html`** — the dead `backbone` layer now loads the real file;
  new `dc_registry` and `cable_landings` layers; a new **Fiber** preset; the
  Data Center preset gained the corridor, registry, IXP and colo layers. The
  renderer gained a per-feature `styleFor(props)` hook so a cited conduit and
  an inferred corridor cannot draw identically.
- **`grid-atlas-national.js`** — both the map layer and the site analysis now
  read the same prebuilt file instead of routing live. Six times the coverage,
  no OSRM round trip, and the page and the function finally agree. The live
  path is kept as a fallback and **says so in the layer status**, so a
  deployment missing the file cannot pass 53 conduits off as 317. The report
  gained a route-diversity row.
- **`editor.html` Network Proximity panel** — a second KPI row (class,
  diversity, strand band, DC fit), a corridor table with bearings, the
  regional call list as live links, the DC-fit component bars and the nearest
  comparables.
- **`editor.html` screening register** — the Fiber cell now reads
  *class · diversity* rather than distance-to-carrier, a **DC fit** column was
  added, the detail view gained capacity and comparables rows, a
  `fiber_single_path` flag is raised, and the CSV went from 23 to 42 columns
  (header and row arity verified to match — a mismatch silently shifts every
  column).

`scripts/test-network-proximity.js` is now 68 checks. The Frio County test
changed its assertion on purpose: it used to read "far from every published
conduit" at 100+ mi, because the old 53 chords never passed through south
Texas. The routed San Antonio–Laredo corridor runs down I-35 straight through
it, so the honest answer became "on a corridor, but single-threaded". That
change is the whole reason for routing the geometry.

### Open

- **`data/us-cable-landings.geojson` (111 US landing stations) is LICENCE
  UNCLEARED and off by default.** The compilation is TeleGeography's
  commercial research product and the repository it came from mirrors their
  public API. Confirm redistribution terms before this is enabled for a
  tenant. Everything else here is CC BY 4.0, credit-required or public domain,
  and the attribution rides on every feature as `attrib`.
- Carrier-on-segment is still unanswerable from free data. `api/fiber-proxy.js`
  is where GeoTel / FiberLocator / LandGate lands when a licence is bought;
  the corridor layer is the free approximation until then.
- `scripts/build-fiber-facilities.js` reads from `~/Downloads`. Point `--src`
  at wherever the source datasets live before re-running it.
- `FCC_BB_KEY` is still not set in Vercel, so "service at the point" still
  scores its not-checked middle value and the verdict still says so.

---

## 2026-09-18 · Public fiber route evidence, shared by both tools

### The dataset, stated exactly

10,345 public records, verified against the manifest and its SHA-256 hashes:
195 OSM ways explicitly tagged optical fiber, 1,681 OSM telecom ways whose
medium is **unspecified**, 5,996 OSM telecom facilities, and 2,473 California
MMBI design/partner/status line parts. The manifest states its own limits in
machine-readable fields — `complete_national_route_inventory: false`,
`fiber_strand_records: 0`, `site_service_records: 0`,
`available_capacity_records: 0`, `no_evidence_meaning: "unknown; never no
fiber"` — and nothing in this integration contradicts them.

Optical routes exist in 13 states; facilities in all 50. Those are record-
presence counts, not coverage estimates.

### One library, two tools

`api/_lib/fiber-evidence.js` is the only interpreter. Grid Atlas reaches it
through `api/fiber-screen.js`; the Site Map Editor reaches it through
`/api/network-proximity`, which now requires it directly. Same classifier,
same four buckets, same nulls — so the two tools cannot disagree about one
coordinate, which was the whole requirement.

### Boundary support — new, and the reason it was needed

The package shipped point-only. `screenArea()` measures from the site
**boundary** and returns 0 when a route crosses the parcel. On a 200-acre site
the edge and the centroid differ by half a mile, and the edge is the one a
lateral is built to; quoting the centroid overstates every row. Point and
boundary answers both carry `measurement_method` and `measured_from`, so one
can never be read as the other.

`editor.html` gained `_npxSiteRing()`. `_e5Ring()` could not be reused: it
reads `sh._geoBoundary`, which is stamped from `sh.boundary` — the auto-layout
field — and never from `sh.pts`, so a parcel traced with `OmegaSiteRoles` was
invisible to it. The new extractor takes the role-tagged shape through
`OmegaSiteRoles.pts()` (rotation is a live render transform, not baked into the
stored points), expands rect shapes via `_alShapePts`, and falls back to
`_savedMapState` because `_liveMapState()` deliberately returns null on a
frozen plot. When no ring can be built it sends none, and the panel says the
measurement came from the point.

### No existing score moves — and two that should, but not here

The evidence is reported beside the analysis and folded into `score()`,
`verdict()`, `capacity()` and `dcSuitability()` **nowhere**. Those numbers are
already published on saved rows and in the screening register.

Two pre-existing bugs were found and deliberately **left alone**, because
fixing them changes published figures and that is its own decision:

- `grid-atlas.html` **Fiber Confidence** scores absent fiber as **0** across
  ~70% of its weight, so "no mapped route" is today indistinguishable from
  "confirmed route, far away".
- `grid-atlas.html` **Data Center Site Report** falls back to **15/100** for
  unknown fiber at 24% weight.

Both are the exact bug class this work was required not to introduce: unknown
treated as confirmed absence. `api/grid-atlas.js` already has the correct
pattern at `weightedScore()` — a null part drops out of **both** numerator and
denominator, commented "UNSCORED IS NOT ZERO". These two should be moved onto
it in a separate, deliberate change.

Also unfixed and worth knowing: `OmegaNPX.open()` can never open the panel and
the status-rail carrier cache is permanently null, because both depend on
`_npxInner`, which does not exist anywhere in `editor.html` — the renderer is
`_npxBody`. Any validation driven through `OmegaNPX` reports a false failure.

### Deliberate changes to the vendored control

- Layers default **off**, behind `CLEARSKY_CONFIG.fiberLayersOn`. Upstream
  shipped two **on**, costing every Grid Atlas visitor ~5.8 MB and ~6,200
  features before touching anything, against a page whose own convention is
  all-layers-off with viewport-scoped loading.
- Control moved `bottomleft` → `topright`. `bottomleft` renders underneath the
  Grid Layers rail; confirmed by screenshot before and after.

### The installer was reviewed and NOT run

`scripts/install-fiber.py` is vendored for reference. It covers only Grid
Atlas, touches nothing in the Editor, copies no files and verifies no
prerequisites, and its `vercel.json` edit appends the `api/fiber-screen.js`
entry **after** the `api/**/*.js` catch-all. The equivalent edits were made by
hand, with the function entry placed **before** the catch-all, matching how
`network-proximity` and `render` are already declared.

### Open

- **Not done: persistence and staleness.** A fiber assessment is not yet
  written to the project record. `saveProject()`'s payload is an explicit
  allowlist (editor.html:25246–25313) with a matching restore block, and a
  field added through either `saveProject` wrapper silently never persists —
  `OmegaVersion.stamp()` sets `S.omegaVersion` and it is provably never
  written. The correct precedent is `omegaSizing` / `OmegaRecord.persist()`.
  Marking an assessment stale on geometry change needs a boundary hash; note
  the boundary can change identity without any vertex moving.
- **Not done: Grid Atlas site-detail fields.** The vendored control renders its
  own floating panel with counts and three routes; it does not write into the
  page's Site Analysis panel, and it shows no evidence date or per-route
  serviceability. It also binds its own `map.on('click')` rather than reading
  the page's `pinLatLng`, so its "selected site" and the page's pin can differ.
- `window.OmegaFiber` is already bound to the operator-entered, carrier-
  confirmed route record. The public-evidence module must never take that name:
  it is the stronger verified evidence the requirements say to preserve.
- The 1,681 unknown-medium OSM ways overlap the live OSM query
  `network-proximity` already runs. They are kept in their own bucket and out
  of `hard[]` precisely so one cable is not counted twice at two distances.

---

## 2026-09-18 · Two live scoring bugs, and the rest of the fiber integration

### The bugs — unknown was being scored as confirmed absence

Both in-page scores in `grid-atlas.html` fed a constant in for every factor
whose layer was switched off, then weighted it as though it were a
measurement:

| Score | Factor | Weight | Value when never measured |
|---|---|---:|---|
| Fiber Confidence | mapped route | 45% | **0** |
| Fiber Confidence | FCC coverage | 25% | **0** |
| DC Site Report | fiber | 24% | **15/100** |
| DC Site Report | water | 14% | 30/100 |
| DC Site Report | flood | 12% | 85/100 |

Fiber alone is **70%** of the confidence score. A site nobody had looked at
scored the same as a site that had been looked at and found wanting, and the
DC report printed "Challenged for DC scale" about parcels with no fiber layer
loaded. That is a false negative that reads exactly like a finding.

Both now use `wScore()`, which is `weightedScore()` from `api/grid-atlas.js`
ported into the page: **an unmeasured factor drops out of the numerator AND
the denominator**. A factor whose layer IS on and which found nothing is a
genuine low reading and still counts — "looked and found none" and "never
looked" are different answers and this is the line between them. An entirely
unmeasured score renders as an em dash, never as 0, and the caption names the
weight that went unmeasured. `scripts/test-grid-atlas-scoring.js` lifts
`wScore` straight out of the page so the test cannot drift from it.

### Persistence and staleness

`omegaFiber` / `omegaFiberAt` are written in the save payload **literal** and
restored in `_loadProject`. Both halves, because this payload is an allowlist:
a field set by a `saveProject` wrapper is never written (`OmegaVersion.stamp()`
sets `S.omegaVersion` and it provably never persists), and a field saved
without a restore line is written forever and read never.

The record is compact by design — verdict, provenance and the two nearest
records, not the whole response — because `_shedIfOversize` can drop project
data to fit the document. `siteHasFiber` and `availableCapacityGbps` are
stored as `null`, never `false` or `0`: the null is the finding.

`_npxSiteKey()` hashes the point and the boundary ring at ~1 m precision. A
saved assessment whose key no longer matches raises a stale banner rather than
letting old distances sit under a new outline. Known gap, stated in the code:
a boundary can change **identity** without any vertex moving, and a geometry
hash cannot see that.

### Grid Atlas site details

The four datasets are registered as native layers (`pf_routes`, `pf_unknown`,
`pf_design`, `pf_facilities`) so they appear in the Grid Layers rail, and a
"Public route evidence" section in Site Analysis shows route distance,
operator, source, evidence date and serviceability/capacity status. Route
proximity is kept separate from facility proximity, and unknown-medium lines
and planning records are labelled as not-confirmed-optical.

They are **deliberately absent from `fiberKeys`**. Adding them to the
nearest-fiber winner would move Fiber Confidence and the DC Site Report on
every covered site.

Two bugs found by running it rather than reading it:
- `nearestLine()` returns `{props, km}` and `nearestPoint()` returns
  `{f, km}`. Reading `.props` off a `nearestPoint` result is `undefined`, and
  the first field touched was `.operator` — which threw and took the entire
  Site Analysis panel down, because `analyze()` builds one string and renders
  once. The panel silently stopped at "Connectivity".
- `nearestLine()` has no radius, and the California layer is national, so a
  site in Indiana was told its nearest planning route was **2,415 km** away.
  Capped at 80 km, matching the radius the rest of the panel reasons in;
  beyond it the answer is "none within 80 km".

### Still open

The `omega-core-main.zip` package (26,371 published features across 29 states
+ DC) remains unmerged. It is a different package built on a stale ~Sep 12
snapshot and it collides with this one on `api/_lib/fiber-evidence.js` — two
interpreters of two datasets, which is a reconciliation, not a copy.

---

## 2026-09-18 · The published route inventory, folded into the one library

### What arrived, and what was wrong with how it arrived

`Omega-Grid-Atlas-Fiber-Integrated.zip` carried a second dataset — 26,371
published line features across 30 states and DC, sharded one GeoJSON per
state — and it resolved the earlier filename collision by **renaming rather
than unifying**:

| Endpoint | Interpreter | Dataset |
|---|---|---|
| `api/fiber-screen.js` | `fiber-screen-evidence.js` | `data/fiber` (10,345) |
| `api/fiber-site.js` | `fiber-evidence.js` + `fiber-inventory.js` | `data/usa-fiber` (26,371) |

Two interpreters and two endpoints means the same coordinate can return two
different answers depending on which tool asks — the exact thing this work was
told to prevent. That snapshot was also stale in the usual way: `mission.html`
80 KB behind `main`, `editor.html` 163 KB behind, and none of this branch's
work present.

So only the **data** was taken, plus its best idea, and both were folded into
`api/_lib/fiber-evidence.js`. There is still one interpreter, one classifier
and one set of nulls. `fiber-screen-evidence.js`, `fiber-inventory.js` and
`fiber-site.js` were deliberately not merged.

### Sharded and lazy, because 68 MB is not 11 MB

`load()` reads its dataset eagerly; that is affordable at 11 MB and not at 68.
The inventory is read per state, only when the query bbox meets that state's
bbox, with a second per-feature bbox rejection before any geometry maths, and
a **bounded cache** (6 states) so a warm serverless instance answering queries
across the country cannot end up holding all 68 MB resident.

Measured: Chicago cold 314 ms / warm 87 ms; Portland cold 412 ms against
Oregon's 5,073 features; an empty Wyoming point 116 ms returning
`no_route_evidence_in_loaded_sources`.

### Category is not medium — the mapping that mattered

16,530 of the 26,371 records carry `category: "unknown"`, the largest bucket by
far. That means the **publisher did not state whether the route is in
service**. It does not mean the medium is uncertain: every source layer in
this inventory is a fiber layer.

That is a different claim from the OSM `telecom_route_unknown` bucket, where
the medium itself is unspecified and the line may be copper. Filing
status-unknown fiber under "medium unknown" would invent a doubt the source
never expressed, so it maps to `fiber_route` with its status surfaced verbatim
as "not stated by the publisher". `planned` and `inactive` are **not**
proximity-eligible and fall to `planning_routes`, which is what the shared
classifier already does with an ineligible route.

### On the map

`data/usa-fiber/overview.geojson` (10.7 MB, all 26,371 simplified) is a
national layer, off by default. **Status is the styling, because status is the
finding:** planned draws dashed amber, inactive dotted grey, existing solid
teal, and status-unstated thinner rather than being promoted to look like
confirmed plant.

Site Analysis reads both inventories. They name the same facts differently —
OSM-derived features use `operator`/`operational_status`, the published
inventory uses `carrier`/`routeStatus` — so both keys are read rather than
printing "unknown" over data sitting under another name.

### Deploy

`includeFiles` on both `api/fiber-screen.js` and `api/network-proximity.js` is
now `data/{fiber,usa-fiber}/**`. Same tracing gap as before: the library builds
its paths at runtime and `@vercel/nft` cannot follow them, so undeclared data
is an ENOENT that only appears once deployed.

### Open

Nothing about the two datasets is de-duplicated across sources. They publish
different records from different agencies, and silently collapsing them would
drop provenance a user is entitled to see; each source already guarantees
uniqueness by id within itself.

## 2026-09-20 — detailed priority-state fiber maps

Merged the supplied nationwide inventory additively into the current core:
30,580 source map records / 218,350 published line parts, with partial geometry
in 40 states plus DC. Added CNS Massachusetts and Nichols/STN New York public
route sources. All baseline detailed coordinates are retained. New Jersey,
New York, Connecticut and Massachusetts remain especially incomplete statewide.

Grid Atlas and `usa-fiber-map.html` now share `omega-published-fiber.js`:
priority state navigation, status/source filters, publisher popups, overview
and detailed state loading, bounded caching and cancellation of stale draws.
State links open the Fiber project profile. Layer selection remains in Settings.
Public fiber checks occupy the same drawer; duplicate floating layers are removed.

The shared server evidence library reads lossless `data/fiber-api/*.json.gz`;
Vercel explicitly bundles `data/{fiber,fiber-api}/**`. Border-state records are
deduplicated by source ID. Missing deployed data now fails visibly. Authenticated
site checks calculate distances server-side; display overviews are never used for
site distances. The existing legacy grid scoring code is unchanged except that
synthetic, estimated and design-only layers no longer feed the nearest-fiber
input. Historical road-derived corridors are absent from project presets.

No editor, tenant, billing, Firestore schema or deployment-project replacement.
The editor's existing `publicFiber` integration automatically receives the same
expanded inventory. See `docs/FIBER-PRIORITY-STATES.md` for counts, acquisition
gaps, source references, refresh commands and verification.

---

## Omega Logic — tracking and fulfilment (2026-09-20)

The umbrella over the whole chain: an order arrives, money clears, a works
order is raised, units are scanned across ten benches, each carries its own
record, it ships, the balance clears. `⬢ Omega Logic` on `mission.html`,
fed by `api/logic-summary.js`, arranged by `api/_lib/logic.js` (pure, 59
assertions in `scripts/test-logic.js`).

**Staff-only and cross-tenant, and that is the product decision.** This is
ClearSky's view of every tenant's floor at once. `admin/tenant.html` is
already one tenant's view of themselves, and `portals/customer/` is one
buyer's view of their own order. Three surfaces, three audiences, one set of
facts underneath — `api/_lib/plant.js` decides where a unit may move and
`api/_lib/portal.js` decides what milestone an order is at, and neither
decision is re-implemented anywhere else.

**It is an endpoint although `api/orders.js` says reads are not.** That file
is right for `orders.html`, which is scoped to one tenant and lets the rules
decide. This is a join across `orders` → `plant_works_orders` →
`plant_units` on `orderNo`, which no rule can follow, and staff read
everything so there is no scoping work left to do.

### What is actually built, as of this entry

| stage | state | owner |
|---|---|---|
| Order intake | live | `api/embed-order.js` |
| Deposit | live under Omega Logic | QuickBooks installment invoice, `api/_lib/qbo-sales.js`; reconciled by `api/logic-worker.js` every 5 min |
| Works order | live under Omega Logic | `api/_lib/logic-workflow.js` `release()` on a verified deposit; `api/plant-release.js` remains the staff-pressed path for orders outside it |
| Production line | live | `api/mes-scan.js`, `api/mes-test-result.js`, `api/plant-control.js` |
| Unit record | live | captured at release; read back by `api/my-orders.js` (customer milestone) and `api/logic-plant.js` |
| Shipment | live under Omega Logic | `finish(orderId, caller, shipment)` — carrier and tracking, after every serial is Ready |
| Final payment | live under Omega Logic | balance invoice queued at quality release; shipment waits for it |

*(Rewritten 2026-09-21. The earlier entry read "not built" for deposit,
shipment and final payment and "partial" for the works order; PRs #65 and
its neighbours landed the whole chain for orders carrying `logic`. An order
placed through the public storefront and never priced under Omega Logic
still has none of it — which is a state, not a gap.)*

### The rule the whole view is built on

**A stage that is not built reports as absent, never as zero.** `collected`
is `null`, not `0`. An unshipped order has no shipment record rather than an
empty one. And `deposit: true` — the boolean the Clean Cell demo carried as
a stand-in — is explicitly NOT money: only an object with a paid timestamp
counts, and the view labels any order still carrying the flag. The first
collected-cash number in this estate is the one people will believe.

The same discipline covers the floor: a failed or clipped unit read returns
`known:false`, the board renders empty, `milestoneOf()` falls back to the
order status rather than claiming progress, and `totals.unknownFloors`
counts those rows — so "nothing on the line" and "we could not see the line"
are never the same number.

### The payment rail, and the rule it will break

Thomas chose **QuickBooks invoice + payment link** over Stripe on
2026-09-20, having been shown that it breaks the never-write discipline in
`api/_lib/qbo.js`. That header says a write path "should be an argument, not
a patch", so when it is built:

- the write path goes in its own module, not spread through `qbo.js`;
- `qbo.js`'s header is rewritten to record the decision rather than left
  claiming OMEGA never writes, which would then be false;
- the Stripe code on `main` is NOT the model. It is platform SaaS billing —
  `billing/current`, tiers, subscriptions, `invoice.paid → lastPaidAt` — and
  shares nothing with an order payment but the vendor.

`portals/finance/` is the project-finance deal room (`fin_*`, developers and
capital partners). It has nothing to do with order payments but the word.

### Rules and indexes

`docs/firestore.rules.plant.addendum` had never been applied — `grep -c
plant_ firestore.rules` was 0 — and its four indexes were not in
`firestore.indexes.json`. Both are now in the tree and **neither is live
until `firebase deploy --only firestore:rules,firestore:indexes` runs**.
Confirm the way CLAUDE.md says to, against the LIVE rules:

```
grep -n 'match /plant_units' firestore.rules
```

The addendum could not be pasted verbatim: its `plantOrg()` fell back to
`myOrg()`, which does not exist in these rules. `userOrg()` is the real name
and already folds through `orgAlias()`.

## Omega Logic OEM workspace and accounting workflow — 2026-09-21

Built on the merged `main` implementation, not a second orders system.
`/omega-logic` is the private owner destination in the Where to chooser;
`?org=cleancell.us` opens the OEM office and links its existing public embed,
customer portal, white-label designer/setup, new `/plant/` workspace and the
scoped Mission view. The private directory and commercial/bank controls require
verified `tom@clearsky-usa.com` server-side. Active OEM members/admins can use
their org-scoped operational surfaces; buyers keep the existing email-isolated
projection API. No agent was created: the user deferred that separate priority.

Commercial logic lives entirely in `api/_lib/logic-policy.js`,
`logic-workflow.js` and `qbo-sales.js`. Explicit customer-price approval is
separate from the legacy internal fulfillment price. Terms snapshot to each
order: 30% down on receipt by default, account overrides respected. ClearSky's
configurable initial 0.25% processing fee is added to the price and disclosed
separately; actual provider fees are not guessed. Omega Logic subscription
billing stays on the existing SaaS billing rail; the bundle includes platform
lite and white-label sitemap resale, not anonymous full-editor access.

The authorized exception to the former read-only QuickBooks policy is now
implemented: owner OAuth connection, company-pinned customer/invoice writes,
stable request IDs, serialized token refresh, HMAC webhooks, durable worker
leases/retries, invoice links and verified Payment allocations. Accepted +
deposit-paid orders reserve eligible serialized stock transactionally and
release the manufacturing shortage. Actual serial registration, genealogy and
scan/test readback live in the factory workspace. Ready orders queue the balance
invoice; shipment records require complete passed units and reconciled payment.
No client-paid boolean or invoice credit balance can release work.

The bank rail is intentionally **not represented as complete**. The user plans
to wire CleanCell but has not selected a bank integration. The office prepares
OEM proceeds from bank-confirmed cleared receipts and records completed wires;
it never calls a bank or treats a QuickBooks accounting entry as a sent transfer.
Settlement-provider automation, beneficiary verification and automatic wires
remain launch dependencies, as do accountant-approved installment/tax mapping,
Intuit sandbox validation, deployment, real catalog/website installation and
applicable subscription configuration. See `docs/OMEGA-LOGIC-OPERATIONS.md` for
the rollout checklist, operational caps and known exclusions.

Verification: `npm test`, `npm run test:logic`, inline HTML/script resolution,
structural rules checks and local browser fixture inspection. Workflow tests
mock Firestore/Intuit; no live invoices, transfers or production data were
created by these tests. Rules/index changes in this worktree are not live until
deployed. `scripts/preview-logic.js` is a loopback-only, read-only UI fixture,
clearly labelled as test data, with no Firebase/payment connection.
# Editor Lite shell — September 2026

`editor-lite.html` / `editor-lite-logic.js` embed the canonical `editor.html`
on the same origin. No engine is copied and no bundled build is introduced.
The shell replaces the visible ribbon with a bounded canvas, minimal tools,
and guided-build controls. BESS, compute, EV and solar entry points use the
existing engines; exports and saves also remain canonical. A generic BESS
target is explicitly a concept, not a catalog product or fulfillment order.

`api/editor-lite.js` checks verified tenant membership, active Omega Logic
subscription and `billing/current.editorLite` module grants. Guided requests
recheck their module server-side. These are product/entry-point controls, not
DRM on downloadable JavaScript: Firestore rules continue to isolate project
data. Existing engine pricing/modeling debt is not represented as fixed here.
White-label owner previews paint the OEM brand but save to the owner's own
workspace; they never impersonate the OEM. Ordinary Lite accounts opening an
old full-editor link are redirected by `omega-editor-gate.js` to the shell.

## Customer Editor Lite boundary — September 21, 2026

The same shell now supports `?customer=1&org=<supplier>`. Buyer auth is owned
by the shell and deliberately does not run platform tenant auto-enrollment.
The canonical engine iframe uses `?customerEngine=1`: `_initFirebase` and the
platform capability resolver do not initialize there. It is a drawing engine,
not an alternate route into platform projects. A same-origin parent bridge
controls presentation; it is not a security boundary or DRM.

`api/customer-design.js` resolves verified email through the existing supplier
customer pointer and writes only `omega_orgs/{org}/customers/{id}/projects`.
Browser rules deny that subtree. Server-side module/entitlement checks, bounded
snapshot size and transactional revisions guard saves. Pricing and accepted
order totals never come from the drawing. Quote requests accept published SKUs
only, stamp buyer identity, retain a submitted snapshot, and use one idempotent
order ID per project revision. Customer subscription checkout is still disabled
pending processor selection; owner-issued trials are explicit, audited and
expire within fourteen days, without charging or changing platform membership.

The public `customer-start.html?org=...` is a reusable website-button target.
Public configuration publishes only a usable storefront publishable key. It
never publishes staff credentials, customer records or payment-provider secrets.
The shared demo theme now covers the customer entry, account, editor and plant.
Scanner pairing uses a read-only authenticated description rather than logging
a deliberately nonexistent serial. Existing core financial-modeling debt is
unchanged; no new pricing model was moved to the browser.

## Site Finder workflow integration — September 21, 2026

Follow-up: the authenticated `/api/site-catalog` reads a tenant listing snapshot
from existing `toolData/{orgId}/tools` documents. Staff-only imports create
immutable version pages, verify their counts, then atomically switch the
manifest. No `sites` or `capacityAllocations` writes occur. The Crexi listings
tab paginates and searches all records, including ungeocoded listings; only
located records get pins. Census positions are labelled street-interpolated,
not rooftop. Direct Crexi links and snapshot dates remain visible. Supplied
HTTPS photo URLs render; missing images are explicitly labelled. No paid
imagery provider or live outbound Crexi feed has been configured. Staff tenant
preview now retains the requested workspace, with API authorization enforced.
No pricing or scoring logic was added to the browser.

Completed the interrupted Site Finder modules and connected the property
browser to energy score/hosting filters, workspace saves, selected battery
size, feeder holds, ownership/listing details, and estimator handoff.
Address lookup now opens the same canonical record as its saved card.
Unknown feeders remain unclaimable; property/market details remain visible.

Pricing and value-stack engines moved into `api/_lib/cost-model.js` and
`api/_lib/value-stack.js`. Score/load models live in `api/_lib/site-score.js`.
`api/site-score.js`, `api/price-site.js`, and `api/listings.js` authenticate,
scope the org, and check billing/access. Browser files collect and render;
they do not fall back to local financial/scoring calculations.

Saved sites use the existing `sites` collection and retain estimates and
selected size. Browser fallback is scoped by org/user and labelled. Holds
remain in `capacityAllocations`; rejected writes roll back optimistic state.
The legacy ledger's capacity guard remains client-side: simultaneous holds
are not a server-transactional capacity reservation. No rules, production
data, credentials, or deployment changed in this pass.

Configuration and live-Crexi requirements: `docs/sitefinder-server-config.md`.
Verification covers mocked authenticated endpoints, client batching and stale
responses, save isolation, hold rollback, pricing parity, and a fixture-only
desktop/mobile browser workflow. Live Crexi and live Firestore verification
remain environment-dependent.

## Site Finder: finished map, property card, product fit, host lease — September 22, 2026

The Cook County listing snapshot (3,677 rows) had 881 without a map
location: `scripts/prepare-site-catalog.js` kept only a Census batch
`Exact` match on a cleanly parsed address. `api/_lib/geocode-listings.js`
(shared by the prepare script and a staff `action:'geocode'` on
`api/site-catalog.js`) retries every unplaced row through several spellings
with the one-line geocoder, then places the remainder at the median of the
matched listings in its ZIP/city as `geocode.status:'approximate'`. The
catalogue validator accepts that status only with its accuracy note; the
manifest carries `located`, `approximate`, `unmatched`. In the browser an
approximate row takes the existing `approx` flags (no feeder, no hold, pin
fix on open). `tests/geocode-listings.test.js`, `tests/site-catalog.test.js`.

Product fit moved out of the page into `OmegaBessCatalog.fit` and changed
rule: fewest units first, then closest (a shortfall counts 1.5×). A 3 MWh
need is one 3.4 MWh container, not four cabinets. `scripts/test-catalog-fit.js`.

The card prints asking price, value, last sale, days on market, owner and
contact, with "pending API integration" for what the snapshot does not carry.

Lease pricing is server-side: `api/_lib/site-lease.js` (seed rate card) behind
`api/site-lease.js`, gated on the Site Finder entitlement, components hidden
from non-staff. `omega-site-lease.js` renders the host proposal. No rules,
production data, credentials or deployment changed; the live catalogue is
re-matched by pressing the button once as staff.

The listing catalogue finishes its own map: `api/logic-worker.js` (the
five-minute cron) runs one `finishMatching` pass per tick for the first
workspace whose catalogue is not marked `matchingDone`, so an import is
fully placed within the hour with nobody pressing anything. The host lease
rate card (v2) cites its published basis in `RATE_CARD.sources`.

ComEd retired the June hosting-capacity service (403 for everyone, the
Cloudflare worker included) and publishes `…_SEP2026`. The service is now
named once server-side in `api/_lib/comed-service.js`; the map reads it
through the same-origin `/comed-proxy` (`api/comed-proxy.js`), and the
worker's constant is updated for its own redeploy. The scheduled worker also
attributes each matched listing's circuit once (`api/_lib/circuit-attribution.js`,
`api/site-catalog.js` `attributeCircuits`), so `sort:'capacity'` and `minKw`
rank the whole catalogue on the server and the phone app's list is the
county's shortlist rather than the first hundred rows. A staff import still
strips circuits; only a server re-publish keeps them.


**Cost to us** is server-side: `api/project-cost.js` composes the build
(the `/api/price-site` path: same gate, org pricing and model), the host rent
(`api/_lib/site-lease.js`) and the asking price into buy-versus-lease
(`api/_lib/project-cost.js`); `omega-project-cost.js` only renders it. No
rules, data or deployment changed.

## Mission Control is the phone app — September 23, 2026

`/mission` installs as the app and opens on the Command Center.
`mission.webmanifest` is now scoped to `/mission` (the worker's scope, and
no longer wrapping every tenant page), starts on `?view=command` (the page
honours `?view=` for any screen it has; otherwise the last view on that
browser), and carries its own icon set, `icons/mission-*.png`, rendered by
`scripts/make-mission-icons.js` through `scripts/make-app-icons.js`, which is
now also a module (`build(src, size, {bg, inset, tint})`; the OMEGA icons are
byte-identical). `mission.html` loads `mission-push.js` (the one line
`docs/push-notifications.md` had left out) and hands it `token()`; a **Phone**
panel on the System view holds Install and Notifications (turn on, test to
this account, turn off), each honest about the device it is on. The worker's
notification tap lands on the Command Center with the new icon. Rendered at a
phone viewport with auth stubbed: the Command Center and the Phone panel,
no browser errors. Nothing on the desktop layout changed; the 2026-09-13 rule
(no tab strip on a phone, navigation is a sentence) stands.

## Mission Control on the phone: a bar, a sheet, and doors — September 23, 2026

From the installed app: "I can't access any of the stuff on the command
center." The 2026-09-13 rule had removed the seventeen-button strip under
700px and left navigation to a sentence, which moves well and discovers
nothing. Under 700px `mission.html` now has a fixed bottom bar (Home, Tasks,
Outbox, Calendar, More) with the rail's count pills mirrored by a
MutationObserver, a More sheet built from `#nav` on every open (one list, one
set of pills, a screen added to the rail appears without a second edit), and
Overview rows that open the screen they count (tasks, outbox, calendar,
system, people). The sticky talk bar sits above the bar; the caption still
measures the real talk bar. The sentence still works. Nothing above 700px
changed. Driven headless at a phone viewport: tab, sheet, door, no errors.

## Mission Control on the phone: every screen in one hand — September 23, 2026

Every one of the seventeen screens rendered at 390px with fixture data and
fixed where it failed. The rail row no longer shares the viewport's spare
height with the content (a void under the brand on every screen); views that
set their columns inline (calendar, board, open work) become one column
through `!important`; panels sized for the desktop grid take their natural
height; the talk bar is fixed above the tab bar (the old sticky rule lost to
`.main > .talkBar{position:relative}` and had never stuck); the Command
Center's three columns dissolve into one list in reading order: Overview,
Needs you, Conversation, the day, Quick commands, Feed, Messages,
Connections, Agent activity, with the window onto the core last instead of
first. Task rows wrap: title, reason, then DO / done / edit / dismiss as a
full-width row of 40px buttons; chips and panel buttons are 36–40px; rows
read at 15px; the brain shows the graph first. Header is sticky. Desktop unchanged.

---

---

## Battery Sizer — engineering design engine (2026-09-20)

Three ClearSky electrical-engineering workbooks were ported into omega-core:
*Electrical Engineering Design Calculator R3.0i*, *BESS Sizing Calculator
R2.3+* and *Payback Period Table Rev.0*.

### Why it exists

The Battery Sizer answered one question well — **how many kW and kWh does the
utility bill justify** — and then stopped. Nobody can order kW and kWh. The
questions that follow it are the ones the workbooks answer: how many
containers is that, how many converters, what transformer, what breaker, what
cable after derating, what is the fault current at the bus the gear is bolted
to, can the pack actually be recharged before the peak period comes round
again, and does it reach end of cycle life before the end of the analysis.

### Logic moved to `/api/` (per the IP-protection rule)

**None of this shipped to the browser.** Both new files are server-side from
the start:

| file | what it holds |
|---|---|
| `api/_lib/bess-design-engine.js` | the whole engine: capacity chain, converter count, charge-window feasibility, transformer selection, breaker/cable/busduct sizing with derating and voltage drop, IEC 60909 fault level, switchgear Icu, metering and protection CT sizing, solar string limits, the 20-year degradation/replacement lifecycle, scenario sensitivity, design checks, bill of quantities |
| `api/bess-design.js` | auth + the same tier gate as `api/bess-size.js` (`standard`+ tier, the `engineering` addon, or a `batterysizer` override), plus per-field range validation and two cross-field rules |

The standard-size tables (IEC 60076 kVA, breaker frames, busduct ampacity, CT
ratios, Icu steps, cable ampacity and mV/A/m) live in the engine, not in the
page. They are the product.

### Verification

The engine reproduces the R3.0i workbook cell for cell on its own example:

| figure | workbook | engine |
|---|---|---|
| capacity after DoD / after RTE | 4.4445 / 4.6088 MWh | 4.4445 / 4.6088 MWh |
| converter count | 8 × 135 kW | 8 × 135 kW |
| transformer duty → rating | 1,589 kVA → 1.6 MVA | 1,589 kVA → 1.6 MVA |
| primary current / breaker | 1,834 A → 2,500 A | 1,834 A → 2,500 A |
| AC cable after derating | 300 mm², 9 runs | 300 mm², 9 runs |
| full charge time | 9.4 h | 9.4 h |
| payback / discounted payback | 3.91 / 4.86 yr | 3.91 / 4.86 yr |
| NPV / IRR | 1,422,244 / 26.11% | 1,422,244 / 26.11% |

### Two places the port deliberately departs from the workbook

1. **The fault level is taken at the bus the gear sits on.** The workbook
   computes one fault figure and warns, in prose, when the busduct and
   switchgear sheets are pointed at a different voltage. For a step-up BESS
   that is not a footnote: the same transformer impedance referred to 0.4 kV
   and to 33 kV differs by the square of the turns ratio, so a figure taken at
   the wrong bus is two orders of magnitude out and still looks plausible. The
   engine computes the fault at the converter bus and at the system bus and
   reports both; the breaker, cable, busduct and CTs are checked against the
   one they are bolted to.

2. **Converter fault contribution is included.** A battery converter is a
   fault source, firmware-limited to a fixed multiple of rated current
   (default 1.2×). On the low-voltage bus it is not small, and LV switchgear
   sized on the grid contribution alone is under-rated. It is reported as its
   own column, not folded silently into the total.

A third, smaller correction: the workbook's *Payback Period Table Rev.0*
divides by round-trip efficiency where *R3.0i* takes its square root. The
square root is right — only the discharge half of the round trip is spent
getting energy to the meter — so the engine follows R3.0i.

### Surfaces

- `battery-sizer.html` — step 5, "Engineering design". **Pull from sizing**
  carries the recommended system across; the schedule invalidates itself when
  the sizing changes rather than sitting stale beside a new number.
- `editor.html` — a fifth tab, "Engineering", on `OmegaBessSizer`, between
  *Recommended Size* and *Hand Off*. Same engine, same endpoint.
- `tenants/cleancell/tenant.json` — `batterysizer` added to `requiredTools`
  so it is pinned on the Clean Cell dashboard. Visibility only; the gate is
  still the serverless function. Takes effect on the next
  `scripts/seed-omega-orgs.js --apply`.

### Open

- The workbook's *Hourly Dispatch (Off Grid)* sheet (520 rows of an 8760-style
  dispatch) was **not** ported. `api/_lib/battery-tool-engine.js` already
  simulates dispatch against real interval data, which is a better answer than
  a modelled day; porting the sheet would give the tool two dispatch engines
  that disagree.
- %Z, X/R, busduct impedance per metre and CT winding resistance are
  placeholders until equipment is selected, and every one of them moves the
  fault duty. The UI says so on every run; it is not a stamped drawing.
- Cable ampacities are the direct-burial table. Tray, conduit and free-air
  installations need their own table before the schedule is trustworthy for
  those methods; today they are approximated through the Ci derating factor.

---

## Battery sizing: one engine (2026-09-20)

### The finding

`battery-sizer.html` and the site-map editor's BESS Sizer both POST to
`/api/bess-size`. They sent different `mode` values, and the endpoint forked
on that into two entirely separate engines. On identical input:

| | battery-sizer | editor | gap |
|---|---|---|---|
| 12 bills — nameplate | 1,306 kWh | 1,726 kWh | 24% |
| 12 bills — payback | 3.85 yr | 6.47 yr | 68% |
| real 8760 — nameplate | 259 kWh | 539 kWh | **52%** |
| real 8760 — savings/yr | $21,302 | $34,871 | 39% |

The editor's answer is written to `S.billBessHint`, so it reaches pre-qual
and the proposal. The same site could be quoted two ways depending on which
screen it was sized from, and — since the design engine consumes whichever
sizer ran — two different bills of quantities: 3 containers against 6, a
250 A breaker against 400 A.

### Which logic was better, dimension by dimension

Neither engine was wholly right. This is what each one won:

| dimension | winner | why |
|---|---|---|
| load shape from bills | `battery-tool-engine` | builds a load duration curve from load factor and solves the achievable shave against it, and carries a P50 and a flat-top P90 shape; the other assumed one duration |
| interval dispatch | `battery-tool-engine` | hour-by-hour simulation carrying state of charge across the whole year |
| savings credited | tie | both bill the peak the meter ACTUALLY saw, not the shave the sweep asked for |
| ratchet | tie | both apply a trailing 11-month floor |
| time-of-use, subscription tariffs | `battery-tool-engine` | the other has neither |
| **nameplate conversion** | **workbook** | both browser engines were wrong — see below |
| **C-rate floor on capacity** | **workbook** | `bess-engine` applied it to the sweep, `battery-tool-engine` not at all |
| economics | `battery-tool-engine` | ITC, O&M, fade, escalation, discounting, IRR. `bess-engine` did `gross capex / savings` and nothing else |
| degradation / replacement | workbook | year-by-year state of health against a minimum, with the replacement booked |
| depth of discharge | `battery-tool-engine` | `bess-engine` read `window.BESS_DOD` in a file whose first line is `var window = {}`, so it could never resolve and the engine always ran at a hardcoded 95% |

### The nameplate bug

Both browser engines computed `nameplate = usable / DoD`. That skips the
**discharge half of the round trip**. Round-trip efficiency is the product of
both legs, so one leg is its square root, and the workbook's chain is:

```
nameplate = usable / DoD / sqrt(RTE) / otherEfficiency
```

At 88% RTE the omitted term is 1/sqrt(0.88) = 1.066 — the pack was under-sized
and under-priced by 6.6%. Small enough to read as rounding, large enough to
under-price every project the tool has ever priced. `$/kWh` is quoted against
nameplate, so the error lands directly on capex.

### What was built

- **`api/_lib/bess-capacity.js`** — the chain, the C-rate floor and container
  quantisation, in one place. The design engine and the sizing engine both
  call it, so the sizer and the equipment schedule cannot disagree about what
  "nameplate" means. Reproduces R3.0i cell for cell (4.4445 / 4.6088 MWh).
- **`api/_lib/bess-size-adapter.js`** — translates the editor's request into
  the shared engine's vocabulary and the answer back into the result shape the
  editor's four tabs already read. A translation, not a second model: every
  field is a rename, a unit change or a restatement.
- **`api/bess-size.js`** — both editor modes now run `battery-tool-engine`.
- **`api/_lib/bess-engine.js`** — retired, with a header saying so. Kept
  because its 29 tests are the behavioural reference the replacement had to
  match, and because a project quoted before this date was sized there.

### Two other defects found and fixed on the way

1. **"Nothing pencils" recommended a token system.** On a flat demand tariff
   the return per dollar is constant across most of the sweep, so when it sits
   below the hurdle every size is equally unviable and NPV just approaches
   zero from below as the battery approaches nothing. Ranking by NPV returned
   17 kW; ranking by payback returned much the same. Neither is an answer.
   When no size clears the hurdle the engine now reports the DEEPEST size that
   still holds the best available return, beside the banner saying none of
   them pay back. The render-contract test was silently exercising this: its
   recommendation went from 5.5 kW to 820 kW.
2. **`breakEven()` derived a second, lower nameplate** than the one the
   economics were priced against, so the break-even installed cost came out
   optimistic. It reads the priced figure now.

### What this changes for people already using the editor

| | before | now |
|---|---|---|
| power | 641 kW | 516 kW |
| nameplate | 1,686 kWh | 1,223 kWh |
| installed | $758,579 | $550,485 |
| payback | 6.28 yr, gross | 3.65 yr, net of ITC |

The direction is favourable because the ITC was previously ignored, so the
editor UNDERSTATED returns. Sizes fall because the hardcoded 95% depth of
discharge is gone. **Any quote produced from the editor before this date used
the old engine and will not reproduce.**

The editor's tariff form now carries DoD, round-trip, ITC, O&M, term and
discount rate. They were hidden defaults; an assumption that moves payback by
three years is not a default.

### Still open

- Four browser-side sizers remain in `editor.html` — the Solar→BESS sizer
  (`ceThruSizerCalc`), the 8760 bill-import shave (`shaveKw*3/BESS_DERATE`,
  a flat 3-hour event assumption) and `shaveAnalysis`. All compute in the
  browser, all write `S.billBessHint`, so all reach the proposal without
  passing through the shared engine. That is both an accuracy gap and a
  violation of the IP rule in CLAUDE.md. They should move to `/api/`.
- `touSpread` on the editor's tariff form is carried but not yet priced; the
  shared engine prices time-of-use per month from parsed bill data, which the
  editor does not supply.

---

## Sizing reaches the marketplace, and units (2026-09-20)

### Every surface that sizes from energy usage

| surface | before | now |
|---|---|---|
| `battery-sizer.html` | shared engine | shared engine |
| `editor.html` BESS Sizer | its own engine | shared engine |
| `portals/finance/battery-sizer.html` | **whole engine inline, in the browser** | redirect to the canonical tool |
| `editor.html` bill-import 8760 shave | `BESS_DERATE`, a third derate | corrected derate, flagged as an estimate |
| `editor.html` `shaveAnalysis` | same | same |
| `site-optimizer.html` | **already correct** | unchanged |

`site-optimizer.html` was checked and left alone deliberately. It splits
round-trip efficiency correctly across both legs (`out = min(kW, soc*√RTE)`,
`soc -= out/√RTE`) and its objective — co-optimising storage, solar and EV
against three value streams — is a different question from peak shaving.
Forcing it onto the shaving engine would lose function and gain nothing.

### The finance portal's sizer

`portals/finance/battery-sizer.html` was a copy of the root tool taken before
the engine moved server-side, and `vercel.json` served it on
`finance.csebuilders.com` and `financing.csebuilders.com`. It carried the
whole engine inline — load duration curve, dispatch, sweep, economics — so the
logic shipped to every browser that opened it, and it still computed
`nameplate = usable / DoD`, under-sizing by ~6.6% against the canonical tool
on the same bills. A finance partner and a developer looking at the same meter
got different numbers, on two customer-facing hostnames.

Nothing in it was finance-specific. The four host rewrites are removed — the
default route already resolves `/battery-sizer` on every host — and the file is
a redirect that carries the query string through.

### The editor's derate constant

`BESS_DERATE` was `DoD × RTE` = 0.836. Round-trip efficiency is the product of
both legs, so the discharge leg alone is its square root; applying the whole
round trip charged the losses twice and **over-sized** by ~6.6% — the opposite
of the engines' error. Depth of discharge also drops 0.95 → 0.90 to match the
shared default. The two corrections nearly cancel (0.836 → 0.844, ~1%), so this
is a consistency fix rather than a repricing. It matters because these
constants feed the bill importer's quick estimates, which write into the
project alongside results from the shared engine.

### kW and MW

`api/_lib/bess-units.js` normalises at the boundary. The engine only ever sees
kW and kWh; the caller states a unit and the answer echoes it back.

- `/api/bess-size` takes `unit: 'kw' | 'mw'` and scales **measured site data
  only**. Rates are never scaled — a demand charge is quoted per kW at every
  site size, so scaling it alongside the load turns $18.50/kW-mo into
  $18,500/MW-mo and the savings with it.
- `/api/bess-design` takes kW aliases (`loadKw`, `unitKwh`, `pcsUnitKw`,
  `chargeGridKw`, `chargeOtherKw`). The unit is in the field **name**, not a
  flag: a flag that changes what `loadMw` means leaves the field still called
  `Mw` while holding kW. Sending both forms of one quantity is refused.
- `battery-sizer.html` has an input scale and a display scale. Different
  concerns: the first is accuracy (pasting MW into a kW field is a 1000× error
  that computes happily and looks reasonable), the second is presentation.

### The sizing record

`omega-bess-result.js` is the shape a sizing run leaves behind. Written by both
sizers onto `projects/{id}.bessSizing`; read by `financing.html` and by the two
deal-room paths.

It is a **record, not a model** — every field comes from an `/api/` response,
and the only arithmetic is unit conversion and multiplying a percentage out.
Anything else would be a way to smuggle a second opinion into the browser.

It carries its **basis**. A megawatt figure alone tells a capital partner
nothing about whether it came from a year of interval data or one bill and an
assumption, and those underwrite differently. Every record states the engine,
the kind of data, the number of months, and a grade — `measured`,
`twelve bills`, `partial year`, `single bill` — which the consumers print
beside the figure rather than under a tooltip.

| consumer | what it takes |
|---|---|
| `financing.html` | financed amount, annual throughput, year-1 savings, ITC % and amount, term in months, a scope line stating the basis — and a banner that warns when the grade is soft. Never overwrites a field the person has already filled, and fills nothing it cannot know (no legal entity, industry or address). |
| `api/dealroom-refer.js` | project → marketplace. Fills `mw`, `mwh` and `capexUsd` only when nobody typed them, so a project sized in the tool does not reach the market as 0 MW. |
| `api/dealroom-open.js` | deal → marketplace. The record lives on the project, so this follows `projectId` rather than looking on the deal; a deal with no project named simply carries no sizing. |

### Still open

- `ceThruSizerCalc` (Solar → BESS) sizes from generation rather than usage, so
  it is a different question and was not migrated. It still computes in the
  browser.
- `touSpread` on the editor's tariff form is carried but not priced.

---

## Accuracy pass on the sizing engine (2026-09-20)

Four findings, each measured before it was changed.

### 1. The C-rate floor priced a pack it refused to use

Adding the floor created a case the engine had never had: when the floor
binds, the pack you must buy holds more energy than the duty asked for. The
engine kept dispatching with the requested figure while pricing the
floor-sized pack — **69% more battery than it credited**, on every
short-duration candidate.

A 409 kW / 1-hour request at 0.5C forces an 818 kWh pack, which delivers
~691 kWh, i.e. 1.69 hours. The engine now sizes the pack from the request and
then dispatches with what *that pack* delivers. Energy-limited candidates are
unaffected — the chain and its inverse round-trip. On the reference profile
this moved the recommendation from 2 h to 1 h, correctly: the 1-hour system
gets 1.69 h of real energy for the price of its floor pack.

`effDur` and `cRateForced` are reported so the buyer can see they are paying
for duration they did not ask for.

### 2. Degradation was scaled off savings, not measured against the load

`econ` applied `(1-fade)^(y-1)` to **savings**. Capacity fades; savings come
from shave *depth*, and the load duration curve is concave, so the first kWh
lost costs far less depth than the last. Measured on the reference profile:

| state of health | linear model | actually earns |
|---|---|---|
| 95% | 95.0% | 99.8% |
| 85% | 85.0% | 98.2% |
| 70% | 70.0% | 98.1% |

Year-eight savings were understated by 13%, end-of-life by 29% — always in
the conservative direction, which is why it never looked wrong.

The engine now measures the curve by **re-solving the shave at each state of
health**, samples it on SOH (not on year, so a replacement can reset it),
re-prices the whole sweep with it and re-picks — iterating until the pick
stops moving, because a size with energy headroom fades more gently and
should be allowed to win on that. The distinction is real: on a bill-sized
system with headroom the year-20 retention is 88%, on an energy-limited
4-hour interval-sized system it is 75%. The linear model could not tell them
apart.

### 3. No battery replacement was ever booked

The design engine books one; the sizer did not. A 20-year NPV with no
replacement tells a funder the cells are free after year ten. At 2%/yr a pack
crosses 70% in year 18; at 4%/yr it needs two replacements inside the term.

Replacement is charged against **nameplate and the energy side only** —
replacing cells is not rebuilding the plant, so the converters, pad,
switchgear and interconnection are not bought again — and the ITC is not
assumed to be available a second time. `minSoh` and `replKwh` are on the form.
On the reference 20-year case this took NPV from $843,982 to $685,563.

### 4. The integrator was the slowest and least accurate part of the engine

`energyAbove` was a 1,200-slice midpoint sum carrying up to **0.06% of
quadrature error at shallow shaves** — exactly where a demand charge is most
sensitive. The curve `p(x) = pmin + (ppk-pmin)(1-x)^k` has a closed form:

```
u   = (T - pmin) / (ppk - pmin)
x_T = 1 - u^(1/k)
A   = (pmin - T)*x_T + (ppk - pmin)*(1 - u^((k+1)/k)) / (k+1)
```

Checked against a four-million-slice integration across k from 0.05 to 60 and
every threshold from base to peak: agrees to **3×10⁻⁷%**, and is ~4,700×
faster. That speed is what makes re-solving the shave at twenty states of
health affordable in the first place.

A 20-year, four-duration bill run went from **6,871 ms to 177 ms**; a
35,040-point interval year with the measured fade curve runs in 621 ms.

### Net effect

The first three corrections pull in different directions and do not cancel:
crediting the floor pack and measuring degradation both raise returns,
booking the replacement lowers them. The engine is more accurate in both
directions rather than uniformly more optimistic — and it is now fast enough
that the accurate method is the affordable one.

---

## Tariff engine (2026-09-20)

### The gap this closes

Benchmarked against EnergyToolbase, whose moat is precise tariff modelling.
OMEGA valued **every shaved kW at one `$/kW-mo`**. Almost no commercial
schedule works that way. A typical C&I tariff bills:

- a **facility** (non-coincident) demand charge on the month's highest kW,
- an **on-peak** demand charge on the highest kW *during* its window,
- sometimes a part-peak charge on a third window,
- energy at a different price in each window,
- all of it seasonal,
- and a ratchet on some components and not others.

Those are different determinants, and a battery cannot shave them all at
once — shaving the 4pm coincident peak and the 11am facility peak are
different dispatches worth different money.

**Measured, on a summer-only demand charge** ($6.10/kW all year + $28.10/kW
on-peak, Jun–Sep), for the same 250 kW battery:

| how the flat rate was chosen | claims | error |
|---|---|---|
| read off a July bill | $102,600 | **+54%** |
| read off a January bill | $18,300 | **−73%** |
| a correct 12-month blend | $46,400 | **−31%** |
| exact, billed per determinant | **$66,825** | — |

Even the *right* blended rate is 31% out, because the battery earns the
summer rate on the summer peak and the blend averages it across months where
it earns less. Run through the sizing engine end to end, the flat model
overstated annual savings by 32% and payback by 28%.

That is larger than every other correction in this codebase combined.

### `api/_lib/bess-tariff.js`

Exact, line-item billing from either an interval profile or month
aggregates. Every figure in the tests is hand-computed and written out.

**The schema is OpenEI URDB's, deliberately.** URDB is public, free and
carries thousands of US tariffs; building to anything else would mean
writing an importer later and getting the edge cases wrong. A URDB record
drops in essentially as-is — which is the answer to the one thing ETB has
that we do not, a rate library.

Handles: tiered energy and demand (cumulative, with the marginal rate
reported — what a battery actually saves on the margin), 12×24 weekday and
weekend period schedules, seasonal facility charges via `flatdemandmonths`,
coincident TOU demand, ratchets on the trailing 11 months, fixed charges,
per-kWh riders and tax.

A flat rate is expressed in the same schema and reproduces the old
arithmetic exactly, so there is one billing path rather than two.

### Wired in

`/api/bess-size` takes an optional `tariff`, bounded before the engine sees
it (periods, tiers, schedule shape, rate ranges — a negative rate is a
sell-back price this engine does not model, and a rate above $1,000 is a
misplaced decimal). With no tariff the engine is byte-identical to before.

`battery-sizer.html` gains a third rate mode. It takes pasted URDB JSON and
**reads back a plain-English summary of what it understood** — grouped by
season, with non-contiguous windows described as such, because an off-peak
period is usually the night *plus* the evening and printing "0:00–24:00" for
it says the opposite of the truth.

### Honest limits

- **A monthly bill cannot carry a coincident demand figure.** On the Utility
  bills tab only the facility determinant is priced, and the summary says so
  rather than quietly understating what a well-targeted battery is worth.
  Interval data prices everything.
- **The dispatch is not yet tariff-aware.** It still shaves the monthly
  maximum. Pricing is now exact; *targeting* the highest-value determinant is
  the next step and is where the remaining value sits.
- **No rate library.** The schema makes URDB import a mapping rather than a
  rewrite, but the import is not built. Pasting a schedule is manual today.
- The template button ships a **shape, not a real schedule** — every number
  is a placeholder. Shipping a real utility's rates would be shipping numbers
  that go stale silently.

### Also fixed

`ES_TAX = 0.0635` was hardcoded in the shared engine — a Massachusetts
utility tax applied to every site in the country, including the ones in
California. It is an input now, defaulting to zero.

Zero-rate demand periods no longer emit a `$0.00` line. That was not
cosmetic: a caller reading the first demand line got the period that never
moves, so a battery shaving the window that *is* billed looked like it
achieved nothing.

---

## BESS Pro Forma 2.0: the investor model moves to the server (2026-09-24)

The old `proforma.html` was NextNRG's legacy EV-charging calculator copied into
core: every figure computed in the browser, no income tax, the ITC and a lump
of MACRS subtracted from capex at year zero, degradation computed and never
applied, a fixed 10-year horizon, and tenant names in a core file. Replaced.

**Moved to `/api/` (CLAUDE.md IP rule):** ITC basis and the §48E rate build,
MACRS and bonus, state and federal tax, debt sizing, IRR/NPV/payback, levelized
price, LCOE — `api/_lib/proforma-engine.js` behind `POST /api/proforma`
(`context | size | model`, gated on the `proforma` tool). The page renders what
the API returns; `proforma-logic.js` lays out the investor deck (PDF) in the
producing tenant's brand and computes nothing.

**Method.** The investor one-pagers the deck is modelled on were NREL SAM
single-owner runs; the engine follows SAM's method, and
`scripts/tests/tproformaengine.js` reproduces the published Topanga and
Sunnyside figures to the dollar (ITC, basis, year-1 distribution) and to the
basis point (IRR, IRR build).

**Sizing** is the unified engine merged in the same release
(`battery-tool-engine.js` via `api/_lib/proforma-sizing.js`). `econ()` now also
returns the year-by-year schedule it already computed; sweep rows drop it so
`/api/bess-size` responses are byte-identical. Its request validation moved to
`api/_lib/bess-size-validate.js`, shared by both endpoints.

**Follow-up (same branch family):** dashboard styling, PowerPoint export,
server-side site lookups (energy community, PVWatts, URDB) and
`docs/PROFORMA.md`.


## Packaging Phase 0 — September 26, 2026

L2 closeout is already on main via PR #133; no second merge was performed.
`omega-caps.js` takes verification from the same Firebase user as the email,
requires literal true plus the current staff domain on all three fallback
paths, and clears stale add-ons before resolving another account. An existing
billing record wins. Server authorization continues to use `caller.staff`.
New signup trials default to and cannot exceed 14 days; repeat signup does
not rewrite billing. Phase 4 still owns approval-started trials and billing.
No pricing/modeling engine is changed or moved by this phase; existing engine
debt above is outside this authentication-only editor edit. No tenant data,
QuickBooks records, rules or production deployment changed.

## Packaging Track A — September 26, 2026

The shared `omega-newproject.js` now presents seven project cards. Solar +
Storage expands to existing `der` + `bess` siteScopes. Existing scope keys
and primary-type precedence remain stable; Building is additive. No saved
project is migrated. The editor recognises Building for its existing project
type selector. This is project metadata, not a new entitlement or engine.

The existing OmegaRibbonIcons owner converts glyphs to a common SVG stroke
family. OmegaShelf keeps the named duplicate tools hidden after late
injection, and retires only the BESS Config and Viability ribbon launchers.
`_openPadConfig` (equipment placement/configuration) and every draw function
remain intact. No pricing, scoring, eligibility or finance engine changes
were made; the existing browser-engine debt listed above remains.

Workspace filtering and the catalog-based package gates remain Phase 3.
Checks render the real shared dialog and isolated real ribbon owners with
legacy standard/deluxe billing fixtures; they do not simulate future
Lite/Field module entitlements or claim a full Maps/authenticated editor run.


## Packaging Phase 2 — September 26, 2026

The canonical editor keeps every drawing implementation. The shared server
catalog now drives packaged command visibility, direct launchers, File/Output,
Summary Cost, Ctrl+K/Jarvis and late controls. Customer Editor Lite receives an
authorized drawing projection instead of bypassing caps by query parameter.
AI Render belongs only to Plan Sets & CAD. Existing tier behavior stays on
unpackaged records; read failures no longer stand in for legacy billing.

Server producers use `api/_lib/package-access.js`; Grid Atlas and validation
submission now require Firebase authentication. No financial/scoring engine
was moved in this phase: the browser-engine debt above remains a release
prerequisite, not a solved security claim. See
`docs/PACKAGING-PHASE-2-VALIDATION.md` for coverage and exact test limitations.


## Packaging Phase 3 — September 26, 2026

The packaged editor now derives command attributes and MODULE_GRANTS from the
server catalog, prunes empty containers, renumbers captions and provides seven
project workspaces with a per-user All tools choice. The shared module gallery
uses server feature/price projections; subscription checkout remains Phase 5.
Staff-only presentation previews do not write billing or impersonate a tenant.
Catalog metadata keeps shared draw tools out of gated Compute/Estimate
containers. Fleet O&M and O&M Lifecycle now correctly belong to Operations;
no second command ownership table was introduced.

The full canonical HTML browser run exposed an existing Recent Projects loop:
a successfully loaded empty array was mistaken for a missing result, causing
an endless promise/refetch loop on a new account. Empty results now render the
existing empty state. No draw implementation was removed. Result-rail changes
only reorder existing displayed values and add an action for an empty project;
no financial/scoring engine changed or moved. The engine debt above remains.

Legacy layout modes remain for unpackaged records; packaged project focus
cannot override module access. The dry-run backfill requires captured current
tool access and flags grants outside the sold catalog, rather than deleting or
automatically converting them. See docs/PACKAGING-PHASE-3-VALIDATION.md.


## Packaging Phase 5 — September 26, 2026

No `editor.html` edit. The shared + Modules gallery (`omega-package-menu.js`)
gained the subscribe control: a quote, a pay-first change invoice or an
immediate $0 activation, all from `POST /api/plan-change`; the browser
displays server strings and grants nothing. The tools appear when the
server projection says so. "Your plan" in the tenant record uses the same
control. No draw implementation was touched and no financial engine moved;
the proration and change math lives in `api/_lib/plan-change.js` and
`api/_lib/package-billing.js`. What a tenant bought (`billing.subscription`)
is now separate from what is switched on (`billing.modules`), so a late
payment never rewrites the package. The browser-engine debt above remains.
See docs/PACKAGING-PHASE-5-VALIDATION.md.


## Packaging Phase 6 — September 26, 2026

No `editor.html` edit. The Subscription Proposal is a new root tool page on
the Pro Forma pattern with a companion `subscription-proposal-logic.js`
that only draws; every figure comes from `POST /api/subscription-proposal`
on `api/_lib/subscription-proposal.js` and the price book. `brandOf` moved
out of `api/proforma.js` into `api/_lib/deck-brand.js` so the two decks
share one brand rule (the Pro Forma keeps `_gate.brandOf`). `start.html`
gained the discovery step and a proposal prefill; `api/tenant-signup.js`
stores the answers and accepts a keyed proposal. No draw implementation was
touched and no financial engine moved; the browser-engine debt above
remains. See docs/PACKAGING-PHASE-6-VALIDATION.md.


## Packaging Phase 7 — September 26, 2026

No `editor.html` edit. `omega-usage.js` is a new shared runtime file; the EV
cost workbook, the closeout and Site Finder gate their export through
`POST /api/usage` before producing, and the RFQ endpoint counts a bill of
materials server-side. All counting, allowance, overage and review math is
in `api/_lib/usage.js`; the browser draws the server’s badge. No draw
implementation was touched and no financial engine moved; the
browser-engine debt above remains. See docs/PACKAGING-PHASE-7-VALIDATION.md.

## Packaging Phase 8 — September 26, 2026

No `editor.html` edit. Omega Logic follows the package: `api/_lib/logic-access.js`
judges a packaged tenant by `modules[]` and the live grant
(`package-access.live`, lifted out of the editor projection so both read one
rule), and every Logic endpoint names the part it serves. The office chrome
(`omega-logic-theme.js`), the desktop dashboard, the Omega Logic app and
`logic-settings.html` draw only the parts held; the sandboxes were rebuilt and
the PDF guides retaken because those screens changed. Nothing moved between
browser and server; the browser-engine debt above remains. See
docs/PACKAGING-PHASE-8-VALIDATION.md and docs/PACKAGING-RELEASE-CHECKLIST.md.

## Packaging Phase 9 — September 26, 2026

No `editor.html` edit, no page changed. The bench (`api/mes-scan.js`), the
test rig (`api/mes-test-result.js`) and hold/release (`api/plant-control.js`)
run `logic-access.requirePartIfPackaged(org, 'plant')`; `firestore.rules`
compares the sign-in email lower-cased in the four team blocks,
`termsAcceptances` and `isAdmin()`; `omega-auth-errors.js` names the
preview hostname when a sign-in is refused for an unauthorised domain. See
docs/PACKAGING-PHASE-9-VALIDATION.md.

## Loading screen — September 26, 2026

`editor.html` (and 42 other signed-in pages): `<script src="/omega-splash.js?v=1">`
first in `<head>`, the OMEGA mark until the page is known and again on
leaving; the editor has no `omega-tenant.js`, so its splash ends at load
+ 400 ms or the 4 s cap. See docs/LOADING-SCREEN.md.

## Ribbon icons — September 26, 2026

`editor.html`: the ribbon's icon module (`OmegaRibbonIcons`, the light
restyle that turns every text glyph into an SVG line icon) drew a generic
four-box placeholder for any button its ten loose regexes did not match —
about ninety of them (Trace Boundary, Add Exclusion, the interconnection
modes, Place Substation, Supply Link, Move System, Load Screen, Land Lease,
the stencils, the equipment…). `omega-ribbon-icons.js` (new, ES5, UMD) is
the one icon set: a hand-drawn 24×24 stroke glyph per button label, in
the ribbon's line style, with the regex tier kept as the second chance;
the module loads it first and marks a button it does not know
(`data-icon-fallback`). `scripts/tests/tribbonicons.js` (in `npm test`)
reads every ribbon label out of `editor.html` and fails if one falls back.
Tommy, 2026-09-26: "we had logos for this earlier and they were fine —
just make them match your new style."

## Packaging Phase 10A — September 26, 2026

No `editor.html` edit. `start.html` gains *Pay and start now* and the pay
step (QuickBooks' card page, "I've paid"); `login.html` sends a new company
to signup and the price list; `offerings.html` and `api/offerings.js` are
new (the public price list); `omega-tenant.js`'s billing bar gains "I've
paid". `api/_lib/packaging-mode.js` is the one sandbox-or-live rule; the
engine, item sync, QuickBooks guard, price book, signup, runner and the two
scripts read it. See docs/PACKAGING-PHASE-10A-VALIDATION.md and
docs/PAYMENTS-BROWSER-SETUP.md.

## Editor chrome theme — September 26, 2026

`editor.html`: after the ribbon went light, "make the outside parts match
our theme a little more, easier on the eyes" (Tommy). One token set in
`<style id="omega-ui-theme">` now carries both schemes: the graphite values
stay the `:root` default, the ribbon's light values (`--bg #F5F4F0`,
`--panel #FFFFFF`, `--surface #EEF1F3`, `--border #D7DFE6`, `--text
#16202B`, `--sub #526273`, `--accent #2B5FA8`, `--hl-dim #E6EEF9`, `--icon
#526273`, `--navy #FFFFFF`, `--blue #E6EEF9`) apply under
`prefers-color-scheme: light` for `html:not([data-omega-theme="dark"])` and
again under `html[data-omega-theme="light"]`; new relation tokens `--scrim`,
`--hover`, `--hover-strong`, `--inset`, `--hairline`, `--shadow`,
`--grid-dot`, `--ok/--warn/--bad/--on-status` have both values.
`OmegaUI.theme('auto'|'light'|'dark')` persists `data-omega-theme` exactly
as the accent is persisted; the command palette gains Theme: Auto / Light /
Dark. The ribbon's scoped light block collapsed to
`#tb,#ribbon{background:var(--navy)}`. About 2,170 lines were retokenised
by `scripts/_lib/editor-theme-retoken.py` (style blocks, inline panel
markup, the JS dialog builders and every full-screen scrim → `var(--scrim)`);
the File menu, hamburger items, side panels, legend, canvas furniture,
bars, modals, compass, diagnostics, address chip, site panel, meters, SOS,
ARR and Project Intelligence read tokens; coloured headings tuned for a
dark ground read `--accent-2/--green/--amber/--purple`; dark `--gold` is
`#5CA6DF` (5.9:1 on `--panel`). Left as data: draw swatches, status chips,
gradient buttons, the SLD paper sheet, chart and canvas paints, exported
HTML/PDF documents. No id, class or behaviour changed; `omega-package-menu.js`
honours the switch. Tests: `scripts/tests/teditortheme.js` (npm test),
`scripts/render-editor-theme.js` (check:pages; screenshots in
`docs/screenshots/editor-theme/`). Design and what is not done:
`docs/EDITOR-THEME.md`.

## Projects list — September 27, 2026

`editor.html`: the Projects modal (File → Open Projects…) loses its All /
BTM / FOM tabs and lists every project, and each row names what kind of
project it is — BESS, DCFC, L2, Solar, DER, Data center, Building — where
it used to wear the BESS wizard's market (every save writes one, BTM by
default, so a Level 2 job read "BTM"). Tommy: "we dont need BTM or FOM just
show all the projects … but they should tell what kind of project they are
i.e bess L2 DCFC etc". `_projKinds(p)` is the one rule: what the record
declared (`type`; the New Project dialog's `siteScopes` while they still
include that type; the EV wizard's `L2` / `EVSE`), then what is on its
plan, read by the editor's own collectors — `evChargerTotals`,
`_findBessPads` and `derTotals` now take a saved record, and with no
argument read the live drawing exactly as before. Nothing declared and
nothing placed is no label. The labels are `OmegaProjectTypes`' (a `short`
on each type; `norm()` and `short()` exposed). Search matches a kind, and
Home → Recent wears the same labels. Then "remove the BTM/FOM market field
from new project too": the editor's own New Project dialog drops its Market
select (`np-market`) and creates the project without a `wizMode`, so the
BESS wizard's market is unconfirmed and asked when that wizard runs, as for
a project created anywhere else. `wizMode` is still saved by the editor and
still restores the BESS wizard's market. Tests:
`scripts/tests/tprojectkinds.js` (npm test); `teditortheme.js` records the
three tab ids and `np-market` as retired.

## Site Map shows how the workspace pays — September 27, 2026

"You need to make sure the editor is linked to how a tenant pays and what
their modules are" (Tommy). `editor.html` gains one script include
(`/omega-editor-plan.js`, after `/omega-package-menu.js`) and one mount,
`<span id="omega-plan" hidden>` in `#portal-nav`. No other editor edit.
`omega-editor-plan.js` paints a plan chip on the `omega:package` /
`omega:tier` events `omega-caps.js` already sends: the plan (· Read-only or
· Payment due), a popover with the modules in Site Map and elsewhere (the
`/api/offerings` `editor` flag), the monthly figure and next invoice from
`GET /api/plan-change` (any failure shows the plan without figures),
changes in progress, the read-only notice with its pay link and *I've paid*
(reconcile-now, then the package is re-fetched and re-applied), and links
to `/workspace#billing` and `#modules` in a new tab. A legacy plan's modules
are `OmegaWorkspaceHub.moduleState` on the tier `OmegaWorkspaceHub.editorCtx`
names (the one legacy rule the workspace's Modules page reads; see the
merge below); `omega-tools.js` and
`omega-workspace-hub.js` load only when the popover first opens.
`omega-tenant.js` is still never loaded. The tier names and the read-only
command list are copies of `omega-tenant.js` and `M.readOnlyRibbon()`;
`scripts/tests/teditorplan.js` fails if either drifts.

`omega-caps.js`: a failed billing read or package fetch leaves the plan
"unchecked" — navigation and read-only commands stay, producing controls
are hidden (never greyed), the Ladder tab opens the chip's popover with
Retry, and `OmegaCaps.retry()` re-checks without a reload. The
`GOVERNED`/`governs`/`editorCan` block is unchanged by this (since the
merge below it is compatibility only: the Modules page asks
`OmegaCaps.canWith` through `editorCtx`).

`omega-editor-gate.js`: a failed check shows its own message with Retry
instead of "not on this plan"; the real refusal keeps "not on this plan"
and adds "See modules ›". A legacy `billing.toolAccess` array without
`editor` now refuses (absent = whatever the plan includes); a missing
`omega_orgs` record still fails open. Not built: the chip in Editor Lite
(it hides `#portal-nav`). Tests: `scripts/tests/teditorplan.js` (npm test),
`scripts/render-editor-plan.js` (check:pages).

## Merging main (#172–#188) into the modules batch (#190) — September 27, 2026

Main's editor plan re-read, legacy "Add to plan", renamed modules, Stripe
rail, price book page, signup shop and new-project panel met this batch's
one card, one menu and tools marketplace. Every feature of both is kept;
where they overlapped:

- **Marketplace: the tools catalogue** (Tommy's later ask). Main's store
  paragraphs and its legacy "Add to plan" in the store are not ported;
  shared-library work main did for other pages stays. A locked tool
  names its module and links to `/workspace#module-<key>`.
- **Module surfaces keep this batch's words and its one card rule**
  (`OmegaWorkspaceHub.moduleCard`); main's legacy purchase is a STATE and
  a PATH inside it. A legacy module not held says **Opt in**; the one menu
  asks `plan-change` `addon-quote` and either sells it by card ("Opt in
  and pay", or "Turn it on"; `addon-buy`, its own QuickBooks invoice) or,
  where it is not exact or card payments are not open, records the request
  ("Request opt-in"; `addons.gate` now answers `request: true` for a closed
  engine too, so a legacy Opt in never dead-ends with the flags off). A
  purchase waiting reads *Waiting for payment* with Pay and Cancel request
  (`addon-cancel {addOnId}`); a card add-on on reads Live with **Opt out**,
  which is NEW server code: `addon-cancel {remove}` (`addons.stop`, dry run
  first) stops it at the end of the month paid for through
  `addOns.ending`, the billing day leaves it out of the renewal and takes
  its grants back, and `withdraw-addon-cancel` keeps it. The recorded
  opt-out refuses a card add-on; the recorded opt-in counts live add-ons
  as held. Main's `addOnControl` is the same legacy path. Never "Add to
  plan", "Ask ClearSky to include it", "Pay $X now" or "Subscribe" on a
  module surface.
- **ONE legacy editor rule.** Main's `legacyGates` measurement (read off
  the real editor, `render-legacy-gates.js`, `tlegacygates.js`) is the
  judge (`moduleEditor` asks `ctx.canCap`); this batch's `editorCtx` is the
  ONE mirror of the tier Site Map runs that feeds it, made pure over
  `OmegaCaps.canWith` and returning `canCap`; `capsFor` is its no-person
  alias and `legacyCtx` builds the whole legacy ctx once. The m.caps /
  `editorCan` counting is retired as the judge (`editorCan` stays for
  compatibility). Omega Design stays always held. The workspace, the
  marketplace, the editor's plan chip, the admin Package tab and the
  server's add-on check all ask it; the tests were re-baselined to it
  (Standard holds Omega Design, Omega EV and Omega Permits and is Partly on
  nine), not bent back to the old rule.
- **Billing rail words follow `payWith`** (`billing-driver`: Stripe or
  QuickBooks) wherever this batch had written QuickBooks as the pay page;
  an add-on's pay button reads the add-on's own `payWith`, always
  QuickBooks (`addons.RAIL`), never the package's.
- **Module names follow main's catalog** (Omega Design, Omega Grid, Omega
  Intel, Logic Office, …) in this batch's copy, tests and fixtures ("Omega
  Design stays.", "Omega Design is always included"); keys are unchanged
  and a stored request keeps the name it was written with.
- **The module cards live on the Modules page, not the home** (main,
  Tommy's ask); the page groups them as main does (Your modules, then the
  rest) with this batch's card rule on each.
- **`omega-caps.js`**: main's read / commit / refresh / watchPlan and
  `pendingPackage(loading)` carry this batch's unchecked view
  (`unverifiedPackage`: pending, not loading, viewing stays and producing
  waits) and `retry()` rebuilt on `read()`; one `failedView` tells a 403
  refusal from an unchecked plan. After a retry the editor's gating block
  re-applies `OmegaCaps.tier()` (the answer), which replaces this batch's
  `_retried` pin.
- **The plan chip rides on main's re-check**: *I've paid* re-reads the
  plan through `OmegaCaps.refresh` (never through the locked state), and
  the access deadline has ONE clock, `OmegaCaps.watchPlan` (the server is
  asked first; the editor closes on its own clock only when the server
  cannot answer): the chip only arms it for the package on screen. A 403
  reads "No access · Refused" in the server's words. Its pay links read
  "Pay in " + the rail the server names (`payWith`). The chip, the admin
  Package tab and the server's add-on check (`addons.judge`) build their
  legacy ctx with `OmegaWorkspaceHub.legacyCtx`, as the workspace and the
  marketplace do; `admin/tenant.html` loads `omega-caps.js` once.
- **Admin Package tab**: preselects what the tenant holds and partly uses
  (main) plus its requests, a trial only Omega Design plus its requests
  (this batch); card add-ons ending are listed and not preselected.
  `package-billing.reconcile` flags an add-on invoice paid after the
  workspace moved onto a package for a person to review.
- **Kept untouched from main**: the new-project panel and click sweep, the
  price book page, the signup shop ("Subscribe" is the SIGNUP's word, not
  a module surface's), the Stripe rail and its tests, the project-kind
  labels and the report chrome. `package.json` runs both sides' checks
  (`render-legacy-gates.js` and `render-editor-plan.js`; `teditorplan`,
  `tprojectkinds`, `tlegacygates`, `treportchrome`).

## New Project dialog — September 27, 2026

`editor.html`: the editor's own New Project dialog is no longer a BESS
dialog. Its title reads New Project (was New BESS Project), the name example
is neutral, a blank name saves as "New Project", and its `project.created`
event sends `vertical: null` until a type is chosen (as `omega-newproject.js`
and `omega-intake.js` do) instead of `'bess'`. Pinned in
`scripts/tests/tprojectkinds.js`.

## Projects list on a phone; first save's vertical — September 27, 2026

`editor.html`: the Projects window's search row (search, Sort, New Project)
now wraps (`flex-wrap`, the search box `flex:1 1 240px; min-width:0`): on a
390 px phone the search box keeps the first line and Sort + New Project sit
under it, where New Project used to end 150 px past the window's edge. On a
desktop it is one line as before. The editor's first save of a new project
(`saveProject`, no `_projectId` yet) now sends `project.created` with the
type it is saved with (`payload.type`, set only when one was chosen), else
`null`, instead of `'bess'`; no project.created in the editor says BESS by
default. Pinned in `scripts/tests/tprojectkinds.js`.

## Level 2 trenches both ways from the panel — September 28, 2026

"Did we figure out any way to trench two different directions without
overlapping?" (Menachem, 2026-09-28, for a Level 2 job). The guided build
already spurs: a charger clicked off the trench runs a straight spur from
the nearest point (2026-09-16). What it could not do was bend before the
first stall, and a panel snapped mid-run started the branch at the run's
far end.

- **Draw another trench (T)** in the charger step of the Level 2 and DCFC
  builds (`_dcfcDrawAnother` in `editor.html`): the first click lands on
  the trench already drawn (`_dcfcTapOn`, the panel or anywhere along it,
  a ring showing where), further clicks route it, Enter files it as a spur
  of the run it tapped (`spurOf`, `spurSeg`, `spurTapFt`), Esc or *Back to
  chargers* drops the draft with nothing written (`_dcfcDrawBack`). The
  chargers' run stays the root (`_dcfcFamily`), so a charger lands on
  whichever trench is nearest, its conduit walks that trench back to the
  panel, and `trenchTotals` digs each trench once, the parent as far as
  the tap. The surface toggle during that draft leaves the first trench's
  surface alone.
- The next run leaves the node just placed (`placeDcfcAt`, node step),
  not the far end of the run it was placed on.
- `scripts/tests/ttrenchkeep.js` holds both; `api/jarvis-help.js` tells
  Jarvis.
- The guide with screenshots is `guides/editor/Site-Map-Level-2-Two-Trenches.pdf`
  (moved from `docs/`, which Vercel does not serve, on 2026-09-29 so a field
  rep can be sent a link: `/guides/editor/` holds the editor's own guides,
  built by their own scripts; `guides/*.pdf` stays the Omega Logic set that
  `build.js` writes and `tguides.js` and the kit judge),
  made by `scripts/guides/site-map-level-2.js`: it runs the real Level 2
  build in Chromium on the offline harness (clicks and keys, the state
  asserted after each step) and prints the pages, so it can never show a
  screen the editor does not draw. Not in `build.js` (whose guides are the
  Omega Logic apps); rerun the script after a change to the build. The
  finish banner names the Level 2 unit now ("4 × Autel AC Pro (76.8 kW)",
  not "4 × DCFC (0 kW)"), and the ring marking where a second trench will
  start clears the panel icon.

## Service pedestal: a new utility service on the site map — September 28, 2026

"I'm doing a job where I'm putting 2 new pedestal services. Any way I can
show that in the site map?" (Menachem, 431-437 Sunderland St, Worcester,
2026-09-28). A pedestal service is a freestanding meter socket and main
breaker on its own base, fed by an underground lateral: a NEW utility
service out by the stalls. There was nothing to place for it, and the
counts the editor hands the EV Cost Workbook were every one zero.

- **Insert › Service Pedestal** (`rbInsert('svcped')`, `EQ`,
  `EQ_FOOTPRINT_FT` 3 × 2 ft, `ICONS.svcped`, the ribbon glyph in
  `omega-ribbon-icons.js`, an electrical note in `_deviceElecNote`). It is
  in the legend as Service Pedestal ×n.
- **Level 2 › Start from › New service pedestal** (`L2_SERVICE.pedestal`):
  the build places the service node as a flagged pedestal (`svcPedestal`)
  wearing the pedestal symbol, and the node's spec now follows the choice
  (it read "existing, verify available capacity" under every option). Two
  pedestal services are two builds.
- **The counts reach the workbook** (`_evCountsFromCanvas`): it read the
  element's `type` first, which is `eq` or `evgear` for everything ever
  placed, so no kind matched and bollards, pads, handholes, the meter,
  dual pedestals and future positions all went across as zero; it reads
  `eqId`, then `evKind`, now. New: `servicePedestal` (Insert or the
  build) and `newService`.
- **`ev-cost-workbook.html`**: `counts.servicePedestal` → `nServicePedestal`;
  a pedestal (or a service node the build named new) answers the service
  question as New service once an existing meter bank has had its say; a
  standard row on the metering line, priced per pedestal by its own rate
  (`STANDARD` fifth field → `case 'svcPedestal'`): the filed metering
  socket and labour, plus `STANDARD_ITEMS.l2.servicePedestal`, a pedestal
  hardware ALLOWANCE that the row's note says to confirm against the
  utility spec. Nothing appears without a pedestal on the drawing.
- `scripts/tests/tsvcped.js` holds all of it; `api/jarvis-help.js` tells
  Jarvis.

## The trench is the thing you drag — September 29, 2026

Two chargers clicked off the trench made a straight spur across the
building at 431 Sunderland Rd; dragging one charger's conduit moved that
one leg while the spur's band and the other leg stayed on the straight
line — "this weird ghost line ... it should only be one trench for the
right side" (Thomas, 2026-09-28).

- A click on any conduit the guided build laid in a drawn run opens the
  RUN's handles (`_trShow`, `#trench-verts`), not that one conduit's: a
  vertex drags, a faint midpoint becomes a bend, a double-click removes a
  point, Esc puts them away. A root run's first point is where it leaves
  the equipment and stays put; a spur's first point slides along its
  parent. Shift-click still selects the one conduit; Alt-click still adds
  a vertex to it alone.
- A trench taken apart by hand is put back together on opening. Site Map
  4 at the same address had every leg dragged off its trench one by one
  (all an earlier build let you do): twelve lines where there should be
  one — "a trench only happens once and then the run is on that"
  (Thomas, 2026-09-28). A fresh open of a trench (a click on a leg, not
  the redraw after a bend is born or a drag ends) re-lays every leg on
  it and, only when one actually moved (`_trSamePts`: as many points,
  none a pixel off; the build's tap on the run's own vertex sits a
  fraction of a pixel from the charger's whole-pixel centre and is not a
  change), writes ONE undo step and says so in the banner
  (`_trShow.relaid`). A trench whose legs already ride it writes nothing.
- `_dcfcRelayRun` re-lays every conduit laid in the run from its device,
  through the run as it is now, back to the run's start, then every spur
  off the run (whose tap slides to the nearest point on the new line) and
  their conduits; per frame during the drag, with anchors re-cut on
  release. `_trMoveVertex` / `_trInsertVertex` / `_trRemoveVertex` are the
  pure geometry; `scripts/tests/ttrenchedit.js` holds them.
- The drawn runs now travel with undo: both history cores (`pushHist` /
  `undoLast`, and the FIX 6 replacements that run at boot) snapshot and
  restore `S._trenches`, so an undo after a re-route or an extension puts
  the run and its legs back together instead of the legs on the old line
  under a run that kept the bend. `tundoleg.js` still passes.
- The Level 2 guide (`scripts/guides/site-map-level-2.js`) gains step 7,
  *Move a trench after it is drawn*, with two screenshots; Jarvis knows.

## Project capex is what Site Map's Run costed — September 29, 2026

The workspace home read "Pipeline capex —, 63 projects not priced yet"
over sixty-three sites whose cost sheets had priced every one (Tommy,
2026-09-28: "project capex should reflect the costs that are calculated
by the run function in the project site map editor"). The workspace
(`omega-workspace-today.js`), the dashboard rollup (`index.html`) and the
asset book (`omega-assets.js`) read `capex`, `incentive`, `annualRevenue`
and `bessKwh` straight off `projects/{id}`, and nothing the editor did
wrote them: `saveProject()`'s payload is an allowlist, and the only
writers of those fields were the demo seeds and NextNRG's backfill.

- `omegaRunRollup()` (beside `omegaRunDesign` in `editor.html`) captures
  the run's OWN totals once the engines have recomputed: Total install
  (`window._COST_TOTAL`, the contracted number when one is entered), the
  incentives netted (`_INC_TOTAL`), the net figure, year-one revenue
  (`_YR1_REV`) and the fleet `omegaBessFleet()` reads (placed, else the
  Config dialog's, as the cost sheet falls back). Kept on `S.costRollup`;
  a run that priced nothing (`_COST_TOTAL` 0: nothing placed, or out of
  scope) clears it and records nothing.
- `omegaRollupFields()` is what the record gets: `capex`, `incentive`,
  `capexAt`, `capexSource: 'site-map'`, plus `annualRevenue` only when the
  streams gave one and `bessKwh`/`bessKw` only when a battery is there.
  `saveProject()` names each field in its payload literal from that
  object, so undefined is stripped and an unpriced save never blanks a
  figure someone entered or backfilled. `_loadProject` resets the capture,
  as it does `vendorOverride`, so a figure never leaks between projects.
- `omegaRunSave()`: a priced run marks the record unsaved and saves at
  once (signed in, a project open, the load finished — the plot commit's
  condition), so the workspace shows it without waiting for the autosave;
  a read-only or unchecked plan (`OmegaCaps.packageAccess()`) waits, and
  the totals ride the next allowed save. `saveProject()` stays the one
  writer of the record.
- Not built: the Battery Sizer's `bessSizing` record still does not feed
  the flat fields, so a site sized there but never run in Site Map still
  reads "No battery size yet" on the home; a rail row naming the figure
  on the record.
- Tests: `scripts/tests/tcostrollup.js` (npm test) runs the three
  functions out of the editor against the sheet's totals, pins the payload
  literal and the load-side reset, and hands the fields to the real
  workspace rule: `$1.2M`, the site nobody ran the one "not priced yet".

## In flight reads the work done on the design — September 29, 2026

Eight Level 2 jobs on the Concord home each read "No battery size yet ·
0%" (Tommy: "these are all batteries these are l2's so the details that
show on the in flight tab should show the amount of work done on them, if
they have been designed and run then they are 100%"). The card's bar was
the pipeline stage (candidate = 0), and the Today rule asked every
candidate without a size for a battery, whatever kind of job it was.

- `omega-workspace-today.js` reads what KIND a job is through
  `omega-workspaces.js`, the ONE type table (the dialog's type and
  scopes, legacy names folded, the EV wizard's L2 / EVSE mark as the
  editor's Projects list reads it), never a second alias map;
  `workspace.html` now loads that library (its ribbon and rail hooks are
  no-ops without the editor's DOM). `wantsBattery` is true only for a
  kind whose focus carries storage (BESS, Solar + Storage, DCFC, a
  microgrid) or a record that declares no kind, so every legacy project
  reads as before.
- `progress(p)`: designed when equipment or conduit is on the site map,
  run when Site Map's Run costed it (`capexSource: 'site-map'` /
  `capexAt`, the mark the previous entry added), else priced when a
  figure is on the record; 50 and 100; a project past candidate reads the
  further of that and its stage, so a job in construction never reads 0.
  The card's bar is that percent, its meta line the kind of job
  (`kindLabels`) where there is no battery size, and its why the
  progress phrase — "Nothing on the site map yet", "Designed, not run
  yet" (a candidate that still needs something), "Designed and run ·
  Touched today". A battery candidate with no size still reads "No
  battery size yet" and opens the sizer.
- Today folds every non-battery job with nothing on the site map into
  ONE row (`design`, opening the oldest in Site Map), the twin of the
  size row; a Level 2 job is never asked for a battery size.
- Tests: `scripts/tests/tworkspacetoday.js` §10 (kinds off the one
  table, the percent, the phrases, the row, the card order);
  `tcostrollup.js` now hands the workspace a Level 2 site the run priced
  and reads "Designed and run" at 100%.

## Parcel lines — October 2, 2026

A customer asked for the map to "show the parcels so they know property
lines". Google's Maps JavaScript API has no parcel layer (the lines in the
consumer Maps app are not offered to developers), so View › Panels gains
**Parcel Lines** (`rb-parcels`, `pcToggle`, beside 3DEP Tiles), a view
setting like Solar Panels: remembered per browser (`omegaParcelLines`),
never saved with the drawing, never a shape on the plan. Designer mode, the
default ribbon on every legacy plan, keeps it (`/pcToggle/` in OmegaMode's
`KEEP`); it first landed in View › Canvas without that and was hidden on
legacy plans (Tommy, 2026-10-03: "it should show on the tools in the panels
in the editor under view").

- `omega-parcel-sources.js` (new, ES5, UMD) is the ONE list of public
  county and state parcel layers, each verified by hand on 2026-10-02 (the
  service answered and drew lines on an export tile): Cook, DuPage, Lake
  and Will counties (IL), North Carolina, New Jersey and Delaware
  statewide, and New York's participating counties. Each is drawn on the
  live Google map as an ImageMapType from the county's own `/export`, in
  one yellow line style with labels off where the service takes
  `dynamicLayers` (Lake's own cyan line layer where it does not). Free, no
  key; every service sends CORS headers, so the lines also land in map
  captures.
- `api/parcel.js` builds its county lookup table from the same list
  (`lookupLayers()`, byte for byte what it carried before), so a county
  that moves its layer is fixed once. The Cloudflare worker keeps its own
  attribute copy, as before.
- The parcel at the map centre is outlined from `/api/parcel` through
  `OmegaAutopilot.parcel` (Regrid where the plan carries it, the counties
  otherwise) and named by APN and acres; this is the line a site outside
  the public layers still gets. It is asked when the lines come on, then
  only where no public layer draws as the map settles somewhere new, never
  twice for a parcel found, and at most twelve times a page (Regrid is
  metered per lookup).
- The inline `OmegaParcels` block it replaces was console-only, and its
  South Carolina and Florida URLs answered "Invalid URL" (hosted
  FeatureServers, which have no `/export`); its Lake and North Carolina
  layer ids drew nothing. `OmegaParcels.status()` / `.sources()` remain.
- Tests: `scripts/tests/tparcellines.js` (the list, the tile maths, and the
  editor's block cut out of `editor.html` and run on a stand-in Google
  map); `scripts/tests/tparcel.js` (unchanged, now in `npm test`).

## 2026-10-03 — Site Discovery evidence handling

Site Discovery weighted ranking now runs in `/api/site-discovery`, guarded by the existing tenant/billing/member checks and the Omega Sites module. Missing or invalid active factors remain Verify with a weighted score range; zero is a real value, and all-zero weights are rejected. Grid proximity and load preference are explicitly not capacity approval or BESS sizing. CSV uses the shared quoted-field parser and safe export, imported names render as text, edits invalidate old results, and only returned tenant scope is saved. Removed seeded example candidates. Added 50-site/edge-case/access tests and a browser regression for quoted CSV, unknowns, stale results and mobile layout. No data migration.

## Parcel lines everywhere; a Finance tab; no label on its caption — October 3, 2026

Tommy, from the live editor at a customer's site in Peoria: "the whole point
is that we need the map to show the parcels like what the gis would show and
the property boundaries", then "build an api and get all the GIS data we can
get", "make sure text layers dont overlap", "put summary in estimate panel"
and "these should have their own tab in the panel finance".

- **Peoria County** joins `omega-parcel-sources.js` (DP/Cadastral layer 1,
  from z16), for drawing and for the server's point lookup (PIN,
  owner_name), and so do sixteen more Illinois counties found and verified
  the same day: Kane, Sangamon, McLean, St. Clair, Macon, Tazewell, Grundy,
  LaSalle, Madison, Logan, Adams, Coles, Knox, Lee, Boone and Winnebago
  (fifteen with a point lookup; Logan is a line layer). The ones not public
  or not reachable are named in the file. Every source carries a `test`
  point, and `scripts/check-parcel-sources.js` re-checks them all over the
  network (25 of 25 drew on 2026-10-03). Cook stays last in the lookup.
- **`api/parcel-tiles.js`** relays Regrid's nationwide parcel tiles. POST
  (a signed-in member of an active workspace) answers a ticket or why not
  (`not-configured`, `no-tile-access` after one remembered probe tile,
  `switched-off` by `toolOverrides.parcelTiles === false`); GET serves one
  PNG for a valid ticket, edge-cached for the month. The ticket is an HMAC
  of the month under a key derived from REGRID_TOKEN, the same for everyone
  so the edge cache is shared; last month's is honoured across the turn.
  Regrid's terms license the tiles for exactly this (a Tileserver
  subscription; regrid.com/terms/api). Their unkeyed endpoint answering is
  not a licence and is never used.
- The editor asks for a ticket when Parcel Lines comes on; where it gets
  one, a single Regrid layer replaces the county layers on that map, its
  dark-green lines repainted in the Parcel Lines yellow on a canvas (the
  tile is same-origin, so nothing is tainted). Without one, the county
  layers draw as before.
- **No label on its caption.** Two label lines, the icon and the button's
  padding came to ~57px where a 78px ribbon leaves ~50px, so every second
  line spilled onto the caption rule (onto the caption itself in macOS
  fonts). The ribbon's last style block now fixes the line heights in
  pixels and trims the button's padding: 50px over an 18px caption. The
  title bar gives way in order (key hints, then the search words, then the
  project name) instead of cutting "Pro" or wrapping "Ask Jarvis".
  `scripts/render-editor-plan.js` measures every label against its caption
  on every tab, packaged and legacy (Pro and Designer), and fails on the
  old CSS.
- **Finance tab** (`data-page="finance" data-module="finance"`): Push to
  Marketplace, Apply for Financing and Helios Intake move out of Output's
  Marketplace group with their caps unchanged; `finance.editorPage` is
  `finance`, so a package without Omega Capital sees the tab marked Opt in.
  Designer mode keeps it hidden, as those three were.
- **Summary** also sits in Estimate › Cost & ROI (`rb-est-summary`); the View
  copy stays, because Estimate is plan-gated and Summary is Omega Design's.
  The Estimate copy calls `openRpPanel('summary','estimate')`, which the
  catalog gives to Omega Estimate: an Omega Design command on a tab gated
  behind engineering made Omega Design itself read partly locked on lower
  legacy tiers (render-legacy-gates caught it).
- `render-admin-account.js`: the legacy fixture's dates follow the run (a
  fixed 2026-10-17 due date fell inside "due soon" on 2026-10-03).
- **Seventy-four public layers.** Twenty-two statewide services (WV, TX, AR,
  HI, VA, MA, MD, RI, VT, NH, ME, OH, WI, MN, NE, FL, CO, MT, WA, NV,
  Mississippi in two halves, Oregon's county taxlots) and twenty-six county
  and metro ones (California statewide; Los Angeles, San Diego, Orange,
  Riverside, Sacramento, Harris, Tarrant, Travis, Maricopa, Pima, Clark,
  Franklin OH, Oakland, Pennsylvania statewide, Allegheny, Hennepin, Jackson
  MO, St. Louis County, Marion IN, Davidson, Jefferson KY, Salt Lake,
  Multnomah, Hillsborough, Miami-Dade) join the list, each re-checked by a
  tile at its own `test` point (74 of 74 drew on 2026-10-03; Mississippi's
  server takes 15-30 s a tile, so the check now waits 45 s and prints the
  time). Twenty-three of them add a point lookup to `api/parcel.js`
  (43 in all); Pennsylvania's statewide lookup comes after every county
  inside it, Cook still last. Left out: Idaho's statewide layer (its
  licence keeps the data inside IDWR), and Dallas, Hamilton OH, King WA
  and Kankakee, which did not answer from here on the day; states that
  publish parcels only as a FeatureServer (no picture to draw) are not
  in it either. Regrid's relay is still what draws the rest.
- **One overlay, not seventy-four.** The editor draws every public layer
  through ONE custom map type: a tile holds an `<img>` for each layer whose
  box it touches (usually one), and a layer that refuses a tile hides its
  image. Seventy-four ImageMapTypes would have put a tile slot per layer
  per tile on the map. `OmegaParcels.opacity()` reaches the live tiles.

