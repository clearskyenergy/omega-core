# Eversource — now booked exactly as your Bridgeport submission does

## Sales tax

Your v4.0 sheet carries **one** tax line, in the Ineligible section, reading
material $316.87 and labor $158.75. Those divide out precisely at 6.35%:

| | |
|---|---|
| $316.87 ÷ 6.35% | **$4,990** — EVSE Hardware #1 |
| $158.75 ÷ 6.35% | **$2,500** — EVSE Installation (2 × $1,250) |

The $1,250 pedestal was **not** taxed, and nothing in make-ready, utility-side
or future-proofing was taxed either. That's coherent under CT rules: the
charger is tangible personal property and taxable; a pedestal bolted down is a
capital improvement to real property.

The tool now does exactly that — hardware taxes into the material column,
installation into the labor column, one line, ineligible. Exported and
verified at **$316.87 / $158.75, row 50**.

United Illuminating is untouched: a tax row inside every block, on that
block's own material and labor. Their four 50 Fitch sheets still reconcile to
the penny.

## Template version

The row map was built against Eversource **Version 3.0**, which puts Sales Tax
*inside* the EVSE block. Your submissions are **Version 4.0**, which moved it
down to Ineligible at row 50 and gave the freed EVSE slot to Networking. The
map now follows 4.0.

## Two eligibility corrections

Found while implementing the tax, and both were live discrepancies:

- **Activation Fee** was sitting in an *eligible* block on the Eversource form
  while mapping to the ineligible sheet section. A row's block decides which
  total it lands in, so the eligible total was overstated by the activation
  fee. Moved to Ineligible — matching Bridgeport, which books it below the
  line. United Illuminating is the opposite: their sheets carry Activation at
  $395 *inside* the eligible EVSE block, and that stays.
- **Networking** was the reverse — in the ineligible block but mapping to the
  eligible section. The Springfield ESMA sheet totals networking on its own
  eligible line, so it moved to eligible for Eversource. UI keeps it
  non-eligible.

The eligibility warnings are now form-aware: the same line flags on one
programme and not the other, because the programmes genuinely differ. Nagging
a rep to move a line the utility wants where it is would train them to ignore
the warnings.

## Eversource MA (2026-09-28)

Two things a customer found on the day they filed the March 2026 template:

- **The totals read `#ERROR!` outside Excel.** Eversource's sheet writes its
  arithmetic against its Excel table (`SimpleInvoice[[#This Row],[Material
  Total]]+…`). Excel reads that; Google Sheets shows `#ERROR!` in every total,
  and Numbers, Quick Look and a mail preview showed nothing because the
  export stripped the cached results and left the recalculation to Excel.
  The export now writes the SAME arithmetic as plain references (`G13+H13`,
  `E13*F13`; the `SUM`s were plain already) with the result cached in each
  cell, drops the table's column formula (the cells carry their own), and
  still asks Excel to recompute on open. `scripts/tests/tesma.js` runs the
  converter over every formula the shipped template carries and pins the
  totals of a ten-port job, so a new template revision with a shape it
  cannot name fails there, not on a reviewer's screen.
- **Design & engineering is a flat $2,000 on Eversource MA**, not $1,000 a
  port ("for CT Eversource we were charging 2k flat rate not dependant on
  plugs"; ten ports had put $10,000 on the sheet). `designFlat` on the form
  is the rule, `designRate()` reads it, Rate settings › *Design & engineering
  — flat per site* changes the amount, and a typed-over figure is pinned as
  permitting's is. Every other form keeps the per-port rate the four
  reference jobs fit; permitting stays 3% of everything else.

## Still worth one manual check

I derived all of this from your submitted sheets, not from Eversource's
written instructions. Two judgement calls to confirm on the next real job:

- Whether **freight** and **shipping** should join the tax base. Bridgeport has
  those rows blank, so the sheet couldn't tell me either way.
- Whether **networking is eligible in CT** as it is in the Massachusetts ESMA
  programme. I inferred it from the ESMA sheet's separate networking total; the
  CT form may treat it differently.
