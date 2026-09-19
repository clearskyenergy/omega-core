# Nationwide fiber research — carrier expansion, 2026-09-19

## What is delivered

Grid Atlas and standalone `usa-fiber-map.html` now include **35,678 source-derived map records containing 323,729 line parts**, with some geometry in **47 states plus DC**. The September 19 carrier batch adds **5,211 records / 105,492 line parts**, preserving all **30,467** prior records unchanged. This is **partial coverage**, not every fiber cable in those states or the country. Different publishers can describe the same infrastructure.

`fiber-research.html` provides an initial research register for all 50 states plus DC, in the requested order: Texas, Georgia, Illinois, Connecticut, Ohio, Florida, South Carolina, California, then remaining states alphabetically. It distinguishes imported geometry, reference-only maps, availability-only maps, incomplete searches, and blocked downloads. Each state links directly to its map view and actual bundled source layers. Search discovery included Google; original publishers supply imported geometry.

Prepared for `clearskyenergy/omega-core` on September 19 against main `0d177c8`. The current production architecture is preserved: Grid Atlas's existing national layer uses the expanded overview, and authenticated `fiber-screen` and `network-proximity` APIs use the detailed state shards through `api/_lib/fiber-evidence.js`. Desktop originals and unrelated local edits were not overwritten. Authenticated production/API acceptance remains outstanding; a Git push alone is not evidence of a completed deployment.

## Priority-state result

| State | Map records | Published line parts | Main addition / caveat |
|---|---:|---:|---|
| Texas | 2,334 | 40,574 | FiberLight and Uniti added to LOGIX/FNA; source overlaps retained |
| Georgia | 1,975 | 73,228 | FiberLight/Uniti added to FNA and Atlanta municipal layers |
| Illinois | 697 | 23,322 | Uniti added; Illinois Century Network maps are reference only |
| Connecticut | 226 | 229 | Uniti added to Norwalk; CEN's 2018 image is reference only |
| Ohio | 682 | 4,923 | Uniti and one explicitly classified Henry County fiber record |
| Florida | 506 | 7,750 | Carrier GIS added; LambdaRail image is reference only |
| South Carolina | 768 | 51,336 | Uniti added; no private Segra file requested |
| California | 335 | 1,267 | Uniti added; 2,473 supplied design records remain a separate supplemental toggle |

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

Next ingestion candidates include Segra's public GIS experience, remaining Uniti layers, Dakota Carrier Network and SDN interactive routes, MassBroadband 123 source geometry, and operator-approved national long-haul exports. Nebraska logical-circuit GIS needs physical-path verification; Montana's public transport-map page describes a 2016 map. Reference images, diagrams, funding awards and FCC service polygons are not converted to invented cable lines. A complete nationwide view requires carrier-authorized or licensed private route data and continued source acquisition.

## Implementation and validation

- Main atlas and standalone map share the expanded inventory. The existing main-atlas national layer stays off by default and outside its scoring inputs. Linked standalone maps offer priority ordering, source popups, state deep links, viewport-filtered low-zoom drawing and detailed geometry loaded by state. Nearby line parts are grouped without connecting disjoint lines or altering their paths.
- Source popups explain unverified precision, carrier-label age and grouping. UI uses “map records” instead of claiming unique cables.
- The existing authenticated `fiber-screen` and `network-proximity` lookups read the new geometry with unchanged serviceability safeguards. Cross-border records duplicated in state shards are returned once by stable source ID; distinct publisher records are not collapsed. No backend scoring was moved to browser code; no Firebase collections, tenant data, billing or access rules changed.
- Automated checks pass for all 51 shards, source/ID preservation, coordinate validity and bounds, line-part accounting, priority order, minimized metadata, new-source proximity lookup, existing site/UI regressions and HTML script resolution.
- Offline gzip packaging reduces 190.9 MB of detailed state JSON to 51.7 MB without coordinate changes. Both fiber functions explicitly include the compressed shards and manifest, excluding raw national GeoJSON. The approximately 40 MB overview and raw shards remain static browser assets. No application build or browser decompression dependency is added. `--check` validates byte-for-byte decompression parity, and API tests refuse raw-shard reads to exercise the production format.
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
