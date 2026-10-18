# OMEGA journey verification

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Review build — 17 October 2026

`codex/omega-journey-review` combines the existing work from #350, #355,
#353 and #352 without changing those branches or merging to production.
#357 remains excluded. Editor v2 and the hex home are unchanged.

Integration fixes:

- Shipping reads the `projectId` written by the design handoff, while
  retaining the older `sourceProjectId` fallback.
- Plant reads the saved design's project name. A project name is labeled
  Project when the order has no customer; it is not presented as a customer.
- Plant and Accounting use `office-stage.path()` and the shared path bar.
- The four order views share links to the same order, work order, shipment
  and invoices. Accounting's order link scopes both rows and totals and
  can retrieve an older order outside the latest 500.
- A zero or invalid BOM quantity is refused instead of becoming one unit.
- Existing source and guide conflicts are reconciled; guides are regenerated
  from the combined screens.

## Automated checks

`node scripts/tests/tdesignorder.js` exercises the RFQ handler with an
in-memory Firestore double. It checks saved-address disagreement, no
invented customer, estimate-only creation, zero quantities, repeated sends,
own-OEM orders, external-OEM routing, and equivalent solar/battery shapes.

`node scripts/test-logic-workflow.js` includes one continuous example:
design placement → OEM price approval → deposit invoice and receipt →
stock allocation → final invoice and receipt → shipment plan → pickup →
delivery → accepted receiving. It checks the project, address and lines
in Plant, Shipping and Accounting, refuses unrelated tenants and foreign
order links, and verifies a resend cannot alter the accepted order.
A finished stock unit is seeded; bench quality and scan gates have separate
plant tests. Payments are recorded example receipts, not bank transactions.

`npm run check:journey` runs Chromium against actual local API handlers,
with authentication, Firestore and accounting-provider doubles. It starts
with a design order and a recorded deposit, follows links through four
pages, checks the project destination and quantities, verifies the shared
bar, checks 390px layouts, and requires HTTP 403 from all four APIs for an
unrelated tenant. It is also in `npm run check:pages`.

Measured navigation clicks:

| Link | Clicks |
| --- | ---: |
| Order → work order | 1 |
| Work order → order | 1 |
| Order → shipping | 1 |
| Shipping → invoices | 1 |
| Invoices → order | 1 |

These are navigation counts, not counts for entering a PO or recording
payments. The browser does not automate drawing equipment in the map,
Firebase sign-in, external QuickBooks, carrier booking or bank clearance.
No production customer data or credentials are used.

## Screenshots

The before images use the production branch's page sources. Both sets use
the same synthetic example and local API handlers, not production data.

| Screen | Before | After |
| --- | --- | --- |
| Order | [before](journey-review/before/order.png) | [after](journey-review/after/order.png) |
| Plant | [before](journey-review/before/plant.png) | [after](journey-review/after/plant.png) |
| Shipping | [before](journey-review/before/shipping.png) | [after](journey-review/after/shipping.png) |
| Accounting | [before](journey-review/before/accounting.png) | [after](journey-review/after/accounting.png) |

## Remaining roadmap

This review covers the immediate handoff and integration work. It does not
claim to implement delivery scheduling, commissioning approval, progress
billing, OEM payables, project margin, non-battery Prime sizing/cost models,
or the complete Settings → Features registry. The existing APIs themselves
still describe shipping as a manual evidence ledger. Receiving evidence is
not commissioning approval. Cross-org project access remains subject to
existing rules; an OEM order does not grant access to its designer's project.

Before production: review the combined preview and screenshots, then approve
the merge. Run the required GitHub checks on the exact proposed commit.
