# Hosting capacity in Arizona (checked 2026-10-20)

Tommy's case: Omega Prime's Circuit step at **29 W Main St, Mesa, AZ** said
"This site is outside ComEd's territory." That was the ComEd-only Circuit
step; the national door (`POST /api/hosting-capacity`, PR #354) replaced it.
This note is the research behind the door's Arizona answers: which utility
serves a point, and what each publishes. Primary sources only: each
utility's own pages and documents, its own map services, the Arizona
Corporation Commission's rules. Every link below was opened on 2026-10-20.

## The answer

**No Arizona electric utility publishes distribution hosting capacity.**
Not APS, TEP, UNS Electric, SRP or the City of Mesa, and none of the
co-operatives, districts, municipal or tribal utilities checked (the list
below). DOE's U.S. Atlas of Hosting Capacity Maps (updated July 2025) lists
one Arizona entry, Garkane Energy, as "asset map only", not hosting
capacity, and that map now asks for a sign-in.

So the Circuit step names the utility, says plainly that it publishes no
hosting capacity, and hands the person the route the utility offers instead
and its own pages. Nothing is guessed and no figure is invented. There is
no Arizona hosting-capacity source to wire into the registry today; the
hosting scout looks again on each run.

What Arizona has instead of maps is a rule. The ACC's interconnection rules,
A.A.C. R14-2-2601 ff. (in force 2020-02-25, 26 A.A.R. 473), apply to the
ACC-regulated utilities (APS, TEP, UNS Electric and the co-ops it
regulates):

- **Screen A** (R14-2-2615 A): the generation on a circuit may not exceed
  15% of the circuit's annual peak load, or the "circuit hosting capacity
  limit", whichever is greater. Each utility computes that limit itself.
- **Pre-Application Report** (R14-2-2616): within 21 calendar days, from
  data the utility already has, the total, allocated, queued and available
  capacity in MW of the substation bus or bank and of the circuit likely to
  serve the site. A fee applies only where the ACC approved one in a
  tariff.

The rule text was read from the copy APS links from aps.com/dg
([ArizonaAdministrativeCode.pdf](https://www.aps.com/-/media/APS/APSCOM-PDFs/Residential/Service-Plans/Understanding-Solar/ArizonaAdministrativeCode.pdf),
Supp. 20-1). It was checked against the Secretary of State's current copy
(apps.azsos.gov/public_services/Title_14/14-02.pdf, Supp. 26-3), which
refuses scripted reads and was opened in a browser.

SRP, the cities, the districts and the tribal utilities are not under
those rules (R14-2-2602: a utility subject to the Commission's
jurisdiction).

## Utility by utility

| Utility | EIA id | Publishes hosting capacity | What it offers instead | Its own pages |
|---|---|---|---|---|
| Arizona Public Service | 803 | No | Pre-Application Report under R14-2-2616 (APS's form goes to renewables@aps.com); APS computes circuit hosting capacity inside its own review (Screen A) | [aps.com/dg](https://www.aps.com/dg) · [Interconnection Requirements, rev. 10.0](https://www.aps.com/-/media/APS/APSCOM-PDFs/Residential/Service-Plans/Understanding-Solar/InterconnectReq.pdf) · [Pre-Application form](https://www.aps.com/-/media/APS/APSCOM-PDFs/Residential/Service-Plans/Understanding-Solar/PreAppCustomerForm.pdf) · [Service Areas Viewer](https://apsc.maps.arcgis.com/apps/View/index.html?appid=edc55ca7fa254b528433ef1fe66d72af) |
| Salt River Project | 16572 | No | SRP's own Screen A (the circuit's generation against the minimum hosting capacity of its most limited section), computed by SRP inside its review; no pre-application report; PowerClerk application, SRP solar representative (602) 236-4663 | [Commercial solar installers](https://www.srpnet.com/doing-business/builders-developers-contractors/info-commercial-solar-contractors) · [DG Interconnection Handbook](https://www.srpnet.com/assets/srpnet/pdf/doing-business/builders-developers-contractors/commercial-specifications-guidelines-and-handbooks/distributed-generation-interconnection-handbook.pdf) (revised 2026-04-08) · [Service-area lookup](https://www.srpnet.com/about/service-area-territory) |
| Tucson Electric Power | 24211 | No | Hosting capacity set on the circuit's minimum daytime load over the last 12 months at the substation; Pre-Application Report under R14-2-2616 (renewables@tep.com). TEP's FAQ mentions "DG Saturation Maps"; none is linked | [DGIR requirements](https://www.tep.com/dgir-requirements/) · [Safe solar interconnection FAQ](https://www.tep.com/more-details-about-safe-solar-interconnections/) · [Service territory](https://www.tep.com/service-territory/) |
| UNS Electric | 19728 | No | Hosting capacity set on minimum daytime load; supplemental review under R14-2-2620 ($500, up to 21 days); Pre-Application Report (renewables@uesaz.com) | [DGIR requirements](https://www.uesaz.com/dgir-requirements/) |
| City of Mesa | 12351 | No | An interconnection application to Mesa Electric Utility, accepted before installation, then an agreement and a permission-to-operate letter; commercial systems over 50 kW go through the Large Commercial Solar Program; Mesa Energy Resources, 480-644-3683 | [Solar program](https://www.mesaaz.gov/Utilities/Energy/Electric/Solar-Program) · [Electric service area map (PDF)](https://gis.mesaaz.gov/energy/serviceareas/Electric_Service_Area.pdf) |

SRP's 2026 All-Source RFP points bidders to an "SRP Hosting Capacity Study"
on SRP's OASIS. That study is about SRP's transmission limits and
deliverability for utility-scale generation. It is not a figure for a
site's distribution circuit, so it is not read as one.

### Co-operatives

Every co-op serving Arizona is on the ACC's [list of regulated electric
utilities](https://www.azcc.gov/docs/default-source/utilities-files/regulated-companies/elec-regulated-utility-list.pdf)
(1 July 2024). So the Pre-Application rule is theirs to answer, whatever
their own manual says. None publishes a capacity figure. ArcGIS Online
holds no capacity item for any of them, and none links a GIS server of its
own.

| Co-op | EIA id | ACC no. | Publishes hosting capacity | Notes | Its own page |
|---|---|---|---|---|---|
| Trico Electric Cooperative | 19189 | E-01461A | No | Interconnection Manual approved 13 July 2021: Screen A with no published limit; an optional pre-application meeting | [Solar](https://trico.coop/sustainable-programs/solar/) (sunwatts@trico.coop, 520-744-2944) |
| Sulphur Springs Valley EC | 18280 | E-01575A | No | 2026 Interconnection Requirements (docket E-01575A-24-0246): a Pre-Application Report for a $125 data review fee, asked for on the DG application | [Renewable](https://ssvec.org/sites/renewable/) |
| Navopache Electric Cooperative | 13318 | E-01787A | No | DG Interconnection Manual (May 2022): Screen A with no published limit; an optional pre-application meeting | [DG interconnection](https://navopache.org/dg-interconnection-information-3/) (928-368-5118) |
| Mohave Electric Cooperative | 21538 | E-01750A | No | No map, layer or capacity page | [SunWatts](https://www.mohaveelectric.com/energy-solutions/renewable-energy/sunwatts-renewable-energy-program/) |
| Graham County Electric Cooperative | 7456 | E-01749A | No | No map, layer or capacity page | [Solar](https://gce.coop/energy-efficiency/solar-renewable-energy/) |
| Duncan Valley Electric Cooperative | 5438 | E-01703A | No | Its manual (filed 2021, Decision No. 77347) commits to the R14-2-2616 to 2623 timelines | [Renewable energy](https://dvec.org/renewable-energy-0) (928-359-2503) |
| Columbus Electric Cooperative (NM; serves southeast AZ) | 4071 | E-01851A | No | Its monthly interconnection queue (updated 1 Oct 2026) lists substation and feeder, no capacity | [Net metering and interconnection](https://columbusco-op.org/net-meteringinterconnections) |
| Garkane Energy (UT; serves northern AZ) | 6957 | E-01891A | No | Its public map has lines, transformers and the service area, with no capacity fields (last edited Nov 2022); DOE's atlas lists it as "asset map only". The copy on its website now asks for a sign-in. Its manual says the ACC governs it in Arizona | [Interconnection application](https://garkaneenergy.com/interconnection-application) · [service area map](https://garkane.maps.arcgis.com/apps/View/index.html?appid=60f986f187b24dfe96cb6593b2e8d3af) |
| Dixie Power (Dixie Escalante REA; UT, serves the Arizona Strip) | 40165 | E-02044A | No | No interconnection manual or DG page posted | [New construction](https://www.dixiepower.com/services/new-construction-2/) (866-673-3297) |

Arizona Electric Power Cooperative (the G&T, E-01773A) publishes no hosting
or available capacity for its members' systems either.

### Tribal utilities

These are not under the ACC. The Commission's [electric page](https://www.azcc.gov/utilities/electric)
says it has no authority over utilities run by tribal authorities.

| Utility | EIA id | Publishes hosting capacity | Notes | Its own page |
|---|---|---|---|---|
| Navajo Tribal Utility Authority | 13314 | No | DG Interconnection Policy (2023): systems under 700 kW, studied by NTUA. The study is free for a pre-certified unit exporting at most 15% of a radial feeder's load and adding at most 25% of its short-circuit current | [DG Interconnection Policy](https://www.ntua.com/assets/ntua-distributed-generation-interconnection-policy.pdf) |
| Gila River Indian Community UA | 65261 | No | Solar applications and checklists, under and over 50 kW | [Solar](https://gricua.net/new-service-requirements/solar/) (520-796-0600) |
| Tohono O'odham Utility Authority | 14543 | No | Schedule DG (under 700 kW AC) cites a procedures manual that is not posted | [Electric](https://toua.net/electric/) ((520) 383-2236) |
| Aha Macav Power Service (Fort Mojave; AZ and CA) | 58123 | No | Its staff and engineers plan commercial projects with the customer | [Commercial service](https://ahamacav.com/commercial-service/) ((928) 768-2200) |
| Ak-Chin Electric Utility Authority | 25866 | No | No utility website found; it stays in the public-power group | — |

### Public power, districts, BIA systems and small companies

None of these is under the ACC's rules except Morenci Water & Electric and
Ajo Improvement Company, which are on its list.

| Utility | EIA id | Publishes hosting capacity | Notes | Its own page |
|---|---|---|---|---|
| Electrical District No. 3 (Pinal) | 30518 | No | Up to 2 MW through its Small Generator Interconnection Policy (Fast-Track or Study), 2–20 MW through Study; some need a customer-paid System Engineering Analysis of ED3's ability to take more generation | [Distributed generation](https://www.ed3online.org/accounts-programs/distributed-generation-resources-including-solar) (dg@ed-3.org) |
| Electrical District No. 2 (Pinal) | 15048 | No | No net metering | [Solar](https://ed2.com/resources/solar/) (solarapps@ed2.com) |
| Electrical District No. 4 (Pinal) | 15049 | No | Solar Application Package | [Service](https://ed4.biz/connect-service/) (info@ed4.com, (520) 466-7336) |
| Hohokam Irrigation & Drainage District | 8700 | No | Sells power at retail | [Solar Q&A](https://hohokamthepowerofchoice.com/solar-qa/) |
| Wellton-Mohawk Irrigation & Drainage District | 25060 | No | Power franchise in the Wellton-Mohawk Valley. Its national polygon covers all of Yuma County, so the note says APS is the likelier utility in Yuma | [Solar information](https://www.wmidd.org/solar-information.html) |
| San Carlos Irrigation Project (BIA) | 19604 | No | **No new service, line extension or load since 11 May 2026 unless no other utility can serve** ([public notice](https://www.bia.gov/sites/default/files/media_document/public_notice_new_service_%26_line_ext_requests_final.pdf)); solar 10 kW DC maximum | [Solar](https://www.bia.gov/scip/solar) (scipsolar@bia.gov) |
| Colorado River Agency Electrical Services (BIA) | 3990 | No | Serves the Colorado River Indian Tribes' reservation (Parker). Its national polygon is far larger than the reservation | [Electrical services](https://www.bia.gov/services/colorado-river-agency-electrical) |
| Page Utility Enterprises | 14373 | No | Solar Interconnection Agreement | [Services and rates](https://pageutility.com/services-rates/) |
| City of Safford | 16538 | No | Electric Division handles solar and net metering | [Electricity](https://www.cityofsafford.us/227/Electricity) ((928) 432-4221) |
| Town of Thatcher | 18805 | No | DG guidelines on its utilities page | [Utilities](https://www.thatcher.az.gov/residents/utilities-billing) |
| Town of Wickenburg | 20618 | No | **No generation or storage in parallel with the town's grid**: only a break-before-make transfer switch (its non-parallel interconnect agreement, rev. 2022) | [Agreement (PDF)](https://wickenburgaz.gov/DocumentCenter/View/7706/Wickenburg-Grid-Solar-App-and-APS-Agmt-combined) |
| City of Williams | 56535 | No | Solar Policy | [Building department](https://www.williamsaz.gov/departments_and_services/building_department) |
| Town of Fredonia | 6753 | No | Ask its utilities office | [Utilities](https://www.fredoniaaz.gov/utilities) |
| Morenci Water & Electric | 12919 | No | ACC-regulated (E-01049A): a Pre-Application Report is the route. No solar page | [Morenci Water & Electric](https://www.morencitown.com/MWE) (MWESupport@fmi.com) |
| Ajo Improvement Company | 176 | No | ACC-regulated (E-01025A): a Pre-Application Report is the route. No website of its own | — |
| Electrical District No. 8 (Maricopa) | 5729 | None found | No website reached | — |
| Buckeye WC&DD, Tonopah ID, Harquahala Valley PD, Ocotillo WCD, Maricopa Water District, McMullen Valley WC&DD | 2469, 19016, 8139, 13961, 40355, 12191 | No | Mostly irrigation pumping power. The national layer draws them as region-sized polygons, so they stay out of the registry and read as water districts, never as a point's utility. Ocotillo's DG applications go through ED3 | — |

## Whose wire is it? (Mesa, and the Phoenix metro)

The national territory layer (EIA-861 / HIFLD) returns twelve polygons at 29
W Main St: the City of Mesa, SRP, and ten county-sized stand-ins, federal
systems and water districts. SRP's own boundary encloses APS and City of
Mesa islands (its 1955 agreement with APS, its 1954 agreement with the
City of Mesa). So the public layers alone cannot say who serves downtown
Mesa.

Each utility's own boundary map, and whether OMEGA may ask it:

| Map | Owner | Terms | Used |
|---|---|---|---|
| Electric Service Area, Explore Mesa map service, layer 13 (`gis.mesaaz.gov/mesaaz/rest/services/Geocortex/GCX_ExploreMesa/MapServer/13`) | City of Mesa GIS | A public map service of the city, with no licence text on the layer. The city's [open-data terms](https://data.mesaaz.gov/stories/s/Terms-of-Use-page/2dcd-j2nx/) allow reuse with credit; its [website policy](https://www.mesaaz.gov/government/policies-disclaimer) is non-commercial; neither names this service | **Yes,** pending counsel. Asked one point at a time with its polygon (`SERVICE_AREAS` in `api/_lib/utility-territory.js`), never copied, the city named as the source, its PDF map linked |
| SRP_PSA (SRP's ArcGIS Online) | SRP | For SRP's own web app only: showing the boundary needs SRP's written consent, and the data may not leave SRP | **No.** A person gets SRP's own address lookup |
| APS Service Territory, CC&N (APS's ArcGIS Online) | APS GIS Solution Delivery | Public reference for use inside ArcGIS Online only; no transfer or export without APS's consent | **No.** A person gets APS's own Service Areas Viewer |
| APS DG_Locations | APS | Carries meters and addresses | **Never** (customer data) |

The City of Mesa's layer has two polygons, 5.39 and 0.03 square miles. The
city's own figure is about 5.5 square miles around and including
downtown. The point at 29 W Main St is 1,523 m inside it.

The rule (`utility-territory.js` `SERVICE_AREAS`, `ISLANDS`):

- **40 m or more inside** the city's area: the City of Mesa serves the
  point. The answer is confident, and SRP and the stand-ins read "the point
  is inside the City of Mesa's own electric service area".
- **Within 40 m of its edge:** the City of Mesa leads, but nothing is
  confident. A geocoded address can land on the wrong side of a boundary
  street, so the bill decides.
- **Outside** (east Mesa, Riverview): the city's stand-in polygon is weak,
  and SRP leads. SRP's caution now names APS's islands alone.
- **The city's map does not answer:** the old answer stands (the city's
  own utility beside SRP, the bill decides). The note says the map did not
  answer, and the answer is never cached.

## What the Circuit step shows

At 29 W Main St, Mesa (live, 2026-10-20):

- **City of Mesa** · publishes no hosting capacity.
- **Who serves this point:** City of Mesa, inside its own electric service
  area (the city's map). It publishes no hosting capacity. Links: the
  city's solar interconnection page and its service-area map.
- **Also on the territory maps, not this point:** Salt River Project and
  the stand-ins, each with its reason (folded away).
- **Needs a study:** no figure is judged as if it were published.

In Phoenix the answer is Arizona Public Service, with its Pre-Application
route and its Service Areas Viewer. In Tucson it is Tucson Electric Power,
the same way. Where SRP leads, the answer is not confident, because of
APS's islands; the list gives SRP's lookup, and the bill decides.

## Not built, and open

- **Terms:** legal sign-off on each `termsNote` before relying on these
  reads commercially, as for every registry entry. The City of Mesa's GIS
  layer carries no licence text, and the city's two policies differ
  (open data: reuse with credit; website: non-commercial). Ask the city or
  counsel which governs before relying on it commercially.
- **Western Arizona:** the national layer draws Wellton-Mohawk over all of
  Yuma County and the Colorado River Agency far past the reservation. So at
  Yuma the answer names Wellton-Mohawk beside APS, unconfident, and its note
  says APS is the likelier utility in the city. A service-area boundary
  from either would settle it; none was found published.
- **SRP and APS boundaries:** where the national map's SRP polygon covers
  a point, an APS island inside it cannot be told apart, so SRP is never
  named there with confidence. Settling that needs SRP's or APS's written
  consent to query its own layer.
- **A Pre-Application Report** is a request a person makes. OMEGA does not
  file one and does not read its answer back. A report's figures could be
  typed onto the project as the utility's own answer: a future step.
