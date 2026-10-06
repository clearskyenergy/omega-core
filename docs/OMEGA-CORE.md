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
| Skid | 336 × 87 in, 8 in base, 82.75 in overall | ClearSky's drawing |
| Price | **$450,000 per skid** | ClearSky |

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
  and a spec-sheet row, each saying ClearSky-owned and not host capex.
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
40% of the $450,000 at year 5 ($90k / $135k / $180k), declining geometrically for
a longer term, never under 5%. ClearSky's program outlay is the system cost,
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
96.0%). Where a cell pointed at the wrong row it is corrected and the
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
- **A CAPEX basis**: the CMDC range (the workbook's default, general-purpose
  air-cooled high, $724,471), the chipset-scaled estimate, the Omega-Core skid
  price ClearSky recorded ($450,000), or a typed figure. Which one is
  ClearSky's position is not decided; the dialog says which was used.
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

- **OEM quotes for the CAPEX.** The compute model's costs are the CMDC
  estimated range and a market-value proxy per chipset (the workbook's own
  note: replace with OEM/server quotes before investment approval), and which
  CAPEX basis is ClearSky's position — the $450,000 skid price or the 75 kW
  container range — is not decided.
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
