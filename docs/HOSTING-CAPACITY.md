# Hosting and interconnection capacity (2026-10-17)

Where a utility publishes how much generation or load a feeder can still
take, how to read it, and the prototype that already does for two open
ArcGIS publishers. This is a research note. It does not change a
production map, a Firestore record, or an environment variable.

The machine check is `npm run validate:data -- --live`. It asks PG&E,
National Grid Massachusetts and National Grid New York for one known
point each. No key. A miss is an error. A hit is recorded in the JSON
report and is not treated as a failure.

## What was actually opened

On 2026-10-17 the following answered. Everything else in the catalog
below is a viewer the product already links, or a sibling service that
was listed and not queried.

| Source | What answered | Grain | Units on the wire | Sample |
|---|---|---|---|---|
| PG&E GRIP `DRPComplianceRelProd` FeatureServer layer 3 `LineDetail` | HTTP 200, features | Line section | Kilowatts | San Francisco (37.7749, −122.4194): feeder `022011121` “SF X (MISSION) 1121”, `LoadCapacity_kW` 315, 12 kV. `GenCapacity_kW` was null on that section and stays null |
| National Grid MA `MASDP/Nodal_Hosting_Capacity_MA` MapServer layer 0, “Local Feeder Level Hosting Capacity for PV” | HTTP 200, features | Feeder | Megawatts | Worcester (42.2626, −71.8023): feeder `05_01_11J331`, substation `FARADAYSTREET11`, max 1.8 MW → 1,800 kW, min 0.3 MW → 300 kW, 4.16 kV, `hca_refresh_date` `10/02/2026` |
| National Grid NY `NYSDP/Hosting_Capacity_Data` MapServer layer 0, same layer title | HTTP 200, features, once the field list matches the layer | Feeder | Megawatts | Buffalo area (42.8656, −78.7709): `Master_CDF` `36_01_12161`, bank `121 CLINTON ST TB 1`, max 2 MW → 2,000 kW, min 0.2 MW → 200 kW, 4.8 kV, refresh `2026-03-31` (the service sends epoch milliseconds `1774915200000`) |

`https://services9.arcgis.com/.../DRPComplianceFeatureSVC` returns an
HTTP 200 whose body is `Invalid URL`. The service that answers is
`https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer`.
Layer 2 on that server is `FeederDetail` (existing and queued DG, no
ICA kilowatts). Layer 3 is the line-section ICA. Layer 4 is `ICA Not
Available`. The prototype reads layer 3 only.

National Grid’s REST directory
(`https://systemdataportal.nationalgrid.com/arcgis/rest/services?f=json`)
lists folders `Hosted`, `MASDP`, `NY_Sandbox`, `NYSDP`, `RISDP`,
`Utilities`. Under `NYSDP`, also listed and not queried: `ESS_Charge_Data`,
`ESS_Discharge_Data`, `ESS_Phase1`, `EV_Load_Serving_Capacity`. Under
`RISDP`, also listed and not queried: `Hosting_Capacity_All`,
`Hosting_Capacity_no_Voltage_AntiIslanding`, `Hosting_Capacity_without_Voltage`,
`RISDP_HostingCapacity`. `NYSDP/Nodal_Hosting_Capacity_NY` is not a
service; the PV layer is `Hosting_Capacity_Data`.

Asking the New York layer for Massachusetts names (`feeder_cdf`,
`substation_name`) returns HTTP 200 with `Failed to execute query` and
no features. The New York field list is `Master_CDF` and
`substation_bank_name`. A point-plus-distance query works on all three
once the names exist on that layer.

## Architecture

One registry, server-side, one shape.

1. `api/_lib/hosting-capacity.js` is the registry. It builds the query
   URL and normalizes one feature. It does not fetch. The caller passes
   `fetch` (today: `scripts/validate-analysis-data.js --live`).
2. The query runs on the server. Browsers cannot set the Referer ComEd
   requires, and a page should not learn each publisher’s field names.
3. The normalized record is kilowatts, a feeder id, a name, a
   substation, voltage, an as-of date, and a note. A blank capacity
   stays null. It is not stored as zero.
4. A line-section ICA is the minimum of the hourly criteria on that
   section. Sections on one feeder share the feeder limit. They are not
   added. The PG&E note on every row says so. Load, generation, and
   generic PV are separate fields (`LoadCapacity_kW`, `GenCapacity_kW`,
   `GenericPVCapacity_kW`), including the with- and without-OpFlex
   variants on the same layer. The prototype keeps the three headline
   kilowatt fields.
5. ComEd stays on `api/_lib/comed-service.js`. That gateway answers only
   with the viewer’s Referer, and the service name rotates monthly
   (`SEP2026` as of this review). It is not an open endpoint and it is
   not in this registry. The harness treats a name two months behind as
   a warning and three months behind as an error.
6. A point with no feature is “not published here”, not a zero. Single
   phase and networked secondary often have no ICA; PG&E draws those on
   their own layers.
7. `grid-atlas-national.js` still deep-links the human viewer (`url`).
   `api` is set only where this pass confirmed a layer: PG&E, National
   Grid MA, National Grid NY. The report renderer does not call `api`.
8. Do not feed these figures into `api/_lib/grid-verdict.js` until a
   reviewer accepts the unit conversion on a live feeder. The conversion
   is tested. The verdict path still takes the circuit number it is
   given.

A later daily job is the same command. It needs outbound HTTPS and no
secret. `OPENEI_API_KEY` and `EIA_API_KEY` add the tariff and retail-price
spot checks described in `docs/ANALYSIS-AUDIT.md`; they are not required
for hosting capacity.

## Prototype

```js
var H = require('./api/_lib/hosting-capacity');
var url = H.queryUrl('pge-grip', 37.7749, -122.4194); // or 'ng-ma-feeder', 'ng-ny-feeder'
// GET url, then H.normalize(id, feature) for each feature
```

`queryUrl` refuses an unknown id, a bad latitude or longitude, and a
radius outside 1 m–5 km. The default radius is 250 m for PG&E and
1,000 m for National Grid. `metadataUrl` is the layer document.

National Grid megawatts become kilowatts with
`Math.round(n * 1000000) / 1000`, so 1.8 MW is 1,800 kW and 0.01334 MW
is 13.34 kW. The Worcester sample’s queued and installed DG were
0.00456 MW and 0.01334 MW (4.56 kW and 13.34 kW), which is a small
amount of DG, not a megawatt that was dropped.

## Catalog

**Verified, wired.** The three rows in the table above. No login.

**In production already, not in this registry.** ComEd BESS hosting
capacity, feeder grain, `BESS_HC` / `PV_HC_kW` / `EV_HC_kW` / `Feeder_Q`
on layer 75, Referer-gated `usrsvcs` gateway, name rotates monthly.
See `api/_lib/comed-service.js` and `docs/GUIDED-SITE-FLOW.md`.

**Listed in a directory on 2026-10-17, not queried, not wired.**
National Grid Rhode Island hosting layers under `RISDP`, and National
Grid New York ESS and EV load-serving layers under `NYSDP`. Field names,
units and a sample point are still to be read before an adapter.

**Viewers already linked from Grid Atlas, not probed this pass.** The
`HOSTING` array in `grid-atlas-national.js` deep-links these. An `api`
of null means this pass did not confirm a feature service. Do not paste
a guessed ArcGIS URL into that array: a 404 that looks like “no
capacity” is worse than a link to the utility’s own map.

| Utility | States on the atlas entry | How the public page is reached |
|---|---|---|
| Ameren Illinois | IL | Utility hosting-capacity map |
| Ameren Missouri | MO | Utility hosting-capacity map |
| Con Edison | NY | Utility hosting-capacity page |
| NYSEG / RG&E | NY | Distributed-generation page |
| PSE&G | NJ | Utility solar page |
| Southern California Edison | CA | Distribution resource plan portal |
| SDG&E | CA | Integration capacity analysis map |
| Xcel Energy | CO, MN, NM, TX, WI, MI, ND, SD | Hosting-capacity map (one page for every Xcel state) |
| Duke Energy | NC, SC, IN, OH, KY, FL | Hosting-capacity map |
| Dominion Energy | VA, NC, SC | Hosting-capacity map |
| Georgia Power | GA | Renewable-programs page, not confirmed as a feeder map |
| Consumers Energy | MI | Distributed-generation page |
| DTE Energy | MI | Generation-interconnect page |
| Eversource | CT, MA, NH | System data portal |
| Oncor | TX | Generation-interconnection page |
| CenterPoint Energy | TX, IN, OH, MN | Distributed-generation page |
| APS | AZ | Interconnection page |
| Salt River Project | AZ | Interconnection page |
| Portland General Electric | OR | Generation-interconnection page |
| Puget Sound Energy | WA | Interconnection page |
| Baltimore Gas & Electric | MD | Hosting-capacity map |
| Pepco | MD, DC | Hosting-capacity map |
| PECO | PA | Hosting-capacity map |
| PPL Electric | PA | Generate-your-own-power page |
| MidAmerican Energy | IA, IL, SD, NE | Generation-interconnection page |
| Alliant Energy | IA, WI | Interconnection page |
| We Energies | WI, MI | Interconnection page |
| Evergy | KS, MO | Interconnection page |
| OG&E | OK, AR | Interconnection page |
| Entergy | LA, AR, MS, TX | Interconnection page |
| NV Energy | NV | Generation-interconnection page |
| PacifiCorp | UT, OR, WY, ID, WA, CA | Interconnection page |
| Idaho Power | ID, OR | Generating-your-own-energy page |

Several of those pages are an interconnection form rather than a feeder
map. They stay as links until someone opens the map and records the
service.

Arizona was opened utility by utility on 2026-10-20: no utility there
publishes distribution hosting capacity (APS and SRP above are
interconnection pages, as the table says). The list, the links, the route
each utility offers instead and the City of Mesa's own service-area map are
in `docs/HOSTING-ARIZONA.md`.

**Publishers not in the atlas, and not probed.** Central Hudson and
Orange & Rockland (New York joint-utilities maps), Unitil
(Massachusetts and New Hampshire), United Illuminating (Connecticut),
Hawaiian Electric, and the other New Jersey utilities (JCP&L, Atlantic
City Electric, Rockland Electric). Add one only after its layer, grain
and units are read the way the three above were.

## What the state programmes ask for

These are the public programmes the maps come from. Cadence below is
what the services stamped on 2026-10-17, not a claim that every utility
in the state refreshes on that schedule.

- **California.** The CPUC distribution-resources-plan proceeding
  requires the three large utilities to publish integration capacity
  analysis. PG&E’s open FeatureServer is wired. SCE and SDG&E publish
  ICA maps; their services were not opened. PG&E’s line section carries
  `ICA_Analysis_Date` and `Last_Update_On_Map`. The San Francisco
  sample’s map date was August 2026.
- **New York.** The joint utilities publish hosting-capacity maps under
  the Public Service Commission’s hosting-capacity orders. National
  Grid upstate is wired. Con Edison and NYSEG/RG&E are linked only.
  National Grid’s New York refresh on the sample feeder was 31 March
  2026, so a feeder can sit for months between stamps. `feeder_dg_connected_since_refresh`
  is on the layer and is not yet copied into the normalized record.
- **Massachusetts.** The distribution companies publish hosting capacity
  through the Department of Public Utilities’ interconnection work.
  National Grid is wired (refresh 2 October 2026 on the Worcester
  feeder). Eversource is linked. Unitil is not in the atlas.
- **Illinois.** ComEd and Ameren Illinois both publish maps. ComEd is
  already queried through the Referer proxy, at the feeder, with the
  queue (`Feeder_Q`) available to net. Ameren is a link.
- **Minnesota.** Xcel publishes a hosting-capacity map. The atlas links
  Xcel’s page for Minnesota and the other Xcel states. The download or
  the layer behind that viewer was not opened, and some Xcel views ask
  for a login. Treat it as login-unknown until it is opened.

Update cadence for a new utility is whatever the layer stamps
(`hca_refresh_date`, `ICA_Analysis_Date`, `Last_Update_On_Map`), read
on a sample, not a guess of “monthly”.

## Adding the next utility

1. Open the service directory or the viewer’s network log and copy the
   layer URL that returns features.
2. Read `?f=json` and keep only field names that layer has.
3. Add one object to `SOURCES` with `shape` `pge-line` or `ng-pv-feeder`,
   or a new shape and a branch in `normalize`, and set `units` to what
   the service publishes.
4. Pin a fixture in `scripts/tests/tanalysisvalidate.js`, including a
   blank capacity staying null and a megawatt value landing on the
   kilowatt it should.
5. Add one known point to the `--live` list in
   `scripts/validate-analysis-data.js`.
6. Set `api` on the matching `HOSTING` row. Leave `url` as the page a
   person can open.
