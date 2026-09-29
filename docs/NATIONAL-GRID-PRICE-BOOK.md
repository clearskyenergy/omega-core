# National Grid MA — the price book (Concord Energy, v2, 2026-09-28)

Source: *Concord Energy — National Grid MA Cost Estimate & Proposal Engine,
Operating Instructions (v2, updated 2026-09-28)*. This is what
`ev-cost-workbook.html` does with it and, honestly, what it does not.

## The rule

National Grid's feasibility team compares line-item unit prices across every
Concord submission. So every job uses the **same unit prices** and only the
quantities change. The page never scales, marks up or adjusts a rate to hit a
total: the old per-port floor (`allInPerPort`, the "raised to $13,350/port"
uplift) is gone, and the proposal's markup knob is ignored on a National Grid
job (a flag says so). Price per plug is a **check, not a lever**.

`NG_PRICE` in the page is the book. `ngPriceBook(Q)` is pure: quantities in,
priced lines and flags out. `ngQuantities()` gathers Q from the page (ports,
paved and unpaved trench footage, conduit footage, handholes, the service
scope, the 80 A price, the drawing's counts). `scripts/tests/tngpricebook.js`
pins the instructions' five reference jobs (§14) and the line level of
18 Blanche St (§14.1) — a rate change moves them on purpose.

## The book

| Sheet row | Line | Qty (E) | Material (F) | Labor (G) |
|---|---|---|---|---|
| 10 | Design/Engineering/Permitting | P | — | $1,423 × P |
| 12 | Trenching, paved | LF | $30 × LF | $110 × LF |
| 13 | Trenching, unpaved | LF | **no rate — ask** | **no rate — ask** |
| 14 | Conduit & cable | LF | $1.90 × LF | $1,100 + $2.50 × LF |
| 15 | Protective bollards | S | $250 × S | $300 × S |
| 16 | Handholes/manholes | — | **no rate — ask** | **no rate — ask** |
| 17 | Concrete pads | S | $500 × S | $1,000 × S |
| 18 | Panels, standard package (no new service) | 2 | $1,451.22 | $621 |
| 18 | New 200A single-phase service | lump | $6,600 | $12,550 |
| 18 | New 200A three-phase service | lump | $8,910 (= 6,600 × 1.35) | $12,550 |
| 19 | Other — materials + install labor | P | $1,200 flat | $2,360 × P |
| 27 | Autel AC Elite 50A dual-port (12 kW) | P | $2,000 × P | blacked out |
| 27 | Autel MaxiCharger AC Pro 80A (19.2 kW) | P | **ask** (the old $6,100/station is not confirmed) | blacked out |
| 28 | Pedestal & mounting | S | $1,150 × S | blacked out |
| 29 | Freight | P | $50 × P | blacked out |
| 32 (or 45) | Networking (Green Joulez) | P | $480 × P | blacked out |
| 34 | Signage & labels | P + 1 | $400 lump | $190 lump |
| H52 | Sales tax | | 6.25% × (F12…F19 + F34), half-up | |

P = ports (C6). S = stations = P ÷ 2 (every station is dual-port; an odd P
rounds up and is flagged). C7 is written as S.

## What the page asks instead of guessing

Flags in the *National Grid price check* card, above the incentive table.
An **ask** is a hard stop the rep answers on the form:

- **Service scope (row 18)** — *Program details › Service scope*. Until it
  is chosen the sheet carries the standard package and the flag states the
  dollar impact of each option. "A new meter is being added" still needs
  the phase.
- **The 80 A unit** — *Program details › Autel AC Pro 80A price per port*.
  Ports on 80 A units are $0 until it is entered.
- **Unpaved trench, handholes** — no rate; $0 until the rep types the
  material and labor over the line (a typed figure is pinned and used).

Notes (not stops): a Workplace or Fleet site with networking on row 32
(belongs on 45; left pending the decision), utility-side rows 21–25 with a
cost (kept in H54, out of H53 and out of the proposal), a line the book has
no rate for carried as submitted, station/pedestal/pad counts that differ
from S, blank header fields, the markup knob, and the gross price per plug
outside the $10,500–$13,500 band with its driver (a new service over few
plugs, a long trench, a small scope).

The card also shows Mode 2's table — Line | Submitted | Corrected — for
every sheet row the book moved from what the estimate carried.

## Not built (the instructions describe it; this page does not do it)

- **§8 Column C note templates.** The sheet's notes are still the short
  line notes, not the paragraph templates with the municipality and the
  counts in words.
- **§9 the client proposal layout** (rows 5–41 with the exact labels). The
  proposal is still the page's own layout; it is built from the same priced
  lines, so it matches the matrix to the cent, which is the rule that
  matters.
- **§10 editing an uploaded workbook in place.** The page writes National
  Grid's template from scratch (or fills the blank template); it does not
  take a customer's filled workbook and correct its cells.
- **Moving networking to row 45** on Workplace/Fleet sites: flagged, not
  moved, pending the decision the instructions leave open.
