# The live demo

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Five product surfaces inside a browser frame, sharing one world. You click
it the way a customer, a sales desk, a technician and we would.

| Surface | Address it shows | Who |
|---|---|---|
| Public storefront | `cleancell.us` | anybody |
| Customer portal | `portal.cleancell.us` | the buyer |
| Design studio | `design.cleancell.us` | the buyer, on the Designer plan |
| Bench tablet | `plant.cleancell.us/bench/2` | the plant |
| ClearSky console | `console.clearskyomega.com` | us |

The address bar is part of the point: everything the customer touches is on
Clean Cell's own domains, and our name is nowhere on them.

## Brand

Two real brands, neither of them invented here.

**Clean Cell** (`cleancell.us`) — cyan `#3FAFC6` on white, near-black
`#0B2733` headlines, a coral `#EE5A4F` accent, the bolt out of their
wordmark, Poppins. Their hero splits a headline into a black line and a cyan
line over a pale cyan wash, with the bolt as a watermark; the site, the
portal, the studio and the bench tablet all wear it.

**ClearSky OMEGA** (`clearskyomega.com`) — a blueprint: warm paper with a
blue grid, `#1B57C9` for structure, an orange `#E4502A` call to action,
monospace sheet labels and a SHEET tag, Inter.

The sandbox bar and the browser frame around them are deliberately neutral
grey so they belong to neither.

    node scripts/sandbox/build.js     # -> scripts/sandbox/index.html
    node scripts/sandbox/drive.js     # clicks the whole thing in Chromium
    node scripts/sandbox/look.js      # screenshots for eyeballing

`index.html` is generated and deliberately not committed; `build.js` rebuilds
it in under a second.

## The walk

Size a system on the home page → see it drawn on your own lot → place the
request **with no account** → create the account afterwards and watch the
order you already placed get claimed by email → hit the locked design studio
→ subscribe → run the guided build, flip through the plot plan, single-line,
BOM, proposal and drawing set → order the BOM out of the drawing. Switch to
Rob at Clean Cell to accept it, record the deposit and release it to the
floor. Switch to Marco on the bench and scan — at the wrong station first, so
it refuses. Switch to us to price it, publish it, push a direct order to the
same floor, and run the leak test on what the buyer actually receives.

The **Show what is real** toggle in the sandbox bar puts one paragraph under
each screen saying which committed file decided what you just saw.

## Why it is trustworthy

`build.js` reads `api/_lib/plant.js` and `api/_lib/portal.js` **verbatim** out
of the repo and rewrites exactly one line in each — `module.exports` becomes a
`window.` global — and throws if that rewrite fails. Scan verdicts, the
furthest-behind milestone and the buyer projection are the functions
production calls. Change `portal.js` and the demo changes with it.

Simulated, and only this: Firestore (a `localStorage` object), auth (a sign-in
modal), payments (a button), and two screens — the storefront stands in for
`embed/storefront.html` and the studio for `editor.html`. Each of those two
says so under **Show what is real**.

## What `drive.js` asserts (52)

- ClearSky's name appears nowhere on Clean Cell's site
- the tightest-fit sizer, not the biggest box
- an order can be placed with no account, and signing up afterwards claims it
  by verified email
- the internal status vocabulary (`quoted`) never reaches the buyer
- priced is not published — repricing crosses nothing
- **another company's order never appears on this customer's account**
- the designer is gated, and compute is disabled rather than hidden
- a scan at the wrong station is refused (`out_of_sequence`)
- a scan at a station the test rig owns is refused (`machine_station`)
- a double-fire is a duplicate, not an error; a typed label scans identically
- **one held unit pulls the whole order back a milestone** — "In production"
  becomes "Confirmed", because the furthest-behind unit decides
- mark-complete appears only when every unit is at Ready to ship
- terms Clean Cell sets afterwards appear on the customer's portal
- the buyer's projection carries no cost basis, margin, ClearSky price,
  provenance, audit history or `placedBy`
- state survives a reload, no horizontal scroll at 390px across 18 pages,
  dark mode paints, no JS errors

## Known stand-in

The deposit is a button. In the product the Stripe milestone webhook that
raises the works order is designed (`docs/CUSTOMER-PORTAL.md`) and not
written, so the ClearSky console names it as the first thing to automate
rather than pretending it already fires.
