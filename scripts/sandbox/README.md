# The walkthrough

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Three guided stories over one world, built to be presented:

**A · The customer buys.** A visitor on `cleancell.us` sizes a system, sees it
drawn on their own lot, creates their own account, orders, hits the locked
designer, subscribes, designs a site, and orders the BOM out of the drawing.

**B · Clean Cell builds it.** The works queue takes an order — from their own
storefront or sent over by ClearSky — raises the works order, allocates
serials, and walks them across ten benches: a refused scan, a QA hold, the
hold cleared, and a human marking it complete.

**C · ClearSky sells direct.** A client order taken at the console, priced,
published, deposited, pushed to Clean Cell's floor, fulfilled, shipped,
invoiced and closed — ending with the estate and the leak test.

    node scripts/sandbox/build.js     # -> scripts/sandbox/index.html
    node scripts/sandbox/drive.js     # drives all three stories in Chromium
    node scripts/sandbox/look.js      # screenshots for eyeballing

`index.html` is generated and deliberately not committed; `build.js` rebuilds
it in under a second.

## Why it is trustworthy

`build.js` reads `api/_lib/plant.js` and `api/_lib/portal.js` **verbatim** out
of the repo and rewrites exactly one line in each — `module.exports` becomes a
`window.` global. No logic is copied, re-implemented or adjusted, and the
build throws if that rewrite fails. So the scan verdicts, the furthest-behind
milestone and the buyer projection are the ones production computes. Change
`portal.js` and the walkthrough changes with it.

What is simulated, and only this: Firestore (a `localStorage` object), auth (a
sign-up form), Stripe (a button), and the two screens that stand in for
`embed/storefront.html` and `editor.html`. Every decision in between is real
code, and each step's panel says which of the two it is.

## What `drive.js` asserts

- the tightest-fit sizer, not the biggest box
- a customer creates their own account; terms are an overlay applied after
- **another company's order never appears on this customer's account**
- priced is not published — repricing crosses nothing
- a scan out of sequence is refused (`out_of_sequence`)
- a scan at a station the test rig owns is refused (`machine_station`)
- a unit on hold does not move the customer's milestone
- mark-complete unlocks only when every unit is at Ready to ship
- the buyer's projection carries no cost basis, margin, ClearSky price,
  provenance, audit history or `placedBy`
- state survives a reload, no horizontal scroll at 390px, dark mode paints,
  no JS errors

## Known stand-ins

The deposit is a button. In the product the Stripe milestone webhook that
raises the works order is designed (`docs/CUSTOMER-PORTAL.md`) and not
written, so story C names it as the first thing to automate rather than
pretending it already fires.
