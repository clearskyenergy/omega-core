# Published fiber route integration — September 20, 2026

Grid Atlas and `/usa-fiber-map.html` share `omega-published-fiber.js`, state
navigation, status/publisher filters, source popups and zoom-dependent geometry.
Use `/grid-atlas?state=TX` (or another postal code). The ten requested priority
states lead the dropdown; all remaining states and DC follow alphabetically.
State deep links select the Fiber profile automatically. Other project profiles
and all existing grid layers remain available in Settings.

## Inventory and known gaps

30,580 distinct source map records / 218,350 line parts intersect 40 states plus
DC. This is partial public coverage, not every cable, all carriers, statewide
coverage, or complete national long-haul coverage. Multipart records and
overlapping publishers must not be interpreted as counts of physical cables.

| Priority | State | Map records | Published line parts | Coverage notes |
|---|---|---:|---:|---|
| 1 | Texas | 1,045 | 16,585 | LOGIX, FNA and agency sources; operational status varies |
| 2 | Georgia | 1,682 | 65,382 | FNA plus Atlanta city/GDOT public lines |
| 3 | Illinois | 466 | 18,689 | Existing public agency sources plus FNA |
| 4 | New Jersey | 3 | 4 | Extremely sparse; major geometry gap |
| 5 | New York | 44 | 44 | 43 Nichols/STN FTTH routes plus one prior record; major statewide gap |
| 6 | Connecticut | 211 | 211 | Norwalk only; major statewide gap |
| 7 | Florida | 279 | 4,711 | FNA plus existing agency fiber sources |
| 8 | Massachusetts | 70 | 70 | Undated Cambridge Network Solutions map around Boston/Cambridge/Lowell; 11 in-progress routes remain planned |
| 9 | South Carolina | 652 | 49,717 | FNA member geometry; current operations unverified |
| 10 | North Carolina | 498 | 1,933 | FNA and public municipal/middle-mile sources |

All 26,371 production baseline records and all 30,467 records from the supplied
nationwide research archive were retained without changing their detailed
geometry. This release additionally imports 70 valid CNS lines (two invalid or
duplicate lines excluded) and 43 complete Nichols route records. Raw point
assets, personal contacts, map descriptions and embedded HTML are not imported.

## Geometry and evidence

- National/state overviews are display-only. At zoom 8+, the map fetches detailed
  state files and viewport-filters them. No road routing, snapping, hand-drawn
  connections or synthetic paths are added to this inventory.
- Existing routes are turquoise; unknown status purple; planned amber dashed;
  inactive gray dotted. Unknown operational status is not promoted to existing.
- The historical road-derived layer is off in all project profiles and excluded
  from Grid Atlas's nearest-fiber calculation. Existing legacy server-side
  corridor planning estimates elsewhere in Network Proximity remain a separate
  model; this release does not reclassify those as published route evidence.
- `/api/fiber-screen` and Network Proximity's `publicFiber` block read the same
  detailed data, irrespective of visible state/status/publisher filters. Site
  and parcel distances are estimates to published geometry, not constructible
  lateral lengths. No strand count, spare bandwidth, serviceability or physical
  diversity is invented. Shared source records in border states count once.
- Missing/corrupt deployed inventory now fails explicitly instead of silently
  returning an empty set. Missing coverage never establishes absence of fiber.

## Sources and remaining acquisition work

The complete per-layer provenance, dates, terms and original source links are
in `data/usa-fiber/manifest.json`.

- Fiber Network Alliance: https://www.fibernetworkalliance.com/membership-map-line/
  and publisher download/embedding instructions:
  https://www.fibernetworkalliance.com/membership-map-line-pop/
- LOGIX: https://logix.com/network-maps/
- CNS published KMZ: https://telecomramblings.com/files/media/CambridgeNetworkSolutions.kmz
  discovered at https://www.telecomramblings.com/metro-fiber-maps/new-england/
  (undated; current ownership and operational status unverified).
- Nichols/STN: https://www.arcgis.com/home/item.html?id=3037b92988f8450db8ce87f828c579f3
  published by Southern Tier Central Regional Planning and Development Board.
- Massachusetts MBI: https://broadband.masstech.org/map-gallery provides reference
  network maps. The discovered last-mile GIS service required a token; no
  restricted data was imported and no reference images were traced into cables.
- Burlington County NJ's published fiber application returned HTTP 403 on its
  public configuration endpoint. Additional approved NJ geometry is needed.
- NY and NJ broadband availability polygons are not cable routes and were not
  converted into lines. Operator-provided GIS/KMZ exports are needed for broad
  metro/backbone coverage in both states.

Arkansas, Delaware, Hawaii, Idaho, Missouri, Montana, Nebraska, Rhode Island,
Utah and Vermont still have no bundled routes. Every mapped state has gaps too.
Do not describe the priority states as complete or survey-accurate.

## Refresh and deployment

`node scripts/import-published-fiber.js /path/to/inspected/data/usa-fiber`
performs an additive source merge, refuses geometry changes under an existing
ID, validates WGS84 coordinates, then rebuilds state overviews and lossless
compressed API shards. With no argument it rebuilds the current inventory.

`python3 scripts/import-cambridge-fiber.py /path/to/CambridgeNetworkSolutions.kmz`
and `node scripts/import-nichols-fiber.js` refresh the two additional sources.
Run the shared builder afterward. Review source terms and status changes.

`data/fiber-api/` contains lossless gzip JSON (about 33 MiB) plus the manifest.
Vercel bundles that directory and the OSM/CA data in the two existing API
functions, rather than duplicating the much larger display inventory in each
function. Static state files remain publicly available for map rendering.
Firebase identity, tenant, member and billing checks are unchanged. The UI now
restores the existing same-origin Firebase session when running a site check.

`npm run test:fiber` validates all state files, API/display geometry equality,
source IDs, priority ordering, filter/dedup behavior, distances, status handling,
and auth/error contracts. Check both pages in a browser at desktop and mobile
sizes before release. Live authenticated checks require an existing tenant
session; automated API auth tests use isolated fixtures.
