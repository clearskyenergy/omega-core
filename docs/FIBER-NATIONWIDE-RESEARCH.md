# Nationwide fiber research — carrier expansion, 2026-09-19

## What is delivered

Grid Atlas and standalone `usa-fiber-map.html` now include **47,661 source-derived map records containing 1,100,644 line parts**, with some geometry in **47 states plus DC**. The first September 19 carrier batch added **5,211 records / 105,492 line parts**, preserving all **30,467** prior records unchanged. The Segra batch added **2,994 records / 227,090 line parts**, retaining all **35,678** previous records unchanged. The parcel-workflow batch adds **8,989 records / 549,825 line parts**, preserving all **38,672** previous records unchanged. This is **partial coverage**, not every fiber cable in those states or the country. Different publishers can describe the same infrastructure; counts include separately classified plans and illustrative references.

`fiber-research.html` provides an initial research register for all 50 states plus DC, in the requested order: Texas, Georgia, Illinois, Connecticut, Ohio, Florida, South Carolina, California, then remaining states alphabetically. It distinguishes imported geometry, reference-only maps, availability-only maps, incomplete searches, and blocked downloads. Each state links directly to its map view and actual bundled source layers. Search discovery included Google; original publishers supply imported geometry.

Prepared for `clearskyenergy/omega-core` on September 19 against main `0d177c8`. The current production architecture is preserved: Grid Atlas's existing national layer uses the expanded overview, and authenticated `fiber-screen` and `network-proximity` APIs use the detailed state shards through `api/_lib/fiber-evidence.js`. Desktop originals and unrelated local edits were not overwritten. Authenticated production/API acceptance remains outstanding; a Git push alone is not evidence of a completed deployment.

## Priority-state result

| State | Map records | Published line parts | Main addition / caveat |
|---|---:|---:|---|
| Texas | 3,379 | 89,814 | Added Uniti dark/developing layers and Round Rock municipal fiber; Dallas parcels available |
| Georgia | 3,209 | 166,987 | Added Uniti dark/developing layers; Fulton parcel overlay available |
| Illinois | 1,003 | 36,048 | Added Uniti geometry and historical Silvis reference; Cook/DuPage/Lake parcels available |
| Connecticut | 227 | 243 | Further Uniti geometry; CEN's 2018 image remains reference only |
| Ohio | 1,058 | 26,748 | Further Uniti geometry; no parcel survey accuracy asserted |
| Florida | 1,237 | 67,018 | Further Uniti geometry; LambdaRail image remains reference only |
| South Carolina | 1,251 | 85,704 | Further Uniti geometry; no private Segra file requested |
| California | 401 | 2,106 | Further Uniti geometry; 2,473 supplemental designs remain separate |

State counts are not additive. Multipart geometry is not a unique physical cable count. Entire published features intersecting a state are retained, so cross-border features can extend beyond the selected state.

## September 19 geometry and provenance

Google discovery, web/image searches and publisher pages led to public carrier GIS rather than requiring image tracing. The importer retains original 2D coordinates, groups at most 100 local line parts per map record, never joins disjoint lines and removes only exact within-source geometry duplicates. Download hashes, source item timestamps, input counts and exclusion accounting are in the manifest. Source modification timestamps are not observation dates.

| Publisher / layer | Input line parts | Retained line parts | Map records |
|---|---:|---:|---:|
| FiberLight lit | 1,780 | 1,780 | 171 |
| FiberLight dark-only | 86 | 86 | 6 |
| FiberLight dark-and-lit | 22,649 | 22,625 | 711 |
| Uniti national core | 28,766 | 17,248 | 1,564 |
| Uniti regional transport | 96,294 | 63,680 | 2,713 |
| Henry County explicitly classified fiber | 1 | 1 | 1 |
| Kansas Freestate new cable and duct | 62 | 62 | 37 |
| Kansas Freestate new cable | 6 | 6 | 4 |
| Kansas Freestate existing cable | 4 | 4 | 4 |

- [FiberLight's official map page](https://www.fiberlight.com/network/regional-network-maps/texas-express-routes/) links its public ArcGIS experience. The September 2025 lit, dark-only and dark-and-lit layers are imported with current operating status and serviceability unconfirmed. Layer names do not establish available strands or capacity.
- [Uniti Wholesale's network map](https://www.unitiwholesale.com/network-map/) supplies public national-core and regional-transport layers. 43,991 exact within-layer duplicate parts were removed; cross-layer overlaps remain separately attributed. Dark-fiber and developing-network layers are not included in this batch.
- [Henry County's TelephoneFiberOpticLines layer](https://services.arcgis.com/osmyvTbXDC07yFxn/ArcGIS/rest/services/UtilityLayers/FeatureServer/6) is mixed utility data: only the one record with `TYPE = 'FIBER OPTIC'` is included. Telephone and unspecified records are excluded.
- [Kansas Commerce's planning download](https://www.kansascommerce.gov/officeofbroadbanddevelopment/route-maps-and-planning-files/) distinguishes new/proposed paths from existing cable. The August 2024 new cable records remain **planned and ineligible for proximity evidence**. Its four existing-cable parts remain dated publisher claims, not current serviceability confirmations. No point facilities or amplification heatmaps were imported.

165 carrier line parts fell outside the generalized state boundaries and were excluded. All new geometry is labeled `publisher_geometry_unverified`; the numeric source record IDs are retained without free-text descriptions, contact details or point assets. Public visibility does not establish an unrestricted redistribution license; preserve attribution and review provider terms before external publication.

## Additional Segra route batch

[Segra’s official network map](https://www.segra.com/our-network/) now links a public fiber-polyline service. The July 2026 metadata snapshot contains 228,782 records; 24 have empty geometry and are explicitly excluded. There are 228,761 input line parts: 227,090 retained, 627 exact duplicates removed, and 1,044 outside the generalized state boundaries excluded. The retained lines form 2,994 local records across 23 states. Status, capacity and serviceability remain unconfirmed; near-net polygons, towers and access points are not imported. No private KMZ request was submitted.

The shared data-center scorecard now uses this detailed inventory as a mapped-proximity factor, separately from service and diversity. See `docs/DATA-CENTER-SITE-SCORING.md`.

## Parcel-workflow route expansion

The `20260919-parcel` batch adds geometry in **45 states plus DC**. Kinetic ILEC dark fiber contributes 4,108 local map records / 322,401 line parts; Uniti Wholesale dark fiber contributes 4,662 / 226,071. Both are publicly linked from [Uniti's own network map](https://www.unitiwholesale.com/network-map/), with current status, available strands and parcel service unconfirmed. 215 records / 1,261 parts from the developing/under-review layer remain **planned**, excluded from qualifying proximity evidence. Five Kinetic and one Wholesale record have empty geometry; exact within-source duplicates and out-of-boundary exclusions are audited in the manifest. Cross-source overlaps remain separately attributed.

[Round Rock's public municipal fiber layer](https://www.arcgis.com/home/item.html?id=999003bd039b4586924820e93f667cfd) returned 88 records explicitly labeled `STATUS = 'EXISTING'`, grouped as two local map records. Eight other records were not imported by this filter. Municipal fiber does not establish a commercial service offer. [Silvis's public layer](https://www.arcgis.com/home/item.html?id=a6bd6493486c4cc1add15ce27c8330f6) contributes four parts in two **illustrative-only** records, with an approximately 2014 source vintage. Its publisher expressly says it is not survey/engineering quality and is unsuitable for site-specific decisions. The `proximityEligible:false` override is carried through the importer, overview and shared API adapter; it cannot earn site-scoring points.

Google and publisher searches also surfaced a third-party layer explicitly described as purchased GeoTel data. It was **not imported**. Public accessibility does not grant a commercial dataset license. Vermont's state-owned layer still fails TLS validation and was not fetched with verification disabled. Hawaii, Montana and Vermont remain explicit geometry gaps.

## Parcel inspection

The standalone map now supports street/aerial basemaps, direct coordinate links, boundary drawing, single-feature GeoJSON import (including holes and multiple parts), county parcel selection, and boundary/evidence exports. Registered public parcel services are **Dallas TX, Fulton GA, Cook IL, DuPage IL and Lake IL only**. Queries are viewport-limited, at zoom 16+, capped at 400 displayed outlines with an explicit partial-response warning. Only geometry and parcel IDs are requested, not owners or contact attributes. Draw/import is available throughout the country; this is not nationwide assessor coverage.

`POST /api/fiber-screen` uses the existing authenticated tenant/billing/member/tool gate and the detailed state shards. The new parcel engine preserves holes and disconnected parts, validates finite closed non-self-intersecting geometry, limits boundary size and response geometry, ranks actual boundary distances, and keeps plans/reference-only/unknown-medium routes separate. Zero means a **published geometry intersection**, not a surveyed crossing or service confirmation. All capacity, access and physical-diversity fields remain unconfirmed. The existing GET point contract and legacy editor boundary workflow are unchanged. See `docs/PARCEL-FIBER-INSPECTION.md`.

## Publisher images inside the map

The standalone viewer now has a source/carrier filter, a September 19 additions filter, and a collapsible **Publisher maps & images** panel tied to the selected state. `map-references.json` catalogs seven publisher-hosted images and three map collections, including CEN, OARnet, Florida LambdaRail, Uniti expansion routes, FiberLight, Illinois Century Network, CENIC and New Mexico Fiber Network.

Images are linked to their original publishers and show available vintage caveats (including CEN's 2018 and LambdaRail's 2014 upload). They are visual references only: **not georeferenced overlays, not traced cable paths, not counted as routes and not used in distance or site scoring**. No image is copied into the repository. A broken external image cannot affect route loading.

## September 18 batch retained unchanged

- [Fiber Network Alliance member lines](https://www.fibernetworkalliance.com/membership-map-line/): 183,768 input line parts; 169,154 retained, 11,674 exact same-member geometry duplicates removed, 66 invalid/zero-length lines excluded, 2,874 outside the generalized state boundaries excluded. These are packaged as 2,984 local multipart map records, at most 100 parts per record. All 56 published placemark labels were examined. Names are historical/as published, not verified current ownership. The map does not establish operational status or an observation date.
- [LOGIX public network map](https://logix.com/network-maps/): its embedded public KMZ supplies 15,830 input line parts; 15,573 retained in 248 local multipart records; 221 invalid/zero-length parts and 36 exact geometry duplicates excluded. The filename contains `02012024`, which is not treated as a current field-verification date.
- [Norwalk public fiber GIS](https://services2.arcgis.com/HfsHDBmkGwb1UtID/ArcGIS/rest/services/Fiber/FeatureServer): 41 City Traffic, 40 City MAN and 130 Fibertech records.
- [Atlanta DPW public Fiber Assets](https://dpwgis.atlantaga.gov/hostingserver/rest/services/Fiber_Assets/FeatureServer): 450 City of Atlanta Fiber, 141 Unknown/Unmarked Fiber and 62 GDOT Fiber records. Points and access assets were not imported.

That first batch added 4,096 records / 185,591 line parts. For those layers, all operational status, building service, capacity and route diversity remain unconfirmed. Only 2D route coordinates, opaque source record IDs and source/carrier attribution are retained; raw HTML descriptions, individual contact names, email addresses, phone numbers and point assets are not copied into these route features.

FNA explicitly offers downloading, copying/customizing and embedding its maps on its [map instructions page](https://www.fibernetworkalliance.com/membership-map-line-pop/). Public access to other sources does not establish an unrestricted redistribution license. Their attribution and source links are retained; review applicable source terms before external publication. No access controls or certificate validation were bypassed, and no carrier requests were sent.

## Remaining gaps

No main-inventory line geometry is currently bundled for **Hawaii, Montana or Vermont**. An empty state does not mean no fiber. Every mapped state also has substantial carrier/municipal coverage gaps.

The Vermont state-owned route service was identified but its TLS chain failed validation during download. The source is linked as blocked, not imported. Some other Vermont fiber availability routes are road-centerline proxies and must not be misrepresented as surveyed cable paths. The Temple TX fiber-only filter returned zero records; electrical and non-fiber data lines were excluded. Some discovered carrier maps require an authorized request for KMZ; no private files were acquired.

Next ingestion candidates include remaining Uniti layers, Dakota Carrier Network and SDN interactive routes, MassBroadband 123 source geometry, and operator-approved national long-haul exports. Nebraska logical-circuit GIS needs physical-path verification; Montana's public transport-map page describes a 2016 map. Reference images, diagrams, funding awards and FCC service polygons are not converted to invented cable lines. A complete nationwide view requires carrier-authorized or licensed private route data and continued source acquisition.

## Implementation and validation

- Main atlas and standalone map share the expanded inventory. The existing main-atlas national layer stays off by default and outside its scoring inputs. Linked standalone maps offer priority ordering, source popups, state deep links, viewport-filtered low-zoom drawing and detailed geometry loaded by state. Nearby line parts are grouped without connecting disjoint lines or altering their paths.
- Source popups explain unverified precision, carrier-label age and grouping. UI uses “map records” instead of claiming unique cables.
- The existing authenticated `fiber-screen` and `network-proximity` lookups read the new geometry with unchanged serviceability safeguards. Cross-border records duplicated in state shards are returned once by stable source ID; distinct publisher records are not collapsed. No backend scoring was moved to browser code; no Firebase collections, tenant data, billing or access rules changed.
- Automated checks pass for all 51 shards, source/ID preservation, coordinate validity and bounds, line-part accounting, priority order, minimized metadata, new-source proximity lookup, existing site/UI regressions and HTML script resolution.
- Offline gzip packaging reduces 361.3 MB of detailed state JSON to 102.8 MB without coordinate changes. All three screening functions explicitly include the compressed shards and manifest, excluding raw national GeoJSON. The approximately 82 MB overview and raw shards remain static browser assets. Only the already-generalized low-zoom overview is rounded to six decimals to stay below GitHub's per-file limit; detailed coordinates used at parcel zoom and by APIs are untouched. Coordinate deep links load detailed state data without first downloading the national overview. No application build or browser decompression dependency is added. `--check` validates byte-for-byte decompression parity, and API tests refuse raw-shard reads to exercise the production format.
- Local browser verification covers Texas and Connecticut latest-addition filtering and the CEN image panel without browser warnings/errors; first-batch checks also covered high-density Georgia and the research register. Production authentication and deployment acceptance remain outstanding.

## Repeatable additive workflow

Use Python 3 with Shapely 2.x, and a separate raw-input directory outside this project. Download the official FNA file from the linked download on its source page into `fna-routes.kmz`, and the KMZ referenced by LOGIX's public map into `logix-routes.kmz`. The manifest records original download URLs and SHA-256 hashes for this snapshot.

Run from the project root:

```sh
python scripts/download-priority-fiber.py /absolute/path/to/raw-inputs
python scripts/expand-fiber-inventory.py /absolute/path/to/raw-inputs
npm run test:fiber
node scripts/check-html-scripts.js fiber-research.html usa-fiber-map.html
```

For the September 19 batch, use a different raw-input directory. The six public GIS layers are registered in `scripts/fiber-expansion-sources.json`. Save Kansas Commerce's linked `Final186.zip` as `kansas-freestate-20240808.zip` in that raw directory, then run:

```sh
python scripts/download-fiber-expansion.py /absolute/path/to/carrier-raw-inputs
python scripts/import-fiber-expansion.py /absolute/path/to/carrier-raw-inputs
npm test
```

The downloader writes raw inputs and status reports only and validates public access, HTTPS, pagination, count stability and unique source IDs. The carrier importer refuses an incomplete batch and validates raw snapshot hashes. Both importers preserve unrelated source records and refresh the committed gzip shards. Review source changes and take a project backup before refreshing. Source versions, research notes and counts in this document should be updated together. The manifest and research page are the dynamic coverage authority. Do not replace this mixed GIS/KMZ inventory with a single-source refresh.

Segra refresh (a distinct additive batch, no Kansas file required):

```sh
python scripts/download-fiber-expansion.py /absolute/path/to/segra-raw scripts/fiber-segra-sources.json
python scripts/import-fiber-expansion.py /absolute/path/to/segra-raw --batch 20260919-segra --skip-kansas
npm test
```

Parcel-workflow expansion (another independent additive batch):

```sh
python scripts/download-fiber-expansion.py /absolute/path/to/parcel-batch-raw scripts/fiber-parcel-expansion-sources.json
python scripts/import-fiber-expansion.py /absolute/path/to/parcel-batch-raw --batch 20260919-parcel --skip-kansas
node scripts/update-fiber-parcel-research.js
npm test
```
