# Rextag telecom delivery — ingest runbook

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

The licensed Rextag telecom dataset (Fiber Optic Network lines, Data Center
points) drops into Grid Atlas's existing layer slots with one converter run.
This is the runbook for the day the delivery lands, and the record of the
decisions already taken so nobody re-litigates them under deadline.

## The conventions this integration discovered and matched

Recorded per the hand-off spec's §1, so the next reader does not have to
re-derive them:

- **Repo:** the Grid Atlas lives HERE, in omega-core (`grid-atlas.html`),
  not in a separate Solela repository. Solela is a tenant/workspace with
  the diligence switch (`portfolio-diligence`), not a codebase.
- **Map library:** Leaflet 1.9.4, single-file ES5 HTML tool per the repo's
  no-build constraint. New page code stays ES5 (`var`, `function`).
- **Layer declaration:** the `LAYERS` registry object + `ORDER` array in
  `grid-atlas.html`, one entry per layer with `name/color/on/geom/role/url`
  and `label()/meta()` popup readers; loader dispatch by `url` sentinel
  (`__STATIC__`, `__PROXY__`, `__PEERINGDB__`, `__OSM__`, …). The rail,
  legend and presets all read that registry.
- **Data home:** bundled GeoJSON under `/data/` (world-readable, no token),
  fetched at runtime; `data/fiber/` is the vetted published-route registry
  with its own `sources.json` provenance pattern.
- **Site/pin object:** `analyze(ll)` in grid-atlas.html — every proximity
  read attaches there, plus the DD checklists (`grid-atlas-dd.js`) and the
  confirm ladder (`omega-fiber-confirm.js`).
- **Coordinates:** WGS84 / EPSG:4326, GeoJSON lng-lat order throughout.

## What already answers the spec without Rextag

| Question | Answered today by |
|---|---|
| Fiber routes (open) | `pf_inventory` (241k published segments, tiled per state), `pf_routes` (OSM optical), `backbone` (InterTubes-derived corridors, labeled synthetic), aggregator layers (labeled unverified) |
| Fiber-served areas | `fcc_fiber` (FCC BDC H3 hexes, live) + `omega-fiber-confirm.js` (named providers at the pin: block / hex / ~1.5 km ring) |
| Data centers / carrier hotels | `dc_registry` (3,885-facility open registry), `carrierhotels` (PeeringDB national snapshot with `networks` on-net, built by `scripts/build-peeringdb-facilities.js`), `ixp` / `colo` (live PeeringDB per view), `datacenters` (live OSM) |
| Proximity at the pin | nearest fiber across source-ranked layers, fiber-confidence score (unmeasured ≠ zero), nearest named facility, FCC service at the point, DD checklists |

## Source precedence

The atlas's own mechanism is the precedence config: `fiberKeys` in
`analyze()` ranks `fiber_licensed` FIRST, then imported, then the open
layers, and the nearest-facility row ranks `dc_licensed` first. The moment
licensed data flows, it is the source of record — no code change.

## When the delivery lands

1. **Convert and normalize** (Shapefile / File Geodatabase / GeoJSON):

   ```
   node scripts/ingest-rextag.js /path/to/delivery.shp
   node scripts/ingest-rextag.js /path/to/delivery.gdb --layer FiberOpticNetwork
   node scripts/ingest-rextag.js /path/to/datacenters.geojson --kind datacenters
   ```

   Needs GDAL for .shp/.gdb (`brew install gdal`). Output:
   `private-fiber/rextag/rextag-fiber.geojson`,
   `private-fiber/rextag/rextag-datacenters.geojson`, provenance in
   `private-fiber/rextag/sources.json`. The attribute mapping
   (Name/Operator/Owner/Type→class/Miles, DBF upper-case tolerated) is
   `scripts/_lib/rextag-map.js`, held by `scripts/tests/trextagmap.js`.

2. **Serve it through the authenticated proxy, never `/data/`.**
   `private-fiber/` is gitignored; `/data/` is served to anyone with the
   URL, which would republish Rextag's product — the liability
   `docs/fiberlocator-integration-spec.md` names. The serving slot already
   exists: set `CLEARSKY_CONFIG.fiberProxyUrl` to a same-origin serverless
   path that verifies the Firebase token and answers bbox slices from the
   normalized files (`?layer=fiber|datacenters&bbox=w,s,e,n`). The
   `fiber_licensed` and `dc_licensed` layers call it with the signed-in
   user's token and go live the moment it answers. That proxy function is
   the one piece NOT built yet — build it against the delivery's actual
   size (a national line set wants tiling or a bbox index, not a
   whole-file read per request).

3. **Verify:** drop the pin at 4846 S Michigan Ave, Chicago (the spec's
   functional site). Nearest fiber should read from `fiber_licensed`
   with an operator name, and the nearest-facility row should prefer the
   licensed set. Re-run `npm run test:fiber`.

## What is deliberately NOT done

- **No scrape of Rextag's viewer tiles or internal API.** Export is gated
  behind their subscription; the licensed delivery is the only road.
- **Not fed into the published-route registry** (`import-published-fiber.js`
  — "reachable without a token is not published", and licensed is the
  opposite of published). The licensed set stays isolable so a licence
  question never contaminates the clean layers.
- **No licensed geometry in git, in `/data/`, or in a public response.**
- **Open layers stay** as fallback and context (PeeringDB `networks`
  on-net rides beside Rextag's ownership attributes; they coexist, never
  blend into one unattributed "fiber nearby").
- The license terms for multi-tenant display need counsel's sign-off
  before `fiber_licensed`/`dc_licensed` are shown to tenants — same
  gate as every `termsNote` source.
