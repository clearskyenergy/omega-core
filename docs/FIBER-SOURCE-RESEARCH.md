# Source research and coverage audit

Reviewed September 18, 2026. This is a source-by-source acquisition audit; discovery of a map does not mean its geometry or capacity is included.

| Source | Treatment | Finding |
|---|---|---|
| [OpenStreetMap U.S. telecom records](https://www.openstreetmap.org/copyright) | bundled | Optical medium is required for the fiber layer. Facilities and unspecified-media lines are separate. Existing records can be old. |
| [California MMBI statewide network design](https://www.arcgis.com/home/item.html?id=7debc3879ec8438c8c37ec51b9e958f0) | bundled | August 2026 snapshot; multipart geometry split into line parts. No operational or capacity claim. |
| [California MMBI partner network design](https://www.arcgis.com/home/item.html?id=7dceccdae28d428984930b3c5b8884fe) | bundled | Generalized geometry and partner agreements; overlaps the statewide design. Do not sum into unique route miles. |
| [California MMBI project construction status](https://www.arcgis.com/home/item.html?id=ab3010840faa4cbea569ee2e2d5858d1) | bundled | Installation, Pre-Construction and Ready-to-Connect are preserved. A project status does not qualify the neighboring parcel. |
| [FCC National Broadband Map downloads](https://broadbandmap.fcc.gov/data-download) | importer only | No national FCC records bundled. Import technology 50 and keep advertised upload/download separate. Coordinates need an authorized exact location-ID join. |
| [Lumen network mapbook](https://assets.lumen.com/is/content/Lumen/LumenNetworkMapbook25) | reference only | Reviewed the national route image and optical-network pages. Representative routes, with staged deployment; no spare capacity or parcel serviceability. |
| [Zayo network maps](https://www.zayo.com/network/) | reference only | Request current route GIS, permitted application use, access points and a serviceability response for each site. |
| [Cogent North America optical IP network map](https://security.cogentco.com/files/docs/network/maps/map_americas.pdf) | reference only | Q3 2026 map distinguishes route construction. Published backbone network totals are not bandwidth for sale at a parcel. |
| [Uniti network map](https://uniti.com/network-map/) | reference only | Carrier reference located; direct fetch returned 403. No geometry copied or service claim made. |
| [FiberLight network coverage map](https://www.fiberlight.com/fiber-network/network-coverage-map/) | reference only | Official interactive map. Request authoritative GIS and exact-site qualification before promoting any candidate. |
| [Segra network and GIS file request](https://www.segra.com/our-network/) | reference only | Publisher offers a request path for network KMZ and on/near-net building data. No request has been submitted. |
| [Internet2 network map](https://internet2.edu/infrastructure/i2-network-map/) | reference only | Public network topology and optical sites. Research-network presence does not imply commercially purchasable service; map data not redistributed. |
| [ESnet network maps](https://www.es.net/engineering-services/the-network/network-maps/) | reference only | Science network context. Not a commercial serviceability feed. |
| [Massachusetts Broadband Institute map gallery](https://broadband.masstech.org/map-gallery) | reference only | Network and interconnection maps are available, including a 2014 completed-network reference. Confirm current route and commercial terms. |
| [Connecticut broadband mapping hub](https://broadbandmaps.ct.gov/) | reference only | Regional availability context; do not turn service polygons into cable routes. |
| [Connecticut Education Network Worldview](https://worldview.net.cen.ct.gov/) | reference only | Public network reference; no commercial capacity feed has been connected. |
| [CENIC CalREN maps](https://cenic.org/network/maps) | reference only | Research and education network context; distinct from commercial enterprise service. |
| [PeeringDB facilities and networks](https://www.peeringdb.com/aup) | permission required | Current AUP restricts bulk onward distribution and commercial uses. No PeeringDB data bundled; source is not treated as CC0. |
| [InterTubes U.S. long-haul infrastructure](https://www.impactcybertrust.org/dataset_view?idDataset=521) | access and rights required | 2014–2015 collection, not an ongoing measurement. Account required; commercial use listed as unknown. No data bundled. |
| [Public ArcGIS Long Haul Network item](https://www.arcgis.com/home/item.html?id=8c6120233e7e496e85588cfbd62311ea) | excluded | Public endpoint exists, but publisher provenance and reuse terms were blank. Excluded from evidence and routing decisions. |
| [Public copy labeled Zayo customer network 2019](https://www.arcgis.com/home/item.html?id=c37db8596a614b5faf3a78ccb360c0ef) | excluded | Third-party public copy is not current carrier confirmation or a redistribution license. Excluded. |
| [U.S. Census TIGERweb states](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0) | analysis reference | Generalized output used to summarize record coverage; geographic intersections do not establish service coverage. |
| [FiberLocator](https://www.fiberlocator.com/) | license required | Potential licensed route/on-net data source. Obtain an explicit application/API reuse agreement and verify coverage and freshness. No subscription or connection established. |
| [GeoTel](https://www.geo-tel.com/) | license required | Potential licensed route/on-net data source. Obtain an explicit application/API reuse agreement and verify coverage and freshness. No subscription or connection established. |

## Geographic coverage

The completed national OSM queries yielded optical-route records in 13 states and telecom-facility records in all 50 states. This is sparse infrastructure evidence. It is not a national route inventory or evidence of purchasable service in every state.

State counts use intersections with generalized Census boundaries. The sum can exceed the source count when routes cross state lines. Coastline generalization can omit some offshore locations. California records overlap across design, partner and progress datasets.

| State | Tagged optical route records | Unspecified-medium records | Telecom facility records | CA design/progress line parts |
|---|---:|---:|---:|---:|
| Alaska (AK) | 0 | 0 | 19 | 0 |
| Alabama (AL) | 0 | 0 | 123 | 0 |
| Arkansas (AR) | 0 | 1 | 102 | 0 |
| American Samoa (AS) | 0 | 0 | 0 | 0 |
| Arizona (AZ) | 2 | 263 | 91 | 3 |
| California (CA) | 0 | 651 | 397 | 2473 |
| Colorado (CO) | 1 | 2 | 68 | 0 |
| Connecticut (CT) | 3 | 0 | 16 | 0 |
| District of Columbia (DC) | 1 | 0 | 2 | 0 |
| Delaware (DE) | 0 | 0 | 12 | 0 |
| Florida (FL) | 0 | 245 | 84 | 0 |
| Georgia (GA) | 0 | 5 | 88 | 0 |
| Guam (GU) | 0 | 0 | 2 | 0 |
| Hawaii (HI) | 0 | 1 | 7 | 0 |
| Iowa (IA) | 0 | 0 | 73 | 0 |
| Idaho (ID) | 0 | 0 | 12 | 0 |
| Illinois (IL) | 14 | 74 | 292 | 0 |
| Indiana (IN) | 0 | 0 | 160 | 0 |
| Kansas (KS) | 0 | 0 | 134 | 0 |
| Kentucky (KY) | 0 | 7 | 123 | 0 |
| Louisiana (LA) | 0 | 0 | 151 | 0 |
| Massachusetts (MA) | 0 | 12 | 27 | 0 |
| Maryland (MD) | 125 | 18 | 82 | 0 |
| Maine (ME) | 0 | 0 | 13 | 0 |
| Michigan (MI) | 0 | 0 | 780 | 0 |
| Minnesota (MN) | 0 | 0 | 39 | 0 |
| Missouri (MO) | 0 | 0 | 144 | 0 |
| Commonwealth of the Northern Mariana Islands (MP) | 0 | 13 | 0 | 0 |
| Mississippi (MS) | 3 | 0 | 132 | 0 |
| Montana (MT) | 0 | 21 | 15 | 0 |
| North Carolina (NC) | 27 | 236 | 92 | 0 |
| North Dakota (ND) | 0 | 1 | 14 | 0 |
| Nebraska (NE) | 0 | 0 | 34 | 0 |
| New Hampshire (NH) | 0 | 15 | 25 | 0 |
| New Jersey (NJ) | 0 | 5 | 194 | 0 |
| New Mexico (NM) | 3 | 1 | 91 | 0 |
| Nevada (NV) | 0 | 0 | 75 | 6 |
| New York (NY) | 0 | 9 | 96 | 0 |
| Ohio (OH) | 5 | 11 | 263 | 0 |
| Oklahoma (OK) | 0 | 0 | 158 | 0 |
| Oregon (OR) | 7 | 20 | 197 | 3 |
| Pennsylvania (PA) | 2 | 13 | 111 | 0 |
| Puerto Rico (PR) | 0 | 0 | 2 | 0 |
| Rhode Island (RI) | 0 | 1 | 1 | 0 |
| South Carolina (SC) | 0 | 1 | 39 | 0 |
| South Dakota (SD) | 0 | 0 | 9 | 0 |
| Tennessee (TN) | 0 | 5 | 153 | 0 |
| Texas (TX) | 0 | 9 | 503 | 0 |
| Utah (UT) | 0 | 0 | 26 | 0 |
| Virginia (VA) | 4 | 38 | 456 | 0 |
| United States Virgin Islands (VI) | 0 | 0 | 0 | 0 |
| Vermont (VT) | 0 | 0 | 1 | 0 |
| Washington (WA) | 0 | 0 | 138 | 0 |
| Wisconsin (WI) | 2 | 1 | 82 | 0 |
| West Virginia (WV) | 0 | 7 | 16 | 0 |
| Wyoming (WY) | 0 | 0 | 28 | 0 |

## What images can and cannot establish

The Lumen national mapbook image was inspected visually. It supports broad network-footprint research, but its own notes describe representative routes and phased deployment. Raster or schematic linework has no surveyed positional precision. Road alignment, color, line thickness, or adjacency to a parcel cannot establish cable size, splice rights or unused optical capacity.

Accordingly, this release links carrier images and retains public GIS geometry where available. It does not trace marketing-map pixels into apparently precise street-level fiber routes, or construct straight-line links between cities and call them actual cable paths.

For a future permitted digitization: record the publisher, map date and reuse terms; georeference against identifiable controls; retain residual error and operator review; separate schematic from geographic geometry; preserve planned/active distinctions. Keep those lines out of parcel-distance or serviceability conclusions until validated.

## Practical next data acquisition

1. Obtain carrier-authorized GIS/KMZ and access-point data for target parcels and regions. Segra publishes an explicit file-request path; the request was not sent.
2. Select a licensed national route inventory if broad commercial coverage is necessary. Confirm SaaS display/API/export rights and how recently each carrier updated its footprint.
3. Import authorized FCC technology-50 data for reported mass-market speeds. Do not equate its advertised maximum with committed enterprise bandwidth.
4. Obtain carrier engineering qualification for each shortlisted parcel: exact demarcation, service and capacity, access point, lateral costs/timing, SLA, and independently diverse paths.
5. Store qualification evidence by exact site and validity period in the existing tenant-scoped workflow. Do not let it leak into a public GeoJSON or public repository.
