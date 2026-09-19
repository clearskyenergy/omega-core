# Data-center site screening · v1.0 · 2026-09-19

The national fiber map and Grid Atlas pin analysis now call `POST /api/dc-site-screen`. All numerical scoring is in `api/_lib/dc-site-score.js`; browser code collects inputs and renders the response. Map visibility, viewport and visual reference images cannot change the server result.

## What the number means

This is an **internal preliminary mapped-signal score**, not readiness, investment advice, a utility/carrier commitment, engineering feasibility or an Uptime Tier rating. The response carries `model: dc-site-screen-v1.0`, the query coordinate, requested MW/Gbps, profile, timestamp, evidence coverage, attribute breakdown, source links/dates and unresolved requirements. The UI calls the number preliminary and always displays coverage beside it.

| Attribute | Weight | Current evidence |
|---|---:|---|
| Mapped power proximity | 20% | Published substation/transmission geometry within 25 km |
| Mapped fiber proximity | 20% | Qualifying detailed route geometry within 25 km, independent of map toggles |
| Carrier interconnection market | 10% | Nearest PeeringDB facility within 100 km reporting at least 10 networks |
| Mapped flood exposure | 10% | FEMA NFHL zone at the point, not parcel clearance |
| Deliverable power and energization | 15% | Unknown; requires utility diligence |
| Parcel service and bandwidth | 10% | Unknown; requires carrier confirmation |
| Physically diverse routes | 5% | Unknown; requires physical/shared-risk review |
| Cooling and water feasibility | 5% | Unknown; requires cooling design and utility/water-rights evidence |
| Land, zoning and environment | 5% | Unknown; requires parcel-specific diligence |

The score is the weighted mean of **measured** attributes only. Unknown values remain null and are excluded from both numerator and denominator. Evidence coverage is the sum of measured attribute weights, **not a confidence probability or percentage of due diligence complete**. With the present public inputs, at most 60% of weight is measured. `readiness_score` and `ready_for_development` remain null for every result. A high score at low coverage is not comparable to a fully qualified site. No pass/fail or acquisition verdict is emitted.

General, AI and edge profile names and MW/Gbps requirements are captured, but this first version deliberately uses the same transparent mapped-signal weights for all three. It does **not** claim that a route meets the requested Gbps or nearby voltage can deliver the requested MW. Workload-specific calibrated models and confirmed-evidence ingestion remain future work.

## Curves and safeguards

- Fiber points by distance: ≤0.25 km: 100; ≤1: 90; ≤2: 75; ≤5: 50; ≤10: 25; ≤25: 5. Zero distance is not service. Duplicate records, line-part counts and different operator labels earn no extra points.
- Power distance points, for each qualifying substation/transmission result: ≤0.5 km: 100; ≤2: 85; ≤5: 65; ≤10: 35; ≤25: 10. Available measurements are averaged for the power attribute. Voltage is reported as context, never converted to deliverable MW.
- Carrier-facility distance points: ≤5 km: 100; ≤20: 80; ≤50: 55; ≤100: 25. Facility presence is a market proxy, not service, diverse paths or measured latency.
- FEMA SFHA/A/V zones: 10 and a `mapped_risk` requirement flag. Shaded/0.2%-annual-chance or levee-related mapped zones: 60; recognized other lower-hazard zones: 90. Empty, D, unsupported, failed or truncated answers remain unknown. No zone is called flood-free, and other hazards remain unresolved.
- These curves and weights are explicit **product assumptions**, not externally certified thresholds. The [DOE siting FAQ](https://www.energy.gov/indianenergy/articles/data-centers-tribal-economic-development-frequently-asked-questions) informs the attribute categories: appropriate land, water/cooling, nearby fiber, grid access and land-use/permitting considerations. It does not prescribe this score.

Planned/inactive routes, unknown-medium lines, point facilities, road-routed long-haul corridors and images cannot earn fiber-proximity points. A missing/corrupt inventory shard now fails the lookup visibly rather than disappearing into an empty result. Incomplete live GIS responses are `partial` and do not score. Absence in a partial public source does not establish physical absence.

## Data and execution

`api/_lib/dc-site-evidence.js` queries fixed, allowlisted source endpoints, not URLs supplied by callers. It fetches minimal attributes and has independent 10-second source timeouts. Fiber uses the same losslessly compressed inventory/classifier as `/api/fiber-screen` and `/api/network-proximity`.

- EIA/ArcGIS substation and transmission mirrors: source dates, published operational status, geometry distance and voltage are surfaced. Proposed/retired/abandoned records are excluded. These are public mappings, not current utility capacity studies.
- [PeeringDB](https://www.peeringdb.com/apidocs/): facility registry and reported network count. A facility with absent/invalid counts is not promoted to a qualifying carrier facility.
- [FEMA NFHL Flood Hazard Zones](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28): point intersection and source citation. Whole-parcel, access-road, drainage and other-hazard review remain required.
- Fiber: 38,672 map records / 550,819 line parts, partial coverage in 47 states plus DC. Publisher dates and metadata-edit dates are not retrieval dates or field verification.

All three screening APIs share the existing Grid Atlas gate: Firebase token, billing/tool override, organization status and membership/tool access. Staff behavior is unchanged. Results are `private, no-store`; no Firestore writes, grants, carrier requests, billing changes or new collections are introduced. The public map remains visible when signed out, but API scoring is refused. A plain static localhost server does not host the API.

`/api/network-proximity` adds `datacenterScreening` using the same scoring module with its existing fiber and facility evidence. Power/FEMA are not checked in that additive response, so it has lower coverage. Existing `fiber.score`/`datacenter.score` values remain legacy fields for saved-record compatibility and carry a migration notice; consumers should use the new response or the dedicated endpoint. The old Grid Atlas browser score, fiber-confidence arithmetic and voltage-to-MW band were removed rather than duplicated.

## Use and validation

In either map: select a point (or enter latitude/longitude), optionally enter MW/Gbps/profile, sign in on the same Omega host, then select **Score selected site**. Expand diligence/methodology and export JSON if needed. Changing inputs invalidates the result/export; stale async responses cannot attach to a different site. Main-atlas layer redraws preserve the scorecard for the same pin. This version does not automatically save a score to a project.

Local developer/research use, without changing production authentication:

```sh
node scripts/screen-dc-site.js 32.7767 -96.797 50 100
npm test
```

Tests cover null handling, weights, source failures/truncation, geometry versus plans, duplicate-count invariance, hazard flags, strict inputs, fixed-source collection, date formatting, authorization before data access, private responses, compression packaging and server-only browser integration. The fiber/DC test suite is now included in the existing CI test job.

Live local collection at the Dallas example returned all five public sources and a 93/100 mapped-signal score at 60% coverage, with all readiness fields unconfirmed. That is a renderer/integration example, **not a recommendation for that location**. Browser QA checks the live-result snapshot, signed-out denial, map integration and source rendering. A signed-in deployed acceptance check is still required; neither local tests nor a Git push prove production deployment.
