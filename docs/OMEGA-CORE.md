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
  project kinds and the guided build's taps. Without that, one 75 kW skid read
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
**height is not stated**: the drawing's 82.75 in overall and the datasheet's
2,200 mm (86.6 in) cabinet disagree — to confirm with Clean Cell. `evSkid: true` keeps the auto-sizer from recommending an EV
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
| **Qualified** | every gate clears on confirmed facts (the utility's figure with a confirmed will-serve, gig fiber on site, the zoning, the chargers drawn) | priced |
| **Qualified with conditions** | confirmed, with an engineering or contract condition (e.g. the utility's kW carries the compute but the battery recharge is capped) | priced |
| **Needs further qualification** | anything open, or resting on the drawing or the public record; the result lists exactly what closes it | an **indicative range, marked "not an offer"** — or none at all while fiber or zoning only looks *unlikely* on the public record |
| **Does not qualify** | only a confirmed fact: the utility declined a new service, the utility's own kW is under one skid, zoning the rep entered is residential | none |

Each gate says the same in its own chip: *Clears*, *Clears with conditions*,
*Needs qualification*, *Unlikely — confirm*, *Does not qualify*.

**The lease card** (`omega-core-lease-v1`, ⚠ a seed, not comps): **$750 /
$1,000 / $1,500 per skid per month**, escalating 2.0 / 2.5 / 3.0% a year, priced
over the term (5-year minimum, up to 15). Low is compute-lease's floor; base is
75 kW at compute-lease's high capacity band plus about three parking stalls of
ground; high is for a site that clears every gate on evidence. Every entitled
caller sees the offer; the build-up is staff-only. Replace with signed comps and
bump the version before quoting it as ClearSky's position.

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

- **The skid's height.** The drawing says 82.75 in overall; the R60 cabinet
  alone is 2,200 mm (86.6 in) on the datasheet. Omega-Core carries the
  drawing's figure; the R60 row states none until Clean Cell confirms.

- **Compute revenue.** The skid's own GPU revenue and ClearSky's return on the
  $450,000 are not modelled here; `api/_lib/compute-site.js` is where that
  belongs when the Solela figures arrive.
- **A signed comp set** for the lease card and the buyout band.
- **The utility's answer.** Hosting capacity is not public; the power gate
  asks for it.
- **A one-line node** for the skid's own service; the host's one-line simply
  leaves it off.
- **The R60 in Clean Cell's tenant product list** (`tenants/cleancell/`) — that
  list is Clean Cell's to import (`scripts/import-products.js`), and its test
  still expects placeholders.
