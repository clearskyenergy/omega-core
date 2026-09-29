# VPP Earnings Simulator

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## What it is

A tool in the workspace's **Finance** cell (`vppsim`, `/vpp-earnings.html`)
**included with every account** — the Omega Design (base) module, every tier
from trial up — that answers: *if this site's battery were enrolled in
a managed virtual power plant — the DividendVPP model (Molecule Systems
execution + Lightsmith optimisation) — what would it earn a year, stream by
stream, and who keeps what?*

It simulates what DividendVPP describes publicly (moleculesystems.com,
read 2026-09-29): value stacking across behind-the-meter bill savings (TOU
arbitrage, demand charges) and grid programmes (demand response, capacity /
resource adequacy, utility VPP and BYOD programmes), with their published
split — **70% asset owner / 20% platform / 10% installer** on programme
earnings, no upfront fee. It is **not** their number: Molecule has not
published an estimator API (their developer portal says "coming soon").

## Why it is in the base

Tommy, 2026-09-29: "this tool should be at the base function included with
every account as we can upsell this." It is the taste: every workspace can
screen a site's VPP earnings, and the results end with **Take it further**,
which sends them to the Omega Storage module card (Battery Sizer, Value
Stack, Pro Forma) — Live if they hold it, Opt in (priced by the server) if
they do not. A `billing.toolAccess` allowlist (a white-label product such as
Clean Cell's two tools) still wins: absent is not empty.

## Intake

| Input | Required | Notes |
|---|---|---|
| ZIP | yes | → state → market (ISO/RTO or utility region); the user may override the market |
| Site type | yes | residential · commercial · industrial |
| Battery kW / kWh | no | blank = 5 kW / 13.5 kWh home battery, or ¼ of peak for 2 h |
| Solar kW-dc | no | modelled from a state yield; unlocks Clean Peak where it applies |
| Load | no | **8760 / 15-minute interval CSV** (best), **12–24 months of bills** (kWh, peak kW, $), or nothing (a typical load, labelled) |
| Tariff | no | own on/off-peak and demand rates, or an OpenEI URDB record; else a regional planning rate calibrated to the bills' dollars |
| Split | no | defaults to DividendVPP's 70/20/10 |

## Where the logic lives

- `api/_lib/vpp-sim.js` — pure, server-only. Builds an 8760, runs an hourly
  dispatch (monthly demand target by bisection, event days, TOU arbitrage,
  solar charging, no export on the meter), bills before/after through the ONE
  tariff engine (`bess-tariff.js`), and prices programmes. PJM capacity reuses
  `value-stack.js` (published BRA price × ELCC class). One programme per
  exclusivity group is counted; the rest are listed with the reason.
  Load-reduction programmes are capped at the site's summer peak load;
  battery-metered BYOD programmes (`exportOk`) take the full rating.
- `api/_lib/vpp-provider.js` — the seam for the live integration. With
  `DIVIDENDVPP_API_URL` and `DIVIDENDVPP_API_KEY` set in Vercel, every
  estimate also carries `providerQuote` **beside** the simulation (never
  blended into it). What leaves our server is `request()`: ZIP, market,
  segment, battery, monthly kWh/peak — no name, address or raw interval
  file. `readQuote()` is the one function to finish once their contract is
  known. A provider failure never fails the estimate.
- `api/vpp-estimate.js` — the gate (proforma's: verify-token, absent ≠ empty
  allowlists, `toolOverrides.vppsim`, Omega Design on a packaged workspace,
  every tier from trial, 503 on a failed read) and two actions, `options` and `estimate`.
- `vpp-earnings.html` — collects, reads the CSV as text, posts, draws.
  Scenarios save to `toolData/{org}/tools/vppsim` (inputs only; an interval
  file is not stored).

Every stream carries a tier: **computed** (from this site's load and
tariff), **published** (a dated public figure), **planning** (a screening
rate; its `ref` says what replaces it).

## Linking it into the editor

`/vpp-earnings.html?zip=&segment=&kw=&kwh=&solar=&name=` pre-fills and runs,
so Site Map (or a project) can hand a site over today. A native editor panel
would POST the same `estimate` action with the placed fleet and the bill
import's months; that button is not built yet (it needs a `ribbon` entry on
a module and a `render-legacy-gates.js` pass).

## Not built

- The live DividendVPP call is written but unverified — their API is not public.
- Programme rates are planning figures; there is no rate feed or dated
  programme book yet, and no utility-specific tariff lookup (URDB is pasted).
- Wholesale (front-of-meter) participation, one-time incentives (SGIP, ITC)
  and resilience value are listed as not counted.
- Weather is a climate curve by state, not a TMY year.

Tests: `scripts/tests/tvppsim.js` (in `npm test`).
