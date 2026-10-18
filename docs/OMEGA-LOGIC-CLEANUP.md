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
