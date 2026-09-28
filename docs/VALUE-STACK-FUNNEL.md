# The value stack funnel, and where DividendVPP plugs in

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **design note, nothing built.** Written 2026-09-28 from a read of the
code (not a run of the app) for the DividendVPP conversation. It records how
the editor values a battery today and proposes five integration points,
D1–D5. The partner-facing chart is `docs/design/value-stack-funnel.html`,
published privately as a claude.ai artifact
(https://claude.ai/artifact/YNLSbK9EarAQv6UjrXRsDR). Keep the two in step.
The chart deliberately leaves out the defects listed below.

DividendVPP is Molecule Systems' VPP product; AERA is Molecule's device
integration surface (`fleet-simulator-3d.html:250-251`). The editor already
names Molecule as a route to market (`editor.html:93485`, "Molecule Systems
(EMS + VPP)") and DividendVPP as a price-deck provider tag
(`editor.html:119847-119853`, no adapter).

## The six gates

A value stack should narrow through six gates. Each removes value that this
battery, in this market, through this route to market, cannot earn.
"Applied" means the gate shapes the number that reaches the customer today
(Cost & ROI, then the results rail and the exports).

| Gate | Removes | Where it lives today (`editor.html`) | Applied |
|---|---|---|---|
| 1 Gross stack | nothing; every stream on its own | Estimate › Cost & ROI › Construction Cost › Revenue: `runValueStackEstimate` (30291) writes `_VS_ESTIMATE` (30393); `applyValueStackEstimate` (30450) fills `arbitrage`, `demand`, `dr`, `reg_pjm` in `_revStreams` (`REV_CATALOG` 28911). `vpp`, `capacity` and `resilience` are typed in. | yes |
| 2 Reachable | streams the route cannot reach | Analyze › Screening › Value Stack (`OmegaValue`, Patch 41, from 93343): `PARTNERS[k].streams` (93464) | no: the panel only has a close button and nothing reads `OmegaValue.*` |
| 3 Kept | the operator's share | same panel: `PARTNERS[k].keep` | no |
| 4 Deliverable | double-booked hours and cycles | `OmegaValueStack.allocate` (from 141299); the hourly `dispatch.verifyShave` (127778), used only by the Bill Analysis workbook (139299) | no: `run`, `allocate` and `lifecycle` have no callers; only `irr` and `readSite` are used |
| 5 Lifetime | fade, O&M, augmentation | `updateROI` (36664): payback, year-1 cash-on-cash, 10-year NPV at 8%, 3% revenue growth; results-rail IRR through `OmegaValueStack.irr` (36461) | partly: no degradation (the lifecycle with fade and augmentation, 141458, is unused) |
| 6 Verified | value nobody signs for | the `_certified` badge (29632), never set true; the "certified by our aggregator partners" footnotes (21344, 30421-30424) | no: a label |

## The live path

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

## DividendVPP integration points (proposed)

Server to server only. A DividendVPP credential lives in Vercel environment
variables, every call goes through an authenticated `/api/` function
(`A.authenticate`, `canActInOrg`, the module gate), and no customer name or
address leaves OMEGA before the customer accepts.

| Point | Gate | Where it would land |
|---|---|---|
| D1 Rates & forecasts | 1 | Programme rates: `V.stack({ vppPerKwYear, vppRef })` already marks the VPP stream `published` when a reference is supplied (`api/_lib/value-stack.js`). Key a rate table by market, utility and programme on the server and let the estimator's streams, including the typed-in `vpp` line, come from it. Forecasts: Price Decks (`PRICE_PRODUCTS` 119462). Add a named adapter once a sample export is in hand (the comment at 119847 says why there is none). `PRICE_PRODUCTS` holds ERCOT's seven series; other markets need their own lists. |
| D2 Coverage | 2 | Replace `PARTNERS.molecule.markets: 'market-agnostic'`, and resolve the market by utility territory or node instead of by state. |
| D3 Terms | 3 | One server-held figure per market and programme, replacing the three assumptions in defect 6. |
| D4 Dispatch | 4 | A new authenticated endpoint: send kW, kWh, round-trip efficiency, warranty cycles, the 8,760-hour load, tariff and node, with no identity. Receive the hourly schedule, revenue per stream and value forgone. Compare it with `OmegaValueStack.allocate`. |
| D5 Verification | 6 | A verification id, date and basis that sets `_certified` and, once defect 2 is fixed, is saved on the project and carried to the exports, `/api/proforma` (`revenue.dr.*`, `proforma.html:989-1001`) and `fin_projects`. Enrolment rides the existing partner route, `api/opportunity.js`: an anonymous `public{}` until the customer's `reveal`. |

To start, from DividendVPP: a sample forecast export, the coverage list, terms
by market, and dispatch API documentation.
