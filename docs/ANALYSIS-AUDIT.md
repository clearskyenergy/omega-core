# Analysis tools — audit (2026-10-17)

What each analysis engine does, where its numbers come from, and what was
checked against the code and against the public sources that could be
reached without a paid key. The machine-readable twin of the checks is
`npm run validate:data` (`scripts/validate-analysis-data.js`,
`api/_lib/analysis-checks.js`).

This pass did not re-download the PJM auction PDF, the ComEd DG rebate
terms, or the NYSERDA dashboard. Those rows already cite a primary
document and a read date. The harness fails when a `read YYYY-MM-DD`
date is older than `VALIDATE_STALE_ERROR_DAYS` (default 180) and warns
after `VALIDATE_STALE_DAYS` (default 45). OpenEI and EIA are queried
only when `OPENEI_API_KEY` or `EIA_API_KEY` is set. Nothing in this
work writes production data or environment variables.

## How to run the harness

```bash
npm run validate:data
npm run validate:data -- --out /tmp/analysis-validation.json
npm run validate:data -- --live --out /tmp/analysis-validation-live.json
VALIDATE_STALE_DAYS=30 npm run validate:data -- --strict
```

`--live` calls the open PG&E and National Grid Massachusetts hosting
services (no key) and, when the keys above are present, one OpenEI URDB
lookup for ZIP 60601 and one EIA Illinois commercial retail price.
`--strict` fails the process on warnings as well as errors. The unit
test is `node scripts/tests/tanalysisvalidate.js`, and CI runs both
(`scripts/tests/t*.js` and the `analysis data validation report` step).

Exit 0 means no error-severity check failed. The JSON report has
`ok`, `summary`, and `checks[]` (`id`, `severity`, `ok`, `message`,
`detail`).

## Inventory

| Tool | What it answers | Where the math lives | Data |
|---|---|---|---|
| Utility rate book | Which utility a ZIP is screened as, and a planning demand $/kW-month, energy $/kWh, demand share, TOU flag, ratchet | `api/_lib/utility-rates.js`, `GET /api/utility-rates`. The editor keeps only the ZIP3→state table (`_FOM_ZIP3_STATE`) and caches one record | Hardcoded planning rates. No as-of date on the rate figures. Detailed rows for ComEd, Ameren Illinois, MidAmerican (Quad Cities), Eversource CT, United Illuminating, Eversource MA, National Grid MA (no ZIP3 of its own), AEP I&M. Every other state is one primary utility |
| Facility demand screen | Peak kW and a 4-hour battery from an annual bill, and the demand-charge saving | `omega-demand-screen.js` (`basis`, `savings`). `editor.html` paints it | The rate book above. Install cost on the card is still $280–$380/kWh in the page, labelled as a range |
| Tariff engine | A monthly bill from an OpenEI URDB-shaped tariff: energy tiers, TOU demand, facility demand, ratchet on the trailing 11 months, fixed charge, rider, tax | `api/_lib/bess-tariff.js` | Caller-supplied URDB record, or a flat demand and energy rate. No bundled tariff library |
| Value stack | PJM capacity at ELCC, demand-charge band if the caller supplies one, VPP $/kW-year if supplied, one-time incentives, unlevered pre-tax lifecycle | `api/_lib/value-stack.js` | PJM 2028/2029 BRA, $325/MW-day, cited to the 14 July 2026 results report. ELCC 4h 59%, 6h 68%, 8h 71%, 10h 78%, cited to PJM's class-rating PDF. Incentive book read 2026-10-06 (ComEd, Ameren, SGIP, NYSERDA, Maryland RCES) |
| VPP simulator | Hourly dispatch against the site's load and tariff, plus one programme per exclusivity group | `api/_lib/vpp-sim.js`, `POST /api/vpp-estimate` | Planning `RATE_BOOK` by ISO (no as-of). Programme rows are `published` or `planning`; 21 planning rows have no read date. Solar yield is a rounded kWh/kW-dc by state, described as an NREL PVWatts range, not a PVWatts call. Load shapes are internal. ComEd territory is `utility-rates.isComedZip` |
| Pro forma / ITC | §48E rate build, phase-down, solar begin-construction cliff, IRR | `api/_lib/proforma-engine.js` | Statutory schedule in code (base 30% or 6%, adders 10 or 2 points, solar cliff after July 2026 / in service after 2027, storage phase-down from 2034). Pinned by `scripts/tests/tproformaengine.js` and the harness |
| Battery sizer | Interval or monthly peak shave, ratchet, payback | `api/_lib/battery-tool-engine.js` (current). `api/_lib/bess-engine.js` is marked retired and this harness does not call it | Tariff from the caller. Tests: `scripts/test-bess-sizer.js` |
| Compute site pro forma | Can the service carry GPU pods, and what does the project return | `api/_lib/compute-site.js`, `api/_lib/site-model.js`, `api/_lib/omega-compute-model.js` | Dispatch reuses `vpp-sim.js` and `bess-tariff.js`. Skid price, GPU-hour reference and host PPA are the records described in `docs/OMEGA-CORE.md` and `docs/COMPUTE-PROFORMA.md`. Not re-derived in this pass |
| Editor cost | Installed cost of what is drawn, including the Omega-Core skid line | `api/_lib/editor-cost.js` | Internal price book. Test: `scripts/tests/teditorcost.js` |
| Grid verdict | Fits / smaller / study from published hosting minus the queue | `api/_lib/grid-verdict.js` | The circuit figure is the utility's, passed in. ComEd's feed is `api/_lib/comed-service.js` |
| Hosting capacity prototype | Feeder or line-section kW from an open ArcGIS service | `api/_lib/hosting-capacity.js` | PG&E GRIP, National Grid MA, National Grid NY. See `docs/HOSTING-CAPACITY.md` |

## Formulas that were re-checked

PJM capacity for `kw` kilowatts and a duration that falls in a published
class: `(kw / 1000) × ELCC × $325/MW-day × 365`. Below 4 hours the stream
is missing, not zero. A 1 MW, 4-hour battery is
`0.59 × 325 × 365 = $69,988.75`. The delivery year 2028/29 (1 June 2028
through 31 May 2029) has 365 days; 29 February 2028 falls before it.

Flat bill: facility kW × demand rate, plus kWh × energy rate, plus the
customer charge. Reference: 100 kW at $20, 10,000 kWh at $0.10, $15
fixed → $3,015.

Ratchet, URDB `demandratchetpercentage` as 0–100: billed kW is the
greater of this month's peak and that percent of the highest peak in
the trailing 11 months. Reference: 100 kW then 40 kW at 50% and $10/kW
bills the second month at 50 kW, $1,500 for the two months.

Demand screen: demand dollars = annual bill × the facility's demand
share. Peak kW = that figure / 12 / demand rate, rounded. Saving =
shaved kW × demand rate × 12. The 12 months are the case where the new
peak resets the ratchet floor. The ratchet is not a second credit.

ITC: prevailing wage or a facility under 1 MW AC is the 30% base;
otherwise 6%. Energy-community and domestic-content adders are 10
points on the 30% base and 2 on the 6% base. Solar that begins
construction after July 2026 and is in service after 2027 is zero.
Storage begun in 2034 is 75% of the built rate.

ComEd large C&I rebate, as coded: `$250 × kWh`. Residential and small
C&I: `$300 × kWh`. The 5 kWh-per-kW cap described in the row's
conditions is not applied. See below.

## Bugs fixed

| Severity | What was wrong | Fix |
|---|---|---|
| High | The facility demand screen added `(ratchet − 0.5) × (shaved kW × rate × 12)` on top of a saving that already counted all 12 months. ComEd's 0.70 ratchet inflated the saving by 20% (a 50 kW shave at $19.85/kW-month showed $14,292 instead of $11,910). A ratchet above 0.5 made the number larger, which is the wrong direction | `omega-demand-screen.js` is the only formula. Ratchet savings are 0. The card says the ratchet is already inside the 12-month figure. A stated ratchet of 0 from the bill assist is kept (`ai.ratchet === 0` used to fall through) |
| High | ZIP 055 (Andover, Massachusetts) was inside 050–059 and resolved as Vermont, so the rate book returned Green Mountain Power | 055 is Massachusetts. 050–054 and 056–059 stay Vermont. The editor's postal table is the same list; the test fails if they drift |
| High | ZIP 885 (El Paso, Texas), 398–399 (Georgia), 569 (State Department, DC) and 005 (Holtsville, New York) matched no state and the rate book fell through to ComEd defaults | Each prefix is mapped to its state, so the state primary utility is used |
| High | The detailed ComEd row claimed ZIP3 612 (Rock Island / Moline, MidAmerican), 614 (Galesburg, Ameren), 620 (Alton, Ameren), 622 (Belleville, Ameren), 623 (Quincy, Ameren) and 624 (Effingham, Ameren). Those sites were screened on ComEd's $19.85/kW and $0.0681/kWh. 612 was listed under MidAmerican as well, but ComEd was tested first so MidAmerican never won | Those prefixes are Ameren, except 612 which is MidAmerican only. ComEd is 600–611, including Kankakee (609) and the Chicago prefixes 607 and 608 |
| Medium | ZIP 028–029 (Providence and the rest of Rhode Island) were labelled National Grid (Massachusetts) | They fall through to Rhode Island Energy. National Grid MA shares 010–027 with Eversource, so it has no ZIP3 of its own |
| Medium | ZIP 065 (New Haven) and 066 (Bridgeport) were labelled Eversource because that row was tested before United Illuminating, which listed the same prefixes | 065 and 066 are United Illuminating. 064 stays Eversource; it is mixed |
| Medium | ComEd-in-PJM was a second ZIP range (`600–611`) beside the rate book, so the two could drift | `vpp-sim.js` `locate()` uses `utility-rates.isComedZip`. A ComEd ZIP is PJM unless the caller overrides the market |

## Needs a decision

| Severity | Item | Why it was not changed |
|---|---|---|
| High | The ComEd and Ameren rebate rows say interconnection agreements after 1 June 2026 are capped at 5 kWh per kW and 25,000 kWh total. `incentives()` does not apply either cap. An 8-hour battery is priced at the full $250/kWh. The row itself says the cap is "reported" and should be confirmed against the tariff | Applying a cap the comment treats as unconfirmed would change customer quotes. The arithmetic should follow the tariff once someone confirms the current sheets |
| Medium | Every Indiana ZIP3 is labelled AEP Indiana Michigan Power, including Indianapolis (AES Indiana), northwest Indiana (NIPSCO) and Evansville (CenterPoint). The state primary row says Duke Energy Indiana. The comment in the rate book now says this | There is no per-prefix rate for those utilities in the book. Reassigning Indianapolis from I&M's $14.90/kW to Duke's $14.90/kW would not even change the number, and NIPSCO would be a guess |
| Medium | Massachusetts 010–027 are all Eversource. National Grid MA (Worcester and others) is not separated at ZIP3 | The prefixes overlap. The National Grid feeder service in `api/_lib/hosting-capacity.js` is the right next source, not a guessed split of the rate |
| Medium | ZIP 613 is mixed (Ottawa is ComEd, LaSalle is Ameren). It is not on the ComEd list, so the rate book uses the Illinois state primary, which is still ComEd, while `locate().comed` is false and the ComEd rebate is not offered | A ZIP3 cannot settle it. A territory polygon should |
| Medium | The state primary rates and the VPP `RATE_BOOK` have no read date. They are planning figures (California commercial energy $0.30/kWh and $24/kW-month, Hawaii $0.40/kWh, and so on). The harness only checks that they sit inside wide bounds | Replacing them with EIA or URDB averages needs a key and a decision about whether a state average may stand in for a tariff. `--live` compares the ComEd planning energy rate with EIA when `EIA_API_KEY` is set and warns outside 0.5×–2× |
| Low | Westchester's NYSERDA block is described as $125/kWh and priced at the upstate $175. The conditions already say so | `locate()` has an NYC flag and no Westchester flag |
| Low | SGIP's conditions say the screening assumes the ITC, so the $180/kWh rate is used. The code uses $180 only when the caller passes `itcClaimed` | The API does pass that flag from the ITC rate. The sentence in the row overstates what the function does on its own |
| Low | ComEd's ArcGIS service name is `SEP2026` while this review is October 2026. One month of lag is allowed. Two months warns. Three months errors | The service id in the URL rotates with the name. It was not changed without a confirmed October URL |
| Low | ConnectedSolutions is carried at $200/kW-summer with the note "2024–2026 programme years" | Confirm the programme year still in force before editing the planning figure |

## What was compared with public sources

Reached live on 2026-10-17, no key: PG&E GRIP `LineDetail` (FeatureServer
layer 3) and National Grid Massachusetts
`Nodal_Hosting_Capacity_MA` (MapServer layer 0). A San Francisco point
returned line sections with `LoadCapacity_kW` (sample feeder
`022011121`, 315 kW, 12 kV, map date 2026-08-01). A Worcester point
returned feeder PV hosting in megawatts, normalized to kilowatts
(sample `05_01_11J331`, 1,800 kW max, refresh date 10/02/2026). See
`docs/HOSTING-CAPACITY.md`.

Not reached: OpenEI URDB and EIA, because no API key is in this
environment. DSIRE was not used as an authority; the incentive rows
cite the utility tariff or the programme administrator, which is the
stricter source. NREL PVWatts and NSRDB are not called anywhere. The
solar yield table in `vpp-sim.js` is a rounded regional screening
figure and is labelled as one.

## Assumptions that are screening, not errors

- State primary utilities are one company per state. Overlap (National
  Grid and Eversource in Massachusetts, Duke and AES and NIPSCO in
  Indiana) is unresolved below ZIP3.
- A ratchet of 0.70 in the rate book is a fraction. URDB's
  `demandratchetpercentage` is 0–100. `proforma-sizing.js` divides the
  URDB figure by 100 before it meets the sizer. The two conventions
  are not mixed in the demand screen.
- Planning programme dollars (MISO LMR, ERCOT ERS, and the rest of the
  undated rows) are not cleared auction prices. Each row says so.
- The value-stack lifecycle is unlevered and pre-tax. Tax, debt and
  depreciation stay in the pro forma.
