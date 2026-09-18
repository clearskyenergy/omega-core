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
