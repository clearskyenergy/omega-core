# Nationwide fiber research — first expansion, 2026-09-18

## What is delivered

Grid Atlas and standalone `usa-fiber-map.html` now include **30,467 source-derived map records containing 218,237 line parts**, with some geometry in **39 states plus DC**. All 26,371 earlier records were retained unchanged. This is **partial coverage**, not every fiber cable in those states or the country. Different publishers can describe the same infrastructure.

`fiber-research.html` provides an initial research register for all 50 states plus DC, in the requested order: Texas, Georgia, Illinois, Connecticut, Ohio, Florida, South Carolina, California, then remaining states alphabetically. It distinguishes imported geometry, reference-only maps, availability-only maps, incomplete searches, and blocked downloads. Each state links directly to its map view and actual bundled source layers. Search discovery included Google; original publishers supply imported geometry.

Prepared for `clearskyenergy/omega-core` on September 19 against main `0d177c8`. The current production architecture is preserved: Grid Atlas's existing national layer uses the expanded overview, and authenticated `fiber-screen` and `network-proximity` APIs use the detailed state shards through `api/_lib/fiber-evidence.js`. Desktop originals and unrelated local edits were not overwritten. Authenticated production/API acceptance remains outstanding; a Git push alone is not evidence of a completed deployment.

## Priority-state result

| State | Map records | Published line parts | Main addition / caveat |
|---|---:|---:|---|
| Texas | 1,045 | 16,585 | LOGIX public map and FNA overlap; status unconfirmed |
| Georgia | 1,682 | 65,382 | FNA members and Atlanta's public fiber line layers |
| Illinois | 466 | 18,689 | FNA member geometry including published WOW Chicago |
| Connecticut | 211 | 211 | Norwalk only; not all Connecticut |
| Ohio | 514 | 1,549 | FNA member additions; OARnet map retained as reference |
| Florida | 279 | 4,711 | FNA member additions; LambdaRail image is reference only |
| South Carolina | 652 | 49,717 | FNA member geometry; separate Segra file request not submitted |
| California | 255 | 1,049 | Baseline plus FNA; 2,473 supplied design records remain a separate supplemental toggle |

State counts are not additive. Multipart geometry is not a unique physical cable count. Entire published features intersecting a state are retained, so cross-border features can extend beyond the selected state.

## New geometry and provenance

- [Fiber Network Alliance member lines](https://www.fibernetworkalliance.com/membership-map-line/): 183,768 input line parts; 169,154 retained, 11,674 exact same-member geometry duplicates removed, 66 invalid/zero-length lines excluded, 2,874 outside the generalized state boundaries excluded. These are packaged as 2,984 local multipart map records, at most 100 parts per record. All 56 published placemark labels were examined. Names are historical/as published, not verified current ownership. The map does not establish operational status or an observation date.
- [LOGIX public network map](https://logix.com/network-maps/): its embedded public KMZ supplies 15,830 input line parts; 15,573 retained in 248 local multipart records; 221 invalid/zero-length parts and 36 exact geometry duplicates excluded. The filename contains `02012024`, which is not treated as a current field-verification date.
- [Norwalk public fiber GIS](https://services2.arcgis.com/HfsHDBmkGwb1UtID/ArcGIS/rest/services/Fiber/FeatureServer): 41 City Traffic, 40 City MAN and 130 Fibertech records.
- [Atlanta DPW public Fiber Assets](https://dpwgis.atlantaga.gov/hostingserver/rest/services/Fiber_Assets/FeatureServer): 450 City of Atlanta Fiber, 141 Unknown/Unmarked Fiber and 62 GDOT Fiber records. Points and access assets were not imported.

The imported sources add 4,096 records / 185,591 line parts. For new layers, all operational status, building service, capacity and route diversity remain unconfirmed. Only 2D route coordinates, opaque source record IDs and source/carrier attribution are retained; raw HTML descriptions, individual contact names, email addresses, phone numbers and point assets are not copied into these route features.

FNA explicitly offers downloading, copying/customizing and embedding its maps on its [map instructions page](https://www.fibernetworkalliance.com/membership-map-line-pop/). Public access to other sources does not establish an unrestricted redistribution license. Their attribution and source links are retained; review applicable source terms before external publication. No access controls or certificate validation were bypassed, and no carrier requests were sent.

## Remaining gaps

No main-inventory line geometry is currently bundled for **Arkansas, Delaware, Hawaii, Idaho, Massachusetts, Missouri, Montana, Nebraska, Rhode Island, Utah or Vermont**. An empty state does not mean no fiber. Every mapped state also has substantial carrier/municipal coverage gaps.

The Vermont state-owned route service was identified but its TLS chain failed validation during download. The source is linked as blocked, not imported. Some other Vermont fiber availability routes are road-centerline proxies and must not be misrepresented as surveyed cable paths. The Temple TX fiber-only filter returned zero records; electrical and non-fiber data lines were excluded. Some discovered carrier maps require an authorized request for KMZ; no private files were acquired.

Next ingestion candidates are listed explicitly in the research register, including Kansas planning KMZ, Nebraska circuit GIS (verify actual path geometry), Dakota Carrier Network and SDN interactive routes, MassBroadband 123 source geometry, and operator-approved national long-haul exports. Reference images, diagrams, funding awards and FCC service polygons are not converted to invented cable lines. A complete nationwide view requires carrier-authorized or licensed private route data and continued source acquisition.

## Implementation and validation

- Main atlas and standalone map share the expanded inventory. The existing main-atlas national layer stays off by default and outside its scoring inputs. Linked standalone maps offer priority ordering, source popups, state deep links, viewport-filtered low-zoom drawing and detailed geometry loaded by state. Nearby line parts are grouped without connecting disjoint lines or altering their paths.
- Source popups explain unverified precision, carrier-label age and grouping. UI uses “map records” instead of claiming unique cables.
- The existing authenticated `fiber-screen` and `network-proximity` lookups read the new geometry with unchanged serviceability safeguards. Cross-border records duplicated in state shards are returned once by stable source ID; distinct publisher records are not collapsed. No backend scoring was moved to browser code; no Firebase collections, tenant data, billing or access rules changed.
- Automated checks pass for all 51 shards, source/ID preservation, coordinate validity and bounds, line-part accounting, priority order, minimized metadata, new-source proximity lookup, existing site/UI regressions and HTML script resolution.
- Local browser verification passed for Texas overview, Connecticut detailed geometry, high-density Georgia detailed geometry and the research register/filter. Production authentication and deployment are not tested.

## Repeatable additive workflow

Use Python 3 with Shapely 2.x, and a separate raw-input directory outside this project. Download the official FNA file from the linked download on its source page into `fna-routes.kmz`, and the KMZ referenced by LOGIX's public map into `logix-routes.kmz`. The manifest records original download URLs and SHA-256 hashes for this snapshot.

Run from the project root:

```sh
python scripts/download-priority-fiber.py /absolute/path/to/raw-inputs
python scripts/expand-fiber-inventory.py /absolute/path/to/raw-inputs
npm run test:fiber
node scripts/check-html-scripts.js fiber-research.html usa-fiber-map.html
```

The downloader writes raw inputs and status reports only. The importer preserves every baseline source and replaces only successfully imported source IDs from this expansion; unknown or failed inputs are not used to erase old data. Review source changes and take a project backup before refreshing. Source versions, research notes and counts in this document should be updated together. The manifest and research page are the dynamic coverage authority. Do not replace this mixed GIS/KMZ inventory with a single-source refresh.
