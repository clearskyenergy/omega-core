# Omega Logic cleanup — coordination

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Cross-area handoffs and the shared order bar belong to the agent that
owns this file's layout and office path (`office-stage.path`, the desktop
order bar, the office app path). Plant and production notes below are the
plant agent's, so the two sides do not edit the same bar.

## Plant and production

`GET /api/logic-plant?workOrder=` now includes `source`, built by
`api/_lib/plant-source.js` from the order the works order points at:

- `poNumber`, `projectId`, `address`, `items` (sku, name, qty), `sites`
- read when the card opens, not copied onto the works order at release
- another tenant's order is skipped (`orgId` must match)
- prices, email and notes are not projected

The work-order card (`/plant/work-orders`) and the plant board's work-order
detail show that block. The order bar does not yet show plant progress.
Production on the bar is still "Building — follow the work order". A later
plant change may stamp `orders/{id}.plant` (stage, percent, holds) for the
office to read; that stamp is not this card, and it must not change the bar.
