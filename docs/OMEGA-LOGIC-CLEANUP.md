# Omega Logic cleanup — fold #357 into #350

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Thomas wants to see the quote / BOM → Logic order flow before it goes live.
**PR #357 stays open. Do not merge it.** PR #350
([bc-7fa39176](https://cursor.com/agents/bc-7fa39176-c69b-5492-b436-c193ac1503de),
branch `cursor/design-to-po-03de`) owns this handoff. The two PRs do the
same job through different doors and should be folded into one PR on #350.

Both take a Site Map BOM or an Omega Prime quote and open one OEM purchase
order for the same project, with the site address and the drawing's lines,
and a second send reopens that order. The OEM still approves the selling
price.

## Endpoints

| | #357 (`cursor/design-order-handoff-c3f0`) | #350 (`cursor/design-to-po-03de`) |
|---|---|---|
| Door | `POST /api/orders` with `action: 'design'` (`api/orders.js` `design()` / `fileDesign()`) | Existing `POST /api/rfq` (`api/rfq.js`). After the RFQ write, `placeSafe()` calls `api/_lib/design-place.js` `place()`, which drafts with `api/_lib/design-order.js` and writes `orders/{id}`. |
| Response | `{ ok, orderId, orderNo, status, duplicate, locked, orgId, logic }` where `logic` is `/omega-logic?org=&order=` | The RFQ body plus `orders[]` (`id`, `orgId`, `orgName`, `orderNo`, `sameWorkspace`, `lines`, and `href` only when the caller is that OEM) and `unmatched[]`. |
| Order id | New id, remembered on `projects/{id}.designOrderId` | `ds_` + sha256(`orgId:projectId`). One order per OEM per project. |
| Address | Read from the project (`address`, else the address object, else `mapState.address`, else `siteAddr`). A client address that disagrees is 409. | `b.address` else `project.address`, parsed into the delivery destination. |
| Lines | Name, qty, sku, unit, category, size, note, manufacturer. Catalog `listPrice` is stored null. Dollar amounts are stripped from notes. Component SKUs are 400. Lines without a sku are kept. | A published catalog sku becomes an order line in that OEM's workspace. Anything unpublished stays on `design.lines` and is named, and is not an order line. |
| Price | No `approvedQuote`, no `pricing`, no client dollars. | `design.estimateCents` from Prime's `prime.run.totalUsd`, else the project's `capex`, else the body's `estimateUsd`. It is an estimate, not an approved price. The office price box is filled from it. |
| Customer | Blank unless the caller supplies both a name and a valid email. | `buyer-accounts.ensure` makes the designer the customer on that OEM's order. |
| While still new | A resend replaces lines, site and customer and does not mail again. Once priced, in workflow, or holding `approvedQuote`, the resend returns the existing order and does not overwrite it. | A resend returns the existing order and does not rewrite its lines. |
| Org | `safeOrg(project.orgId)`. The body cannot name another org. | One order per OEM whose catalog matches a line. A line for another OEM opens in that OEM's workspace, and the page does not link into it. |

## Files both PRs edit

These five files are the merge conflict. Fold them on #350 and drop #357's copies.

- `api/logic-office.js` — #357 adds `site: { address, projectId }` on each order (from `o.site` or `sourceProjectId`). #350 requires `design-order.js` and adds `design: Dsgn.view(o)` and `shipTo: Dsgn.shipTo(o)` on the same projection.
- `editor.html` — two send buttons on the BOM (see Buttons).
- `omega-logic.html` — #357 falls the order heading and the list row back to the site address and prints `Site · address · project id`. #350 adds `designBlock()` (`#from-drawing`: project name, ship-to, Open the project, unmatched lines) and fills `#quoteTotal` from `design.estimateCents` (`#drawing-estimate`).
- `omega-prime.html` — two send buttons on the quote step (see Buttons).
- `scripts/render-prime-handoff.js` — #357 drives `#bom-to-logic` / `omegaSendBomToLogic` and asserts `POST /api/orders`. #350 only guards a null `document.body` while the staff directory click settles.

## Buttons

**Site Map BOM (`editor.html`)**

- #357 adds `#bom-to-logic`, label **Send to Omega Logic**, `onclick="omegaSendBomToLogic()"`. It saves the project, then `POST /api/orders` `{ action: 'design', projectId, items }` with no address and no prices, and opens `j.logic`.
- #350 keeps `openRfqFile()` / `submitRfqFile()` and relabels **File RFQ**, **Send RFQ** and the panel heading to **Send to the OEM**. The same `POST /api/rfq` now also sends `estimateUsd: window._COST_TOTAL`. A distributor is optional. The green note links a same-workspace order to `/omega-logic?org=&order=#orders`.

**Omega Prime quote (`omega-prime.html`)**

- #357 changes `#q-logic` (**Next: Omega Logic →**). It writes the project address, then `POST /api/orders` `{ action: 'design', projectId, address, items: quoteLines() }`, stores `S.logicOrderId`, and opens `/omega-logic?org=&order=`. `quoteLines()` sends the unit and cost-model division names with no dollars.
- #350 adds `#q-oem`, label **Send to the OEM**, `onclick` `sendToOem()`. It `POST /api/rfq` with `{ projectId, address, zip, toOrgIds: [], bom, estimateUsd }` (`estimateUsd` is `S.run.total.base`). `#q-logic` stays the step that only shows the Logic screen. `#qOemMsg` links a same-workspace order.

## Files only one PR touches

**#357 only** — `api/orders.js`, `docs/GUIDED-SITE-FLOW.md`, `docs/OMEGA-LOGIC-MANUAL.md`, `scripts/render-omega-prime.js`, `scripts/test-orders-create.js`, `scripts/tests/teditorfeatures.js`, `scripts/tests/tomegaprime.js`.

**#350 only** — `api/_lib/design-order.js`, `api/_lib/design-place.js`, `api/rfq.js`, `scripts/tests/tdesignorder.js`, `scripts/tests/rfq.js`, `scripts/tests/trfq.js`, `package.json`, `docs/design-order/*.jpg`, and the guide PDFs / shots (`guides/Omega-Logic-*.pdf`, `scripts/guides/`).

## What the fold has to decide

The price. #357 refuses every client dollar and leaves the price box empty. #350 fills that box from the drawing's estimate and still requires the OEM to approve it. #350 is the door that stays: `POST /api/rfq` → `design-place.place`. #357's `POST /api/orders` `action: 'design'` does not ship beside it.
