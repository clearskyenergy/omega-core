# Project pricing

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

The preview book is version **2026.10**, read **2026-10-18**. It does not replace a live total. Site Map still costs a drawing in `api/_lib/editor-cost.js` through `POST /api/cost-rollup`. Omega Prime still costs a screen in `api/_lib/cost-model.js` through `POST /api/price-site`. The preview is `POST /api/project-pricing`. It returns library dollars only when the body sets `preview: true` or `version` / `pricingVersion` to `2026.10`, or when the server has `PRICING_LIBRARY=2026.10`. That environment variable is also the only switch that makes `replacesLive()` true. It is unset. Nothing in the live doors was changed.

One interface, `api/_lib/pricing.js` `quote()`. Site Map, Prime, Quote Desk, and editor-v2 each have an adapter (`fromSiteMap`, `fromPrime`, `fromQuoteDesk`, `fromEditorV2`). A line carries `price`, `unit`, `source`, `url`, `published`, `dollarYear`, `read`, `regionFactor`, `confidence`, and `status`. A total adds a line only when it is sourced and `inTotal`. A range and a `needs source` line are shown and not added.

`npm run validate:data` runs the four reference projects and the read-date clock (`api/_lib/pricing-benchmarks.js`, called from `api/_lib/analysis-checks.js`). A total outside its cited band is an error. A read older than 45 days is a warning. A read older than 180 days is an error. The clock is the day the source was read, the same rule the incentive book uses. The publication date of an annual NREL edition is stored on the line and is not that clock.

## Where a project is priced today

| Surface | What it costs | Where the dollars are | Date on the book |
|---|---|---|---|
| Site Map Estimate (Summary, Construction Cost, BOM, Electrical Estimate) | Placed equipment, benchmarks, contingency | `api/_lib/editor-cost.js` via `POST /api/cost-rollup` | Benchmark comment updated with the Q1 2025 PV points (page note 2026-10-14). Storage split is the NREL 2025 update's unadjusted power term. |
| Site Map cost sheet blanks | Placeholders only. A blank solar field is filled on the server. | `editor.html` `#ce-pv-wdc` placeholder `auto`, `#ce-bess-kwh` placeholder `241`, `#ce-bess-kw` placeholder `379`. Contingency input defaults to 10. | Same book |
| Value Stack | Revenue, not capital cost | `api/_lib/value-stack.js`. A generic battery cost, when the stack needs one, is `cost-model.js`. | Planning rates, no citation |
| Solar-to-storage sizing and the pro forma | The caller types the battery cost. The page default is not the Site Map book. | `proforma.html` `bess.capexPerKwh` 400, `capexPerKw` 250. Compute pro forma battery field placeholder 550. `scripts/test-bess-sizer.js` uses 400/250 and 250/150 as fixtures. | Typed inputs, undated |
| Omega Prime | The planning cost model | `POST /api/price-site` | File states the rates are internal planning rates. No line carries a source or a date. |
| Quote Desk (`rfq.html`) | Does not price. It carries the editor's BOM. | The preview adapter reads battery, solar, and charger quantities off those lines. | — |
| editor-v2 | Does not price. Branch `cursor/editor-v2-cad-c186` (`editor-v2.html`, commit `149af2f`) has no estimate. | The preview adapter takes the same quantities Site Map posts. | — |
| Portfolio / compute model | Uses a site's stored run and the compute engine. Skid price is a recorded ClearSky figure, not this book. | `api/_lib/omega-core.js`, `api/_lib/site-model.js` | Skid $639,000 on 2026-10-13; controller $125,000 on 2026-10-13 |

## Live unit prices

These stay on the live book. The preview does not copy a row that has no public source.

### Site Map benchmark (`editor-cost.js` `BENCH`)

| Item | Value | Source as written on the live book | Date |
|---|---|---|---|
| Residential PV | $2.95/Wdc | DOE/NREL Q1 2025 modeled market price, 8 kW, 2024 USD | Q1 2025 benchmarks; page note 2026-10-14 |
| Commercial PV | $1.98/Wdc | Same, 250 kW | Same |
| Utility PV | $1.12/Wdc | Same, 100 MW single-axis | Same |
| Canopy PV | $2.75/Wdc | "Industry range $2.50–$3.50/Wdc". No report, table, or date. | None |
| Battery energy | $241/kWh | NREL utility-scale storage 2025 update | 2025 report. The live code does not name the PDF. |
| Battery power | $379/kW | Same report's unadjusted fit. The report then subtracts $7/kW. | Same |
| Contingency | 10% of the subtotal | Sheet default `SHEET.contPct`. Applied on top of the benchmarks. | Undated |
| Populated compute pod | $30,000/kW, band $20,000–$40,000 | "Operator figure, Sep 2026" | Sep 2026 |
| Generation | SOFC 6500, gas genset 1200, recip 2000, large recip 1800, turbine 1500, large turbine 1000, wind 1900, other 1500, all $/kW | "EIA AEO2025 capital cost assumptions, rounded; BoP excluded". No table row is stored. | AEO2025, rounded, undated beyond the edition |

Sector rule on the live book: canopy is the canopy rate; under 25 kW residential; under 20 MW commercial; otherwise utility.

### Site Map equipment and sheet defaults

| Item | Value | Source | Date |
|---|---|---|---|
| Unpriced battery container | $85/kWh equipment, install 55% of equipment | Comment: flat container rate. No citation. | None |
| Catalog keys | Gotion, Autel ESS 256 at $180,000, Pytes, CleanCell R60 at $24,000 | Carried over from the page catalog `eqcost` | R60 noted 2026-10-13 |
| Pad, disconnect, meter, bollards, j-box, panel | $4,800, $3,200, $3,850, $600, $850, $18,500 | Sheet defaults. Transformer and misc default to 0. | None |
| Conduit | RMC mat $11.50/ft labor $35; EMT mat $8 labor $35; BMS mat $3.50 labor $18; PVC-UG mat $9 labor $28 | Sheet defaults. Conduit is estimated and **not added** to the Run total. | None |
| EMS | $12/kWh-yr and $4,500 setup | Sheet defaults. Charged only when EMS is on. | None |
| Data-center electrical ROM | 1,500 kVA transformer $185,000; switchgear $800,500; microgrid control $325,000; Eaton 9395P 750 kW UPS $450,500; e-house $3,000,000–$3,500,000; design 5–6% | Eaton EESS ROM, Flux Core, rev 0.0 | 30 Apr 2026 |
| Autel charger book | Dealer cost, MSRP, and install, by SKU (for example AC Elite cost $714 / install $2,200; DC Compact 40 kW cost $10,725 / install $16,000) | Lionheart / tier price, install "our labour estimates, FOB Greensboro NC" | Undated |
| Other EV | Tesla V4 eq $45,000 install $38,000; Tesla V3 cabinet eq $70,000 install $30,000; Alpitronic HYC 400 eq $165,000 install $70,000 | Comment: prior estimates. No public index. | None |
| Unlisted DC fast charger | equipment `max(20000, round(kW × 300))`, install 55% of that | Estimator in `evEst`. No citation. | None |
| Unlisted Level 2 | equipment `max(800, round(kW × 90))`, install 140% of that | Same | None |
| NextNRG controller | $125,000 each | ClearSky, 2026-10-13 | 2026-10-13 |
| NextNRG solar | $1.98/Wdc installed | `api/_lib/nextnrg.js` system rate, the vendor's own quote shape | 2026-10-14 |
| NextNRG storage | $6.00/W of rated power | Same | Same |
| Omega-Core skid | $639,000 plus the $125,000 controller ($764,000) | ClearSky recorded price | 2026-10-13 |

A vendor installed price and the skid carry no contingency. Everything else on an in-scope Run does.

### Prime planning model (`cost-model.js`)

Thirty-two rates, every one stamped `planning` with an empty reference and an empty date. The file says so. Representative rates: battery enclosures $115/kWh, PCS $58/kW, transformer $42/kW, switchgear $38/kW, EMS $17/kW, balance of plant $15/kW, trench $58/ft, cable $88/ft, grounding $8,500, crane $34,000, field wiring $31,000. Markup on top: construction management 3%, EPC overhead and profit 6.5%, insurance 1.5%, contingency 8% (band 6–10%), developer fee 3%. Labor factors: open shop 1.00, prevailing wage 1.22, project labor agreement 1.30, with no wage source. Default run is 250 ft to the point of interconnection and a 4-hour battery. Voltage, soil, and permitting factors scale lines and are likewise unsourced. Utility-upgrade allowances are $0, $185,000, $340,000, and $650,000.

## Preview sources

Read 2026-10-18 unless a row says otherwise. Equipment lines use region factor 1. Labor lines keep a null factor until a wage table is loaded.

| Id | What is charged | Figure | Publication | Source |
|---|---|---|---|---|
| `pv.utility.mmp` | Utility PV, installed, modeled market price | **$1.12/Wdc** (band $0.981–$1.12) | PVSCM files dated 13 Nov 2025; DOE Table 2 | DOE Solar Photovoltaic System Cost Benchmarks, Q1 2025, Table 2, 2024 USD. https://www.energy.gov/cmei/systems/solar-photovoltaic-system-cost-benchmarks . Range from the utility PVSCM text, https://data.nlr.gov/system/files/304/1767739491-UPV%202025Q1.txt (dataset https://data.nlr.gov/submissions/304). |
| `pv.commercial.mmp` | Commercial rooftop PV | **$1.98/Wdc** (band $1.435–$2.093). O&M $40/kWdc-yr, not in the capital total. ILR 1.20 sizes AC kW for the takeoff only. | Same | Table 2, 250 kWdc benchmark, described as representative of 125–500 kWdc |
| `pv.residential.mmp` | Residential rooftop PV | **$2.95/Wdc** (band $2.319–$3.248). O&M $34/kWdc-yr. ILR 1.14. | Same | Table 2, 8 kWdc, representative of 4–16 kWdc |
| `pv.utility.om` | Utility PV O&M | $20/kWdc-yr, not in the capital total | Same | Table 2 |
| `bess.utility.energy` | Battery energy component | **$241/kWh** | 2025 | Cole, Ramasamy, et al., *Cost Projections for Utility-Scale Battery Storage: 2025 Update*. https://docs.nrel.gov/docs/fy25osti/93281.pdf . 2024 dollars. |
| `bess.utility.power` | Battery power component | **$372/kW** | 2025 | Same paper. The fit was $379/kW. The paper subtracts $7/kW so a 4-hour system is exactly $334/kWh. |
| `bess.utility.4h` | 4-hour check, not added | $334/kWh. Acceptance band **$295–$350/kWh** (Table 2, year 2025, low and high). | 2025 | Same. Contingency, tax, installation labor, interconnection other than network upgrades, overhead, and profit are already inside the point. |
| `pv.cross.*` | Cross-method ranges, not charged | Utility 2023 $1.0–$1.3/W (H1 2024 point $1.1). Nonresidential H1 2024 $1.6–$3.4/W. Residential H1 2024 $2.7–$4.2/W. | Oct 2024 | NREL Fall 2024 Solar Industry Update, https://docs.nrel.gov/docs/fy25osti/92257.pdf , citing Barbose et al., *Tracking the Sun*, 2024 Edition, LBNL, September 2024. |
| `ev.install.l2` | Level 2 installation range, not charged | $500–$6,000 per port | 2024 assessment | DOE/NREL alternative-fueling assessment, installation only, as stated in the text. https://www.osti.gov/biblio/2447838 |
| `ev.install.dcfc` | DCFC installation range, not charged | $45,800–$117,900 per port | Same | Same sentence. All DCFC power levels in that sentence. |
| `ev.rmi.dcfc.150` | 150 kW charger range, not charged | $75,600–$100,000 per charger | 2019 | Nelder and Rogers, Rocky Mountain Institute, *Reducing EV Charging Infrastructure Costs*, as cited by that assessment. https://rmi.org/insight/reducing-ev-charging-infrastructure-costs/ . The citing sentence does not split hardware from installation. No inflation adjustment. |

PVSCM component lines (transformers, conductors, EBOS labor) are MSP model inputs, often under a tariff formula. They were not evaluated and they are not summed into a total. The utility file's MMP high is $1.115/Wdc. DOE Table 2 prints $1.12. The preview charges the table and sets the band high at $1.12 so the charged point sits inside the band.

The 4-hour formula is `241 × kWh + 372 × kW`. At 4 hours that is $334/kWh. The 2024 point in the paper is $334 with low = mid = high for that year. The acceptance band is the paper's 2025 low and high, $295 and $350, because that is the near-term range around the point. `334 × 1.10 = $367.40` is outside that band, which is why the live contingency is not stacked.

ATB 2024's base-year storage cost and ATB 2025's earlier figure are different editions. They are not the price this book charges. Lazard LCOE+ Version 17 (June 2024, https://www.lazard.com/media/xemfey0k/lazards-lcoeplus-june-2024-_vf.pdf) is cited by the storage paper. Its capex tables were not read into this book (`lazard.capex`, needs source).

### Electrical takeoff

`api/_lib/pricing-electrical.js` sizes a low-voltage feeder and does not invent a unit price.

- Current is `kW × 1000 / (voltage × √3)` for three phase. The default power factor 0.8, from the Q1 2025 utility benchmark's transformer note, is used for transformer kVA (`kW / pf`) and is **not** divided into the feeder current.
- Continuous feeder: 125% (NEC 215.2(A)(1)).
- Conductor: 75°C copper ampacity, the sizes this takeoff selects from NEC 2023 Table 310.16. Not a copy of the table.
- Overcurrent: the next standard rating in NEC 240.6(A) at or above the design current.
- Equipment ground: NEC 250.122 copper, for that rating.
- Above a single 1,000 kcmil, parallel sets of 500 kcmil (380 A). That set size is a screening choice, not a code maximum.
- Above 600 V, Table 310.16 is not used. Medium-voltage cable is needs source. At 10 MW and up, with no voltage given, the takeoff uses 34.5 kV.
- Conduit trade size is not selected. NEC Chapter 9 areas were not loaded.
- Trench feet come from the drawing (`trenchFt`, Prime `poiFt`, or Site Map `conduitFt['PVC-UG']`).
- Conductor, conduit, trench, transformer, switchgear, interconnection, and protection are needs source. They are not added on top of an all-in PV or battery benchmark. Those benchmarks already contain electrical balance of system.

### Labor

The factor is meant to be a state or metro mean hourly wage for electricians (BLS OEWS SOC 47-2111) divided by the national mean. Equipment stays at 1. ZIP3 applies only when a wage is tied to that prefix. The May 2024 and May 2025 state and metro workbooks were not loaded (the BLS pages did not return the table in this pass). No wage was guessed. RSMeans city indexes and Davis-Bacon determinations were not copied. `labor.index` is needs source, and every labor line's `regionFactor` is null.

## Reference projects

Computed by `api/_lib/pricing-benchmarks.js` on 2026-10-18. "Live Site Map" is `editor-cost.js` `rollup` with the sheet defaults, including 10% contingency. "Live Prime" is `cost-model.js` `price().total.base`, rounded to the dollar here (the engine returns the unrounded base). Prime has no solar or charger model, so those cells are blank.

| Project | Live Site Map | Live Prime | Preview 2026.10 | Cited range |
|---|---:|---:|---:|---|
| 1 MW / 4 h battery, ZIP 60601, Illinois, 250 ft trench, 480 V | $1,477,300 ($369.33/kWh) | $1,208,888 | **$1,336,000** ($334/kWh) | $1,180,000–$1,400,000 ($295–$350/kWh) |
| 500 kW-DC commercial roof, ZIP 94107, California | $1,089,000 ($2.178/Wdc) | — | **$990,000** ($1.98/Wdc) | $717,500–$1,046,500 ($1.435–$2.093/Wdc) |
| 10 MW / 4 h front-of-meter battery, ZIP 77002, Texas | $14,773,000 ($369.33/kWh) | $10,421,525 | **$13,360,000** ($334/kWh) | $11,800,000–$14,000,000 |
| Four 150 kW DC fast chargers, 480 V | $306,900 | — | **no total** | RMI 2019 $75,600–$100,000 per charger, recorded and not charged. Installation $45,800–$117,900 per port, not charged. |

The live 1 MW and 10 MW Site Map totals sit above $350/kWh because $379/kW plus 10% contingency is outside the 2025 band. The live 500 kW roof sits above the PVSCM commercial band for the same contingency reason. It is still inside the wider H1 2024 nonresidential cross-method range ($1.6–$3.4/W). The Prime 10 MW total sits below $295/kWh. The Prime 1 MW total lands inside the band on a planning model that cites nothing. The preview matches the cited point and sits inside each band. The daily check fails if a later edit leaves the band.

Takeoff on those projects: the 1 MW feeder is 1,203 A, 1,504 A design, 1,600 A device, four sets of 500 kcmil, 4/0 AWG ground, 1,250 kVA transformer screening. The 500 kW roof is sized at 500 / 1.20 = 416.7 kW AC, 626 A design, 700 A device, two sets of 500 kcmil. The 10 MW job is 34.5 kV, so the low-voltage table does not size the cable. The four chargers are 600 kW, 902 A design, 1,000 A device, three sets of 500 kcmil. None of those feet are priced.

## Needs source

These lines have no price. They are listed for Thomas. A public number that is read later replaces the row. A guessed number does not.

| Id | Missing price |
|---|---|
| `pv.canopy` | Installed solar canopy, $/Wdc. The live $2.75 and the $2.50–$3.50 range have no report. |
| `bess.utility.fom` | Fixed O&M, $/kW-yr. The 2025 update says the published range is wide and does not state one figure in the text that was read. Variable O&M is stated as zero. |
| `bess.small.adder` | Any adder below the ~60 MW system the ATB discussion uses. A 1 MW project is priced at the utility point and this line says the scale was not adjusted. |
| `ev.dcfc.150.point` | One installed price for a 150 kW charger. The preview will not average the RMI band or the installation band. |
| `ev.l2.equipment` | Networked Level 2 equipment. The Autel dealer book stays on the live engine. |
| `el.conductor.ft` | Copper feeder, $/ft. PVSCM states conductors per kW, as a model input, not per foot. |
| `el.conduit.ft` | Conduit, $/ft. |
| `el.trench.ft` | Trench, duct bank, and restoration, $/ft. The live $58/ft was not brought forward. |
| `el.transformer.kva` | Pad-mount transformer, $/kVA. The Eaton ROM is a budgetary quote on the live book, not a public index. |
| `el.switchgear` | Switchgear, per lineup. |
| `el.interconnection` | A separate interconnection dollar. The battery benchmark includes permitting and interconnection and excludes network upgrades, and it does not state a separate number. |
| `el.protection` | Relaying and metering. |
| `labor.index` | State, metro, and ZIP3 electrician wage factor. |
| `gen.eia` | On-site generation, $/kW, from a named EIA table row rather than a rounded live rate. |
| `lazard.capex` | Lazard LCOE+ v17 capital-cost tables. |

## Decisions for Thomas

1. **The preview is off.** Live Site Map and Prime totals do not change until you set `PRICING_LIBRARY=2026.10` after you approve the book. Saying `preview: true` on `POST /api/project-pricing` shows the book to a signed-in workspace and still does not replace the live doors.
2. **Power term.** Live uses $379/kW. The 2025 paper's adjusted term is $372/kW so that 4 hours equals $334/kWh. The preview uses $372.
3. **Contingency.** Cole's $334/kWh already includes contingency as one of ten categories. The live Run adds another 10%. That is why the live 1 MW total ($1,477,300) is outside $295–$350/kWh and the preview ($1,336,000) is inside. The preview does not stack a second contingency.
4. **Canopy.** $2.75/Wdc stays live and is needs source on the preview. A canopy quote will not show a preview capital total until a report is read.
5. **Labor.** No state, metro, or ZIP3 factor is applied. BLS OEWS, RSMeans, and Davis-Bacon were not loaded. Equipment stays national.
6. **DC fast charging.** No point price. The live estimator (`kW × $300`, floor $20,000, install 55%, then 10%) produces $306,900 for four 150 kW ports, about $76,725 per port, which happens to sit in the 2019 RMI band. That formula was not adopted.
7. **Scale.** 1 MW and 10 MW both use the utility-scale $334/kWh. No small-system adder was invented. The open question is whether a 1 MW ComEd project should carry a published distribution-scale adder once one is read.
8. **Commercial PV plus storage.** DOE's narrative for the commercial benchmark says the storage is two 250 kWh cabinets. Table 1 says 250 kWh. This book prices PV-only Table 2 and does not use the PV-plus-storage modeled market prices ($1.81, $2.98, and $4.59 per Wdc). The mismatch is unresolved on purpose.
9. **Utility band.** The file high is $1.115/Wdc and Table 2 prints $1.12. The preview charges $1.12 and the test accepts up to $1.12.
10. **Staleness.** The daily job ages the read date (warn at 45 days, error at 180), not the publication year. An annual NREL edition would fail every day if publication age used the 180-day error. Say if you want publication age to fail the build instead.
11. **editor-v2** has no pricer yet. The adapter is ready for the same quantity payload as Site Map.
12. **Quote Desk** does not price. The adapter prices battery, solar, and charger quantities it can read off the BOM lines.
13. **Left on the live book,** because they are not public indexes: the Autel dealer book, catalog `eqcost`, the Eaton ROM, NextNRG's rates, and the Omega-Core skid at $639,000 plus $125,000.
14. **EIA generation rates and the Lazard capex tables** were not transcribed. Both are needs source.
15. **Feeder current ignores power factor.** Transformer kVA uses 0.8 when the project does not state one. Dividing the feeder by 0.8 would add a parallel set on the 1 MW example. That was not done.
16. **Conduit size** is not chosen. Chapter 9 fill was not loaded.
17. **Prime's default voltage.** The preview leaves voltage unset unless the caller sends one, then uses 480 V under 10 MW and 34.5 kV at 10 MW and above. Prime's live model still prices an unanswered voltage as 12 kV inside its own factors.
18. **Placed batteries with a catalog key** still use the live catalog or the $85/kWh equipment rate when the live engine runs. The preview prices a stated kW and kWh, not a catalog key.
