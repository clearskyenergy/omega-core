# Omega Logic cleanup — shared log

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Coordination notes for the Logic cleanup. The cross-area handoffs and the
shared order bar (the path on an order, the office home, the phone order
guide) stay with that work. This file is the place to say what a change
touched so the two do not edit the same screen.

## Shipping, delivery, on site

- Shipping & receiving ledger (`logic-logistics.html`, `api/logic-logistics.js`
  GET): the destination cards show the full site address and the order's
  lines (quantity, product name, SKU). A project id is shown when the order
  carries `sourceProjectId`. Each load shows its destination, pickup and
  delivery dates, and the receiving condition. The customer projection
  (`buyerOrder`) does not gain the project id.
- Not touched: the shared order bar, `omega-logic.html`, `office/app.html`,
  `editor-v2`, `omega-prime.html`.
