# The value stack funnel: two flows, and where DividendVPP and Lightsmith plug in

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **design note, nothing built.** Written 2026-09-28 from a read of the
code (not a run of the app) for the DividendVPP and Lightsmith conversation;
rev B follows internal review ("make the two flows clearer; confirm
Lightsmith's inputs, outputs, where its VPP role begins and who checks that
revenue streams can be combined; walk one sample site"). The partner-facing
chart is `docs/design/value-stack-funnel.html`, published privately as a
claude.ai artifact (https://claude.ai/artifact/YNLSbK9EarAQv6UjrXRsDR), and
printed as `docs/design/value-stack-funnel.pdf` (five 11 × 17 in landscape
sheets, from the page's own print rules). Keep all three in step. The chart
deliberately leaves out the defects listed below.

## Two flows

**Flow 1, our business process**, is how a project moves through ClearSky.
**Flow 2, the value stacking process**, is its step 4 in detail.

| Flow 1 step | Where it lives |
|---|---|
| 1 Site intake | `intake.html` → `intake_projects`, worked by the ops console (`docs/INTAKE-README.md`); `opportunity-intake.html` |
| 2 Screening | `clearsky-sitefinder.html` on `/api/price-site`; the editor's Analyze › Screening (Grid Pre-Qualify, Site Score) |
| 3 Design | the Site Map editor: Build › BESS Build, BESS Sizer, Solar + Storage |
| 4 Value stack | flow 2, below |
| 5 Customer proposal | Output › Reports › Proposal (`buildProposalHTML` 28331), `proforma.html`, `sales-proposal.html` |
| 6 Handoff | Output › Marketplace (Push to Marketplace → `fin_projects`; Apply for Financing); `rfq.html` (Quote Desk); VPP enrollment is not built |

In flow 2, "applied" means the step shapes the number that reaches the
customer today (Cost & ROI, then the results rail and the exports).

| Flow 2 step | Removes | Where it lives today (`editor.html` unless named) | Applied |
|---|---|---|---|
| A Site & utility inputs | — | the placed fleet (`_vsFleetSize` 29695); ZIP → state → market (`_isoForState` 29739; `OmegaValue`'s `MARKET` 93405); utility rates by ZIP (`_fomGetUtility` 20039); the monthly bill typed into `vs-bill` | yes |
| B Eligible programs | what the site or route can't enter; the operator's share | Analyze › Screening › Value Stack (`OmegaValue`, Patch 41, from 93343): programs per market (`TYPICAL` 93431), route to market and share (`PARTNERS` 93464); incentive conditions on the server path (`V.incentives`, `api/_lib/value-stack.js`) | no: the panel only has a close button and nothing reads `OmegaValue.*` |
| C Forecast | — | Estimate › Cost & ROI › Revenue: `runValueStackEstimate` (30291) writes `_VS_ESTIMATE` (30393); `applyValueStackEstimate` (30450) fills `arbitrage`, `demand`, `dr`, `reg_pjm` in `_revStreams` (`REV_CATALOG` 28911); `vpp`, `capacity` and `resilience` are typed in. Price Decks (119400ff) are gated SOON (152152) | yes, at regional rates |
| D Dispatch assumptions | double-booked hours and cycles; streams that can't combine | `OmegaValueStack.allocate` (from 141299); the hourly `dispatch.verifyShave` (127778), used only by the Bill Analysis workbook (139299). No program's combination rules are held anywhere | no: `run`, `allocate` and `lifecycle` have no callers; only `irr` and `readSite` are used |
| E Portfolio reporting | — | `updateROI` (36664): payback, year-1 cash-on-cash, 10-year NPV at 8%, 3% revenue growth, no fade; nothing saved (defect 2). `owner-reporting.html` (`siteVariance` 370) and `om-console.html` report expected against actual energy and availability, not revenue by stream | no |

The "verified" step of rev A is now part of D and E: the `_certified` badge
(29632) is never set true, and the "certified by our aggregator partners"
footnotes (21344, 30421-30424) are labels, not checks.

## Partner roles on record

What the repo says, which is all the chart claims. Everything else on the
chart's partner sheet is a question for the meeting.

- **Lightsmith Energy**, "Dispatch optimization layer" (`admin/admin-console.js:261`,
  signed partner, tooling). `apartment-bess.html:554` has Molecule run
  "cross-program optimization (Lightsmith) so each site is always in the
  best-paying program available that hour".
- **Molecule Systems**, "VPP software stack integration" (`admin/admin-console.js:260`).
  DividendVPP is its VPP product and AERA its device integration surface
  (`fleet-simulator-3d.html:250-251`). `apartment-bess.html:554`: it "sits
  between the utility VPP dispatch signal and your battery portfolio,
  guaranteeing each dispatch event is executed and telemetry-verified".
  `editor.html:93485-93489`: "Not a curtailment provider — a control and
  optimisation layer … you still need a route to market underneath it."
- Both are set up as operators of the **VDC Exchange**
  (`firestore.rules:361` `isVdcOperatorDomain`, `:370` `vdcOperatorOrg`; the
  `vdc_*` rules from 1513). The exchange is `comingSoon` in `login.html:668`
  and no `vdc.html` exists in this repo.

## The sample site

Illustrative: a C&I building in Chicago, ComEd, PJM (ComEd zone), behind the
meter, 1,000 kW / 4,000 kWh. The figures are what the server model returns
under the ComEd/PJM screening scenario `/api/price-site` uses; reproduce them
with

```
node -e 'var V=require("./api/_lib/value-stack.js");console.log(JSON.stringify(V.stack({kw:1000,hours:4,demandLoPerKwMonth:8,demandHiPerKwMonth:14,vppPerKwYear:150}),null,1))'
```

| Stream | Year 1 | Tier |
|---|---|---|
| PJM capacity: 590 kW accredited (4-hour class, 59%) × $325/MW-day | $69,989 | published |
| Demand charges avoided: $8–14/kW-month band | $96,000–$168,000 | planning |
| Utility VPP: $150/kW-year | $150,000 | planning |
| **Added** | **$315,989–$387,989** | |
| One-time: ComEd storage rebate, $250/kWh (paired DG + Rate BESH) | $1,000,000 | published |

If the same 1 MW can't earn PJM capacity and the VPP program at once, the
stack is $246,000–$318,000 (keep the VPP) or $165,989–$237,989 (keep
capacity). Nothing in OMEGA checks this today; the chart proposes that the
market participant of record owns the rules, Lightsmith's optimizer enforces
them in dispatch, and OMEGA applies them in the stack.

## Inside the editor, the live path

1. **Build › BESS Build, BESS Sizer or Solar + Storage.** The estimator reads
   the placed fleet (`_vsFleetSize` 29695), then `S.bessList`.
2. **Analyze › Screening › Value Stack (optional).** ZIP to state to market,
   behind or in front of the meter, and the route to market. Its figures stay
   in the panel.
3. **Estimate › Cost & ROI › Construction Cost, then the Revenue sub-tab**
   (nothing deep-links to it). ZIP (prefilled), the monthly bill (typed),
   facility type and a PJM RegD price, then Estimate Value Stack. A
   front-of-meter project is refused (30318) and has nowhere else to go:
   Price Decks is gated SOON (152152).
4. **Apply to Revenue Streams.** Four streams badged "~ Estimate"; the rest
   typed.
5. **ROI sub-tab and the results rail.**
6. **Out:** BESS Config › Export Analysis prints an "Estimated Year-1 Value
   Stack" (`bmExportAnalysis` 21301, box 21317-21346); Output › Reports ›
   Proposal; Output › Marketplace (Push to Marketplace → `fin_projects`,
   Apply for Financing → `/financing.html?project=`).

## Defects found while mapping

None is fixed by this note.

1. **The proposal's payback and IRR always read "—".** `buildProposalHTML`
   (28331) takes year-1 revenue from `_VS_ESTIMATE.total` (28344).
   `_VS_ESTIMATE` has no `total` (30393-30401) and nothing sets one.
2. **The value stack is never saved.** The `projects` save allowlist
   (25731-25807) has no revenue, value-stack, incentive, bill or ROI field, and
   `_revStreams` is rebuilt at $0 on load (36725).
3. **Imported bills reach neither value-stack model.** Import Bill writes
   `S.billImport` and `_bill8760` (`billApply` 16714). The estimator's bill is
   typed (`vs-bill`). `OmegaValue`'s `billDemandCharge` (93552) reads
   `_billDemandRate`, `_importedBill.demandRate` and `BILL.demandRate`, none of
   which is ever assigned, so it always falls back to "regional typical —
   CHECK YOUR TARIFF".
4. **Three PJM capacity numbers.** The estimator counts one $55/kW-year
   capacity/DR band (`_vsIsoCapRate` 30429). Analyze › Value Stack counts
   $10.14/kW-month on nameplate kW (`TYPICAL.PJM` 93431, 2027/28 BRA). The
   server counts $325/MW-day accredited by ELCC class
   (`api/_lib/value-stack.js`, 2028/29 BRA), and its own comment calls
   nameplate pricing "the single commonest error in a storage pro forma".
5. **Two state-to-market maps.** `_isoForState` (29739) puts IL, IN, MI, KY
   and NC in PJM; `OmegaValue`'s `MARKET` (93405) puts IL, IN and MI in MISO
   and NC outside an ISO. A ComEd site reads MISO in Analyze › Value Stack.
   Neither can express a split state. `projectMarket()` (52757) takes an
   explicit `p4_market`, which only the hidden Viability Workflow writes.
6. **Three Molecule / DividendVPP share assumptions.** The editor keeps 92%
   (93485). `apartment-bess.html` takes 95% capture with 70/20/10 (688), and
   its owner meter applies capture × (0.80 + 0.10), counting the installer's
   10% twice (875, 921). `valuestack.html` takes a 5% aggregator fee (461).
7. **CAISO resource adequacy** is $75/kW-year in the estimator and zero in
   Analyze › Value Stack ("RA is bilateral").
8. **No revenue leaves the editor.** `mktBuildDoc` (64557) sends `ask`, a
   typed `ppaRate`, `sizing: null` and `bill: null`. `financing.html` reads
   `bessSizing` and `capex`, which the editor's save does not write.
9. **`/api/price-site` prices every site as the ComEd/PJM screening
   scenario** (`finish`: demand $8–14/kW-month, VPP $150/kW-year planning,
   the ComEd rebate), wherever the site is.
10. **`valuestack.html` computes in the browser and is served publicly,**
    against the CLAUDE.md IP rule; MERGE.md item 9 (165) is still open.
11. **Double count.** The incentives catalogue has revenue-tagged `dr` and
    `vpp` entries (28905-28906) taken as one-time offsets, while the Revenue
    tab carries the same streams as annual values.
12. **`/api/opportunity`** says the value-stack tool calls it when an
    optimizer vendor is selected (`api/opportunity.js:5-7`). Nothing calls it.
13. Minor: the OmegaEdit rule that moves Value Stack to Estimate (118559)
    never matches, because `findBtns` (118502) reads the `onclick` attribute
    and the button sets a property (93840). `setCostTab` (28938) highlights
    `ct-incentives` and `ct-revenue`; the buttons are `ct-inc` and `ct-rev`
    (3664-3665).

## Integration points (proposed)

Server to server only. A partner credential lives in Vercel environment
variables, every call goes through an authenticated `/api/` function
(`A.authenticate`, `canActInOrg`, the module gate), and no customer name or
address leaves OMEGA before the customer accepts.

| Point | From (to confirm) | Step | Where it would land |
|---|---|---|---|
| D1 Rates & forecasts | DividendVPP or Lightsmith | C | Program rates: `V.stack({ vppPerKwYear, vppRef })` already marks the VPP stream `published` when a reference is supplied (`api/_lib/value-stack.js`). Key a rate table by market, utility and program on the server and let the estimator's streams, including the typed-in `vpp` line, come from it. Forecasts: Price Decks (`PRICE_PRODUCTS` 119462). Add a named adapter once a sample export is in hand (the comment at 119847 says why there is none). `PRICE_PRODUCTS` holds ERCOT's seven series; other markets need their own lists. |
| D2 Coverage | DividendVPP, with the route to market | B | Replace `PARTNERS.molecule.markets: 'market-agnostic'`, and resolve the market by utility territory or node instead of by state. |
| D3 Terms | DividendVPP, with the route to market | B | One server-held figure per market and program, replacing the three assumptions in defect 6. |
| D4 Dispatch | Lightsmith | D | A new authenticated endpoint: send kW, kWh, round-trip efficiency, warranty cycles, the 8,760-hour load, tariff and node, with no identity. Receive the hourly schedule, revenue per stream and value forgone. Compare it with `OmegaValueStack.allocate`. |
| D5 Verification | Molecule (telemetry) | D, E | A verification id, date and basis that sets `_certified` and, once defect 2 is fixed, is saved on the project and carried to the exports, `/api/proforma` (`revenue.dr.*`, `proforma.html:989-1001`) and `fin_projects`; verified events feed E once the asset runs. Enrollment rides the existing partner route, `api/opportunity.js`: an anonymous `public{}` until the customer's `reveal`. |

The combination check needs one rules table that both the stack (step D in
OMEGA) and the dispatch (Lightsmith) read, and a named owner.

To start: a sample forecast export, the coverage list, terms by market,
Lightsmith's input and output spec, and dispatch API documentation.
