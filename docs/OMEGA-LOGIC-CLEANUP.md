# Omega Logic cleanup — coordination

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Cross-area handoffs and the shared order bar belong to the agent that
owns this file's layout and office path (`office-stage.path`, the desktop
order bar, the office app path). Plant and production notes below are the
plant agent's, so the two sides do not edit the same bar.

## Design rules

Applied on the work-order board from the review of that screen:

- One navigation, the office menu. A second filter column does not sit beside it.
- One filter on the board: Late, On hold, In progress, Ready to ship. The operation breakdown and the other filters sit behind More filters.
- One primary action, Register serials. Print, Export, and Refresh sit in an overflow menu.
- The card leads with the journey: which customer and project, what is being built, where it ships, how far along it is, and what is blocking it. Operation steps stay on the card, collapsed.
- Plain labels. A project id is not the name of the job, and it is not shown on the face of the card.
- Nothing floats over the card. This page does not draw a figure, and a floating image that overlaps the drawer is hidden.

## Plant and production

`GET /api/logic-plant?workOrder=` now includes `source`, built by
`api/_lib/plant-source.js` from the order the works order points at:

- `poNumber`, `projectId`, `projectName`, `customerName`, `address`, `items` (sku, name, qty), `sites`
- the customer is the company, or the person's name when there is no company
- an email is never the customer name
- read when the card opens, not copied onto the works order at release
- another tenant's order is skipped (`orgId` must match)
- prices, email and notes are not projected

The work-order card (`/plant/work-orders`) leads with that block in plain
words. The plant board's work-order detail shows the same names. The order
bar does not yet show plant progress. Production on the bar is still
"Building — follow the work order". A later plant change may stamp
`orders/{id}.plant` (stage, percent, holds) for the office to read; that
stamp is not this card, and it must not change the bar.

# Omega Logic cleanup — shared log

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Coordination notes for the Logic cleanup. The cross-area handoffs and the
shared order bar (the path on an order, the office home, the phone order
guide) stay with that work. This file is the place to say what a change
touched so the two do not edit the same screen.

## Shipping, delivery, on site

- Shipping & receiving ledger (`logic-logistics.html`, `api/logic-logistics.js`
  GET): one office nav, and one next step for the order. The bar is
  `office-stage` `path()`, drawn with `OmegaLogicTheme.pathBar`, in the
  page flow. The destination cards keep the full site address, the
  deliver-by date, and the order's lines. The project id, shipment
  reference, and serials are under a disclosure. The freight plan stays
  on the page and opens from `#freight`. The customer projection
  (`buyerOrder`) does not gain the project id or the path.
- Not touched: the shared order bar, `omega-logic.html`, `office/app.html`,
  `editor-v2`, `omega-prime.html`.
