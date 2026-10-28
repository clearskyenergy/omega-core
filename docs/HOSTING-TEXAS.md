# Hosting capacity in Texas (checked 2026-10-28)

Tommy's case (2026-10-28): "we have tons of sites in Texas … when I put a
site in Texas on prime etc that it would work and give grid insight and that
the circuits or details would work." This note is the research behind the
national door's Texas answers (`POST /api/hosting-capacity`): which utility
serves a point, and what each publishes. Primary sources only: each
utility's own pages and documents, the PUCT's own rules, filings and GIS,
the national territory layer's own attributes at live test points. Every
link below was fetched on 2026-10-28; where a site refused a scripted read,
that is said.

## The answer

**No Texas electric utility publishes distribution hosting capacity.** Not
Oncor, CenterPoint, AEP Texas, TNMP or Lubbock Power & Light in ERCOT; not
El Paso Electric (WECC), Southwestern Public Service (SPP), SWEPCO (SPP) or
Entergy Texas (MISO) at the edges; not Austin Energy or CPS Energy; and no
municipal utility or cooperative found. Three independent proofs:

1. **DOE's U.S. Atlas of Electric Distribution System Hosting Capacity Maps**
   ([energy.gov](https://www.energy.gov/eere/us-atlas-electric-distribution-system-hosting-capacity-maps),
   fetched 2026-10-28) lists 26 states; **Texas is not one of them**, and no
   Texas utility appears anywhere on the page. (Xcel Energy's entries sit
   under Colorado and Minnesota.)
2. **The PUCT has no hosting-capacity rule.** Interconnection of distributed
   generation is 16 TAC §25.211 and §25.212, adopted in 1999 under Project
   21220 ([the adoption order](https://ftp.puc.texas.gov/public/puct-info/agency/rulesnlaws/subrules/electric/25.211/21220adt.pdf),
   fetched 2026-10-28). In Project 54233 (2023), the Texas Solar Power
   Association's comments ([54233_57_1312954.PDF](https://interchange.puc.texas.gov/Documents/54233_57_1312954.PDF),
   fetched 2026-10-28) *proposed* requiring hosting capacity analysis and
   listed the "at least twelve states" whose utilities produce maps —
   **Texas is not among them** — noting "XCEL Energy (the parent company of
   Southwestern Public Service Company in Texas) already provides hosting
   capacity maps for Minnesota and Colorado customers". No such rule was
   adopted.
3. **ArcGIS Online holds no hosting-capacity item for any Texas utility**:
   searches for `"hosting capacity"` with oncor, centerpoint, AEP Texas,
   austin energy, CPS energy, el paso electric, entergy, SWEPCO, TNMP and
   lubbock each returned **0 results** (2026-10-28), and a search for
   `title:"hosting capacity" texas` returned 0.

So the Circuit step names the candidates at the point, says plainly that
each publishes no hosting capacity, and hands the person the route each
utility offers instead, its own pages, and the PUCT's own public
service-area boundaries viewer. Nothing is guessed and no figure is
invented. There is no Texas hosting-capacity source to wire into the
registry today; the hosting scout looks again on each run.

**Retail choice matters in ERCOT**: at most Texas sites the bill names a
retail electric provider, not the utility. Interconnection is answered by
the WIRES company (the TDU — Oncor, CenterPoint, AEP Texas, TNMP, or LP&L in
Lubbock), and every TDU entry says so.

## Utility by utility

EIA ids were read off the national territory layer's own attributes
(`Electricity_Rates_H3_Res5/FeatureServer/7`, the door's first layer) at
live point queries on 2026-10-28 — the exact queries are in the PR body —
never from memory.

### ERCOT transmission/distribution utilities (retail choice)

| Utility | EIA id (proven at) | Publishes hosting capacity | What it offers instead | Its own pages (fetched 2026-10-28) |
|---|---|---|---|---|
| Oncor Electric Delivery | 44372 (Dallas, Lewisville, Garland, Denton, Georgetown) | No — its developer page offers "prescreen options and project classification"; no map, no layer | Pre-screen, then an interconnection application under 16 TAC §25.211/§25.212; large DG (~500 kW–10 MW+) takes a detailed impact study, about 9–12 months; dg@oncor.com | [Energy system developers](https://www.oncor.com/us/en/home/smart-energy/renewables-solar-and-more/energy-system-developers.html) · [For installers](https://www.oncor.com/us/en/home/smart-energy/renewables-solar-and-more/for-installers.html) |
| CenterPoint Energy Houston Electric | 8901 (Houston) | No — told the PUCT so in Docket 56211 (June 2024): "not actively pursuing development of a hosting capacity map … the Company does offer a pre-screen in lieu of a hosting capacity map to any prospective customers" ([56211_284_1401104.PDF](https://interchange.puc.texas.gov/Documents/56211_284_1401104.PDF), RFI EDF-RF103-03) | Pre-screen on request, DER application under 16 TAC §25.211/§25.212 | [Builders & developers](https://www.centerpointenergy.com/en-us/for-business/industry/builders-developers) (its DG pages are JS-routed; the docket PDF is the proof) |
| AEP Texas | 20404 (North: Abilene) and 3278 (Central: Corpus Christi, Harlingen) — the layer carries both pre-merger companies, each tagged with AEP's "OK" state code | No | Interconnection application through PowerClerk; DER Team, San Angelo: DER_AEPTexas@aep.com, 361-881-5333 | [Generating equipment](https://www.aeptexas.com/business/builders/generating-equipment) |
| Texas-New Mexico Power (TNMP) | 40051 (Dallas, Lewisville, Garland, Denton — its polygon overlaps Oncor's across the Metroplex) | No | Interconnection application under 16 TAC §25.211/§25.212 | [Interconnecting](https://www.tnmp.com/customers/interconnecting) |
| Lubbock Power & Light | 11292 ("CITY OF LUBBOCK - (TX)" at Lubbock) | No | Interconnection agreement filed with City of Lubbock Utilities (customerrelations@mylubbock.us). In ERCOT retail choice since March–April 2024 (ERCOT notice [M-B022724-02](https://www.ercot.com/services/comm/mkt_notices/M-B022724-02)); LP&L stays the wires company | lpandl.com — **bot-walled**: lpandl.com answers scripts with a 301 to the city's LP&L page (mylubbock.us/358), which answers Cloudflare 403; verified only to the redirect. A person's browser opens both normally |

### Non-ERCOT edges

| Utility | EIA id (proven at) | Publishes hosting capacity | What it offers instead | Its own pages (fetched 2026-10-28) |
|---|---|---|---|---|
| El Paso Electric (WECC) | 5701 (El Paso) | No. It publishes a public DG interconnection **queue** (applications by status, [solarium3](https://solarium3.epelectric.com/DGInterconnection/Queues/PublicQueue.aspx)), which is not capacity and is never read as a figure | Texas interconnection of facilities up to 10 MW, by application | [TX interconnection up to 10 MW](https://www.epelectric.com/residential/rooftop-solar/texas-interconnection-of-facilities-up-to-10-mw) · [Distribution interconnection](https://www.epelectric.com/company/interconnection/distribution-interconnection) |
| Southwestern Public Service / Xcel (SPP; Panhandle, South Plains) | 17718 (Amarillo, Lubbock) | No — Xcel's hosting capacity maps cover Minnesota and Colorado only (DOE atlas; TSPA's 54233 filing says the same) | Xcel's interconnection application | [How to interconnect](https://www.xcelenergy.com/working_with_us/how_to_interconnect) |
| SWEPCO / AEP (SPP; northeast Texas) | 17698 (Longview; tagged "OK" like AEP Texas) | No | AEP's Distributed Generation Coordinator, dgcoordinator@aep.com (named on its own page) | [Generating equipment](https://www.swepco.com/business/builders/generating-equipment) |
| Entergy Texas (MISO; southeast Texas) | 55937 (Beaumont, Houston-edge, Bryan/College Station) | No | Schedule SQF (to 100 kW) or LQF above it; distributed-scale interconnection under Schedule IPODG, which can take a pre-interconnection study; Entergy's interconnection portal | [Net metering](https://www.entergytexas.com/net-metering) |

### Major municipal utilities

| Utility | EIA id (proven at) | Publishes hosting capacity | What it offers instead | Its own pages (fetched 2026-10-28) |
|---|---|---|---|---|
| Austin Energy | 1015 (Austin) | No | Interconnection application under its DG interconnection guide ([the contractors' guide PDF](https://www.austinenergy.com/-/media/project/websites/austinenergy/contractors/ae_dg_interconnection_guide.pdf), fetched, 5.0 MB) | [Solar solutions](https://austinenergy.com/green-power/solar-solutions) |
| CPS Energy (San Antonio) | 16604 ("CITY OF SAN ANTONIO - (TX)" at San Antonio and New Braunfels) | No | DG application under its [Distributed Generation Manual](https://www.cpsenergy.com/content/dam/corporate/en/Documents/Distributed%20Generation%20Manual.pdf) (fetched; its May 2024 memo says it is being revised to add battery storage, microgrids and ERCOT requirements); DG@cpsenergy.com, 210-353-2700 | [Distributed generation](https://www.cpsenergy.com/content/corporate/en/construction-and-renovation/distributed-generation.html) |
| Other munis (grouped `tx-munis`) | Garland 6958, Denton 5063, Georgetown 7129, College Station 3940 (each at its own city) | No | The city utility's own interconnection and engineering review | [TPPA member list](https://tppa.com/member-utilities/). **New Braunfels Utilities is missing from the national layer at its own city** (the query at 29.7030, −98.1245 returned GVEC, CPS and Pedernales, no NBU), so a New Braunfels point reads as its neighbours; said in the entry |

### Cooperatives (grouped `tx-coops`)

No Texas co-op publishes hosting capacity; ArcGIS Online holds no capacity
item for any. The group entry carries the 27 co-op ids proven at the live
test points: Pedernales 14626, CoServ (Denton County EC) 5078, Bluebonnet
1892, Magic Valley 11501 (Harlingen), Trinity Valley 18976, HILCO 8620,
Farmers 6182, San Bernard 16638, San Patricio 16627, Nueces 13830, Taylor
27369, Coleman County 3938 (typed "NOT AVAILABLE" on the layer), Cooke
County 4262, Tri-County 19159, Wise 20948, Karnes 10009, Bandera 1175,
Guadalupe Valley 7752, Rio Grande 16057, Rita Blanca 16063, Upshur 19579,
Rusk County 16461, Lyntegar 11364, South Plains 17561, Navasota Valley
16146, Mid-South 12452, Bartlett 1273. Directory:
[texas-ec.org member directory](https://texas-ec.org/about/member-directory/)
(fetched 2026-10-28). Route: the co-op's own interconnection application and
engineering review.

## Whose wire is it? (the territory)

### The PUCT's own layers are licence-blocked

The PUCT publishes certificated electric service-area boundaries as three
public, queryable ArcGIS layers behind its
[Electric Service Area Boundaries Viewer (PUBLIC)](https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd):
`IOU` (layer 300), `MUNI` (layer 320) and `COOP_DIST` (layer 310) on the
PUCT's ArcGIS Online organisation (owner `gis.user.puct`; fields
COMPANY_NAME, COMPANY_TYPE, CCN_NO, DATA_SOURCE…, all three proven with
`?f=json` on 2026-10-28). They would be the state authority layer Texas
needs. **But each item's licence reads, in full:**

> "Use is limited to the individuals identified in a Master Service
> Agreement with Platts. Usage and Sourcing guidelines are detailed in the
> 'GeospatialProductUsageSourcing' document, delivered with a subscription
> to Platts geospatial products and data. Please email
> powermap_support@platts.com for a copy."

(The item description calls the layers "UNOFFICIAL" and says the official
boundaries are the county mylar maps at PUCT Central Records; "Unless
otherwise noted, data was submitted by the electric utilities; Data edited
by Public Utility Commission"; IOU item last modified 2026-06-29.)

That is the SRP/APS rule: a layer whose licence forbids it is never read.
**OMEGA does not query the PUCT layers.** A person gets the PUCT's own
public viewer instead (`check` on every Texas registry entry). If counsel or
the PUCT clears the layers (the licence text may be S&P/Platts boilerplate
on PUCT-edited, utility-submitted data — ask the PUCT), wiring them as the
Texas `STATE_LAYERS` authority is the single change that would settle metro
attribution; until then nothing else public was found (no official Oncor,
CenterPoint, Austin Energy or CPS boundary service exists on ArcGIS Online —
searched 2026-10-28).

### What the national layer answers (live, 2026-10-28)

The twelve test points, against the door's first national layer
(`Electricity_Rates_H3_Res5/7`):

| Point | Rows returned | The right utility | Reading |
|---|---|---|---|
| Dallas (32.7767, −96.7970) | Trinity Valley EC, HILCO EC, Farmers EC, TNMP, **Oncor** | Oncor | Five overlapping polygons; co-op blobs cover downtown. Candidates, never confident |
| Houston (29.7604, −95.3698) | San Bernard EC, Entergy Texas, **CenterPoint** | CenterPoint | Three candidates |
| Corpus Christi (27.8006, −97.3964) | **AEP Texas Central (3278)**, San Patricio EC, Nueces EC | AEP Texas | Three candidates |
| Abilene (32.4487, −99.7331) | Taylor EC, Coleman County EC, **AEP Texas North (20404)** | AEP Texas | Three candidates |
| Lewisville (33.0462, −96.9942) | Cooke EC, **CoServ (Denton County EC)**, Tri-County EC, Wise EC, TNMP, **Oncor** | Oncor / CoServ seam | Both sides listed; the bill decides |
| Austin (30.2672, −97.7431) | **Austin Energy**, Bluebonnet EC, Pedernales EC | Austin Energy | Three candidates |
| San Antonio (29.4241, −98.4936) | Karnes EC, Bandera EC, GVEC, **CPS (City of San Antonio)**, Pedernales EC | CPS Energy | Five candidates; CPS's polygon leads only on size |
| El Paso (31.7619, −106.4850) | Rio Grande EC, **El Paso Electric** | EPE | RGEC's 2.1×10¹¹ m² polygon covers the city; EPE's entry says EPE is the likelier utility there |
| Amarillo (35.1991, −101.8313) | Rita Blanca EC, **SPS** | SPS | Two candidates |
| Longview (32.5007, −94.7405) | Upshur EC, Rusk County EC, **SWEPCO** | SWEPCO | Three candidates |
| Beaumont (30.0802, −94.1266) | **Entergy Texas** alone | Entergy Texas | One candidate: **confident** |
| Lubbock (33.5779, −101.8552) | Lyntegar EC, SPS, **City of Lubbock**, South Plains EC | LP&L | Four candidates (SPS genuinely borders LP&L in Lubbock) |

Notes on the layer's own data: the IOU/TDU rows carry no
`Total_Customer_Count_2024` (null); AEP Texas's two rows and SWEPCO's are
tagged `STATE: 'OK'` (AEP's), so the registry matches them by EIA id, never
by state; **New Braunfels Utilities is absent at its own city**.

### The known limitation (recorded, not hidden)

Without an authority layer, the door's headline utility at an overlapped
metro point is the **smallest polygon**, which at downtown Dallas is a
co-op (HILCO's blob), not Oncor. The answer is honest — `confident: false`,
every candidate listed with its own route and the PUCT viewer, "confirm the
utility with a bill", and no capacity figure exists to mis-assign (every
Texas verdict is "Needs a study") — but the first name shown can be wrong
in the metros. The fix is the PUCT layer, pending its licence (above).
`scripts/tests/thostingsources.js` pins this behaviour (the Dallas,
Lewisville and Beaumont door tests) so a future change is deliberate.

## What the Circuit step shows

At a Dallas site: the candidates (a co-op first by polygon size, Oncor and
TNMP beside it), each saying "publishes no hosting capacity" with its route
(Oncor's pre-screen and §25.211/§25.212 application) and two pages (the
utility's own and the PUCT's boundary viewer); verdict **Needs a study**; no
figure invented. At Beaumont: **Entergy Texas**, confident, with Schedule
IPODG named. Site Map's Grid panel and Site Plan's Grid Atlas layer draw the
same list (`GV.whoServes`).

## Not built, and open

- **The PUCT layers' licence**: ask the PUCT or counsel whether the Platts
  MSA licence governs the PUCT-edited copies its own public viewer serves.
  Cleared, they become the Texas `STATE_LAYERS` authority and settle the
  metros (the one open fix for the Dallas headline).
- **LP&L's pages** refuse scripted reads (Cloudflare on lpandl.com and
  mylubbock.us); verified to the 301 redirect only. A person's browser is
  fine. Re-check on a future run.
- **Terms**: legal sign-off on each viewer link before relying on these
  reads commercially, as for every registry entry (they are links a person
  opens, not services OMEGA queries, so the exposure is low).
- **A pre-screen is a request a person makes** (Oncor's, CenterPoint's, a
  co-op's engineering review). OMEGA does not file one and does not read its
  answer back; typing a utility's answer onto the project is a future step,
  as in Arizona.
