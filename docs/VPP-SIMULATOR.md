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
| Start date | no | only for a bare list of readings with no dates (`load.startDate`, YYYY-MM-DD); a CSV's own date column wins, and the result says so when they differ |
| Tariff | no | own on/off-peak and demand rates, or an OpenEI URDB record; else a regional planning rate calibrated to the bills' dollars |
| Split | no | defaults to DividendVPP's 70/20/10 |

## Where the logic lives

- `api/_lib/vpp-sim.js` — pure, server-only. Builds an 8760, runs an hourly
  dispatch (monthly demand target by bisection, event days, TOU arbitrage,
  solar charging, no export on the meter), bills before/after through the ONE
  tariff engine (`bess-tariff.js`), and prices programmes. One programme per
  exclusivity group is counted; the rest are listed with the reason.
  Load-reduction programmes are capped at the site's summer peak load;
  battery-metered BYOD programmes (`exportOk`) take the full rating. What the
  engine holds to (each pinned by `tvppsim.js`, each test failing without its
  rule):
  - **One loss model.** The round trip is split evenly: a kWh bought stores
    √rte, a kWh delivered takes 1/√rte out of the store, so delivered over
    bought across the year is the round trip. The demand-target bisection
    uses the same model and counts refill only in the hours the dispatch
    actually charges in; programme kW is limited by the energy the battery
    *delivers*.
  - **The reserve looks ahead.** The store each hour keeps what the
    over-target hours (and events) still to come need, less what the
    charging hours between can put back — so an evening's arbitrage never
    spends what tomorrow morning's demand shave needs, and every month holds
    the target the bisection set. The bisection tests each day alone, which
    cannot see an over-target stretch that runs past midnight or a month's
    end with no charging hour between, so each month's target is then
    checked in order with that same reserve across the boundaries and a
    month that breaks it is raised to the lowest target that holds.
  - **Events are priced off the dispatch.** ELRP (the one programme paid per
    kWh delivered) runs its own event days through the dispatch: seven
    3-hour events a year for a home battery (sub-group A.4), three 4-hour
    events for a business (A.2), from 4 pm — the 2024 record (PG&E's and
    SCE's PY2024 ELRP evaluations: seven A.4 events each, two and three
    A.2), not the 60-hour cap. It is worth the kWh the battery gives in
    those hours *beyond its everyday dispatch* (ELRP pays incremental
    reduction against a baseline of similar days), × performance ×
    $2/kWh; an event takes only energy no later over-target hour needs,
    and the battery never charges from the grid inside an event (that
    would come off the reduction paid for); holding charge for the events
    is a cost the TOU stream carries when ELRP is counted, and the group picks
    ELRP only if it pays net of that cost. A home battery that already
    empties into 4–9 pm for TOU savings has nothing extra to give and ELRP
    is listed with that reason.
  - **Bill savings stay with the customer.** The tariff's streams (demand,
    TOU, tax included pro rata so they add up to before → after) and the tag
    programmes on the customer's own bill (PJM PLC/5CP, ERCOT 4CP, category
    `bill`) are kept whole; only grid-programme earnings are split 70/20/10.
    `totals.billSavings` = `tariffSavings` (the before → after bill) +
    `tagSavings`.
  - **PJM through a CSP is a Demand Resource**, accredited at PJM's Demand
    Resource class rating (91% for 2028/29, beside the storage classes in
    `value-stack.js`), not in the 4/6/8/10-hour storage classes. It is
    nominated at what the battery can hold for four hours (planning; the
    CSP's nomination replaces it) — `published` only when the battery's
    rating, or the site's summer peak read from its own interval data or
    billed peaks, sets the kW. When the four-hour assumption sets it, or a
    summer peak read off a load shape (the typical load, or bills without
    peaks — load quality `low`), the row is `planning` and says why.
  - **Programme status is dated, not live** (read 2026-09-29): DSGS Option 3
    is `closed` (CEC Guidelines 5th ed., CEC-300-2026-001-CMF, adopted
    2026-04-27: 2026 limited to aggregators from October 2025; no 2027
    funding) and listed, never
    counted; ComEd is **Rider SDVPP** ($10/kW-Season of average injection
    4–6 pm weekdays Jun–Sep, ICC-approved, effective 2026-07-16, service by
    2027-03-01; Rider VPP/BYODLR was withdrawn in Docket 25-0678); Hawaii is
    **BYOD Plus** (Battery Bonus closed 2024-07-01), which takes only
    batteries paired with renewables: $60/kW-yr is a planning figure for
    its recurring export credit (Rule 33's formula, zero beyond NEM's own
    retail credit), and its $400/kW upfront incentive is one-time, listed
    with the one-time incentives on the kW the estimate commits. CBP/DRAM
    and ELRP are not called exclusive: ELRP Group B would pay the reduction
    beyond a CBP/DRAM
    commitment, a top-up not modelled, so the better of the two is counted.
  - **Where.** ZIP3 → state → market, refined by prefix where a state
    straddles two markets (El Paso 885, Entergy Texas 776–777, SWEPCO,
    OG&E, I&M, Kentucky Power, Dominion NC 279; 201 is Virginia; 008, the
    US Virgin Islands, is refused; 289 is TVA-distributor territory, and
    278 names Rocky Mount and Wilson as municipal). Those PJM refinements
    in North Carolina, Indiana and Kentucky are bundled: no retail choice,
    so no PLC-set capacity charge on the bill, and the state has closed PJM
    demand response to retail customers except through the utility (NCUC
    E-22 Sub 418, 2010; IURC Cause 43566, 2010; KY PSC Case 2017-00129,
    2017). There the CSP capacity row and the PLC row are listed with that
    dated reason, never priced, and a business gets the utility's own
    demand-response tariff as a planning row ($40/kW-yr; I&M Rider D.R.S.1,
    Kentucky Power Rider D.R.S.); a home battery has no route on file. New
    York is by utility: Con Edison (100–104, 105–108, 111–114,
    11004/11005) earns its DLM rate, New York
    City (Zone J) the NYC SCR price, and Long Island (the rest of 110,
    115–119: PSEG Long Island, Zone K) the upstate planning rates under its
    own label. A market override that changes the market drops the area.
  - **Interval files.** Lines end in CRLF, LF or a lone CR; the delimiter
    is the one most sampled lines carry (a stray tab in a title never
    decides). Quote-aware CSV; a currency cell is never a reading; in a tab
    or semicolon file a comma in a number is read the way the file shows it
    (decimal commas "0,25" / "1.234,5", or a thousands "1,250.0"), and a
    reading that could be either ("1,250"), or that carries digits but is
    not a number, is refused with its row — never read as zero. The load
    column is picked by its header (usage / kWh / kW / demand, money words
    as whole words, never cost, export, power factor, kVA, kVAR, volts,
    amps, or a column whose last word is a time part such as "Usage Hour");
    two load columns are narrowed by the unit (an explicit kWh / kW first),
    still two is refused, and a headerless file with more than one numeric
    column is refused. Once the readings carry a date or time, an unstamped
    row is a note or a footer ("Total") and a stamped row with a blank or
    "N/A" reading is a gap (zero within 2%, said so). The date column is
    read on every row: its day/month order is settled across the file
    (month names, 20250605 and two-digit years too), a newest-first file is
    read oldest-first, and dates that do not span the readings are said and
    drop the load to `medium`. The first date lays the year on the calendar
    (29 Feb removed, wrapped by date, then moved by the shift of up to
    three days that lands the most weekends on weekends over the whole
    year, with how many days still differ); a file's own date wins over a
    given start date, and says so; with no date the readings are read as
    starting 1 January, said so, and the load is `medium` quality, not
    `high`. Cells longer than 32 characters are never tested and the
    number test is linear; the text cap is 4,300,000 characters
    (`MAX_TEXT`, also `options().maxTextChars`, the page's number: a year
    of 15-minute Smart Meter Texas rows is ~3.1 MB, and Vercel takes
    4.5 MB), refused as a size.
  - **Bills.** A month with no kWh (no bill, or dollars only) is filled
    from the climate curve and never calibrates the rate; the calibration
    takes the customer charge out of both sides, so the calibrated bill is
    the dollars paid. A kWh-only battery takes a kW at the suggested
    battery's duration and is refused past twelve hours.
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
  `options` also returns the server-resolved `orgId` (alias-folded, e.g.
  fenecon.de → fenecon.com), which is the org the page saves under.
- `vpp-earnings.html` — collects, reads the CSV as text, posts, draws.
  Scenarios save to `toolData/{org}/tools/vppsim` as `{ v:1, scenarios:[…] }`:
  inputs only. An interval file is not stored (its unit and first-reading
  date are), and a URDB tariff is stored as text (`tariff.urdbJson`) because
  Firestore refuses nested arrays. The page reloads when the signed-in
  account changes, so one person's scenarios never reach another's org.

**A deploy that adds a tool to a module runs the backfill.** A packaged
workspace's `billing/current.toolAccess` is a copy saved when its plan was
activated, and `firestore.rules` (`packageWrite`) reads that copy for a
tool's `toolData` write. So after this tool joined Omega Design, a package
activated earlier runs the estimate (the API projects from `modules[]`) but
cannot save a scenario until the copy is refreshed:
`node scripts/backfill-packaged-toolaccess.js` (dry run, a per-org report),
then `--apply` (adds only, never removes, one `admin_audit` row per change;
needs Admin SDK credentials). `scripts/tests/tpackagedtoolaccess.js` holds
it. The lasting fix, reconcile re-deriving a live trial's grants when it has
no invoices yet, is a separate billing change.

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
- Programme rates are planning figures unless marked published; programme
  status is dated in each row (read 2026-09-29), not a live feed. There is
  no rate feed and no utility-specific tariff lookup (URDB is pasted).
- Capacity programmes (SDVPP, ConnectedSolutions, BYOD, CBP/DRAM, DLM…) are
  priced on committed kW; their own daily or event dispatch is not
  simulated, so the bill streams are not reduced for it. Only ELRP runs
  through the dispatch.
- The dispatch never exports past the meter. ELRP counts exports in an
  event (a NEM-paired home battery can earn there); that is not modelled.
- ELRP Group B on top of CBP/DRAM (the incremental top-up) is not modelled.
- The PJM Demand Resource nomination is a four-hour planning assumption;
  Long Island (PSEG Long Island, Zone K) has no rates of its own here.
- The utility is inferred from the ZIP3, not a utility boundary; mixed
  prefixes (278, 105) say so in the area label and the market can be
  overridden.
- The bundled-PJM rule covers North Carolina, Indiana and Kentucky (FERC's
  Order 719 opt-out states in PJM). Virginia and West Virginia are also
  largely bundled but not reviewed yet: their PLC row is still offered.
  The utility demand-response tariff in the bundled states is a planning
  figure, not the rider's terms.
- `api/price-site.js` still carries ComEd's VPP at $150/kW-yr (the
  withdrawn Rider VPP's planning rate); it is not this engine's figure.
- Wholesale (front-of-meter) participation, one-time incentives (SGIP, ITC)
  and resilience value are listed as not counted.
- Weather is a climate curve by state, not a TMY year.

Tests: `scripts/tests/tvppsim.js` and `scripts/tests/tpackagedtoolaccess.js`
(in `npm test`); `scripts/render-vpp-earnings.js` renders the real page on
the Firebase double against the real engine (in `check:pages`).
