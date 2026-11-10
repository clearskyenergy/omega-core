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
| `api/_lib/portfolio/assess-supercharger.js` | fast-charging posts on the free power: fifteen years, the site-host return |
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

### Compute: the modular shelf

75 kW, 350 kW, 1 MW and 1.77 MW of IT. Each needs IT × PUE at the meter
(90 / 420 / 1,200 / 2,124 kW at the engine's PUE of 1.2). The largest unit
that fits is chosen, and repeated where it fits more than once.

The return is the ONE contract engine's (`compute-contract.js`), read at the
chip's public reference price exactly as the diligence reads it before a
contract price is set, and marked "at spot". The 75 kW unit is the
Omega-Core skid at its recorded system cost; the larger units are whole
nodes of the chip in that IT budget at the engine's chipset-scaled midpoint.
No site rent, purchase or host share is in the case.

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

Posts = free kW ÷ 150 kW a post (one power cabinet's 1,200 kW across eight
posts), never fewer than four: a site that cannot carry four is "does not
fit", with the 600 kW it would need. Price and levelised electricity cost
are the state's indicative figures; utilisation is 325 kWh a post a day
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

### Approve for pre-development

`assess-approve { uses: [compute | bess | supercharger] }`, one use or a
hybrid, on one site or a selection. It records the decision (who, when, a
note), moves the site's status to **Pre-development**, and adds the project
kinds (`compute`, `bess`, `dcfc`) to `siteScopes` so the Site Map project
*Open in Site Map* makes opens on what was approved. `uses: []` withdraws
it. A use the assessment does not show fitting is allowed and named in the
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
  at, by
}
```

Admin SDK only, like the rest of the site. An assessment never touches the
site's facts, revision or `updatedAt` (it is not a fact change, so the
compute model does not run again on it). Every write is an `omega_audit`
row (`sitecrm-assess-run | -screen-start | -screen | -check | -approve`,
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
3. A screen under a week old is kept (`force` re-screens). Stop pauses;
   Run again resumes the same job.

Every handler is invoked in-process with the caller's own headers, so each
runs its own sign-in and plan gate. A screen the plan does not carry is an
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

Core carries no tenant's figure. Nothing a tenant reads names a source
workbook.

## What is not built (honest list)

**The numbers**
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
  estimates. Each case says its capital basis.
- **Compute is priced at a public reference, with no site cost.** A
  contract price, rent and the offtake terms belong to the diligence's
  contract case.
- **A hybrid is approved, not modelled.** Each use is sized on the whole
  capacity; nothing splits the power between two.
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
