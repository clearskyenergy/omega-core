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
