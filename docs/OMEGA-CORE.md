# Omega-Core — edge compute on a charging site, paying the host

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2 October 2026 (Tommy: "add it to the compute options and call it
Omega-Core … use the land lease offering from this unit to provide payment on
charging sites to help increase the profitability of the site … the unit would
have its own meter … the cost for the system is $450,000 … a 5 year minimum
contract and then at the end we remove the skid and turn off the meter, or
they can buy it for fair market value").

## What it is

One transportable skid, **336 × 87 in (28 × 7.25 ft) on an 8 in base, 82.75 in
overall**, carrying:

| Part | What | Source |
|---|---|---|
| Compute | Solela Edge Compute cabinet, **75 kW** | ClearSky |
| Battery | **CleanCell R60** — 61.44 kWh LFP, 614.4 VDC / 100 Ah, one Sol-Ark 60K three-phase hybrid PCS (60 kW continuous, 277/480 V, 72.3 A max AC, 90 kVA for 10 s off grid), 97.5% max / 96.5% CEC / 96.0% grid-to-battery, CAN BMS, battery IP55 / PCS IP65 NEMA 3R, UL 9540:2023 (reported), UL 9540A (reported tested), UL 1973 (reported), PCS UL 1741 SB / IEEE 1547 | Clean Cell US R60 Product Data Sheet, Rev A, September 2026 |
| Controller | **NextNRG Microgrid Controller** — 15-minute dispatch on a 24-hour horizon, economic / resilience / islanded with black start, Modbus TCP to the site PLC, IP55 500 × 750 × 210 mm, IEEE 1547 / IEC 62443 / NERC CIP aligned; it schedules the R60 against the compute load on the skid's own tariff, holds the reserve for the compute and islands the skid when the grid drops. Built into every skid (Tommy, 2026-10-13) | NextNRG Microgrids brochure, Q4 2026, p. 7–8; `api/_lib/nextnrg.js` |
| Skid | 336 × 87 in, 8 in base, 82.75 in overall | ClearSky's drawing |
| Price | **$639,000 per skid as recorded (13 October 2026; $450,000 from 2 October until then) + $125,000 for the NextNRG Microgrid Controller = $764,000** (`PRODUCT.systemCostBreakdown`) | ClearSky |
| Battery price | **$24,000** for the CleanCell R60 on its own, in the server price book (`api/_lib/editor-cost.js` `CATALOG_PRICES`; 13 October 2026) | ClearSky |

ClearSky owns and operates it. It sits on an EV charging site on **its own
utility service and meter**, and ClearSky pays the site host a **land lease**.
The host buys nothing and powers nothing; their bill and demand charges do not
change. The rent is income the charging site did not have, so the site pencils
better. **Five-year minimum.** At the end ClearSky removes the skid, restores
the pad and has the meter turned off, or the host buys the skid at **fair market
value** set by an independent appraisal.

The battery carries up to 60 kW of the 75 kW compute load (the Sol-Ark 60K
limit), about an hour at 60 kW. Nobody should sell it as a full UPS.

## Where it lives in the editor

- **Draw › Data Ctr › Omega-Core Skid** (`derSetDc('dc_omegacore')`) places
  the skid to scale. `DC_CATALOG.dc_omegacore` is the row; the placed `derdc`
  shape carries `omegaCore: true`, `ownMeter: true` and the battery
  (`bessKw`, `bessKwh`, `bessKey: 'CC-R60'`). The cluster dialog places
  several.
- **It is not the host's.** Every reader of host load, host cost, host battery
  and site type skips `omegaCore`: `omegaDer`/`derTotals` (counted as `ocUnits`,
  `ocKw`, `ocBessKwh` instead of `dcLoadKw`), the Results rail's net at the
  POI, the data-centre electrical ROM, `OmegaComputeCost.pods` (no $30k/kW pod
  price), the one-line and the auto single-line, the supply links, the
  proposal type, the overview archetype, the Compute HUD's reconstruction, the
  project kinds, the guided build's taps, Fence & Tie, the cluster dialog's EMS feed, the electrical bid and RFQ, the permit notes, and the campus grouping that moves and turns the host's compute compound. Without that, one 75 kW skid read
  as about $8M of data centre on the host's Run and turned a charging site into
  a "compute campus".
- **It is counted as itself:** its own legend row ("Omega-Core skid (own
  meter)" with kW and kWh), an Omega-Core row on the Results rail, a BOM line
  and a spec-sheet row, each saying ClearSky-owned and not host capex. The
  BOM line and the spec-sheet row name the NextNRG Microgrid Controller built
  into it; the drawing shows it (the MGC box under the Sol-Ark); the placed
  shape carries `controller` / `controllerKey`. The host's Run never prices the
  skid's controller: `omegaCostQuantities` counts only controllers placed from
  Draw › Utility (`docs/NEXTNRG-MICROGRID.md`).
- **Output › Omega-Core** (`openOmegaCore`, `data-cap="compute"`, owned by
  Omega Compute in `api/_lib/modules.js` as `derSetDc` is) opens
  `omega-core-qualify.js`.

## The CleanCell R60 on its own

`BESS_CATALOG['CC-R60']` is the R60 as a battery product (BESS Config's Clean
Cell group, Draw › BESS Pad on its 336 × 87 in skid via `GOTION_CATALOG_DIMS`).
Its PCS is integrated and its output native 277/480 V (`_incPCS: true`,
`_incXfmr: true`); the external AC disconnect stays (`_incDisco: false`). The
catalog's own YES wins over the size rule in `applyBMCatalog` (a tenant row
with blank integration columns is "not said" and keeps the size rule), and
every BESS Pad path — the modal, quick place, the cluster — places it with its
disconnect and without a second PCS or a transformer. An unpublished usable
kWh or price clears the BESS Config field rather than saving a stale one. Its
**height is the drawing's 82.75 in overall** (6'-10¾"; Tommy, 5 October 2026:
"use the drawing height 82.75"), as the Omega-Core skid's is; the datasheet's
2,200 mm (86.6 in) is the battery cabinet alone and stays on the catalog row as
`cabinet`. `evSkid: true` keeps the auto-sizer from recommending an EV
charging skid for a peak-shaving target. Usable kWh, weight, price and the
Autel charger rating are **not published** and stay null or say so; place the
two Autel dispensers from the EV Catalog at the rating the project engineering
package sets.

## Qualifying a site — Output › Omega-Core

The dialog reads what the session knows, never recomputes it:

| Fact | From |
|---|---|
| The Run | `S.costRollup` (capex, net, incentives, year-1 revenue, when) and the cost sheet's own lines (`_EV_TOTAL`, `_BESS_TOTAL`, `_DC_TOTAL` the DC electrical ROM, contingency…), with `S.resultsStale` |
| Skids, chargers, host compute | the drawing (`omegaCore` shapes, `evChargerTotals()`, `omegaDcLoadKw()`) |
| Host service, transformer, peak | BESS Config's service fields, else the site intake (`p0_service_amps`/`p0_service_v`, `p0_xfmr_kva`, `p0_peak_kw`), `_btmServiceAcceptance()` |
| Location | `_npxSiteLatLon()` / `omegaGeo()`, the address |
| Fiber already found | `S.omegaFiber` (reported; it never moves the gate) |

It then fans out through `OmegaComputeLease.evidence` — Grid Atlas, Network
Proximity (up to 55 s) and the parcel — the same three lookups the Land Lease
panel runs, asks the rep what no data holds (utility kW for a new 480 V
service, will-serve, fiber on site, zoning, the host's yes, the term, the
end-of-term preference) and posts everything to `POST /api/omega-core`.
Editing an answer re-scores without re-running a lookup. The answers and the
last verdict ride on the project as `S.omegaCore` (saved in `saveProject`'s
allowlist, restored in `_loadProject`). Print gives a one-page summary.

## The model — `api/_lib/omega-core.js`

Pure, no I/O. Three gates, in the order Tommy named them:

- **Power** — each skid is a new 480 V three-phase service: 75 kW firm (the
  compute), 135 kW at peak (the battery recharging at 60 kW), about a 225 A
  service. The utility's figure and will-serve decide; the drawn transformer's
  headroom (kVA × 0.95 less the host's drawn chargers, compute and building
  peak) is a signal that can make a site conditional, never pass it. When the
  power carries fewer skids than asked, the lease is priced on the fewer.
- **Location** — a charging site (chargers on the drawing), zoning by
  compute-lease's `classifyZoning` (residential fails), a map point, the skid
  placed.
- **Fiber** — **compute-lease's `gateFiber`, unchanged: the hard gate**, 1 Gbps
  bidirectional. While the public record says "unlikely" no lease is priced —
  but that is *needs further qualification* (a carrier may still serve the
  address), never a confirmed "no".

**No false results** (Tommy, 2 October 2026: "we dont want false results it
should say needs further qualification"). A firm answer, either way, rests
only on a confirmed fact; everything resting on a drawing, a public map or a
missing answer **needs further qualification**:

| Verdict | When | Lease |
|---|---|---|
| **Qualified** | every gate clears on confirmed facts (the utility's figure with a confirmed will-serve, gig fiber on site, the zoning, the chargers drawn) | at the rent typed for the site; with none typed, the market reference, marked not an offer |
| **Qualified with conditions** | confirmed, with an engineering or contract condition (e.g. the utility's kW carries the compute but the battery recharge is capped) | as for Qualified |
| **Needs further qualification** | anything open, or resting on the drawing or the public record; the result lists exactly what closes it | an **indicative range, marked "not an offer"** — or none at all while fiber or zoning only looks *unlikely* on the public record |
| **Does not qualify** | only a confirmed fact: the utility declined a new service, the utility's own kW is under one skid, zoning the rep entered is residential | none |

Each gate says the same in its own chip: *Clears*, *Clears with conditions*,
*Needs qualification*, *Unlikely — confirm*, *Does not qualify*.

**The rent — typed for the site, or a market reference.** ClearSky has not set
an Omega-Core rent (Tommy, 3 October 2026: "idk the lease amounts yet we will
need to manually input that or go with a market standard if there is such a
thing"). There is no published standard for an edge-compute skid on a charging
site, so:

- **Rent per skid per month** and **Rent escalator** are fields in the dialog.
  A rent typed there ($1–$10,000; anything else is set aside and the result
  says so) prices the lease as one figure, escalating at the typed rate or
  2.5%, and the host's payback, revenue uplift and ClearSky's outlay follow it.
  It is saved with the project's answers. A typed rent never qualifies a site:
  on an open site it is still headed *indicative until the site qualifies*.
- **Left blank, the lease is the market reference** (`omega-core-lease-v2`):
  **$750 / $1,000 / $1,500 per skid per month**, escalating 2.0 / 2.5 / 3.0% a
  year, over the term (5-year minimum, up to 15). It is headed *market
  reference, not an offer* **whatever the verdict**, and shown with what it is
  read off:

  | Comparable | Figure | Source |
  |---|---|---|
  | Cell-tower ground leases, new in 2026 — a carrier's equipment on its own meter, paying rent (the nearest model) | most new proposals $500–$1,250 a month; suburban/commercial $800–$1,500; urban $1,200–$2,500+; average $1,300; escalators 2–3% | [Steel in the Air](https://www.steelintheair.com/cell-tower-lease-rates/) |
  | Surface parking — the ground the skid and its clearances take, about three stalls | $100–$300 a stall a month, ~$155 average → ~$300–$900 a month | [MyCurbSpot](https://www.mycurbspot.com/tools/parking-spot-value) |

  Low sits under the suburban/commercial tower band and over three stalls at
  the average (and is compute-lease's floor); base is inside that band and the
  2026 new-proposal range; high is its top, for a site that clears every gate on
  evidence. Every entitled caller sees the range and its sources; the build-up
  is staff-only.

When ClearSky sets a standard rent, it replaces `RATE_CARD.monthlyPerSkid`
and the version moves; the typed rent per site stays.

**What it does to the charging site** — read off the Run: net cost, year-1
revenue, payback before and after the lease, the uplift on year-1 revenue, the
share of the net cost the lease repays over the term. No Run, or a Run older than
the drawing, is said and not papered over.

**The end of term** — removal and meter off at ClearSky's cost, or a buyout at
fair market value by independent appraisal. The indicative band is 20 / 30 /
40% of the $764,000 system cost (the $639,000 skid plus its $125,000 controller) at
year 5 ($153k / $229k / $306k), declining geometrically for a longer term, never
under 5%. ClearSky's program outlay is the system cost,
the fiber lateral at compute-lease's $45k–$250k/mile midpoint where fiber is not
on site, and the lease.

## The skid's own economics — `api/_lib/omega-compute-model.js`

Tommy, 5 October 2026, handing over the iQGen *75 kW IT Load Cash Flow Model*
workbook: "this is how the Omega-Compute needs to be modeled … it's an iQGen
set but we are white labeling it Omega Core Skid and when we place it here are
the numbers and we need to make a customer facing version and be able to show
bankability." The module is that workbook, sheet by sheet, pure and
server-side, and `POST /api/omega-core` returns it as `compute` beside the
site verdict, priced on the skids proposed:

| Sheet | Here | What it holds |
|---|---|---|
| Chipset Library | `CHIPSETS` | ten NVIDIA platforms: GPUs and kW per node, CoreWeave North America public pricing (spot, on-demand, inference $/GPU-hr, 2026-10-05), the relative $/GPU CAPEX index. A price CoreWeave does not publish is `null`, never zero. |
| CapEx Reference | `CMDC` | the 75 kW container CAPEX by category (container, cooling, compute, power), general-purpose air-cooled and accelerated liquid-cooled, ±15% |
| Dynamic CapEx | `dynamicCapex()` | the accelerated reference scaled to the chipset: compute × GPUs ÷ 48 × index, cooling and power by factor |
| Dynamic Cash Flow | `cashFlow()` | the 60-month model: whole-node capacity, revenue with a 50/65/80/100% ramp and −8%/yr pricing, electricity at PUE, network + storage 5%, other 3%, fixed $5,000/mo, a 2% maintenance reserve, a 10% residual; debt at 70% LTC, 10%, 60 months, 6 interest-only, 10% balloon, 2% fee, a 3-month reserve; equity cash flow, paybacks, DSCR |
| Scenario Comparison | `scenarios()` | every chipset under the same inputs, unlevered: capacity, revenue, contribution, chipset-scaled CAPEX, payback, cash-on-cash yield |
| Sensitivity | `sensitivity()` | utilisation (50–95%) × price realisation (60–120%) |

The workbook's defaults are the model's defaults, and `scripts/tests/
tomegacore.js` pins its figures (month-1 revenue $35,956, year-1 $755,699,
debt $507,130, payback months 17 and 7, the H100 scenario at $2.156M and
96.0%) and the skid at $575,000 with its breakdown. Where a cell pointed at the wrong row it is corrected and the
correction named in the staff build-up (`buildUp.corrections`).

What Omega-Core adds:

- **The land lease to the host is a cost of the skid.** The offer's base rent
  (or the rent typed) is a line in the cash flow, escalating yearly; *Host's
  rent as a cost: No* shows the skid alone.
- **Bankability**: the minimum DSCR over the amortising months against the
  target (1.25x), the months under it, the balloon month's own cover, and
  the **debt capacity at the target** — debt service is linear in the loan
  for fixed terms, so the largest loan the cash flow carries is the minimum
  over amortising months of EBITDA ÷ (target × service per dollar) — plus
  project and equity IRR.
- **A CAPEX basis**, defaulting to the **Omega-Core skid as built: the
  $639,000 ClearSky recorded (13 October 2026; $450,000 from 6 October, Tommy:
  "use the 450k skid price as the default") plus the $125,000 NextNRG Microgrid
  Controller built into it, $764,000** — `omega-core.js` hands the compute model
  the product record's figure (`opts.skidPriceUsd`) and its label says what it
  is made of; the model's own default stays the recorded skid price. The
  workbook's CMDC range (general-purpose air-cooled high, $724,471), the
  chipset-scaled estimate and a typed figure stay as choices. The dialog says
  which was used.
- **A pricing basis**, defaulting to CoreWeave's public **spot** rate (Tommy,
  6 October 2026: "use spot as the default"; the workbook's cash-flow sheet
  runs on it, $2.46 per GPU-hour for the H100). On-demand ($6.16), inference
  and a typed $/GPU-hour stay as choices; a chipset with no public price on
  the chosen basis says so instead of pricing, and an unknown basis falls
  back to spot and says so.
- **A customer view** (`compute.customer`): the headline figures, the
  bankability verdict and the assumptions in plain words — no cost reference,
  no price sheet, no proxy index. The build-up (`buildUp`: the CMDC
  categories, the index per chipset, the sources, the corrections) is
  staff-only, as the lease card's is.
- Inputs the rep may set in the dialog: chipset, pricing basis (or a custom
  $/GPU-hour), utilisation, electricity $/kWh, the CAPEX basis, the debt's LTC
  and rate, and the rent switch. Anything out of range is set aside and said.

**Print** gives the *customer version* (the skid, the site's verdict in one
line, the lease, the compute economics, bankability, the five years and the
assumptions) or the *full report* (everything, with every chipset, the
sensitivity grid and, for staff, the build-up).

## The skid on a portfolio site — the compute model runs by itself (2026-10-13)

Tommy, 13 October 2026, over a Topanga Terrace site whose Site Map carried one
Omega-Core skid, a 2 MWh battery and 368 kW of solar while its Pro forma tab
read 0.54% and a 59-month payback: "that information should automatically
translate into the site's details so it runs an accurate IRR and compute
model … all the data based on the site zipcode, the map that we made, those
details should auto input into the compute site pro forma … I don't want to
have to open up the site and input that details … it's the Omega Core skid …
as much as actually possible is done for the user from the drawing and our
tools so that they can just put in minimal information."

- **The skid is modelled as the skid is.** `api/_lib/site-model.js`
  `skidInput()` maps a design whose compute is Omega-Core skids and nothing
  else onto the Compute Site Pro Forma as the skid's own case: on its OWN
  480 V meter (`PRODUCT.meter.peakKw`, 135 kW planning peak a skid, 100%
  loading; `service.own`), no building load behind it (`load.none`, a new
  reading of `compute-site.js`: zero kWh, known exactly, never assumed, never
  a warning), its own CleanCell R60 as the battery at $0/kWh because it is
  inside the skid's price, 48 H100 GPUs (the skid's own whole-node capacity
  rule, `omega-compute-model.js capacity()`) sold 100% at the public spot
  market reference (CoreWeave North America, $2.46 a GPU-hour, 85% sold,
  98% up, −8% a year, 8% of revenue variable, $5,000 a month fixed — the
  skid's own operating figures, read off the one module), the skid priced
  as recorded ($639,000 as the GPU-servers line, the $125,000 controller as
  the pod line) with the engine's own site make-ready, fiber and soft costs
  beside them, and the rent to the host from the record's *Rent / month*,
  else the Omega-Core market reference ($1,000 a skid a month, 2.5% a year,
  never an offer). The host's battery, solar, chargers and Site Map cost run
  are on the HOST'S meter: named in the basis, never blended. A design that
  mixes the host's own pods with skids runs the host's case (its pods on its
  service, the cost run) and names the skids as on their own meter. A chipset
  may be chosen from the skid's own library (one with a public price;
  GB300 has none and is refused by name).
- **The ZIP is read, never asked, when the address carries it**
  (`site-model.zipOf`: the run's, the record's, the site address's, the
  Site Map project's; `site-bridge.zipFromAddress` is the one reader and
  never takes a street number or a PO box for a ZIP). A ZIP the run read is
  kept on the site.
- **The model runs by itself.** `api/site-crm.js designModel()`: whenever
  the design is read onto the site (a GET of the site, the register's *Sync
  Site Map*, the editor's own save through `omegaSiteDesignPush` →
  `design-sync {source:'editor'}`) and the design is new or changed (its
  hash) or the site's facts changed since the last try, the model runs with
  no one typing, under the compute pro forma's own gate (a workspace without
  Omega Compute is simply not modelled: no error, no record), labelled
  *Site Map design* and marked `auto: true` on `latestModel`, the audit row
  and the page. What stopped it (the facts missing, the engine's refusal) is
  kept on the site as `designModel` so the page says so and the same facts
  are not tried twice; `latestModel.designHash` is the design it stood on.
  At most ten models run per bulk sync; the rest run on their next open.
- **The pod pro forma prices the skid as recorded** (`runScenario`
  `fromDesign`): a skid's capital is $764,000 each. Since 2026-10-14 the
  Site Map cost run counts the skid too (its `omegaCore` line in
  `editor-cost.js`, at `PRODUCT.systemCostUsd`, no contingency, outside the
  ITC basis; Tommy: "the compute pod is like 639k plus the nextnrg
  microcontroller is another 125k"), and `site-model.hostOf` subtracts that
  line from the host's capex, so the host's cost run stands only for the
  host's own system and plain pods beside it — the 48-GPU spot case on the
  skid's price instead of the $2.1 M container. **It runs by itself too**
  (2026-10-14; `designProforma`, once per design, `latestProforma.designHash`,
  `auto` on the audit row, never bumping `updatedAt`): Topanga's pod block
  read 0.43% on a $2.1 M assumption-set pod a day after the skid was priced
  as recorded, beside a compute model at 27%. The two are judged on the SAME
  capital now, and each says its convention: the pod case is **60 operating
  months, pre-tax, unlevered, no exit value, the skid alone**
  (`latestProforma.convention`); the compute model is **after tax over the
  model's term, the skid and the host's system together**. The assumption
  set (`proforma.js BASE_ASSUMPTIONS`) IS the iQGen baseline Tommy handed
  over — 48 GPUs at CoreWeave's H100 spot ($2.46375 a GPU-hour), 85% sold,
  98% up, −8% a year, $5,000 a month fixed, 8% of revenue variable, 2%
  maintenance — the same figures `omega-compute-model.js DEFAULTS` carries;
  only the capital and the convention differ between the two engines.

## The whole project — the host's system in the ask (2026-10-14)

Tommy: "the site map needs to reflect the costs of the total install of the
project … the pricing on the solar the bess install and then add the labor
cost as well … so that the compute IRR reflects the total ask of the project
… the IRR to reflect the build of the system existing and the cost of that
system now with the cost of the compute system and the payback on that. the
cost of the nextnrg bess and the next nrg solar is $6.00 per watt".

- **NextNRG's solar + storage is ONE installed system at $6.00 per W-DC of
  solar** (`api/_lib/nextnrg.js SYSTEM_RATE`; NextNRG's own Topanga one-pager
  corroborates it: $1,780,063 for 315 kW DC + 300 kW / 1.8 MWh, $5.65/W DC).
  The Site Map cost engine (`editor-cost.js`) prices a NextNRG array at it —
  the array, the storage beside it and the installation labor, all in, no
  contingency on a vendor's installed price, energy property for the ITC —
  and NextNRG storage with no NextNRG solar beside it at $6.00 per W of
  rated power. An array is NextNRG's when it is stamped as its product
  (*NextNRG Solar — Custom*: `sku NEXTNRG-PV-…`, `mfr NextNRG`), a battery
  when it is the catalog's NextNRG group (`nextnrg: true`); in NextNRG's OWN
  workspace (`vendorOrg`, stamped by `api/cost-rollup.js` off the caller,
  never the body) every array and battery is NextNRG's, because what NextNRG
  draws is what NextNRG sells. Topanga: 368 kW-DC → $2,208,000 with the
  250 kW / 1,000 kWh battery inside it.
- **The Run's lines ride the record** (`omegaRunRollup` `capexLines`: solar,
  bess, nextnrgSystem, ev, controller, compute, dc, gen, envelope, site,
  indirect, contingency; `design-read.js` reads them onto `latestDesign`).
- **The compute model carries the host's system as money, never dispatch**
  (`site-model.js hostOf()` → `compute-site.js input.host`): the Run's lines
  on their asset classes (the NextNRG system and the balance of site
  equipment, indirects and contingency as *blended* energy property; solar,
  storage, chargers and the controller as themselves; pods, the electrical
  package, generation and a shell never energy property), unscaled, with no
  soft cost added twice; the host's solar sold under **the PPA on the site
  record** (`ppaRatePerKwh`, `ppaEscalatorPct`, `ppaTermYears` — Topanga's
  executed PPA: $0.2250/kWh, 2.5% a year, 28 years — through the ONE finance
  engine's own PPA on the solar it generates), else the Run's year-one
  revenue rising with inflation, else NO revenue, said as a warning
  (`HOST_NO_REVENUE`) with the cost still in the ask; its O&M $6/kWh-yr on
  the battery and $20/kW-yr on the solar. The skid still runs on its own
  meter; the host's battery is the engine's storage asset. **The capital
  request is the whole** (`latestModel.totalProjectCost`; `computeCapex`
  and `host.capex` apart), and the register, the side panel and the finance
  hand-off read it. Held by `tcomputesite.js`, `test-site-crm.js`,
  `teditorcost.js`, `tnextnrg.js`, `tcostrollup.js`.
- **Nothing a tenant reads names the source workbook or the cost
  reference**: the basis, the summary, the page and the skid facts name the
  Omega-Core skid, the public spot reference and ClearSky's recorded price
  (held by `scripts/test-site-crm.js`).
- Pages: the site record's header reads *1 Omega-Core skid*, the design card
  says the model runs by itself and what stopped it, *Investor deck &
  capital* offers the skid's chipsets and prints *What it ran on* from the
  model record's basis, the Pro forma tab says the site's IRR is the
  model's, and the register's *Sync Site Map* says it runs the model.

Not built: the host's service size and usage still come from the record
(the editor keeps the BESS Config service on the page, not on the project),
so a plain-pod design on a site with no service on record is named, not
modelled; a mixed design (host pods and skids) gives one case, the host's.

## The door — `api/omega-core.js`

The verify-token flavour, no service account. A packaged workspace must hold
Omega Compute; a legacy plan must open the editor's compute cap (the tier
ladder, the JV orgs, a live Omega Compute add-on — `addons.judge`, the one
legacy rule Helios Intake asks), with Site Map in the workspace's product and
the member's tools; pending, suspended and cancelled workspaces are refused; a
missing `omega_orgs` record fails open as the editor gate does; `omegacore` or
`computelease` switched off refuses it. GET returns the build, the card's
version and the gates — never the card or the price.

## Tests

`scripts/tests/tomegacore.js` (in `npm test`, `npm run test:omegacore`): the
product facts, the three gates and the hard gate, power from the drawing never
passing, fewer skids when the power carries fewer, the lease and buyout
arithmetic, the Run's numbers, the door on every plan shape, the catalog row,
the stamp at placement, the skid kept off the host's load (the real `derTotals`
and `omegaDer` run against a drawing), the Output button and its owner, the
client's `collect()` against a fake session, the project field, and the R60.
`scripts/test-package-producers.js` holds the packaged door.

## Not built

- **OEM quotes for the CAPEX.** The default is ClearSky's recorded skid
  price; the container range and the per-chipset estimate beside it are the
  CMDC range and a market-value proxy (the workbook's own note: replace with
  OEM/server quotes before investment approval).
- **Taxes, GPU degradation and a released reserve** are not in the compute
  cash flow (as the workbook has it): the price decline stands in for
  degradation and the debt service reserve is funded and not released.
- **ClearSky's own Omega-Core rent.** Until it is set, a rent is typed per
  site or the market reference is shown. A staff setting for the standard rent
  (rather than a code change) is not built.
- **A signed comp set** for the buyout band.
- **The utility's answer.** Hosting capacity is not public; the power gate
  asks for it.
- **A one-line node** for the skid's own service; the host's one-line simply
  leaves it off.
- **The R60 in Clean Cell's tenant product list** (`tenants/cleancell/`) — that
  list is Clean Cell's to import (`scripts/import-products.js`), and its test
  still expects placeholders.
