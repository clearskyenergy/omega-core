# Solar against HelioScope

Read 2026-10-18 from public pages only. HelioScope is Aurora Solar's commercial design product. The engine built beside this note lives in `api/_lib/solar-*.js` and is asked for by Site Plan (`editor-v2.html`) through `POST /api/solar-design`. Site Map (`editor.html`) is unchanged.

## What HelioScope does

Sources are the help center, the pricing page, and one review that quotes that page. Where a dollar figure did not render on the official page, it is marked as a secondary reading.

### Field segments, keepouts, setbacks

A design starts as a field segment: the designer traces the roof or the ground, picks a module, and sets azimuth off a building edge. Keepouts are traced objects. A keepout with a height casts a shadow. The commercial guide uses a perimeter setback of 4 ft or 6 ft by building size, and a walkway every 150 ft on a large roof. Snowy sites may use 10 ft.

- Mechanical layout and field segments: [3. Mechanical Layout](https://help-center.helioscope.com/hc/en-us/articles/4419952640531-3-Mechanical-Layout), [Field Segment Overview](https://help-center.helioscope.com/hc/en-us/articles/7835324941203-Field-Segment-Overview)
- The commercial sequence, including the 4/6 ft setback and the 150 ft walkway: [Step by Step Commercial Design](https://help-center.helioscope.com/hc/en-us/articles/4465778056595) (updated 8 May 2026)

Independent tilt on a fixed-tilt field is a Pro feature. Basic uses one tilt for the segment.

### Racking

[Racking types](https://help-center.helioscope.com/hc/en-us/articles/7835773340307-Racking-types) (8 July 2025):

| Type | What they model |
| --- | --- |
| Fixed tilt | Rows on a flat plane. They shade each other. Open back, so they run cooler. A row spacing of 0 is allowed and produces a large shade loss. |
| Flush | Modules in the roof plane. No row-to-row shade. Less ventilation, higher temperature loss. |
| East-west | A racking choice in the same menu. |
| Carport | Its own racking type. |
| Single-axis tracker | Premium. The help page says to contact sales. The pricing page puts trackers on Enterprise. |

### Row spacing and GCR

[Field Segment Overview](https://help-center.helioscope.com/hc/en-us/articles/7835324941203-Field-Segment-Overview) (29 May 2026) defines ground coverage ratio as module area divided by the surface the modules cover, and offers three linked spacing inputs: span/rise, that ratio, and a Time of Day window. The commercial guide's usual window is zero shade from 10:00 to 14:00 on the winter solstice. A field segment can also cast shade on another segment when that switch is on. Keepouts with a height drop modules that are shaded in the chosen window, unless the designer turns that off and uses the shade heatmap instead.

### Azimuth and tilt

Azimuth is set from a building edge (degrees clockwise from north, south = 180). Tilt is a racking input. Searching tilt independently of the roof plane is Pro.

### Modules and inverters

The compare table lists a 50,000-component module and inverter library. Electrical design picks an inverter and fills quantity from a target DC/AC of 1.25. SolarEdge needs an optimizer. PAN files can be uploaded. The CEC list is the public source those libraries start from; HelioScope also takes manufacturer files.

### Stringing, combiners, voltage drop, one-line

[4. Electrical Design](https://help-center.helioscope.com/hc/en-us/articles/4419953067411-4-Electrical-Design) (23 August 2026) and [Stringing in HelioScope](https://help-center.helioscope.com/hc/en-us/articles/8198326521491-Stringing-in-HelioScope):

- String length comes from ASHRAE design temperatures, or from a number the designer types.
- Routing is along the racking or up and down it. Dual-MPPT is supported.
- Combiners are optional, sized by pole count. A recombiner is optional.
- The percent next to a conductor is voltage drop at STC from the drawn length and the conductor resistance. The commercial guide tells the designer to hold DC and AC drop under 2%.
- Moving an inverter or a combiner redraws the wires.
- The single-line is a separate view of that electrical design.

### Shading

[Shade Modeling](https://help-center.helioscope.com/hc/en-us/articles/7899937559443-Shade-Modeling) (8 July 2025):

1. Row-to-row, from sun angle and cell strings. For landscape silicon, the first sixth of the module takes out a third of the direct beam. Diffuse is reduced by the sky the front row blocks.
2. Obstructions, hour by hour. A shaded module loses direct beam and keeps diffuse. Mismatch on top of that is described as about 0.5× to 2× the shade loss when the array has no optimizers.
3. One horizon file per condition set (azimuth and elevation). Below the horizon the whole array loses beam. Horizon shade does not add mismatch.

LIDAR-assisted modeling and AI obstruction detection are Pro. The shade report gives monthly solar access, total solar resource fraction, and tilt-and-orientation factor by field segment.

### Irradiance, temperature, and the loss tree

[HelioScope vs. PVsyst](https://help-center.helioscope.com/hc/en-us/articles/4465905757843) (8 July 2025):

- Same family of equations as PVsyst. DNV GL (then BEW) found the two within 1% at each step on the cases they compared. HelioScope works module by module; PVsyst works array by array.
- Default cell temperature is Sandia. "Diffusion Model" is the switch that lines up with PVsyst, and it is off by default.
- Transposition is selectable in the condition set. Perez is the model PVWatts V5 and the usual PVsyst setup share.
- Wiring loss is hourly resistance and current. PVsyst uses a derate.
- Mismatch is computed from the modules. PVsyst uses a derate.
- There is no separate light-induced degradation term. They tell the user to fold it into soiling.
- IAM is one coefficient (b0 = 0.05), called Reflection on their loss table. PVsyst's IAM is the same idea.
- Azimuth: south is 180°. PVsyst's south is 0°.

The loss table they line up with PVsyst is irradiance, shade, reflection, soiling, nameplate, temperature, mismatch, wiring, inverter, and AC.

### 8760, P50, P90

[Creating a P50 and P90](https://help-center.helioscope.com/hc/en-us/articles/8307116250003) (14 July 2026):

- A TMY file is the P50 year. Every plan can produce P50.
- P90, P95, and P99 are Pro and Enterprise. The condition set takes weather variability and system variability (module parameters, inverter efficiency, soiling mismatch, degradation, and a custom term). The result is a sigma.
- The same article says a single-year or custom file will not produce P90, P95, or P99, because those values come from multi-year weather. Outside the US their multi-year sets are incomplete; they point at NSRDB (free, Americas and India) and at paid global sets.
- They point at a DNV accuracy study for the claim that P90, P95, and P99 stay as close to PVsyst as the P50 did, on the order of 1% on the projects in that study. That claim is theirs. This engine does not repeat it.

### Reports, condition sets, price

A condition set holds weather, shade (one horizon), bifacial settings, probability, soiling, and the temperature model. One design can be re-run under another set.

Reports: system summary, loss tree, monthly and 8760 production, shade, and the single-line. CAD export is on the compare table. Pro adds financials and a sales proposal.

[Pricing](https://helioscope.aurorasolar.com/pricing/), retrieved 2026-10-18:

| Plan | What the official page showed | What it gates |
| --- | --- | --- |
| Basic | $159 per user per month, or $1,620 per year (15% off). 1 user. 10 projects a month, 120 a year. | Roof, carport, ground, storage design, designs to 1.25 MW DC. They state accuracy within 1% of PVsyst. |
| Pro | The feature list rendered. The dollar amounts did not render in the page text retrieved that day. | LIDAR, AI obstructions, independent tilt, parcel boundaries in some regions, financials and proposals, P90/P95/P99, designs to 5 MW DC. Storage modeling is listed again here. |
| Enterprise | Custom. | Unlimited users, single-axis trackers, PVsyst export, API, SSO, designs to 30 MW DC. |

A SurgePV review checked 21 September 2026 reads the same pricing page as Pro at $259 per month and $2,640 per year. That figure is the review's reading. It is not a number this retrieval pulled off the official page. Treat it as secondary until someone reads the rendered price in a browser.

The compare table also lists, on the higher tiers as marked: a 50,000-component library, CAD export, single-lines, 8760, shade reports, a utility-rate editor, and financial tools.

## Parity, where we are ahead, and what is still open

| Capability | HelioScope | This build |
| --- | --- | --- |
| Field segment, setback, keepout | Traced segment, perimeter setback, keepouts with height | Drawn boundary, setback inset, keepouts. Modules whose corners fall in a keepout are left out. |
| Fire paths | 4 or 6 ft perimeter, walkway every 150 ft | Roof perimeter is the setback (4 ft, 6 ft when the span is over 250 ft). An aisle of that width every 150 ft along the row. |
| Fixed tilt, flush, east-west, carport, tracker | All five. Tracker is Enterprise. | All five, on any signed-in workspace. Flush and east-west do not use the solstice pitch. |
| Solstice row spacing | 10:00–14:00, winter solstice, zero shade | Same window. GCR = chord / pitch from the profile angle. Trackers are sized off a 60° face and held between GCR 0.28 and 0.45, with backtracking. |
| Tilt and azimuth search | Pro, and only as independent tilt | Fixed-ground searches tilt and azimuth on the 21st of each month when the drawing does not set them. A roof keeps the tilt it was given. |
| Module and inverter library | About 50,000, plus PAN upload | Eight CEC modules and six CEC inverters from the public NREL SAM library, read 2026-10-18. Coefficients stay on the server. The full 21,000-row CEC file is not in the repo. |
| Stringing | ASHRAE temperatures, or typed. Target DC/AC 1.25. | NEC 690.7(A) Voc at the cold hour of the weather year, and a hot Vmp check against the inverter's minimum power-point voltage. Target DC/AC 1.25. An impossible window is refused. |
| Combiners, home runs, voltage drop, one-line | Drawn wires, drop at STC, graphical single-line | Combiner pole count, copper from NEC Chapter 9 Table 8 and Table 310.16, 2% drop target, a text one-line, and those conductors on the bill of materials. The graphical one-line stays on the existing Site Plan hook. |
| Near shade | Module-level, diodes, diffuse sky blocked by the front row, LIDAR on Pro | Row-to-row beam from the profile angle. Landscape uses their diode rule (first sixth → one third of the beam). Obstruction rays from real module samples. Diffuse is left on. A horizon list `{az, alt}` is the far-shade input. |
| 3D and terrain | LIDAR scene on Pro | The 3D view on this branch did not expose a mesh this run could read (agent bc-97528f4e was not available). The engine takes obstruction height and a horizon list whenever that view writes them. |
| Transposition and IAM | Perez available. IAM is b0 = 0.05. | Perez 1990, all-sites composite, with PVWatts V5's isotropic sky from zenith 87.5° to 90°. Cover IAM is a single glass slab, n = 1.526, normalized at normal incidence. |
| Temperature | Sandia by default. PVsyst diffusion is a switch. | Sandia Array Performance Model by racking (open, roof, close-mount). A PVsyst Uc/Uv cell temperature is available as a switch. PVWatts V5 uses Fuentes. These runs use Sandia, and the report says so. |
| Loss tree | Shade, reflection, soiling, temperature, mismatch, hourly wiring, inverter, AC. LID is folded into soiling. | Shade (geometric, on beam), IAM, soiling, temperature, mismatch, LID, nameplate, connections, wiring from the voltage drop, snow, inverter efficiency and clipping, availability. Defaults match the PVWatts categories whose product rounds to 14%. |
| 8760 and weather | TMY, NSRDB, and paid global files | Hourly 8,760. A caller may pass a weather year. With none, the engine builds a clear-sky year scaled by a latitude-band clearness index. `developer.nrel.gov` did not resolve in this environment, so there is no live NSRDB or PVWatts download yet. The report says the year is synthetic. |
| P50 / P90 | P50 on every plan. P90/P95/P99 on Pro, from multi-year weather plus a variability sigma. They cite DNV near 1%. | P50 is the year. P90, P95, and P99 are a normal distribution. Default sigma is the root-sum-square of 4% weather, 3% model, and 1% soiling (about 5.1%). It is a screening figure on one year. It is not a multi-year file and it is not the DNV comparison. |
| Design report | Summary, losses, monthly, 8760, shade, single-line, proposal on Pro | Summary, loss tree, monthly production, shading by row, bill of materials, wiring and the text one-line, price, and the assumptions. Derived from the drawn boundary. |
| Condition sets | Saved weather, shade, bifacial, probability, soiling | One default loss set per run. The caller can pass hours, albedo, a temperature model, and a variability sigma. There is no saved library of condition sets yet. |
| Price | Their own subscription. Basic $159 / $1,620. Pro dollars did not render here. | Installed $/Wdc from `api/_lib/pricing.js` `quote()` when that module is present (PR #343, surface `editor-v2`). On this branch the module is absent, so the same call is filled from DOE Solar Photovoltaic System Cost Benchmarks, Q1 2025, Table 2, 2024 dollars: residential $2.95/W, commercial $1.98/W, utility $1.12/W. A carport has no free price and stays blank. A tracker uses the ground size band. The labor index is quote()'s region and applies to labor lines. Table 2 does not separate labor, so the all-in PV price is not multiplied by the index. |
| Subscription | A separate product, 10 projects a month on Basic and Pro, tracker and P90 behind higher plans | A signed-in workspace member runs it. No second seat and no project cap in this route (20 designs a minute per caller, as a rate limit). |
| BESS, EV, grid, value, funding | Storage design is on Basic. The rest of a site is another product. | The same drawing already places storage, charging, and compute, and already writes the value-stack report, the ROM, the permit set, and the funding hand-off. The solar report is one more output of that drawing. |
| Permit set | CAD export and a single-line. Permit sheets are usually a CAD seat on top. | The Site Plan permit-set hook is the same drawing. This report does not draw the sheet. |

### Where this is ahead of them

- One drawing holds the array, the battery, the chargers, the grid check, the value stack, the ROM, and the funding hand-off. HelioScope is a solar-and-storage design seat. The rest of the project lives somewhere else.
- Trackers, P90/P95/P99, and a tilt search are not a higher subscription. The P90 is a screening sigma, which is a weaker number than their multi-year Pro report. The access is wider. The evidence is thinner. Say that to a lender.
- The price is the shared library's regional quote, with DOE Table 2 underneath, rather than a second solar price book. Labor index rides along for labor lines.
- Stringing, voltage drop, and conductor size land on the bill of materials in the same run as the energy.
- The engine is server-side. The browser file posts the boundary and paints the report.

### What is still open

- LIDAR, a 3D shade mesh, and AI keepouts.
- The other ~21,000 CEC modules, PAN upload, and optimizers / microinverters.
- ASHRAE design temperatures. Today the cold hour is the coldest hour of the weather year in use.
- A real NSRDB or PVWatts year. The hook is `hours[]` on the request. The key was not reachable here.
- Bifacial energy. The CEC rows are marked bifacial. The energy model is monofacial.
- Module-level diode shade and the diffuse sky the front row blocks. Landscape uses their one-third rule. Portrait shade is the shaded fraction of the beam. Diffuse is not removed.
- A graphical single-line and a permit sheet drawn from these strings. The text one-line is in the report. The sheet hooks already exist and are empty.
- Saved condition sets, snow by location, and a degradation schedule taken out of later years. Year 1 includes the default light-induced degradation. The 0.4%/year rate is stated and is not removed from year 1 again.
- A carport price and a tracker price that are not the ground-mount size band.
- Bankable P90. Do not tell a lender this matches DNV or PVsyst within 1%.

## Validation, this run

`node scripts/tests/tsolardesign.js`.

| Check | Result | Tolerance |
| --- | --- | --- |
| 21 June 2021 declination | 23.437° | 0.5° of 23.44° |
| Equator, 21 June, solar noon altitude | 66.56° | 0.5° |
| 33.45°N, 21 December, solar noon altitude | 32.76° | 0.5° of 33.11° |
| NREL SPA sample, 17 October 2003, 12:30:30 MST, 39.742476°N, 105.1786°W | Zenith 50.128° (Δ 0.016°), azimuth 194.343° (Δ 0.002°) against 50.11162° / 194.34024° | 1° allowed. NOAA/Meeus, not the full SPA with ΔT. |
| Perez, tilt 0, zenith 0 | POA = DNI + DHI | 0.5 W/m² |
| Perez, one tilted hour, against a second transcription of the 1990 all-sites coefficients | 888.9 vs 888.9 W/m² | 0.5% |
| PVWatts V5 inverter | 0 W at 0 W DC. Pac0 at ζ = 1 and above. Nominal efficiency just under the clip. | The manual's curve |
| Default loss product | 14.08%, which rounds to 14% | PVWatts help: soiling 2, shade 3, mismatch 2, wiring 2, connections 0.5, LID 1.5, nameplate 1, availability 3. Snow and age are 0. |
| Phoenix clear-sky × kt year, 1 kW DC, tilt 33°, azimuth 180°, open rack, Sandia cell temperature, PVWatts inverter, DC/AC 1.2, the 14% losses, no geometric shade | **1,758.4 kWh/kW-yr** | Band 1,400–2,200. This is not a station-matched PVWatts or SAM run. Same equations, different weather, Sandia instead of Fuentes. A few percent apart from the PVWatts website is expected even after an NSRDB year is wired in. |
| June vs December | June is higher | — |
| Layout | Modules respect the setback. A keepout reduces the count. A roof wider than 250 ft cuts a 6 ft aisle and loses modules. Solstice GCR at 33.45°N, 25° tilt is 0.610, under the noon-only GCR of 0.643. | — |
| Strings, Jinko JKM640N and CPS 125 kW, Phoenix year (−9.3°C cold) | 20 modules, the only length inside 20–20. String drop 0.8%. At −10°C and a 70°C cell the same pair is refused. | NEC 690.7 and the inverter window |
| Shade | A 40 ft object south of a row on 21 December noon takes that row's beam from 0% to 100% in that hour. | — |
| Price | 500 kW roof → $1.98/Wdc. Carport → no price, sent to `quote()` as canopy. | DOE Table 2 |

A 12.8 kW fixed-tilt example with a 20 ft keepout on the same Phoenix year returned 1,538.6 kWh/kW, 14.5% beam shade, and $2.95/W because it is under 25 kW (the residential line). The field places 22 modules. A string on the CPS 125 kW inverter is exactly 20 at that year's cold hour, so 2 modules are left unstrung. A smaller field that cannot fill one string is refused.

## Decisions for Thomas

1. **The engine stays on the server.** Site Plan sends the boundary and paints the report. The drawing's existing table fill is still the picture on the canvas. The report is the module layout, the strings, and the year. Switching the canvas over to those module positions is a later change, on purpose, so it does not collide with the Site Plan work already in flight.

2. **Price goes through `quote()`.** When `api/_lib/pricing.js` is on the branch, that is the only price. Until then the fallback is the same DOE Table 2 figures that library cites, same request body (`surface: 'editor-v2'`). The labor index is not applied to the all-in PV price, because Table 2 does not split labor out. It is shown beside the price when the library returns it.

3. **Weather is a free clear-sky year until an NREL key is in the deployment.** Passing `hours[]` replaces it. The report says which one ran.

4. **P90 is a screening Gaussian, about 5.1% sigma.** It is on every design. It is not the number to send a lender, and it is not the DNV 1% claim.

5. **Design temperatures are the weather year's own extremes.** ASHRAE stations are not bundled. The report names the temperature it used.

6. **Carports are unpriced.** No free public installed price was found that the shared library accepts. The line stays blank.

7. **Far shade is a horizon list.** Obstruction height comes off the drawing (15 ft when the drawing has none, and the dialog says so). The 3D agent was not readable from this run.

8. **HelioScope Basic is $159 / $1,620 on the official page.** Pro's dollar amount did not render in the text retrieved on 2026-10-18. A review dated 21 September 2026 reads that page as $259 / $2,640. Confirm the Pro price in a browser before anyone repeats it.

9. **Do not claim we are within 1% of PVsyst.** The equation checks against PVWatts V5 hold. The annual number is a synthetic desert year at 1,758 kWh/kW for a 1 kW open-rack array. Wiring an NSRDB year is the next measurement, not a wording change.

10. **29 W Main is a validation site, not a traced roof.** The city footprint layer has nothing on the parcel. The roof in the run is the published 7,000 sq ft retail plate. A canopy on the whole lot is the design a person would trace from today's imagery. Neighbor heights are assumptions. The kWh is the clear-sky year. See the section below.

## 29 West Main Street, Mesa

Parcel 138-41-024, 29 W Main St, Mesa, AZ 85201. Maricopa assessor, read 2026-10-18: owner DT MESA HOLDCO LLC, land 20,367 sq ft. The ring used here is that parcel in local feet, about 131 ft east-west by 156 ft north-south, origin at the southwest corner (33.414488°N, 111.832772°W). The City of Mesa building-footprint layer (BaseMap_Public, layer 22) has no footprint on the parcel and publishes no heights. The bank that stood here was demolished. East Valley Tribune, 26 July 2023, described about 7,000 sq ft of ground-floor retail and 21 parking spaces for a project that was not built. That plate, on the Main Street frontage, is the roof in this run. It is not a roof traced from a photograph.

Neighbors that can throw a shadow, from the same city layer, as bounding boxes: 21 W Main (east, on the property line), 37 W Main (about 22 ft west), Heritage Academy at 32 S Center (southeast, not due south), and 30 W Main across the street (the right-of-way is about 131 ft). Storefronts are taken as 18 ft. Heritage is run at 24 ft and again at 40 ft, because that height is not published. The roof array is 16 ft to the top of the module. The canopy is 14 ft.

The comparison is HelioScope's published commercial recipe on this geometry, not a file from their application. No HelioScope login was used. Their guide draws a low-tilt fixed roof with a 4 or 6 ft setback and row spacing that is unshaded from 10:00 to 14:00 on the winter solstice, a carport as its own racking, a DC/AC target near 1.25, and voltage drop held under 2%. Shade removes beam and leaves diffuse. A TMY is their P50. Pro adds a multi-year P90. This run uses the same layout rules and this engine's clear-sky desert year.

| | Roof, the 7,000 sq ft plate | Parking canopy, south of a 24 ft drive | Canopy on the whole open lot |
| --- | --- | --- | --- |
| Racking | Fixed tilt, open-rack temperature, 10° south, 4 ft setback | Carport, 7° south, 5 ft setback, 14 ft clear | Same carport on the assessor ring |
| Modules | 124 × Jinko JKM640N, all strung | 180 × Jinko JKM640N, all strung | 420 modules, 268.8 kW DC |
| kW | 79.4 DC / 66 AC, DC/AC 1.20 | 115.2 DC / 132 AC, DC/AC 0.87 | — |
| Spacing | GCR 0.778, pitch 10.0 ft. That is 21 December, 10:00–14:00. The ground-mount cap of 0.55 is tighter than this and was not used. | GCR 0.831, pitch 9.4 ft, under the 0.9 carport cap | Same spacing |
| Strings | 5 of 21 and 1 of 19. Window 19–23 on the Sungrow SC60HV at this year's cold hour. | 7 of 23 and 1 of 19. Two inverters. | — |
| Beam shade, neighbors on | 8.7%. Front row 0.4%. The three rows behind it 11.5%. | 9.5%. Front row 0.1%. The back row 11.8%. | 10.8% |
| Neighbors off | 8.6%, 126,331 kWh | 9.3%, 171,719 kWh | — |
| Year-1 AC | 126,148 kWh, 1,590 kWh/kW. P90 117,905 kWh. | 171,519 kWh, 1,489 kWh/kW. P90 160,311 kWh. | 395,107 kWh, 1,470 kWh/kW |
| Price | $1.98/Wdc, commercial | No published carport price | No published carport price |

Roof plus canopy is 194.6 kW DC and 297,667 kWh, 1,530 kWh/kW.

What matches HelioScope's recipe: the tilt, the azimuth (180 is south, as they define it), the 4 ft roof setback, the solstice window, the carport as its own rack, and beam-off / diffuse-on shade. The front row is essentially open. The shade on the rows behind it is the array shading itself.

What does not match a HelioScope download:

- **Neighbors barely touch the year.** They add 0.1 point of beam shade on the roof (183 kWh) and 0.2 point on the canopy (200 kWh). Raising Heritage Academy from 24 ft to 40 ft adds another 0.2 point and 285 kWh on the canopy. The school sits southeast of the lot, the stores sit east and west, and the building across Main Street is a street-width away. A HelioScope model with LIDAR heights would move these by feet, not by a different answer. The shade that matters is the row pitch.
- **The canopy DC/AC is 0.87, not 1.25.** One Sungrow SC60HV (CEC measured 66 kW, MPPT 700–1,300 V) on 115 kW would be 1.75. The sizer adds a second unit so the ratio stays at or under 1.25, and lands at 0.87. The roof, at 1.20, is the one that lands near the target. HelioScope would pick an inverter closer to 92 kW out of the full CEC list. The 50 kW class unit checked for this site does not open a string window on the Jinko 640 at Mesa's cold hour.
- **Energy is not their TMY.** 1,590 and 1,489 kWh/kW are this clear-sky desert year. HelioScope's P50 would be a Mesa TMY, and a Pro P90 would be multi-year weather, not the 5.1% Gaussian used here (P90 is about 6.5% under P50). Do not quote these kWh as HelioScope's.
- **There is no roof on the imagery.** The 7,000 sq ft plate is the published retail plan. The whole-lot canopy is what a designer can trace today: 268.8 kW, 1,470 kWh/kW, 10.8% beam shade, 395,107 kWh. It is larger because it covers the drive and the retail footprint.

`node scripts/tests/tmesamain.js` locks these figures. A change in the weather year or the spacing rule has to update this section with it.
