# Site assessment: Run a portfolio, see what each site carries

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Tommy, 2026-11-09: "when i upload a portfolio it then would run all these
numbers … size pods to capability … a bess IRR and projections … a tesla
supercharger ROI … the power column [says] how much power is available on
that site, what is the kVA size of the transformer"; "i should be able to
select run and it will run all the sites … a metric that identifies if it
needs certain verifications … based on the site readiness checklist; the
goal is to get sites shovel ready"; "approve for one of the projects so we
can send it to pre dev for either tesla supercharger, bess, compute or a
hybrid … tag it by which portfolio partner … our goal is to lock up land
that is energized and has capacity".

The register (`portfolio.html`) answers that with one button. **Run** on a
selection, **Run all sites** in the head, and every import by itself: each
site is sized and priced from the facts on file within seconds, then the
Grid Atlas and parcel screens run a site at a time and the site is assessed
again on what they found.

| File | What it is |
|---|---|
| `api/_lib/portfolio/assess.js` | the rule: power, the compute shelf, the readiness checklist and score, the verifications, the approval. Pure, ES5, no clock |
| `api/_lib/portfolio/assess-bess.js` | a grid-participation battery on the free power: ten years, IRR, NPV, taxes, the incentive-swept loan |
| `api/_lib/portfolio/assess-supercharger.js` | fast-charging dispensers on the free power, in the maker's sets of 4, 8 or 12: fifteen years, the site-host return |
| `api/_lib/portfolio/assess-door.js` | the actions and reads, mounted by `api/site-crm.js` |
| `omega-portfolio-assess.js` | the pages' one drawing of it (ES5): the row's cells and the side panel's card |
| `scripts/tests/tassess.js` | 20 cases: both engines to the cent, the library, the door on the Firestore double |

`api/site-crm.js` stays the one door. `scripts/test-site-crm.js` holds the
actions through the real handler, and `npm run check:workspace` draws the
whole flow in Chromium with the real library behind the stubbed endpoint
(`flow /portfolio.html (assessment)`).

## What an assessment answers

**The three uses are alternatives.** Compute, the battery and fast charging
are each sized on the WHOLE free capacity by itself. They are never added
together, and the page says so.

### Power: the limit, the peak, what is free

| on file | free power | basis | grade |
|---|---|---|---|
| a limit and a peak | limit − peak | `measured` | A |
| available power entered (MW) | as entered | `entered` | B |
| a limit, no peak | the whole limit | `ceiling` | C |
| nothing | none | — | D |

- The limit is the lower of the service (`serviceCapacityKw`) and the
  transformer (`transformerKva` × 0.8 continuous).
- The peak is the existing peak on record, else the reported peak when its
  definition is resolved. An unresolved reported peak is flagged and **not**
  subtracted. No peak is never a zero peak.
- A **ceiling** is said everywhere it is used ("a ceiling, not free
  capacity"), and it carries the verification that firms it.
- `transformerKva` is a recorded fact (the import sheet's *Transformer
  (kVA)*, the site record's form). It is never derived from the service
  figure and no public source carries it.
- The utility's published hosting figure, where the screen read one, rides
  beside the site's own number and flags a size above it.

The register's **Power** cell prints the free kW, its basis, and the
transformer's kVA (or "kVA not on file").

**Not sized is not "No fit"** (2026-11-09). A site with no power figure on
file was never judged: its Compute, Battery and Charging cells read *Needs
power*, in amber, and the card reads *Not sized*. *No fit* is kept for a
site that was sized and is too small. (Nine sites of a 104-site intake
sheet had a blank service size and read "No fit" beside the two that are
truly under the smallest pod; the nine are the ones to ask the partner
about.)

### Compute: one right-sized pod a site

Tommy, 2026-11-09: "i dont want to do a model of putting more 75 pods on
their i want it to be sized by 75, 150, 350, 500, 750, and 1mW primairly
this is because of spacing and we need to alo account for chillers"; "we
have Nano Pods which are anything sub 1mW and then 1mW and up are micro".

The shelf is **75, 150, 350, 500 and 750 kW (Nano pods) and 1 MW (the Micro
pod)** of IT. Each needs IT × PUE at the meter (90 / 180 / 420 / 600 / 900 /
1,200 kW at the engine's PUE of 1.2). **The largest single unit the power
carries is the answer, never a row of small ones**: every pod brings its own
chiller and service clearances, so four 75s are four pads where one 350 is
one. Only the 1 MW Micro pod repeats, in whole megawatts. 400 kW of free
power is one 150 kW Nano pod with 220 kW left, not four skids.

**Beside the pod: a battery on what it leaves.** Tommy, of a 400 kW site
that had read four 75 kW skids: "it should just be a 150kW compute and then
allow us to maybe put a bess on their or request for more xfrmr power". One
right-sized pod seldom uses the whole free power, so the answer carries
`pairing`: the same battery engine on the kW the pod leaves (220 kW / 880
kWh beside a 150 kW pod on 400 kW), where 50 kW or more is left. The pod
and that battery together fit the free power, so submitted for funding as
compute + battery they are one amount; the three whole-capacity uses stay
alternatives. The other road, more transformer power, is the upgrade to ask
for below.

**The chiller** is in the answer twice. Its power is inside the PUE: the
answer says how much of the meter load is cooling (`compute.cooling`: "30 kW
of the 180 kW at the meter is the chiller, pumps and losses"). Its space is
not modelled: the pad (the pod, the chiller, the clearances) is the maker's
figure and is not on file, and `compute.space` says so on the physical-area
item of the checklist until a parcel record or a person speaks to it.

**Electricity is the site's own** (Tommy: "that utility cost is diffeernt
for every zip code"): the power price on the site where one is on file,
else the rate book's planning figures for its ZIP (`api/_lib/utility-rates.js`,
else its state) on a flat load, energy plus the demand charge spread over
every hour (`rateOf`). A site nothing places uses the engine's default and
says so. `compute.economics.electricity` carries the figure and its source.

**Two bases**, one engine (`compute-contract.js`):

- **At spot** (the default). The chip's public reference price, exactly as
  the diligence reads it before a contract price is set, marked "at spot".
  The 75 kW unit is the Omega-Core skid at its recorded system cost; the
  larger units are whole nodes of the chip in that IT budget at the engine's
  chipset-scaled midpoint.
- **On the offtake partner's figures** (`portfolioAssessment.compute.basis:
  'partner'`). Tommy: "a compute pro forma that goes off of what lightsmith
  energy showed us … for 1mW of compute its a 35m investement and … about
  26m a year and cost 4m in utility … we need to understand what the offtake
  is so we may need to change that". Those figures are one record,
  `compute-contract.js PARTNER.reference.perMw` ($35M, $26M a year, $4M a
  year of utility; 7 racks, 504 GB200s), **as stated and unverified**. A pod
  is that reference scaled by its IT load; the revenue is the stated figure
  turned into a take-or-pay price a GPU-hour, so the same monthly cash flow,
  partner fee, operating lines and IRR run. It is priced **twice** and both
  are answered (`economics.proforma`): on this site's electricity, and on
  the partner's own utility figure (`asStated`). At 1 MW on Oklahoma power
  that is 70.7% and a 22-month payback, against 54.0% and 26 months on their
  $4M: their case sits inside the 25–55% and "about two years" they stated,
  and their $4M is $0.39 a kWh on the same energy, so the answer asks what
  it covers. Each figure is replaced by the workspace's own in
  `compute.reference` (`revenueUsdPerMwYear` once the offtake is known). The
  75 kW skid stays the skid. Marked "partner ref" on the row.

No site rent, purchase or host share is in either case.

### Compute by chip: the maker's pod (2026-11-11)

Tommy, of the pod maker's product overview (Runware, Sonic Pod System,
November 2026): "Let's base it off the chips this is the first real spec
sheet we have received and it's very detailed."

Until that sheet a "1 MW pod" was 1 MW of IT at an assumed PUE of 1.2. A
real pod is 1 MW of **cooling**: what it carries depends on the chip racked
in it. `api/_lib/pod-spec.js` is the sheet as ONE record, and a workspace
that asks (`compute.basis: 'chips'`) is sized and priced on it:

| chip in the pod | GPUs a pod | usable IT | free at the meter (peak × pPUE 1.091) |
|---|---|---|---|
| RTX PRO 6000 (108 four-GPU servers) | 432 | 430 kW (the maker's estimate) | 469 kW |
| GB300 NVL72 (4 racks) | 288 | 600 kW rated, 680 kW peak | 742 kW |
| Vera Rubin NVL72, Max Q | 288 | 748 kW | 816 kW |
| Vera Rubin NVL72, Max P | 288 | 908 kW | 991 kW |

- **One to four stand-alone pods a site**, as the maker sites them (one
  feed a pod, no UPS or generator). More than four is its cluster design and
  is not sized; the answer says so.
- **Every configuration that fits is priced** by the one contract engine on
  its own GPUs and its own energy (rated IT × pPUE), at the chip's public
  reference price. A chip with no public price (GB300) shows no return until
  the workspace sets one (`compute.pod.prices.gb300`); a chip the library
  does not carry (Vera Rubin) is sized and nothing more.
- **The answer** is the workspace's own chip where it fits
  (`compute.chipset`), else the configuration with the highest screening
  return, else the largest; `chosen.why` says which.
- **Capital is the engine's estimate**, said: the sheet carries no price.
  Once the maker quotes, `compute.pod.costUsd.<chip>` is the pod's cost.
- **The heat** is read off the sheet's own table, never interpolated: the
  loop carries about 850 kW at 35 °C outdoor and 420 kW at 40 °C, so GB300
  holds full power to about 39.4 °C and Vera Rubin Max P to 34.8 °C. A site's
  design ambient is not on file, so no capped hours are in the return; where
  the chosen racks can be capped the answer carries the verification.
- **The checklist follows the pod**: no water (screened, from the
  specification), two carriers or a second separate route, the pad (21 × 9 ft,
  60 metric tons, 2 m between pods), the feed (12 three-phase connections at
  480Y/277 V), delivery as two 20 ft sections.
- **The upgrade to ask for** is the workspace's chip in a pod, else the
  pod's heaviest configuration; an upgrade request names a configuration.

**The maker's site and power requirements** (2026-11-21, Tommy: "Here are
site screening requirements for compute"; the maker's sheet of September
2026, the figures a site owner or utility needs to quote) are folded into
the same record (`POD.siting`, `QUESTIONS`) and change the screen:

- **A pod needs a connection carrying 1,000 kW continuous, whatever chip is
  racked in it.** The table above is what each chip DRAWS; the site is
  screened on 1,000 kW free a pod for every one of them, and the
  electricity in the return stays on what the chip draws. A 500 kW site
  that read "carries an RTX pod" no longer does.
- **The transformer**: above 1 MVA, likely 1.25 to 1.5 MVA a pod, judged
  against the one on file (`compute.transformer`: ok, short or unknown) and
  the first verification where it is short or not on file. The maker's
  1.25 MVA for 1 MW is this assessment's own 0.8 continuous rule.
- **Supply**: 415Y/240 V at the pod, the transformation from 480Y/277 V or
  medium voltage in the site's scope. The product overview names 480Y/277 V
  as standard: both are kept and the answer says to confirm which.
- **The ground**: a pod is 20 × 8 ft and 20 ft tall (two stacked
  containers), 17 metric tons in service on four corners of 6 to 9 tons
  each, on a concrete pad or four ground screws; pods on one site sit on
  one prepared area 2 m apart because they are networked together.
- **Fibre**: 10 Gbps at least, 100 Gbps preferred, two carriers or a
  separate second route; a single provider can work but ranks lower.
- **The maker's twelve questions** (`compute.asks`): power price, facility
  charge, pad, capacity, timing, service, site control, fibre and BGP,
  distance to the police station, remote hands, address, map point. Each is
  On file (a person's figure or evidence), Screened (public data: not yet an
  answer to quote on) or Missing, read off the site's record and never
  invented; the card and the report print the list and the tally.

**This sheet is the baseline** (2026-11-11, Tommy: "We need to note that our
baseline data comes from here"). The compute model's physical figures, GPUs a
pod, usable IT by chip, power at the meter, pods a site, the pad, the feed
and the heat limits, come from Runware's Sonic Pod System product overview of
November 2026, the first maker's specification on file. `POD.baseline` in
`pod-spec.js` says so, and it is the first note under every answer sized on
it, on the card and in the diligence report. It is NOT the baseline for the
money: the pod's price, the GPU-hour price and the offtake are not on the
sheet. A later sheet or a quote replaces the figures in that one file and
moves its `VERSION`, so stored answers on the old figures read stale.

The sheet is the maker's confidential document and says of itself that it is
not an offer: it is off for every workspace that does not ask, and its
figures reach a browser only as that workspace's answer. Held by
`tassess.js` C01 to C06.

### The solutions, side by side, and the one picked for a site (2026-11-21)

Tommy: "we should show a runware system set up and a lightsmith energy and
an armada … there are various sizes of pods and various chip configurations
these are for our solutions we have available so we should be able to
select that based on the site."

Every assessment now carries `solutions`: each compute system on offer,
sized on the site's free power by ITS OWN rule, with its return and its
space score, in one table.

| solution | how it is sized | how it is priced |
|---|---|---|
| Runware Sonic Pod | 1 MW pods by chip, 1,000 kW of connection a pod, one to four a site | each chip's public reference, else the workspace's price; capital the engine's estimate until quoted |
| the offtake partner's container | the partner's unit (as written where the settings carry it, else its megawatt reference by IT load) | the partner's own figures |
| Armada Leviathan | the one Armada unit with a published specification on file: 1.77 MW of IT at the workspace's PUE, on 119 × 45 ft, closed loop, no site water, 480 V | its chips and price are NOT on file: whole nodes of the workspace's chip in that IT load, the engine's estimate |
| Omega-Core skid and pods by size | the 75 kW skid, the Nano pods, the 1 MW Micro pod | the chip's public reference |

The workspace's own basis (its settings) is the default for every site.
**A person picks a solution for a site** (and a chip, for the pod) from the
table: `assess-solution { site | ids[], solution, chip? }` stores
`assessment.solution { key, chip, by, at }`, audited, and that solution is
the site's compute answer from then on: the unit, the return, the space on
the lot, the checklist, the upgrade to ask for and the recommendation all
follow it. `default` follows the workspace's own again. The returns sit on
different bases (a partner's figures, a public spot price, an estimate), and
the table says so: it compares fit, not deals.

Held by `tassess.js` V01 to V03.

### Space on the lot (2026-11-21)

Tommy: "We need to have a space analysis on the sites as well based on the
parcel." The assessment sized everything on a site's free power and said of
the ground only "the pad is not on file". Two makers have now put a
footprint in writing, and the screen already reads the parcel under the
point, so the answer carries a second question: is there room.

**Measured once, while the parcel's outline is in hand**
(`api/_lib/portfolio/assess-space.js measure`). The screen's parcel step,
and `assess-space` for a site already screened, read the lot's outline from
`api/parcel.js` and the building footprints on it from FEMA's USA
Structures (`structures.js`, the service Omega Maximus reads in the
browser), and measure on a raster (`site-fit.js`, for its reasons), square
to the lot's own longest edge:

- the lot's area and the buildings' area on it (their count, their share);
- what is CLEAR: inside the lot line by a setback (10 ft) and off every
  building by a clearance (10 ft), both stated assumptions the workspace may
  set (`portfolioAssessment.space { setbackFt, buildingClearFt }`);
- the largest clear rectangle, and for a ladder of widths (8 to 300 ft) the
  longest clear run that wide.

Only that summary is kept, on `assessment.parcel.space`. The outline itself
is never stored (the assessment's rule, unchanged).

**Judged at every assessment** (`spaceOf`, pure): each use's pad against the
summary. A pad fits when a clear run at least as wide as its short side
(rounded UP to the ladder) is at least as long as its long side.

| unit | pad | whose figure |
|---|---|---|
| the maker's pod, by chip | 21 × 9 ft a pod, 6.5 ft between pods | the pod maker's sheet (`pod-spec.js`) |
| a 1 MW container (the Micro pod) | 50 × 60 ft, the container and its coolers | the offtake partner's written brief (`PARTNER.brief`) |
| the 75 kW skid | 28 × 7.25 ft | the skid as recorded |
| a 150 to 750 kW unit | none on file: judged against the container's 50 × 60 ft as an upper bound, said | |
| a battery, the dispensers | none on file: NOT judged, said | |

The row carries a mark beside the compute size (room · room? · no room; the
question mark is an upper bound: buildings not read, or no footprint for
that unit), the card and the diligence report a *Space on the lot* box, the
checklist's *Adequate level area* reads Screened where the pad fits (never
Done: a person confirms a level pad on the site plan) and stays Open with
the reason where it does not, and a pad with no clear rectangle is the first
verification.

**What "clear" does not mean.** It is open ground on the public record.
Paving, parking stalls, drive aisles, canopies, fuel tanks, easements,
slope and the zoning setback are not read. On a charging site most of the
clear ground is parking: a fit says a clear rectangle that size exists, not
that the pad goes there.

**The space score** (Tommy: "add that as something we can look at and score
in the portfolio and IRR tool"). One number a site, 0 to 100, for the
compute unit's pad on the clear ground (`scoreOf`): 60 and up FITS (60 where
the clear ground is just the pad, 100 at ten pads' worth), 85 and up reads
Ample, under 40 does NOT fit (by how much of the pad the largest clear
rectangle covers), and an upper bound is held at 70. Not judged is no
score, never a zero. The register carries it as its own *Space* column,
sortable like the returns; the card and the diligence report print the
score with its rule in words.

`assess-space { site | ids[] (10) }` reads the lot alone for sites screened
before this existed (the parcel again and the buildings, never the grid
screen; one metered parcel lookup a site where the county has no public
layer). A lookup that fails never replaces a parcel on file. Held by
`tassess.js` S01 to S05.

### The offtake partner's figures as written (2026-11-21)

Tommy, of the offtake partner's Q4 2026 brief: "use these numbers to update
the logic and engine for IRR calculation on compute." The brief is the first
time their figures are on paper, and they are not the megawatt of flat
revenue the partner basis ran on. It is their confidential document, so its
figures are the WORKSPACE'S SETTINGS (`compute.reference`), never the
repository's: the code keeps only the unit's footprint
(`compute-contract.js PARTNER.brief`).

Where a workspace on the partner basis has the unit and the price on file
(`reference.unit { capexUsd, gpus, itKw, sitePowerKw, racks, label }` and
`reference.pricePerGpuHour`; incomplete is no record and the megawatt
reference stands), `writtenCase` runs them through the one contract engine:

- **The unit as sold.** The shelf's top unit is the partner's, on the site
  power it asks for; a Nano pod is that unit by its IT load, said.
- **A price that moves each contract year** (`priceChangePctYear`; the
  engine's escalator now reaches −30% a year: a GPU vintage's price falls).
- **The partner's fee off gross**, and **the operating lines its own model
  counts**: insurance as a share of capital, a fixed sum a year
  (`insurancePctOfCapitalYear`, `fixedUsdYear`), and with `leanOperating`
  nothing else. `uptimePct`, `residualPct` (0: no value at the end) and
  `electricityEscalationPct` are theirs to state too.
- **Electricity is the site's own**, with the partner's own price
  (`electricityPerKwh`) run beside it.
- **Two conventions, one cash.** The engine's return is on monthly cash; a
  brief usually states one sum at each year's end, which reads lower on
  identical cash. Both are answered (`irrPct`, `irrYearEndPct`), and where
  the brief's own return is on file (`statedIrrPct`) the answer says what
  this engine gives on the brief's inputs and convention.

Checked against the brief itself, off the repository: on the brief's own
inputs the engine reproduces its year-one revenue, its fee, its other
operating costs and its payback, and its return to within half a point on
the brief's year-end convention. The difference left is electricity: the
engine draws the unit's IT load times its PUE, the brief its IT load alone.
On monthly cash the same case reads about seven points higher.

`scripts/set-portfolio-assessment.js --compute-basis partner --term-months …
--pue … --reference-json '{…}'` stages it. Held by `tassess.js` W01 to W03
on stand-in figures.

### Battery: the grid value stack

A battery of the free kW at four hours. Capital (hardware, soft costs,
construction per kWh, interconnection), the credit sold at the transfer
price, the rebate, regulation and reserves on MW, capacity and arbitrage on
the fading MWh, the aggregator's and platform's shares, O&M, insurance,
property tax, charging losses, member-level taxes with loss carry-forward,
and a loan the incentives sweep.

The default assumption set (`omega-bess-grid-v1`) is a **reference**: the
revenue rates are the PJM ComEd zone's, the rebate is Illinois's, and the
tax lines are Illinois and Cook County. `market.fit` says where the site
sits: `zone` (priced on its own market), `market` (a PJM state, another
zone) or `reference` (elsewhere). Outside Illinois no rebate is counted.
The register marks a non-zone figure "ref".

A project whose credit and rebate cover its cost has **no net investment**:
the IRR is null with the reason, never a large number.

### Fast charging: the site-host return

Dispensers = the largest set of 4, 8 or 12 (what the maker sells; Tommy,
2026-11-10) that the free kW carries at 150 kW a dispenser (one power
cabinet's 1,200 kW across eight). Never a count between sets and never
fewer than four: a site that cannot carry four is "does not fit", with the
600 kW it would need. A workspace's own `supercharger.sizing.sets` replaces
the sets; the keys keep the name `posts`. Price and levelised electricity cost
are the state's indicative figures; utilisation is 325 kWh a dispenser a day
growing 7% a year; the maker's service fee and the rent escalate 3%.
Returns are dated at each year end (XIRR / XNPV).

### Shovel ready: the checklist and the score

The compute site-readiness checklist: 49 items in eight sections (site
control, zoning, permitting, power and interconnection, physical site,
connectivity, environmental, the readiness package).

| state | means |
|---|---|
| Open | nothing on it yet (it may carry a hint from the data) |
| Screened | public data or an imported fact speaks to it — **not yet evidence** |
| Evidence on file | a person marked it, with a note, who and when |
| Not applicable | a person set it aside; it leaves the count |

The score is **evidence on file ÷ applicable items**. Screened items are
shown as a lighter bar and never counted as ready. *Verify next* lists the
verifications that would move the answer most, power first: the site's
measured peak, the transformer's kVA, the will-serve letter, site control,
zoning, a carrier's quote.

### A utility-side upgrade request

Tommy, 2026-11-09: "a way to mark the site that we are requesting a utiltiy
side upgrade to support the larger compute offtake. meaning that we are
going to have our partner ask for more power".

`assess-upgrade { site | ids, unit | targetKw, askedBy?, note?, status? }`.
A mark a person makes: the power asked for at the meter (a shelf unit's, or
a figure), who is asking (the site's portfolio partner unless named), and
where it stands: **requested → granted or declined**, or withdrawn. It must
ask for more than the limit on file. For a unit, the ask is the limit plus
what the FREE power is short by, and what it "would carry" is judged on
what would be free after it.

**It changes no size.** The free power stays the fact on file; the answer
carries `upgrade` beside it: the request, the kW it adds, and the compute it
would carry with its return. Granted is still a mark: the new service is
recorded on the site, and every size then follows from that fact. While it
is requested it is first on *Verify next*, and the interconnection item of
the checklist reads Screened with the request. The row shows "↑ 1.2 MW
upgrade requested" under the power, and the capacity filter lists them.

**The upgrade to ask for.** Tommy, 2026-11-09: "we should also be
requesting for anything not 1mW for a utility upgrade". Every sized site
that does not carry the 1 MW Micro pod carries `upgradeAdvice`, derived and
never stored: what 1,200 kW free is short by (on top of the service, so a
site whose own load takes 150 kW of it is asked for 1,350 kW), what the
next size up needs (eleven 500 kVA sites of one intake are 20 kW short of a
350 kW pod), and the compute that would follow. The row reads "↑ ask +800
kW for 1 MW" in amber until somebody marks the request, the capacity filter
lists *Under 1 MW · upgrade to request*, and *Utility upgrade ▾ → A 1 MW
Micro pod* marks the whole selection at once (a site that already carries
it is refused by name). It is advice: nothing has been asked of a utility
until a person marks it, and a site with no power figure has none.

### The funding list

Tommy, 2026-11-09: "we dont need to send to the marketplace we are funding
these sites so we essentially need to send this to a list that we can
approve for funding or not and it needs to be screened first then approved
by our finance committe".

For a workspace whose settings name a committee
(`portfolioAssessment.funding { mode: 'committee', name, members: [{ name,
email }] }`, staff-written by `scripts/set-portfolio-assessment.js`). There:

- **The finance marketplace stands down.** `send-to-finance` is refused
  (409), the register's last column reads **Funding**, and the summary card
  counts the committee's list.
- **Screened first.** `assess-fund-submit { uses, note? }` is refused until
  the Grid Atlas and parcel screens have finished on the site. The site is
  assessed again as it is submitted, so the figure in front of the committee
  is the one on file now. One use carries its capital as the amount; a
  hybrid carries each line and no total, because each use is sized on the
  whole capacity.
- **Decided by the committee alone.** `assess-fund-decide { decision:
  approved | declined, note }` is a committee member's, signed in on that
  address with the email **verified** (a password account can be opened on
  any address without proving it). Anybody else is refused, ClearSky staff
  included. A decline says why. The committee may change its own decision.
- `assess-fund-withdraw` takes a submitted site off the list; once decided,
  only the committee changes it.

The row reads *Screen first → Not submitted → With committee → Approved or
Declined*, and the Funding filter is the list. Every step is on
`assessment.funding` with its history, and an `omega_audit` row.

#### An approval made in a connected app (2026-11-10)

Tommy, of his finance committee: "the committe can use the asana app to
preview and review and approve and it gets then show on the platform". A
workspace whose settings name a connected app
(`portfolioAssessment.funding.attest { source, keyHash }`, staff-written by
`scripts/set-portfolio-assessment.js --attest-source Asana --attest-key-hash`)
takes an approval made there as well as one made here. Two actions, neither a
person's:

- `assess-fund-link { site, ref }` ties a submitted request to the ONE record
  the app's server made for it, by that record's id (never its name: anybody
  in the app can rename a card). A record already tied to another site is
  refused. A new submission is a new request and needs a new link.
- `assess-fund-attest { site, ref, email, name?, completedAt, note? }` records
  the approval when the linked record was marked done, after the link, by a
  person whose address in the app is a committee member's. The decision keeps
  `via` (the app's name) and `attested { ref, markedAt, recordedBy }`; G4 reads
  it as any approval.

Both are refused (403) unless the request carries the app server's key in
`x-register-attest`. The settings hold only the sha256 of that key; the key
lives in the app server's environment. The app's own sign-in stands in for
the verified address a decision here needs, so who may use that app as a
committee member's address is part of the control. Only an approval travels
this way: a decline needs its reason and is made here, and the committee
changes any decision here.

What this does not defend: a person who can edit the linked record in the app
can change the words on it before the committee member marks it. The id ties
the mark to the right site whatever the card says, and the decision records
where it was made, but the committee member is trusting the card's text.
The figures a member should rely on are the register's.


On the site record (`site-crm.html`) the *Capital request* card becomes
**Funding** in such a workspace: where the site stands on the list and who
decided, with the way to the register. `GET ?site=` carries `funding` and
the site's `assessment` row for it.

### Closing a site

Tommy, 2026-11-09: "we buy the sites from francis and they have to then go
get the SHA signed over to us and there needs to be a 15 or 20 year lease
on the site". Where the workspace's settings carry the lease it needs
(`portfolioAssessment.closing { minLeaseYears, agreement }`), each site has
three closing steps a person records, with who and when
(`assess-closing { step: purchase | assignment | lease, years?, done? }`):
it is **purchased** from the partner, its host agreement is **assigned** to
the workspace, and a **lease** of the years typed is in place. A lease
shorter than the workspace needs is recorded and said ("10 years: under the
15 needed"), never rounded up. Site control (G0) passes only when all three
stand, and the lease gate (G2) reads the new lease once it is recorded. The
site's own lease-term fact is not rewritten. The selection bar's *Closing ▾*
records a step on many sites at once, and the gate filter lists the sites
waiting on a step and the closed ones.

The two lease figures are different questions: the screen (G2,
`gates.minLeaseYears`) asks whether the agreement on file is worth
pursuing; closing asks whether the lease the workspace needs is in place.
No site of a 104-site intake had fifteen years left, so a 15-year screen
would have failed every site before anything was bought.

A record of what was done. Marking a step buys, assigns and signs nothing.

### The gates and the review

Tommy, 2026-11-09, of his company's operating system: "this is our company
how we work see that this is supported by what we are doing here". A
workspace's own pipeline is read off what is already on the site, in its
own order. The thresholds and the people are its settings
(`portfolioAssessment.gates { minKva, minLeaseYears, irrHurdlePct }` and
`.review { name, members[] }`, staged by `set-portfolio-assessment.js`);
core carries none, and a workspace with neither has no gates.

| gate | passes when | fails when |
|---|---|---|
| G0 Intake & site control | the three closing steps stand, where the workspace has them; else the site-control item of the checklist has evidence | never (open until then) |
| G1 Power | the transformer (else the service at its continuous rating) is at least `minKva` | it is under it |
| G2 Lease | the term left is at least `minLeaseYears` | it is under it |
| G3 Pathway | a pathway is picked: approved for pre-development, or submitted for funding | never |
| G4 Return | the picked pathway clears `irrHurdlePct` (where one is set) and the committee approved (where there is one) | under the hurdle, or declined |
| G5 Shovel ready | every applicable checklist item has evidence | never |
| G6 Review | every member of the review voted the same way | never |

**Open is never failed**: a gate with nothing on file to judge (no kVA, no
lease term) is open, and says what is missing. The gates are DERIVED at
read time (`gatesOf`); nothing is stored but a reviewer's own vote.

**The review** (`assess-review-vote { vote: own | flip | clear }`): one
member's vote on a site, own and operate or portfolio / flip, on a verified
address; anybody else is refused, staff included. The decision is derived:
it stands when **every** member has voted the same way, and a disagreement
reads *split* with who voted what. It is not gated on the earlier gates,
which are shown beside it.

The row wears one mark a gate; the card says each in words, with the votes;
the gate filter lists what passes power and lease, what does not, the sites
whose lease term is not on file, and the decided ones; the CSV and the
diligence report carry them.

### The diligence report

Tommy, 2026-11-09: "i want to be able to export a dilligence report on each
site that shows tesla, bess, and compute".

*Diligence report* on a site's card, or *Diligence reports* on a selection
(25 at a time): one printable document a site, drawn from `GET
?site=&assessment=1` by `OmegaPortfolioAssess.report` and printed from a
hidden frame (no tab, no pop-up; *Save as PDF* keeps it). What the site
carries (the three uses side by side), power and grid with any upgrade
request, compute with its pro forma, the battery with its value stack and
ten years, Tesla fast charging with its fifteen years, fiber, parcel and
zoning, the readiness checklist item by item, what to verify next, the
decisions, and **what the report does not read**.

### Approve for pre-development

`assess-approve { uses: [compute | bess | supercharger] }`, one use or a
hybrid, on one site or a selection. It records the decision (who, when, a
note), moves the site's status to **Pre-development**, and adds the project
kinds (`compute`, `bess`, `dcfc`) to `siteScopes` so the Site Map project
*Open in Site Map* makes opens on what was approved. `uses: []` withdraws
it, and **puts back the status the site had** (`assessment.statusBefore`;
2026-11-09, a withdrawal used to leave an Operational site blank). A use the assessment does not show fitting is allowed and named in the
answer: the call is a person's.

### Portfolio partner

`portfolioPartner` on the site: the company the site comes from (Francis
Energy, EVCS). Set on the import dialog for every row of a CSV, by a
*Portfolio partner* column, in bulk from the bar (`site-set-partner`), or
on the site record. To add facts to sites already imported (the
transformer's kVA, a peak, the partner), re-import the sheet with the same
External IDs: `site-import` updates by ID. The register filters by partner, by state and by free
capacity, and sorts by free power first once sites are assessed.

## The record: `omega_orgs/{org}/sites/{id}.assessment`

```
assessment: {
  result      the answer (assess()), with inputHash
  screen      the Grid Atlas screen (grid-screen.js's record)
  parcel      { ok, apn, owner, acres, zoning, county, source, at } — never the ring
  checklist   { <itemKey>: { state: done|na|open, note, by, at } }
  decision    { status: approved|withdrawn, uses[], label, scopes[], by, at, note }
  statusBefore  the status the site had when it was approved (a withdrawal restores it)
  upgrade     { status: requested|granted|declined|withdrawn, targetKw, unit, askedBy, note, by, at, history[] }
  funding     { status: submitted|approved|declined|withdrawn, uses[], lines[], amountUsd, note,
                submittedBy, submittedAt, decision { status, by, name, at, note }, history[] }
  at, by
}
```

Admin SDK only, like the rest of the site. An assessment never touches the
site's facts, revision or `updatedAt` (it is not a fact change, so the
compute model does not run again on it). Every write is an `omega_audit`
row (`sitecrm-assess-run | -screen-start | -screen | -check | -approve |
-upgrade | -fund-submit | -fund-withdraw | -fund-decide`,
`sitecrm-site-set-partner`).

The register's rows carry the answer without its yearly tables or the
checklist's items (`listView`, about 7 kB a site); `GET ?site=&assessment=1`
carries everything, recomputed. A row is **stale** when a fact the answer
rests on has changed since it ran (`inputHash`); the page marks it and
*Run again* refreshes it.

## How a Run goes

1. `assess-run { ids }`, 50 a call: the numbers, from what is on file.
2. `assess-screen-start { ids }` then `assess-screen-step { jobId }`: a job
   on `site_jobs`, one phase of one site a step. Phase one is the grid
   atlas (the point and the substation). Phase two is fiber and the hosting
   figure in parallel, then the parcel under the point, then the assessment
   again. The page runs four jobs at a time.
3. A screen under a week old that LOCATED the site is kept (`force`
   re-screens); one that located nothing learnt nothing and runs again.
   Stop pauses; Run again resumes the same job.

Every handler is invoked in-process with the caller's own headers, so each
runs its own sign-in and plan gate. Each is named in a LITERAL `require`
in the door, and `vercel.json` carries the fiber inventory with
`api/site-crm.js`: the deploy bundles a function from the requires it can
read, and a path held in a variable left every production screen answering
"Cannot find module" (2026-11-09; `scripts/tests/tscreenbundle.js`). A screen the plan does not carry is an
error on the record, never a failed run. Where the compute-site diligence
is switched on for the workspace, the same screen also lands on
`diligence.screen` by the diligence's own rule.

## A workspace's own figures

`billing/current.portfolioAssessment` (staff-written), read leniently:

| key | replaces |
|---|---|
| `bess` | any figure of the battery set (`bessPricePerKwh`, `revenue.regulation`, `tax.state` …) |
| `supercharger.assumptions`, `.sizing` | the charging set and `kwPerPost` / `minPosts` |
| `compute.chipset`, `.pue`, `.termMonths`, `.partnerName`, `.partnerFeePct` | the compute case's chip, PUE, term and offtake fee |
| `compute.basis: 'partner'`, `compute.reference` | compute on the offtake partner's stated per-megawatt figures; `reference` replaces any of them (`capexUsdPerMw`, `revenueUsdPerMwYear`, `utilityUsdPerMwYear`, `gpusPerMw`) |
| `compute.basis: 'chips'`, `compute.chipset`, `compute.pod { prices, costUsd }` | compute as the maker's 1 MW pod, by chip (`pod-spec.js`); the workspace's own chip, a price a GPU-hour and the pod's cost, each by the pod's configuration key (`rtx6000`, `gb300`, `vr-maxq`, `vr-maxp`) |
| `space { setbackFt, buildingClearFt }` | the space analysis's two assumptions: clear of the lot line, clear of a building (10 ft each unless set) |
| `funding { mode: 'committee', name, members[] }` | the funding list in place of the finance marketplace |
| `gates { minKva, minLeaseYears, irrHurdlePct }` | the workspace's screening gates |
| `review { name, members[] }` | its review board: every member votes own or flip |
| `closing { minLeaseYears, agreement }` | the closing steps: purchased, the host agreement assigned, a lease that long |

`scripts/set-portfolio-assessment.js --org <org> --member "Name <address>"
--compute-basis partner` stages both (a dry run offline unless `--apply
--confirm-org`); it refuses a member without an address, and writes nothing
the assessment would not read back.

Core carries no tenant's figure. Nothing a tenant reads names a source
workbook.

## The engines, checked (2026-11-09)

Tommy: "make sure the IRR calculators are acurate and based on the documents
i gave you make sure those engines are perfect". What was done:

- **The battery** (`assess-bess.js`) was read against its source model cell
  by cell, every formula, and then against an independent evaluation of
  those formulas across six cases that turn every switch (no rebate, the
  rebate as a price reduction, augmentation, a part loan that is not swept,
  usable losses with part bonus, a 2-hour battery with a loss limit). The
  largest difference on any figure was half a cent. `tassess.js` E05 pins
  those cases.
- **Fast charging** (`assess-supercharger.js`) likewise: all 52 rows of the
  state table, the reference case, and five cases through the credit,
  pedestals, incentives, escalations, a leap-year start and a case that
  never pays back. Half a cent, and under 0.005 of a point on a rate. E06.
- **Compute** has no workbook: it is the contract engine's own monthly cash
  flow, pinned by its own tests. Its IRR is monthly cash annualised, so it
  reads higher than an annual-cash IRR of the same project would.

Nothing in either engine's arithmetic was wrong. What the audit did find is
in how the three are read side by side, and it is on the honest list below.

## What is not built (honest list)

**The numbers**
- **Armada is one unit, on its published size alone.** Only the Leviathan
  is on file (its IT load, footprint, cooling and voltage, from Armada's
  product page). Its chips, its price, its PUE and its smaller models are
  not: it is priced as generic compute of that size. Send its sheet and it
  becomes a record like the pod's.
- **The partner's written figures are modeled, not contracted.** Every hour
  billed from year one with no ramp, a price the partner modeled, no tax, no
  debt, no value at the end. A workspace whose settings do not carry them
  still prices on the megawatt reference as told.
- **Space is the public record's clear ground, and only compute is judged.**
  Parking, paving, easements and the zoning setback are not read; no
  footprint is on file for a battery of a given size or for the dispensers'
  equipment pad, so neither is judged; a 150 to 750 kW unit is judged
  against the 1 MW container's pad. Truck and crane access is not counted.
  Buildings under about 450 sq ft are not in the structures service.
- **By chip, the pod's own price and the offtake are not on file.** The
  maker's sheet has no price: capital is the engine's chipset-scaled
  estimate (its enclosure and cooling allowance, not the pod's), and the
  maker's monthly operating fee is not in the case. Revenue is the chip's
  public reference price or a figure the workspace typed, never a contract.
  GB300 has no public price and Vera Rubin is not in the chip library. Hours
  capped by heat are not counted: no site has a design ambient on file. The
  pod's pPUE is stated at full load and leaves out the site's transformer.
- **The three returns are on three bases.** Compute is a project IRR on
  monthly cash, annualised, before tax, over six years; the battery a
  project IRR on yearly cash, before tax and unlevered, over ten; fast
  charging an after-tax IRR on yearly cash over fifteen (its before-tax
  figure is beside it in the card). Each says its basis; the row puts them
  next to one another anyway, and "highest" ranks a screen, not a deal.
- **The offtake partner's figures are stated, not verified, and the revenue
  is not a contract.** On the site's own electricity the case returns more
  than the partner itself claimed, because their utility figure is several
  times the energy at a planning rate. Both cases are shown.
- **The ZIP's rate is a planning figure**, energy plus demand on a flat
  load, not the site's tariff, and it carries no riders or taxes.
- **The pad is not modelled.** One pod and its chiller are assumed to fit;
  no footprint is on file for any unit but the skid.
- **Most imported sites are sized on a ceiling.** Without a measured peak
  the whole limit is used and said. The sizes are upper bounds until the
  peak is on file.
- **The transformer's kVA is only what somebody recorded.** No screen finds
  it. A sheet that put kVA in the service column reads as a service in kW.
- **The battery outside the PJM ComEd zone is a reference figure.** There
  is no rate set for SPP, MISO, ERCOT or the Southeast, and the state tax
  and property tax lines stay Illinois's. Marked "ref"; a workspace's own
  rates go in config.
- **The 75 kW unit reads far higher than the larger ones** because it is
  the skid at its recorded price while the others are chipset-scaled
  estimates (or the partner's reference). Each case says its capital basis.
- **Compute is priced at a public reference, with no site cost.** A
  contract price, rent and the offtake terms belong to the diligence's
  contract case.
- **Only one pair is modelled**: the pod with a battery on what it leaves.
  Any other hybrid is approved, not modelled: each use is sized on the whole
  capacity and nothing splits the power between them.
- **Fast-charging sizing is a planning rule** (150 kW a post, four minimum)
  and the state price and electricity cost are indicative.

**The screens**
- **The parcel lookup is metered** on plans that carry Regrid, cached per
  point for thirty days. A Run of a large portfolio spends lookups.
- **Carrier names need `FCC_BB_KEY`**, and hosting figures exist only where
  the utility publishes them, exactly as in the diligence screen.
- **No flood, wetlands or environmental source is read.** Those items stay
  Open until a person marks them.

**The workflow**
- **The gates judge what is on file.** Seventy-seven sites of one 104-site
  intake have no lease term, so their lease gate is open, not passed.
- **No hurdle rate ships.** Until the workspace sets one, the return gate
  follows the committee alone; and it judges a screening return, not the
  investment model.
- **A technical sign-off is not a gate**, an "energized land" pathway is
  not a use, and nothing writes to a task tracker.
- **An upgrade request is a mark.** Nothing is filed with a utility, no
  cost or schedule is carried, and granting it changes no fact.
- **A funding decision funds nothing.** It is the committee's recorded
  answer; no commitment, wire or document follows from it, and it does not
  move the site's status or gate pre-development.
- **The committee is a settings list.** A member is named by staff with the
  address they sign in on; there is no page to edit it.
- **The report is the browser's print.** No file is stored on the site.
- **Evidence is a note, not a document.** A mark records what a person says
  is on file; nothing links it to the site's Files or checks it.
- **Nothing re-runs by itself when a fact changes.** The row is marked
  stale; a person presses Run.
- **Pre-development makes no project.** It sets the status and the project
  kinds; *Open in Site Map* makes the project.
- **A CSV row updates a site only by its External ID.** A row whose
  External ID names a site already here updates it (the cells that carry
  something; a blank cell is no change, and the word `clear` empties a
  fact), so a corrected sheet does not duplicate. A row with no External ID always creates a site, and a site
  the workbook import keeps as facts is refused by name. The dialog's
  partner is applied to a CSV only.
- **In a diligence workspace the pipeline is the register**, so the
  assessed table is not drawn there; the side panel carries the card.
- **No module sells it yet.** Any workspace with the register may run it;
  the screens keep their own plan gates.

## The lot, when the Space column is empty (2026-11-23)

Tommy, of a register whose Space column read "–" on every site: "make sure the space is pulling details on
the parcel on how much is on the lot and how much is building"; "on the site map editor we have that parcel
feature and api so this should be an api integration … this needs to be accurate so that we can match up".

- **It is the editor's own API.** The lot comes from `api/parcel.js`, the one door Site Map and Omega Maximus
  ask for the parcel under a point (the licensed every-county source first where the plan carries it, then the
  public county and state layers in `omega-parcel-sources.js`); the buildings come from FEMA USA Structures, the
  service Omega Maximus's *Find buildings* reads. No second parcel reader exists. The APN on the card is the
  record's, so a lot can be matched to the one the editor draws.
- **Oklahoma, and Arizona outside Maricopa and Pima, publish no parcel layer.** There a lot outline comes
  only from the licensed source (`REGRID_TOKEN` on the deployment, and a plan that carries it: Deluxe,
  Enterprise, Partner, Internal, the `parcels` add-on or `toolOverrides.parcel`). Without it the answer is a
  miss, and a miss now says why: `api/parcel.js` adds `licensed` (`asked` | `not-on-plan` | `not-configured`,
  never the key) and `assess-door.js missWords` writes the sentence kept as `assessment.parcel.reason`.
- **The cell never reads a bare dash.** A score with the lot under it ("1.2 ac · 18% built"), the lot alone
  where no pad is judged, **No parcel** (hover for why) or **Not read**. The card's button is *Read the lot*,
  or *Look for the parcel again* after a miss.
- **A run reads the lots it skipped.** A site whose screen was kept as fresh, or was screened before the lot
  was measured, has a parcel on file and no measurement: after the screens the page posts `assess-space` for
  those alone, five a call. A site with no parcel record is not asked again by a run. The run's last line
  counts the lots: measured, no parcel record, not read.
- **The parcel cache had never held anything.** Firestore refuses an array inside an array and a ring is one,
  so every write of a hit was refused (logged, not returned) and the metered source was asked again for the
  same point. The ring is now stored flat (`ringFlat`) and rebuilt on the way out; the answer is unchanged.
- **What it rests on.** The point is the screen's located point (the geocoded address). A geocode that lands
  on the road or the neighbouring lot reads that lot: the APN, the acres and the owner on the card are how a
  person checks it against the editor's parcel. Not built: moving the point by hand from the register.

### The lot off the parcel tiles, and reading the misses again (2026-11-23, later)

Tommy, after every site read **No parcel**: "in our editor tool we have it pulling all the parcel data … so
this should do the same".

- **Why the editor had parcels and the screen had none.** The editor's Parcel Lines are the licensed source's
  MAP TILES (`api/parcel-tiles.js`); the screen asked that source's POINT LOOKUP. They are two subscriptions on
  one key, and a key can carry the first without the second. `api/parcel.js` now reads the lot out of the same
  tiles when the point lookup and the public layers give nothing: the vector tile the point is in
  (`api/_lib/mvt.js`, a small pure reader), a wider tile while the lot is cut by the tile's edge (zoom 16, 15,
  14), `source: 'regrid-tiles'`. A lot still cut at the widest is kept and said (`partial`, a lower bound).
  A tile carries few fields: acres are measured off the outline; zoning and county stay blank.
- **A refused key is said as refused** ("regrid refused the key (HTTP 403)"), with the status and never the key.
- **Old misses are asked again.** A run re-reads, once and by itself, a miss recorded before the lookup named
  its sources; **Read lots** (beside Run all sites) re-reads every site shown whose lot is not measured, the
  misses included, five a call.
- **Not verified against the live service.** The tile reader is tested on tiles built in `tparcel.js`; the
  build container cannot reach the service and holds no key. The first live run is the check: compare one
  lot's acres with the editor's lines. If the tiles are refused too, the Space cell's reason says so.

### The lot from public data, state by state (2026-11-23, evening)

Tommy, with every Oklahoma site still reading No parcel: "figure out how to make that work … we have it in
the site map editor so you shouldnt have to recreate the whole thing"; "this needs to work perfectly all over
the country". The tooltip said why: no licensed key on the deployment. The fix is public data, not a key.

- **The editor's line layers now answer a point.** Thirty-one state and county services in
  `omega-parcel-sources.js` drew parcel LINES in the editor and carried no `lookup`, so `api/parcel.js` never
  asked them. Twenty-four now do, each verified live at its own test point (the layer, its id, owner and
  county fields): NC, NJ, DE, WV, AR, HI, VA, MA, MD, RI, VT, NH, ME, OH, WI, MN, NE, FL, CO, MT, WA, NV and
  both halves of Mississippi. With the forty-four already there, the point lookup covers every public source
  the editor draws except the ones below.
- **Oklahoma, through the state's own map service.** OKMaps serves the statewide parcels for viewing and
  through its WMS, not for download. `WMS_LOOKUPS` asks that service's own GetFeatureInfo for ONE lot at a
  point (outline, parcel id, owner, county) and never caches the outline (`cache: false`). Verified at
  Chandler, Tulsa, Oklahoma City, Wagoner, Woodward and Sand Springs. Counsel should read OKMaps' terms before
  this is relied on commercially.
- **Not lots.** A statewide layer draws road corridors and water as polygons: Maryland's are `ROW`, Vermont's
  and Montana's have no id, Mississippi's a parcel number of zeros. `skip` and `requireId` drop them.
- **The nearest lot, said.** A geocoded address often lands on the road. For the portfolio screen alone
  (`near: true`; never the editor, where a click on a road means the road) a second pass takes the nearest lot
  within 100 ft and says so (`nearest`, `nearestFt`, a note on the Space card). Two lots equally near are not
  told apart: it is a lot to check by its parcel number.
- **Still no public outline** (the licensed source, `REGRID_TOKEN`, is the only way): Texas, California's
  statewide layer (its big counties have their own: Los Angeles, Orange, Riverside, Sacramento) and Oregon
  publish pictures only; New York's public service was down when checked; Will County IL needs a token; San
  Diego's query dropped the server runtime's connection in testing and stays lines-only. No public layer was
  found for Georgia, South Carolina, Alabama, Louisiana, Michigan, Kentucky, Kansas, South Dakota, Wyoming,
  New Mexico, Arizona outside Maricopa and Pima, and not searched again here: Indiana, Utah, Tennessee, North
  Dakota, Alaska, Iowa (hosted feature services exist and could be added the same way).
- **The check.** `node scripts/check-parcel-lookups.js` runs the real lookup at every source's test point
  against the live services (network, so not in `npm test`). Run on 2026-11-23 for the new sources, Oklahoma
  and Maricopa: all answered; the forty-four earlier sources were not re-run here.

