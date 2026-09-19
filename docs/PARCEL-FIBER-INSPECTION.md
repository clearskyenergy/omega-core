# Parcel-level fiber inspection

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Workflow

1. Open `usa-fiber-map.html`. Choose a state to explore its published routes, or enter latitude/longitude to jump to a parcel-scale view. Grid Atlas pin analysis links directly to this view with the selected coordinates.
2. Select a registered county and zoom to level 16 or closer. The initial public county overlay supports Dallas TX, Fulton GA and Cook/DuPage/Lake IL. Click an outline to select it. Elsewhere, draw a boundary or paste one GeoJSON Polygon/MultiPolygon feature. Multiple parts and holes are preserved. Imported attributes are discarded.
3. Switch between streets and aerial imagery. Imagery dates vary and imagery does not reveal underground cable. The yellow outline is the selected boundary; published fiber paths remain their original source geometry at detailed zoom. Neither is a survey.
4. While signed in to the deployed Omega app, use **Inspect parcel fiber** to measure routes within 250 m, 1 km or 5 km of the actual boundary. This uses all bundled sources, independent of displayed state/carrier/status filters. Pink result lines are qualifying mapped-route evidence; amber dashed result lines are separate planning/reference/unknown-medium context.
5. Inspect source links, vintage/metadata, status and accuracy caveats. Export the boundary or the current evidence result. Changing the selection or search radius clears stale results and disables evidence export until refreshed.

Local static previews can draw/import parcels and display public county boundaries and route geometry. They do not run the protected API. No anonymous scoring or auth bypass was added. No parcel or report is saved to Firestore.

## Public parcel requests

`data/usa-fiber/parcel-sources.json` is a five-service registry with source attribution, parcel-ID fields, broad county bounds and map centers. Geometry/ID requests go directly from the user's browser to the chosen county GIS endpoint, only for the current close-up viewport. No paid Regrid call, owner collection, parcel scraping job or new API key is involved. Responses are limited to 400 displayed polygons; partial data, source errors, out-of-county views and insufficient zoom are explicit. Source availability was checked on September 19, 2026; that is not the date of the parcel survey.

Tax boundaries may be old, overlap or omit land. A returned outline is not a title report. Draw/import works in every state, but no national assessor dataset is claimed.

## Endpoint and geometry

`POST /api/fiber-screen` accepts `{ boundary: GeoJSONPolygonOrMultiPolygon, radius_km: 0.1..5 }`. The existing GET point query is unchanged. The shared Grid Atlas access guard runs before parsing/reading the inventory. Responses are `private, no-store`; no request-selected upstream URL is accepted.

The new `api/_lib/fiber-parcel.js` engine accepts up to 20 polygon parts, 20 rings per part and 1,000 total vertices, each closed and finite. It rejects self-intersections, degenerate/zero-length edges, invalid holes and envelopes over 0.3 degrees in either dimension. All parts are measured as a union; a route inside a hole is not inside the parcel. Lines crossing or touching a boundary return a mapped intersection. Positive distances rounded below one metre are labeled “less than 1 m,” not crossing.

The engine reads the shared detailed inventory, not the simplified overview, and deduplicates cross-state source IDs through the existing adapter. Line parts retain source coordinates. Returned display paths are contiguous source segments near the search box, never connectors between disjoint runs. Responses show at most the nearest 25 qualifying records and 25 context records, with counts and truncation flags. Display geometry is bounded to 50,000 vertices; omitted display parts are flagged. Rankings use the complete candidate geometry even when display geometry is limited.

A conservative geometry-work budget also rejects excessively complex searches with HTTP 422 and a request to simplify the boundary or reduce the radius. It never converts a computation limit into an incomplete distance result or “no fiber” finding.

`site_has_fiber` and `available_capacity_gbps` remain null; serviceability and physical diversity remain unconfirmed. The result is a source-evidence packet, **not a score or construction-ready route**. The separate data-center scorecard still evaluates a selected point, not the whole parcel. Selecting a parcel sets a labeled screening point at the boundary bounding-box center; that point may be outside an irregular or multipart parcel and must not be treated as parcel-wide clearance.

## Verification and limits

- Unit tests cover crossing/inside/touching/nearby lines, holes, multipart parcels, invalid geometry, radius validation, context exclusion, disconnected display paths, truncation, tenant authorization and stale-response guards.
- Live read-only checks on public Dallas, Fulton and Cook example locations retrieved real county polygons and executed the shared inventory inspector; examples are tests, not user-site recommendations or verified service.
- County lookup and drawing are browser-tested. Authenticated deployed API acceptance still requires a signed-in permitted user.
- A complete countrywide parcel-accurate fiber system requires carrier-authorized/as-built or licensed route data, ongoing updates, and parcel-specific confirmation. This public-source atlas cannot establish universal coverage or locate buried utilities. Before any excavation, use the applicable utility-locate process and professional field verification.
