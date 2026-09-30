# Compute Site Pro Forma and the Edge Site Screen

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## What it is

Omega Compute is sold as "data center campus design, power and load
screening" (the October 2026 price book). The editor already screened a
campus: megawatts of IT load against a substation ceiling. It could not
screen the edge case: can a building's existing service carry GPU compute
pods beside its EV chargers, a battery and its own load?

That is the metro-edge model Laitent (by Xeal) describes publicly: inference
pods placed on power already permitted for EV charging, "one panel, two
revenue streams" (laitent.ai/realestate and /computecustomers, read
2026-09-30).

Two surfaces answer it on one engine:

- **Compute Site Pro Forma** (`computeproforma`, `/compute-proforma.html`) is
  in the workspace's **Finance** hexagon, right after the VPP Earnings
  Simulator, and in the Compute hexagon. It has seven steps, the same as the
  BESS Pro Forma: site and service, building load, EV charging, compute,
  battery and load balance (with a sizing sweep), deal and financing, and
  results and report. The results are the BESS Pro Forma's own: headline
  returns, IRR build, more metrics, warnings, after-tax cash flow with the
  annual table, sensitivity, conventions and the investor deck.
- **Edge Site Screen** is the `rb-site-screen` button in the editor under
  Compute › Size, next to Load Screen. It pre-fills from the drawing, screens
  the site on the server, and prints a verdict (ADVANCE, VERIFY or HOLD) with
  the next gate. It then hands the site to the pro forma through its URL.

**The example.** *Run the example* sits on step 1, in the live summary and on
the empty load balance and results, and `?example=1` opens the page on it. It
is an illustrative tight site: a 400 A, 480 V apartment service in Austin with
4 H200 pods, 12 managed 11.5 kW chargers and a 100 kW / 200 kWh battery,
under the power-layer deal. The chargers at full power would overrun the
service, so managed charging, the battery and the on-demand GPUs all have
work to do, and the model runs at once. The construction and service months
follow today's date (two and nine months out). Whatever the person had typed
comes back from the toast (*Put mine back*).

**The guide.** `guides/compute/Compute-Site-Pro-Forma.pdf` (served at
`/guides/compute/…`, linked as *Guide* in the page's header) is the user guide
with the OMEGA mark (`omega-logo.png`, the product's icon) on every page: a cover, where to find the tool, the example,
each of the seven steps, reading the results, the Site Screen and the
planning figures. `npm run guide:compute` (`scripts/guides/compute-proforma.js`)
builds it from the REAL page against the real endpoint: it runs the example,
photographs every card and quotes only figures it read off the page, so a
change to the page is a rebuild of the guide, never an edit to it. Like
`guides/editor/`, the folder is outside `build.js` and `tguides.js`.

**Portfolio analysis.** *Portfolio* in the page's header (beside the saved
scenarios; also *Run a portfolio analysis* under Compare scenarios, and
`#portfolio`) opens a panel over the page. The person picks saved scenarios
(Select all, Clear, Only ADVANCE, a filter past eight; the picks are
remembered in this browser, `omega_computepf_picks_v1:<org>`) and runs them
together: `POST /api/compute-proforma {action:'portfolio', sites:[{id, name,
at, input}], today}` → `api/_lib/compute-portfolio.js`.

- Each scenario runs through `compute-site.model` **exactly as saved**. Nothing
  is re-sized: sizing is Step 5's Find the best size, saved.
- The portfolio is the **sum of the after-tax cash flows** year by year, every
  site on its own Year 0 as if all closed together, each keeping its own
  term. Its IRR is the finance engine's IRR of that sum (never an average of
  the sites' IRRs), its NPV the sum's at the rate most sites use (said when
  they differ), its MOIC years 1–N over the equity at close, its payback the
  engine's.
- Two portfolios: every site with capital, and the ones that **fit the
  existing service**, `compute-site.fitsService`, the ONE rule the sizing
  sweep also reads (no firm compute lost to the limit, under 5% of charging
  unserved).
- A scenario that cannot run is listed under *Not run* with the reason: an
  interval file is never stored with a scenario (the picker holds those back
  and says so), or the model refuses its inputs. A lease with no capital is
  listed with its rent's value and never summed. A name picked twice gains
  the day it was saved.
- *What needs a look* groups the model's warnings, the no-fit rows and the
  bills whose kWh the billed peak cannot draw (the load builder's own note),
  each once with every scenario it covers; a flag shared by several sites
  says it in general, never one site's figures.

**The workbook** (`Compute-portfolio-<n>-sites-<date>.xlsx`) is written on the
server by `api/_lib/portfolio/xlsx.js`, the repo's one .xlsx writer
(deflated through `portfolio/zip.js`): **Portfolio** (a row per site: load,
service, fit, equipment, capital, returns; the two portfolios as live
totals), **After-tax cash flow** (Year 0 to N per site, the two sums as `SUM`
and `SUMIF`, their cumulative), **Metric verification** (the spreadsheet's own
`IRR`, `NPV` and `SUM` of each cash flow beside the model's, and the
differences), **Site inputs** and **Method & flags**. Every formula carries
the value the spreadsheet will compute, so a preview that never recalculates
reads right, and the workbook asks Excel to recalculate on open. While it was
built, LibreOffice Calc recalculated every formula and matched each cached
value to 1e-9.

**Who owns it.** Omega Compute owns the tool (`api/_lib/modules.js`). A
packaged workspace needs that module. A legacy workspace needs Standard or
above, or a trial, which is the BESS Pro Forma's rule. The endpoint refuses
anyone else, whatever a page shows.

## Where the logic lives

| File | Role |
|---|---|
| `api/_lib/compute-site.js` | Pure, server-only engine. Holds the hourly load balance, the charging schedule, the compute tiers, the battery dispatch, the sizing sweep, the year-by-year schedule, the three structures, and the screen verdict. |
| `api/_lib/vpp-sim.js` (`site.*`) | The one load builder (interval, bills or a typical shape), tariff calibration, the billing wrapper and the solar profile. Its builders are exported, never copied. It adds two host shapes: a multifamily house meter and retail. |
| `api/_lib/bess-tariff.js` | The one tariff engine. The final bills come from here. |
| `api/_lib/proforma-engine.js` | The one finance engine (NREL SAM single owner). The returns, IRR build, tax, ITC, debt and sensitivities are all its own. |
| `api/_lib/compute-portfolio.js` | Pure, server-only. Runs picked saved scenarios as saved, sums their after-tax cash flows, reports what could not run and what needs a look, and writes the workbook. |
| `api/_lib/portfolio/xlsx.js` | The one .xlsx reader and writer: `workbook()` writes sheets with the house style, widths, frozen panes, filters, merges and formulas with cached values; `build()` is the BESS portfolio's upload template. |
| `api/compute-proforma.js` | The gate, using the pro forma's rules. Actions are `options`, `context`, `screen`, `model`, `optimize` and `portfolio` (at most 30 scenarios, 4 MB). It has a 60 s function limit in `vercel.json`. |
| `compute-proforma.html` | Collects inputs, posts them, and draws the results. The deck comes from `proforma-logic.js`. The Portfolio panel picks saved scenarios, posts them and hands over the server's workbook. |
| `editor.html`, patch "EDGE SITE SCREEN" | Gathers what the drawing knows, posts `screen`, and links to the page. |

No figure is computed in a browser. The deck prints words the server wrote
(`result.story`).

## The hour-by-hour model

It runs 8,760 hours on one limit: the service rating (kW, or amps × volts ×
√3 × pf) × the continuous loading limit (NEC's 80% by default), plus any
upgrade. Load is placed in contract priority:

1. **The building** is firm. Its load is an interval file, 12–24 months of
   bills, or a typical shape for the host type, labelled as such.
2. **Firm compute** is firm. Offtake GPUs are take-or-pay and draw serving
   power every hour. Edge-contract GPUs follow a diurnal inference curve at
   their average utilisation, inside their contract hours. Every GPU draws
   idle power whenever it is on. At the meter a GPU draws its rating × (1 +
   server overhead) × PUE.
3. **EV charging** is placed inside what the service has left. Sessions
   arrive by pattern (residents overnight, workplace, retail, fleet or a
   custom window) and leave after their dwell. The calendar wraps: a car that
   arrives on 31 December leaves in January.
   - *Unmanaged:* each car charges at full power on arrival, held under the
     service by the panel's load management (NEC 625.42 EVEMS).
   - *Managed:* each session's energy goes into its cheapest hours without
     lifting the month's firm peak, then into the lowest hours of the stay
     (earliest departure first).
   - Energy that cannot be delivered before a car leaves is **unserved** and
     reported.
4. **The battery and on-demand GPUs** share the rest. For each month a
   demand target is searched: 17 points across the feasible range, then 7
   around the best. At each target the battery discharges to hold it, then
   on-demand GPUs are curtailed. The target kept is the one worth the most:
   on-demand revenue less energy, demand charges (flat and time-of-use
   periods), battery wear and lost firm revenue. The battery charges in the
   day's cheapest hours with room, or when later hours that day need it, and
   arbitrages a time-of-use spread that clears its losses and wear.
5. **Firm protection.** The battery holds the energy that firm overloads in
   the next 24 hours will need. When it holds less, it charges under the hard
   limit and curtails on-demand GPUs to make room. Firm load above the limit
   that the battery cannot cover is lost firm compute, reported and priced
   as lost edge revenue.

"On-demand schedule" has three settings:

| Setting | Behaviour |
|---|---|
| **Follow the site's peak** (default) | The search above decides where to curtail. |
| **Always on** | On-demand GPUs are curtailed only against the service limit. |
| **Off-peak only** | No on-demand GPU-hours are sold in the tariff's dearest hours. |

**Screen verdicts.** These are Patch 56's gate ladder, adapted to a shared
service:

| Verdict | When |
|---|---|
| HOLD | Firm load exceeds the service, or hours exceed it even with the battery. |
| VERIFY | More than 5% of charging is unserved, or unmanaged chargers at full power would exceed the service (install an EVEMS). |
| ADVANCE, fits the existing service | The peak stays within 85% of the limit. |
| ADVANCE, tight margin | The peak goes above 85% of the limit. The next gate is a load study. |

**Sizing sweep** (`optimize`). Pods run from 1 upward, as far as the service
could plausibly carry. Batteries run at 0, then a tenth, a quarter and
two-fifths of the limit for two hours, the largest also for four hours, plus
the user's own. Each cell is a full year of dispatch and a finance-engine
run. The best is the highest NPV that fits: no lost firm compute and at most
5% unserved charging. A lease is swept as "own".

## From one year to the term

Year one is simulated. The later years are a schedule handed to the finance
engine in nominal dollars:

- **GPU-hour prices** fall by the decline rate for each year of the
  hardware's age, and reset when the GPUs are refreshed. The refresh happens
  every N years while at least two years of the term remain. Offtake
  re-prices only at each contract term.
- **Ramp.** Year one runs at the ramp share of steady utilisation.
- **Battery fade.** The battery's share of on-demand revenue and of the bill
  fades with its capacity.
- **Escalation.** The electricity is escalated at the utility escalator.
  Charging prices, rent and O&M escalate at their own rates.
- **GPU refresh** is the engine's new `refresh` block: 5-year MACRS, no
  credit, paid from cash or a reserve.

Electricity is the whole meter billed with the project less the building
billed alone. When the project lowers the building's bill, that saving is a
revenue line.

## Three ways to own it

| Structure | Capital | Revenue | Costs |
|---|---|---|---|
| **Own and operate** | GPUs, pods, make-ready, fiber, chargers, battery, solar, upgrade, plus soft costs | Compute by tier; charging | Incremental electricity; operator platform fee; host rent (fixed + % of gross); fiber; hardware and pod O&M; charger network and processing; battery O&M; insurance |
| **Own the power layer** | Everything but the GPUs | A share of gross compute (default 20%); charging | Electricity, less the operator's compute share by default; charger, battery and insurance costs |
| **Lease the power** | None, or the host's own chargers | Fixed rent, electricity paid; charging if the host keeps it | Charger costs, if the host keeps charging |

The defaults follow **Laitent's published host models** (read 2026-09-30):

- Tenant rent of $25K/yr for 10 years, electricity paid, no capital.
- $80K for 8 chargers with $35K/yr rent.
- $372K for the compute layer at a 20% gross share, about $140K/yr and a
  10-yr IRR of 36%+.
- Co-investment in an SPV.

Every run prices all three side by side. The chosen structure gets the full
pro forma. A lease with no capital gets the NPV of its rent and the property
value at a cap rate, never an IRR.

## Laitent's calculators: what could be used

Laitent's "Plan your cluster" (`cluster-map.html`) is a front end over its own
list of Xeal properties. It sizes a cluster by GPU count or power and shows
the properties in a radius. It has no public API: its form posts a lead to
Laitent's own back end.

We use its **published figures**:

- 0.60 / 0.70 / 1.30 kW per GPU and 48 / 48 / 32 GPUs a pod for RTX PRO 6000,
  H200 and B300.
- The 40 / 30 / 30 revenue mix: offtake floor, edge contracts, on-demand
  overflow.
- The four host models.

Each is cited on the page and in the result. **Not used:** the property data
(proprietary) and any live quote. A provider seam like `vpp-provider.js` can
be added if Laitent publishes an API.

**A tie-out, not a calibration.** One 48-GPU H200 pod at the planning prices
grosses $650K–$900K a year in `tcomputesite.js`. Laitent publishes about
$710K EBITDA a property with one H200 pod.

## Planning figures (September 2026)

| Figure | Default | Source |
|---|---|---|
| H200 $/GPU-hr (offtake / edge / on-demand) | 2.25 / 3.25 / 2.50 | Below cloud list. The H200 on-demand median is $4.40 (listings $2.09–$13.78) and spot starts at $1.99 (getdeploying.com index, jarvislabs.ai, thundercompute.com). |
| B300 | 4.25 / 5.75 / 4.75 | Reserved median $5.71, on-demand median $7.87. |
| RTX PRO 6000 | 0.85 / 1.30 / 1.00 | From $0.93, median $1.48. |
| GPU installed cost | $40K H200, $20K RTX PRO, $62K B300 | HGX H200 about $46K a GPU all-in; the RTX PRO 6000 server card is $14,999. B300 is a planning figure. |
| Pod infrastructure | $250K a pod, plus $60K make-ready and $25K fiber | Set against Laitent's $372K compute layer. |
| Chargers | $9K a port installed | Planning figure. |
| Battery | $550/kWh installed | Planning figure. |

Every figure is an input the user can type over. The result's warnings mark
the planning ones.

## Changes to shared code (all neutral for existing users)

- **`proforma-engine.js`**
  - `revenue.other[i].schedule` and `opex.lines[i].schedule` take yearly
    nominal dollars used as given.
  - A new `refresh` block handles equipment refresh.
  - `revenue.bess.mode: 'site'` covers a battery whose value is inside the
    site's own lines. It quotes no LCOS and raises no "not sized" warning.
  - The three reference decks still calibrate (`tproformaengine.js`).
- **`proforma-logic.js`** accepts `opts.title`, `opts.flow` (with a `compute`
  glyph) and `opts.terms`. Without them a BESS deck is unchanged.
- **`vpp-sim.js`**
  - Exports its site builders (`site.*`).
  - Factors out `calibratedTariff()`.
  - Adds the multifamily and retail shapes.
  - The VPP intake still offers three segments.
  - A bill whose kWh its billed peak could not draw running flat out (a load
    factor above 1.0) is now said in the load's notes, by month. The month is
    still shaped to its kWh, as before; no figure moves.
- **`compute-site.js`** exports `fitsService` (the sweep's fit rule, now also
  `balance.fits` on every screen) and `STRUCTURE_SHORT`; no figure moves (the
  guide's example reads the same to the dollar).
- **`proforma-engine.js`** exports `npv` (its own `npvAt`).
- **`portfolio/zip.js`** `build(files, { deflate: true })` deflates; stored
  entries stay the default. **`portfolio/xlsx.js`** `build(rows)` is now one
  sheet of `workbook()`; the upload template round-trips as before
  (`scripts/test-portfolio.js`).

## Tests and checks

| Check | What it covers |
|---|---|
| `scripts/tests/tcomputesite.js` (in `npm test`) | Input, physics invariants, schedule, structures, sweep, gate, deck and registrations. The invariants: the meter never exceeds the limit, energy balances every hour, the battery stays inside its limits, firm load is lost only when firm load itself exceeds the service, and managed charging never costs more than unmanaged. |
| `scripts/tests/tproformaengine.js` | The engine extensions. |
| `scripts/tests/tcomputeportfolio.js` (in `npm test`) | The portfolio: each site is the model's own figures as saved, fit is the one rule the sweep reads, the sums, IRR, NPV, MOIC and payback are the engine's on the summed flow (not an average), what cannot run is listed with why, flags never quote one site's figures for many, and the workbook is well-formed with formulas whose cached values agree with the model to a cent; the writer escapes and names sheets safely; the upload template still round-trips. |
| `scripts/render-compute-proforma.js` (in `check:pages`; `npm run check:compute`) | The page in Chromium against the real endpoint, on a desktop and a 390 px phone, including a workspace refused for lacking Omega Compute. It runs the example from the empty results and puts typed input back, and fails on a switch drawn without its track, a month field that is not a month and a year, a chart drawn at another width than its card, axis labels closer than 4 px, a wrapping tax control or a rate that reads -0.0%. The portfolio: picks, the interval scenario held back with its reason, a refused one under Not run, the chart at its card's width, flags not cut short, the downloaded .xlsx and its five sheets, a row opening its scenario, Tab held inside and Escape closing, `#portfolio`, and no sideways scroll on a phone. |
| `scripts/render-legacy-gates.js` | The Site Screen in the real editor on every legacy tier and with Omega Compute bought. |
| `scripts/guides/compute-proforma.js` (`npm run guide:compute`) | Builds the guide from the real page; asserts the example runs, each step renders, the sweep names its best size and the scenario saves, then runs four more saved sites and the example as a portfolio and photographs the picker, the results and the table. |
| `scripts/render-workspace.js` | The Finance panel order. |

## Not built

- **No live operator quote.** Laitent has no public API. Prices are planning
  figures until an operator's contract replaces them.
- **Charging is modelled as expected sessions**, not random arrivals. The
  coincident worst case is reported separately as every charger at full
  power (NEC 625.42).
- **Charging is placed before the battery.** On a site whose firm load
  exceeds the service, chargers can take the night-time room the battery
  would recharge in. The screen then reports lost firm hours, which is
  conservative.
- **A typical weather year.** PUE is constant, with no temperature-driven
  cooling. There is no residual value for GPUs at the end of the term.
- **One meter, one tariff.** A separately metered compute service, demand
  ratchets in the monthly search (the final bill applies them), and export
  credit for surplus solar are not modelled.
- **Existing packaged workspaces holding Omega Compute** keep a stored
  `billing/current.toolAccess` written at activation. `firestore.rules` checks
  it on scenario saves, so the page saves to the browser until the package is
  next activated or changed. The VPP simulator has the same gap.
- **The Site Screen reads what the session knows.** The project has no
  structured service rating or ZIP, so the form asks for what the drawing
  lacks.
- **The portfolio runs scenarios as saved, at most 30 at once.** It does not
  re-size a site (a site that does not fit is shown as saved), it aligns every
  site on its own Year 0 rather than on its calendar dates, and a scenario
  saved with an interval file runs only after the file is attached and the
  scenario saved again, because the file is never stored.
