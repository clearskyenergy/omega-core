# BESS Pro Forma — the investor model and deck

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

`/proforma` (tool key `proforma`, TIER.STANDARD). One site in, an investor
deck out: the four-page one-pager a financing team reads (cover, overview,
"The Numbers", contact), as a PDF or an editable PowerPoint, in the brand of
the tenant that produced it. This note is the method, where every number
comes from, how it was checked, and the honest list of what is not built.

## 1. Where it lives

```
proforma.html                 the tool page. Collects inputs, renders what the
                              API returns. Computes no financial figure.
proforma-logic.js             OmegaProformaReport: lays the deck out (PDF via
                              print, PowerPoint via PptxGenJS 4.0.1 loaded on
                              first use, pinned with SRI). Rendering only.
api/proforma.js               POST context | size | model | site, behind the
                              proforma tool gate.
api/_lib/proforma-engine.js   the finance engine (pure, deterministic).
api/_lib/proforma-sizing.js   one site through the unified battery engine.
api/_lib/site-lookup.js       geocode, energy community, low-income tract,
                              PVWatts production, URDB tariffs.
api/_lib/data/                Treasury's energy-community and low-income
                              tables (rebuilt by scripts/build-energy-communities.js).
scripts/tests/tproforma*.js   engine, sizing, API, page; tsitelookup.js.
scripts/preview-proforma.js   local preview on the real handler (never deployed).
```

Branding is the signed-in caller's own `omega_orgs/{org}` record
(`exportBrand.name/logo/accent/tagline`, `logoUrl`, `colors`) plus the
overrides a user sets on one report. There is no default tenant. With no
colour on the record the deck takes its accent from the logo. The "powered
by" line is `api/_lib/whitelabel.js attributionLine()` — empty unless a
white label says otherwise, exactly as every other export.

## 2. The model

The three NextNRG one-pagers this deck is modelled on were built in NREL SAM
("PV Battery / Single Owner", the 2025.4.16 defaults). The engine follows
SAM's single-owner method so a deck built here and a deck built there agree:

- Year 0 is the investment: installed cost + working-capital reserve (months
  of next year's opex) + DSRA + financing fee, less debt.
- Revenue: solar kWh × PPA rate (linear degradation, as SAM's lifetime mode),
  the battery's year-by-year host savings from the sizing engine (shared,
  fixed fee, host-owned, or bundled in the PPA), EV $/kW-yr, other; demand
  response only when marked base case, always reported as upside.
- Reserves as SAM: working capital released in the last year, an equipment
  (inverter) reserve with its replacement on 5-yr MACRS, interest on reserve
  balances; battery replacements the sizing engine books are funded from a
  reserve or from cash.
- ITC per capex line, by asset: §48E base 6%, or 30% with prevailing wage and
  apprenticeship or under 1 MW AC; +10 energy community and +10 domestic
  content (+2 each on the 6% base); low-income +10/+20 for solar only. Solar
  that began construction after 4 Jul 2026 and is in service after 2027 gets
  nothing; storage phases down from 2034. Roof, structure and EV chargers are
  not credit property. 50% of the credit comes off depreciable basis.
- Depreciation: SAM's allocation of energy property (90% 5-yr MACRS, 1.5%
  15-yr MACRS, 2.5% 15-yr and 3% 20-yr straight line, 3% not depreciable),
  explicit classes for everything else (7-yr, 15-yr, 39-yr), half-year or
  mid-quarter, optional bonus with state conformity.
- Tax: state first, deductible federally. Either the owner uses every benefit
  the year it arises (a tax-efficient investor; SAM's default) or the project
  carries losses forward (80% limit) and uses the credit under §38(c); the
  credit can be sold (§6418) instead.
- Debt: sized by loan-to-cost, by DSCR, or the lesser; level or sculpted;
  DSRA of next year's service released at maturity; fee amortised.
- Metrics: after-tax IRR, the IRR build (cash only → depreciation → ITC, each
  step the difference of values rounded to 0.1 so it adds up on the page),
  after-tax payback, total investor returns (the sum of after-tax cash flows
  years 0..N), year-1 distribution, NPV, levelized PPA price and LCOE (SAM's
  definitions at the stated nominal rate), LCOS for a battery-only project,
  DSCR, sensitivity.
- Warnings, in plain sentences with the rule and the date: the solar deadline,
  FEOC material-assistance thresholds by construction year, prevailing wage,
  low-income allocation, storage phase-down, §30C's end for chargers, roof
  credit, mid-quarter, a non-statutory rate, a state rate that disagrees with
  the site's state, tax-exempt hosts (PPA, not lease), transfer restrictions.

Tax-law defaults are as of 24 Sep 2026 (OBBBA, P.L. 119-21; Notices 2025-42,
2026-15, 2026-39). The engine flags what it cannot know; it does not give
tax advice.

## 3. How it was checked

`scripts/tests/tproformaengine.js` runs the three published decks through the
public `run()` and asserts:

| deck | figure | published | model |
|---|---|---|---|
| Topanga | ITC | 640,823 | 640,823 |
| Topanga | basis after haircut | 1,406,250 | 1,406,250 |
| Topanga | year-1 distribution | 94,462 | 94,462 |
| Topanga | after-tax IRR | 8.14% | 8.140% |
| Topanga | IRR build | 4.8 / (0.9) / +4.2 | 4.8 / (0.9) / +4.2 |
| Topanga | levelized PPA / LCOE | 28.10¢ / 27.84¢ | 28.100¢ / 27.841¢ |
| Topanga | payback | ~10.4 | 10.38 |
| Topanga | total returns | 1,757,498 | 1,759,299 (+0.10%) |
| Sunnyside | ITC / year-1 distribution | 761,481 / 128,665 | 761,481 / 128,665 |
| Sunnyside | after-tax IRR / build | 8.01% / 5.1 (0.8) +3.7 | 8.008% / 5.1 (0.8) +3.7 |
| Taft | ITC face / sold at $0.92 | 401,661 / 369,528 | 401,661 / 369,528 |
| Taft | debt / fee | 755,001 / 11,325 | 755,001 / 11,325 |
| Taft | levered after-tax IRR | 10.36% | 10.47% |

The decks' own errors are reproduced only where the test states them as
inputs, and flagged by the engine's warnings: Sunnyside used SAM's default 7%
state rate for a California site; Taft counted its $565k roof as credit
property and applied an 8.84% state rate in Florida. Taft is levered with a
structure the deck does not fully state, so it is matched within ±0.5 pts.

The engine suite also kills 25 deliberate SAM/tax breakages (mutation run);
the API suite kills 22 deliberate gate breakages.

## 4. Sizing

The battery is sized by the unified engine (`api/_lib/battery-tool-engine.js`
through `bess-size-adapter.js`) — the same engine as the editor and the
Battery Sizer — from 12–24 monthly bills or a full interval year. The
recommended system, its year-by-year savings re-solved at each state of
health, and its replacements are what the model prices. A size typed by hand
is allowed and labelled as such on the deck's disclosures.

## 5. Site lookups and their data

| fact | source | refresh |
|---|---|---|
| location, county, tract | US Census geocoder, vintage `Census2020_Current` | live |
| energy community | Treasury's Notice 2026-39 tables (statistical areas; coal-closure tracts), bundled | every June: `node scripts/build-energy-communities.js` |
| low-income tract (§48E(h) cat. 1) | Treasury/DOE 2026 tract list, bundled | with the program year |
| solar production | NREL PVWatts v8 on `developer.nlr.gov` | live |
| utility and tariffs | OpenEI URDB v8 (`effective_on_date` = today) | live |
| state tax | the engine's 2026 table | yearly |

DOE's ArcGIS energy-community layers are NOT used: they still carry the 2024
list. PVWatts and URDB need keys. Set `NREL_API_KEY` and `OPENEI_API_KEY` in
Vercel; until then a user's own keys from Settings are passed through for the
one call (never stored or logged), and PVWatts falls back to DEMO_KEY (about
ten calls, shared). Every lookup is shown with an Apply switch; nothing is
applied silently.

## 6. Not built — say so before selling it

- No partial first year: year 1 is the first full operating year, as SAM.
- No ITC recapture event, terminal value, or state depreciation beyond bonus
  conformity (e.g. California's MACRS non-conformity).
- Tax-equity partnership flips and sponsor/investor waterfalls are not
  modelled; the model is single owner, unlevered or with one senior loan.
- Brownfield energy-community status is site-specific and cannot be looked up.
- The low-income tract test is screening; a capacity allocation is still
  required, and storage is never eligible.
- The marketplace card's description and version come from the published
  catalog (`tools/proforma` in Firestore): they change when staff run
  "Import / Update Applications" (or `npm run tools:apply -- --only proforma`).
