# MERGE.md — how omega-core was assembled from 16 legacy repos

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

| destination | contents | from |
|---|---|---|
| `/admin/` | tools.csebuilders.com hub + `admin-console.js` (the MASTER INDEX) | clearsky-portal |
| `/console/` | alpha.clearskyomega.com ops console + intake + ops-data | omega-main |
| `/portals/finance/` | financing portal (fin_* collections) — separate product surface | finance-main |
| `/tenants/osa/` | JV partner portal, whole repo, own shell | osa-main |
| `/tenants/solela/` | ComEd pipeline shell (index.html) + IL data | solela-main |
| `/tenants/joules/` | omega-fleet.js, fleet.html, commission.html | joules.ai |
| `/tenants/tremco/` | tremco-netzero.js, tremco-patches.js, preview | tremco |
| `/tenants/spatco/` | spatco-ev-estimate.html | SPATCO |
| `/tenants/cir/` | intake.html, queue.html (CIR's variants) | cir |
| `/tenants/<others>/` | logos + legacy `config.js` (kept for the fallback path) | each repo |
| `/docs/` | all README/INTEGRATION/PRICING/etc. markdown | clearsky-portal, salesdemo |
| `/workers/` | `comed-proxy-worker-v10.js` only (v2–v9 dropped) | clearsky-portal |
| `/scripts/` | backfill-orgid, check-rules, build_ilshines + NEW audit/seed | mixed |

Dropped: nine superseded Cloudflare worker versions, `_test_overlay.js`,
`overlay-demo.html`, duplicate PDFs/PPTX/XLSX binaries (kept in `/docs/`
where referenced), `sunesol-portal.zip`, `demo-clearskyomega.zip`.

## NEW in omega-core

**Self-serve signup (decided 2026-09-06):** `start.html` on the hub host
`app.clearskyomega.com` → `api/tenant-signup.js` creates the tenant
PENDING (work email only; public providers refused via
`api/_lib/public-domains.js`); `api/tenant-approve.js` (staff) flips it
live. Second person from the same domain auto-joins as member.
`omega-tenant.js` handles hub routing and the "being set up" screen.
`config.js` at the root is the ONE platform config (no tenant block).

- `omega-tenant.js` — hostname → `tenant_public/{host}` → `CLEARSKY_CONFIG.tenant`; post-auth entitlements from `omega_orgs/{org}` + `billing/current` + `members/{uid}`; hostname lock; suspension gate; wraps `OmegaBrand.resolve`.
- `api/_lib/admin.js`, `api/set-role.js`, `api/opportunity.js`, `api/rfq.js`, `api/stripe-create.js`, `api/stripe-portal.js`, `api/stripe-webhook.js`, `api/tenant-branding.js`.
- `scripts/audit-counts.js`, `scripts/seed-omega-orgs.js`, `tenants/*/tenant.json`.
- `firestore.rules` / `storage.rules` with the control-plane blocks applied and `tenant_public` added.
- `vercel.json` hostname rewrites (alpha → console, tools → admin, osa/solela → tenant shells).

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
   ev-cost-workbook unit-rate bands, valuestack dispatch, proforma math.
10. **Consolidate the orgAlias map** into one exported constant imported by
    the four clients (rules stay hand-mirrored).

## Decisions made (2026-09-06)

- New workspaces go live only after ClearSky approval (`status: pending`).
- Work email required; personal providers are refused at signup.
- Same-domain colleagues auto-join as `member`.
- Trial length: 30 days (`TRIAL_DAYS` env, default 30).

## Decisions pending (Tommy)

- [ ] Remove `sunesol.com` / `ogisolar.com` from `isConsoleViewer()`?
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
