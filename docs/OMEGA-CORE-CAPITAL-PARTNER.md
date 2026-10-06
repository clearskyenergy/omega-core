# Omega-Core for a capital partner: the bankable structure, the split, the portfolio

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 6 October 2026. Tommy: "the need here is to get a bankable solution
to present to Barry to deploy capex and then we need to design the split on
how he makes his money back and how we get [paid] and how he can deploy the
assets in his portfolio." Reshaud Henry (iQGen, who builds the set) is
working the offtake with the Sales desk (`docs/COMPUTE-OFFTAKE-SALES.md`);
Topeka, Kansas is the pilot Tommy wants to try first.

The numbers here come from ONE place, `scripts/omega-core-partner-split.js`,
which runs the skid's own cash flow (`api/_lib/omega-compute-model.js`, the
iQGen 75 kW workbook as one pure function) with the partner's capital in
place of bank debt, the host's land lease as a cost, ClearSky's operating fee
as a cost, and splits what is left three ways. Every split figure is a
PROPOSED placeholder printed with the result; Tommy sets the real ones. The
figures are staff-only, like the model's build-up: they go to Barry on a
page Tommy presents, never to a prospect. `scripts/tests/tpartnersplit.js`
pins the arithmetic.

---

## 1. The parties and what each puts in

| Party | Puts in | Takes out |
|---|---|---|
| **Barry (capital partner)** | The capex: $450,000 a skid, the recorded price. Owns the asset. | His capital back with a return, and the residual (the skid at fair market value, or the host's buyout) |
| **ClearSky (developer and operator)** | Site origination and qualification (the platform's Omega-Core gates: power, location, fiber), the host lease, the offtake contracts, operations, billing, the customer | An operating fee off the top, and a share of cash after Barry is whole |
| **iQGen (the set)** | Builds and commissions the 75 kW compute set inside the skid; Reshaud works offtake with us | Its margin inside the skid price; any share of the split is Tommy's call (§8) |
| **The host (the charging site)** | A pad, a 480 V service point, fiber at the lot line | A land lease, the market reference until ClearSky sets a rent (`RATE_CARD` in `api/_lib/omega-core.js`: $750–$1,500 a month, base $1,000, 2.5% escalator) |
| **The offtaker** | A capacity contract: GPU-hours reserved or a host agreement with a marketplace | Compute near its users |

What the skid is: 75 kW IT, about 48 NVIDIA H100-class GPUs on six nodes,
a 60 kW / 61 kWh battery, its own meter, five-year minimum per site, then
removed or bought at FMV (`docs/OMEGA-CORE.md`).

## 2. What "bankable" has to mean here

A lender or a capital partner underwrites three things. The pack to Barry
answers each with evidence, never a hope:

1. **Contracted revenue.** A signed offtake (a reservation, a take-or-pay on
   GPU-hours, or a marketplace host agreement with a revenue history) that
   covers Barry's fixed claim (§3) in the *contracted base* case. Spot is a
   market reference, not a contract: the workbook's own note.
2. **Coverage at the downside.** Barry's claim covered at least 1.25x in the
   *downside* case (60% of spot realised, 60% busy), which is what a bank
   asks of a project loan and what the model already tests (`targetDscr`).
3. **A site cleared on evidence.** The platform's Omega-Core qualification
   says Qualified only on a confirmed fact (the utility's will-serve, fiber
   on site, zoning); a site that *needs further qualification* gets no
   capex. "No false results" (Tommy, 2 October 2026) is the underwriting
   rule as much as the sales rule.

## 3. The three structures, and what each pays

One skid, 60 months, unlevered, the host lease at the market base, residual
30% of cost at month 60 (the FMV band's base), ClearSky's operating fee 10%
of gross revenue. The cases: *merchant* is the workbook as handed over
(85% busy at CoreWeave's public spot rate); *contracted base* is 70% busy at
75% of spot, which is what an aggregator's revenue share or a reserved
contract at a discount looks like; *downside* 60% at 60%; *stress* 50% at
50%.

**Structure 1: Barry owns, ClearSky operates (the waterfall).** Each
month's cash pays Barry a 12% preferred return on unreturned capital, then
returns his capital, then splits 50/50. ClearSky's operating fee comes off
the top. The residual is Barry's.

**Structure 2: sale-leaseback.** Barry buys the skid and leases it to
ClearSky for a fixed monthly payment sized to return a 12% yield over 60
months with the residual his. ClearSky keeps everything above the payment
and carries everything below it: Barry's return is contractual.

**Structure 3: revenue share.** Barry takes 35% of gross revenue, first
dollar, until he has 1.0x, then 15%; ClearSky runs the skid on the rest and
carries every cost.

At the model's defaults ($0.15/kWh delivered, the workbook's $5,000 a month
site cost):

| Case | Year-1 revenue | Cash to split, yr 1 | 1 · Barry IRR, capital back, pref cover | 2 · lease $8,357/mo covered | 3 · Barry IRR, 1.0x by |
|---|---|---|---|---|---|
| Merchant spot | $755,699 | $444,165 | 98.6%, month 14, 4.18x | 2.25x at worst, 0 short months | 45.9%, month 21 |
| Contracted base | $466,755 | $213,010 | 30.7%, month 32, 1.74x | 0.91x at worst, 5 short months (the ramp) | 22.6%, month 34 |
| Downside | $320,061 | $95,654 | −2.2%, not inside the term, 0.05x | 0.02x, 52 short months | 12.3%, month 52 |
| Stress | $222,264 | $17,417 | −20.3%, 0.36x | under water all term | 2.9%, not inside the term |

ClearSky over the term, contracted base: $432,287 (structure 1), $538,319
(structure 2, carrying the ramp), $458,014 (structure 3).

With two levers moved, power at $0.10/kWh and a $2,500 a month site cost
(what a skid on a charging site in a cheap-power state should look like;
Topeka's own figures go in §6 when the utility answers):

| Case | Cash to split, yr 1 | 1 · Barry IRR, capital back, pref cover | 2 · lease covered | 3 · Barry IRR, 1.0x by |
|---|---|---|---|---|
| Merchant spot | $503,766 | 119.8%, month 12, 5.03x | 2.71x, 0 short | — |
| Contracted base | $272,612 | 48.6%, month 23, 2.59x | 1.39x, 0 short | — |
| Downside | $155,256 | 18.6%, month 53, 1.35x | 0.72x, 17 short | — |
| Stress | $77,019 | −4.4%, 0.87x | under water | — |

Reproduce either table: `node scripts/omega-core-partner-split.js` and
`… --electricity 0.10 --fixed 2500`; `--pref`, `--split`, `--opfee`,
`--yield`, `--rs1`, `--rs2`, `--lease` move the proposed figures.

**What the tables say.** Under the contracted base the skid pays Barry back
in two to three years with his pref covered, under any of the three
structures. The downside is where the structures part: a waterfall shares
the pain, a leaseback puts it on ClearSky, a revenue share puts most of it
on ClearSky and still pays Barry something. Which Barry wants depends on
whether he is buying an operating business (structure 1), a yield (2) or a
royalty (3); the pilot should be structure 1, because it is the only one
where both sides are paid to make the skid busy, and the portfolio tranche
(§5) can move to structure 2 once there is a revenue history to lease
against.

## 4. The levers that make the downside bankable

In order of how much they move the downside, from the model:

1. **A price floor in the offtake.** The downside is 60% of spot. A contract
   that fixes the $/GPU-hour, or a take-or-pay on a share of the hours, turns
   the realisation from a market risk into a counterparty risk. This is what
   the Sales desk is chasing (`docs/COMPUTE-OFFTAKE-SALES.md` §2a: Spheron
   lets the supplier set the floor; Compute Exchange sells forward
   reservations; Baseten and Vultr contract capacity).
2. **A utilisation floor.** A reservation of 60% of the hours makes the
   downside the base. One anchor tenant on each skid, the rest on the
   marketplaces, is the shape Xeal's Laitent sold (up to 5 MW to one
   inference provider).
3. **Power.** $0.15 to $0.10 a kWh moves the downside IRR from under zero to
   18.6%. The skid is on its own meter, so the tariff is the whole story:
   Topeka is the first test of it (§6).
4. **The fixed site cost.** The workbook's $5,000 a month is a container
   data centre's (site, insurance, admin). A skid on a leased pad with the
   host's security and no staff should carry less; ClearSky must say what
   is in the number before Barry sees it.
5. **The price decline.** The model takes 8% a year off the rate. A longer
   contract flattens it; a chipset choice (H200, B200, L40S, priced side by
   side in the model) changes the starting point.
6. **The residual.** 30% of cost at year five is the FMV band's base
   (20–40%); the host's buyout option is a floor on it the contract already
   carries.

## 5. How Barry deploys the assets in his portfolio

The skid is a transportable asset on a five-year site term, so a portfolio
of them is deployed in tranches against contracted revenue, and a skid can
move when a site underperforms or its term ends.

| Stage | Gate to pass | What Barry funds | Structure |
|---|---|---|---|
| **Pilot** | A site Qualified on evidence (Topeka, §6); an anchor offtake or a marketplace host agreement signed; the application doors in §2a of the sales doc applied for | 1 skid | 1 (waterfall) |
| **Proof** | 90 days of metered revenue and uptime from the pilot; the contracted-base case met or explained; one tier-A door accepted | nothing new | — |
| **Tranche 1** | Signed offtake covering the pref (or the lease payment) at ≥ 1.25x on the downside for each skid; each site Qualified | the skids the offtake covers | 1 or 2, Barry's choice; an SPV holding the skids with ClearSky under an operating agreement |
| **Tranche n** | The same test, plus a portfolio of tens of MW is what opens the intermediaries' doors (the sales doc §2c) | as the offtake grows | 2 at scale: a contractual yield is what a portfolio wants |

Two things that change Barry's arithmetic if his portfolio holds the
sites:

- **If Barry owns or controls the host sites**, the host lease is money
  from his left pocket to his right. The structure can zero it and raise
  his pref, or leave it and treat it as site income; either way the skid
  pays his site more than three parking stalls did, which is the whole
  Omega-Core thesis for a charging site.
- **If his portfolio is capital, not property**, the SPV is the asset: the
  skids, the site leases, the offtake contracts and the operating agreement
  with ClearSky, financeable as a package once there is a revenue history.

Tax (depreciation on computer equipment, any bonus treatment) is his
adviser's; the model carries no taxes and the pack must say so.

## 6. The Topeka pilot

<!-- TOPEKA: filled from the 2026-10-06 research when it lands -->

## 7. The page for Barry (what Tommy presents)

1. What it is: one skid, 48 GPUs, own meter, on a charging site, five years.
2. Who buys the compute: the doors (sales doc §2a), the anchor-tenant shape,
   what is signed so far.
3. The money: the four cases, structure 1, the two tables above, with the
   levers named.
4. What makes it bankable: §2's three tests and §4's levers, each with its
   evidence or its gap.
5. The site: Topeka's qualification (§6), the utility's answer, the fiber,
   the host.
6. The portfolio: §5's stages and gates.
7. What Tommy is asking for: the pilot skid, on structure 1, at the proposed
   split, with the gates written in.

Nothing on the page is a price to a customer; the compute rate is the
contract's and the host rent is the lease's.

## 8. Decisions only Tommy can make

1. **The split figures**: the op fee (10%), the pref (12%), the share after
   1x (50/50), the lease yield (12%), the revenue shares (35% then 15%).
   The script prints any set.
2. **Whether iQGen takes a share** of the split or is paid inside the skid
   price only, and whether Reshaud's offtake relationships carry a fee.
3. **What is in the $450,000**: ClearSky's margin, iQGen's set, the battery,
   commissioning; and what the fixed site cost really is (§4.4).
4. **The host rent** ClearSky will set (the market reference stands in).
5. **The Topeka site and the anchor offtake** to put in front of Barry.
6. **Whether Barry's own sites host**, which changes §5.

## 9. Not built, and what the model does not carry

- OEM quotes for the capex (the workbook's own note: replace the proxy
  before investment approval); the $450,000 is the recorded skid price.
- Taxes, GPU degradation beyond the price decline, a released reserve.
- A signed comp set for the FMV band; the utility's answer (hosting
  capacity is not public, the power gate asks for it).
- The offtake contracts themselves: this file structures the money; the
  Sales desk and Reshaud bring the counterparties.
