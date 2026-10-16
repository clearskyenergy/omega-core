# Portfolio IRR — bank-verification review (2026-10-15)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Tommy, 2026-10-15: "make sure our IRR in the portfolio is taken care of … we
should be looking at this over a ten year span, and we need to be very
accurate on how we calculate things so it's able to be verified by the bank."
Read beside the NextNRG Sunnyside workbook Paige shared on the call
("NextNRG Sunnyside Pro Forma Unlevered 10-15-2026 w nanocompute").

## What is already right

- **The engine is NREL SAM's single-owner cash flow**, the method NextNRG's
  own decks are built with, and `scripts/tests/tproformaengine.js` rebuilds
  the Topanga, Sunnyside and Taft one-pagers through it to the cent (ITC,
  year-one distribution, IRR, payback, total returns). A bank running SAM on
  the same inputs gets the same answer.
- **The portfolio term is ten years** (`compute-site.js finance.years`
  default 10). The register, the site page and the CSV say "10-year term".
- **Tax is statutory, not the deck's**: California state income tax at
  8.84% (the deck left SAM's 7% default in place), federal 21%, 5-year MACRS
  on energy property with the §50(c) half-credit haircut, the §48E rate
  built from the adders, bonus depreciation off by default. The deck's "36%
  flat ITC" is not a statutory combination; the engine says so when a rate
  is typed (`NON_STATUTORY_RATE`).

## What was wrong, and is now fixed in this change

1. **The PPA escalator on record was the one-pager's, not the contract's.**
   Both executed PPAs carry a price table, not a rate and an escalator.
   Topanga's runs $0.2250 → $0.3840 over 28 years and Sunnyside's $0.250 →
   $0.427: both compound **2.0% a year**. The one-pagers (and the finance
   portal entries) say 2.5%. The site record now carries the contract's
   own table (`ppaPriceSchedule`, pasted straight off Exhibit 1) and the
   engine prices every year off it (`proforma-engine.js ppaPrice()`, the
   one reader; the terminal value is priced off the same reading). A rate
   and escalator still work without a table, and the model now SAYS when it
   is pricing on a rate with no table, when it assumed an escalator, and
   when it generated the solar from the ZIP's yield instead of the
   contract's figure.
2. **Year-one production was the ZIP's yield, not the contract's.** The
   executed Sunnyside PPA states 627,140 kWh expected in year one. The site
   record now carries `ppaYear1Kwh` and the host's solar generates exactly
   that in year one (SAM's linear degradation after).
3. **The ITC adders could not be entered.** Both one-pagers claim an energy
   community. The site record now carries `itcEnergyCommunity` and
   `itcDomesticContent`; the engine builds the statutory rate (30 + 10
   points) from them. Nobody types a percentage.
4. **The ten-year figure stands beside the headline.** The headline IRR
   takes the PPA's remaining 18 years as a terminal value in year 10
   (discounted at 10%, taxed as income, stated in the assumptions). A
   lender's own ten-year model has no such line, so `irrExTerminal` — the
   ten years' cash flows alone — is now on the deal, the site page's
   headline, the register's drawer and its CSV, with the terminal value's
   amount and year beside it.
5. **A changed fact did not re-run the model.** The automatic model only
   re-ran when the Site Map design changed; a PPA, a production figure, the
   usage or an ITC adder entered afterwards left the stored IRR stale. It
   now re-runs when the model's input differs from what the stored model ran
   on (`latestModel.inputHash`), carrying a chosen chipset, pod count and
   structure.
6. **A partial save wiped facts.** A save that did not send a field (an
   import row, an older form) stored `null` for it: the PPA, the service
   figure and the usage could vanish. Unsent now means unchanged.

## What to enter on the two site records (nobody has done this yet)

The production records were not read in this session (no credentials
here), so this is what the executed contracts say; enter it on each site's
Facts tab and the model re-runs by itself.

| | Sunnyside (Torrance) | Topanga Terrace (Canoga Park) |
|---|---|---|
| PPA price table | 28 rows, $0.250 … $0.427 (Executed Sunnyside.pdf, Exhibit 1) | 28 rows, $0.2250 … $0.3840 (Executed Topanga.pdf, Exhibit 1) |
| PPA term | 28 years (+ two 5-year extensions) | 28 years |
| Expected year-one production | 627,140 kWh (contract) | blank in the contract ("{...}"): ask NextNRG |
| System in the contract | 409 kW DC solar + **300 kW / 1,200 kWh** | **350 kW** solar + **250 kW / 1,000 kWh** |
| System in the one-pager / workbook | 409 kW + 300 kW / **1,800 kWh** | **315 kW** + 300 kW / **1,800 kWh** |
| ITC | energy community claimed (one-pager: 36%; statutory: 40%) | energy community claimed (one-pager: 40%) |

The system-size disagreements are real and a bank will catch them: the
executed contracts describe a smaller battery than the pro formas price.
The Site Map design should be drawn to what is actually being built, and
NextNRG should say which is right.

## Sunnyside through our model as the contract reads

Local run (`api/_lib/site-model.js` + `compute-site.js`, the real code, a
synthetic site: contract table, 627,140 kWh, energy community, one
Omega-Core skid beside the $2,350,251 host system, no usage on record):

| Case | 10-year after-tax IRR | Note |
|---|---|---|
| Whole project, headline | 15.33% | with the PPA's remaining 18 years as a $1.44M terminal value in year 10 |
| Whole project, ten years alone | 12.64% | no terminal value: the figure to check against a lender's model |
| Host system alone, 10 years, no terminal | 0.10% | solar + storage alone does not return inside ten years |
| Host system alone, 28 years, contract table, statutory 40% | 7.94% | the one-pager's 8.01% used 2.5%, 36%, 7% state |
| Host system alone, 28 years, contract table, the deck's tax | 7.46% | what the one-pager would read on the contract's prices |
| Skid alone, 10 years | 27.2% | spot H100 pricing, falling 8% a year |

So inside ten years the return is the skid's. The bank will test the
compute case hardest.

## Our compute inputs beside Paige's workbook

Visible on the shared screen (Inputs sheet): "Nanocompute rev" $1,470,000 a
year flat, "Nanocompute opex" $700,000 a year flat, federal ITC 36%, state
7%, federal 21%.

| | Paige's workbook | Our model (Omega-Core skid, `omega-compute-model.js`) |
|---|---|---|
| Compute revenue, year 1 | $1,470,000 = 48 H100 × $3.50/GPU-hr × 8,760 h at 100% | $837,275 = 48 H100 × $2.46 (CoreWeave spot, 2026-10-05) × 8,760 × 85% sold × 98% up |
| Revenue path | flat for the term | −8% a year on price, reset at the year-5 GPU refresh |
| Compute opex, year 1 | $700,000 flat | ≈ $308,000: power $122k (CA tariff, own 480 V meter), 8% platform fee $61k, pod O&M $60k, fiber $18k, hardware O&M $19k, insurance $16k, host rent $12k |
| Net compute, year 1 | $770,000 | ≈ $530,000, falling |
| ITC | 36% flat | statutory build (30% + energy community 10%); the skid is not energy property |
| State tax | 7% (SAM default) | 8.84% (California) |

Ours is the more conservative revenue case by a wide margin and the lighter
opex case. Neither is wrong on its face, but a bank will ask for the basis
of both: hers needs a contracted $3.50 GPU-hour at full utilisation; ours
is the public spot reference and the skid's own operating figures. If
NextNRG has a signed compute offtake at $3.50, that belongs on the site
record as the price basis and we should model it as firm offtake, not spot.
The workbook itself was not on disk and could not be read line by line;
the Budget and Cash Flow sheets were not visible.

## Not verified here

- The live site records (what is stored today for Topanga and Sunnyside)
  were not read: production Firestore reads are not permitted from this
  session. The 11.88% Topanga figure on the register is the stored model
  under the OLD inputs (2.5% escalator, ZIP yield, base ITC); it changes
  when the table and the adder are entered.
- The workbook's Budget, Cash Flow and Depreciation sheets.
- Whether the energy-community claim holds for each ZIP (the engine takes
  the flag as the sponsor's claim and says so).

## Tests

`scripts/tests/tproformaengine.js` (the table, past-table years, the one
reader), `scripts/tests/tcomputesite.js` (the table and production on the
host, the terminal value off the table, `irrExTerminal`, the three
warnings), `scripts/test-site-crm.js` (the fields on the record, the
re-run on changed facts, the adder's statutory rate, a partial save keeping
the table), `npm run test:portfolio`, `npm run check:workspace`.
