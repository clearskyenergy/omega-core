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
