# Handoff — Clean Cell white label: components, bills of materials, materials plan

For: Astra (ChatGPT / Codex), to finalize.
From: the Claude session that built it. Branch `claude/white-label-cleancell-usa-st5trq`
on `clearskyenergy/omega-core`, three commits past merged PR #45 plus this
handoff and the follow-up that closed items 1, 4 and 5 of §3.
Everything below is committed and pushed; `npm test` is green at the head.

Read `CLAUDE.md` first. The rules in it that bite hardest here: no build step
and ES5 in the shared runtime; Firestore rules are the security boundary;
pricing/forecast logic lives in `/api/`, never in a browser; a tenant's cost
basis is never in the repo; `api/embed-config.js` builds the public response
key by key and must never be replaced with a spread.

---

## 1. What is on the branch (two commits)

### `5f96d8d` — three loose ends from PR #45

- **Customers rules applied.** `docs/firestore.rules.customers.addendum` is
  now inside the `omega_orgs` block of `firestore.rules` (customers/{id},
  customers/{id}/users, customer_index; the older customers/{id}/projects
  rule nests under it unchanged). `node scripts/check-rules.js firestore.rules`
  → 157 defined / 157 called. **Not deployed** — see §4.
- **`customer.notes` alias fixed.** `api/orders.js` create wrote
  `customer.notes || b.note`, so a rep's note landed in the field
  `orders.html` labels "Customer said:". Now `customer.notes` is the
  customer's words only and the rep's `note` is a history entry
  (`note: …`), the shape `action:'note'` already writes.
  `api/_lib/portal.js` keeps excluding the field from the buyer projection
  because rows created before the fix still carry the alias.
  Test: `scripts/test-orders-create.js`.
- **Release docs reconciled.** The deposit → works-order handler exists on
  main (`api/_lib/logic-workflow.js release()`, QuickBooks reconciliation,
  `api/logic-worker.js` on a 5-minute Vercel cron); every doc, comment and
  demo caption that said "designed and not built" now says what runs.
  `scripts/test-logic-workflow.js` gained a check that `release()`'s write
  shape is the two queries `api/my-orders.js` reads.

### `bee71ab` — components, BOM, materials plan (the new feature)

| Piece | File | What it does |
|---|---|---|
| Engine | `api/_lib/materials.js` | Pure. `bomLines()`, `validateCatalog()` (graph: missing SKU, service as material, self-ref, loop, >8 levels), `lowLevelCodes()`, `demandsFrom()`, `plan()`, `purchaseList()`. |
| Catalog lib | `api/_lib/logic-catalog.js` | Third `kind: 'component'`; sourcing fields `unit, supplier, supplierSku, moq`; `bom[]` on product/component; `designs()` drops components; `view()` includes bom + sourcing. |
| Catalog endpoint | `api/logic-catalog.js` | Runs `validateCatalog()` over the merged list on every save; refuses turning a referenced SKU into a service. |
| Plan endpoint | `api/logic-materials.js` | `GET ?org=` → plan from 4 reads (catalog, `fulfillment/materials`, newest 200 orders, newest 200 works orders). `POST action:'stock'` → dated, attributed, revision-checked, audited count into `omega_orgs/{org}/fulfillment/materials.stock[sku]`. |
| Pages | `logic-materials.html` (new), `logic-catalog.html` | Plan page: tiles, what-to-buy table, purchase-list CSV, what-to-build, Count form. Catalog page: Component type, sourcing fields, BOM row editor. |
| Nav | `omega-logic.html`, `plant/manager.html`, `api/logic-office.js` | "Materials plan" link; `links.materials`. |
| Leak guards | `api/embed-config.js`, `omega-bess-products.js`, `api/orders.js` | Public projection filters `kind!=='component'`; designer merge returns null for component/service; a component on an order line is a 400. |
| Importer | `scripts/import-products.js` | `kind` column (component rows need no kW/kWh), component columns, `--bom bom.csv` (`parentSku, componentSku, qty, unit`), graph validation, report lines. Header-only BOM sheet is allowed ("no bills yet"). |
| Templates | `docs/product-list-template.csv`, `docs/bom-template.csv` | Worked rows: cabinet → 8 modules → 104 cells. |
| Tests | `scripts/test-materials.js` (72), `scripts/test-import-products.js` (+17) | On the `npm test` chain. |
| Docs | `docs/OMEGA-LOGIC-STATIONS-CATALOG.md` § Components and bills of materials; `CLAUDE.md` white-label bullet | |

**The netting rule, because it is the whole point:** demand is classified
committed (works orders: `requirements − registeredCounts`), pipeline (orders
`accepted`/`quoted`, no works order yet), forecast (`new`/`confirmed`). SKUs
are processed in low-level-code order; each is netted against
`onHand + onOrder` — stock consumed by committed, then pipeline, then
forecast — and only the NET is exploded into children. Forecast never
produces a `suggestedOrder`. `orderBy = needBy − leadTimeDays`; `late` when
that is before today and there is firm net demand.

---

## 2. How to verify what is there

```
npm test                                   # whole suite, green at the head
node scripts/test-materials.js             # 91 assertions
node scripts/test-plant-agent.js           # 15, eight of them materials
node scripts/import-products.js --org cleancell.us \
  --file docs/product-list-template.csv --bom docs/bom-template.csv
#   → 2 orderable · 5 components · 2 with a bill of materials, 5 line(s)
node scripts/check-rules.js firestore.rules
```

Both pages were rendered in Chromium with `firebase` stubbed and the two
endpoints answered from fixtures (a plan computed by `M.plan()` over the test
catalog): no JS errors, no horizontal scroll at 390 px, the BOM editor
round-trips, the Count form opens on the right row. The render script was
scratch and is not committed; the approach is: serve the repo root over HTTP,
stub `/config.js`, `/omega-brand.js`, `/omega-tenant.js` to empty, route
`https://www.gstatic.com/**` to an empty body, `addInitScript` a `window.firebase`
with `auth().currentUser.getIdToken()` and `onAuthStateChanged`, and answer
`/api/logic-materials` and `/api/logic-catalog` with JSON.

---

## 3. What is deliberately NOT built — decide, then build

Each of these was a product decision I did not want to improvise. Items 1, 4
and 5 were then built with the obvious default (the owner asked for whatever
could be completed unattended), then 2 and 6 as well; only 3 (component
costs) still needs a decision first.

1. ~~**Scrap / yield.**~~ **Done** (commit after `3256e20`): `yieldPct` on a
   BOM line, applied in the explosion, `yielded` flag on rows, footnote on
   the page, `yieldPct` column on the BOM sheet, catalog-editor input.
2. ~~**Purchase orders and receiving.**~~ **Done**: `POST action:'po'` records
   `omega_orgs/{org}/purchase_orders/{id}` and adds to `onOrder` in one
   transaction; `'receive'` moves quantity to `onHand` and marks partial /
   received; `'cancel-po'` releases the rest. Revision-checked against the
   stock document, audited, Admin-SDK-only (named in `firestore.rules`).
   The page raises one pre-filled from the purchase list. `api/logic-logistics.js`
   turned out to be OUTBOUND only (customer delivery legs), so receiving is
   its own thing here. Still not built: any message to the supplier.
3. **Component costs → spend forecast.** A buy price on a component is exactly
   what `CLAUDE.md` forbids in the repo and the importer refuses in both
   sheets. If Clean Cell wants a dollar forecast, the number must live only in
   Firestore, set by hand or by a staff-only endpoint, and `api/embed-config.js`
   must still never name it. Do not add it to the CSV path.
4. ~~**Plant agent.**~~ **Done**: `advise({materials})` adds `order_material`
   (late component, priority 1) and `material_shortfall` (works order short
   of stock, priority 2); `api/jarvis-operations.js` computes the plan
   best-effort and passes it. `replyFor()` names late material.
5. ~~**Per-works-order feasibility.**~~ **Done**: `GET /api/logic-materials
   ?org=&workOrder=<id>` → `{feasible, short[]}`; `plant/manager.html`'s
   work-order detail shows a Materials section. Rows carry `worksOrders[]`
   (the committed works orders whose demand reaches them).
6. ~~**Demo.**~~ **Done**: `build.js` bundles `api/_lib/materials.js` as the
   third verbatim engine; `admin.cleancell.us/materials` in the sandbox shows
   the plan for the released works order (demo BOM: cabinet → 41 modules →
   104 cells at 98% yield, a seeded shelf), records a purchase order and
   receives it; three tour steps after "Money, then serials" (tour is now
   33). `drive.js` 52 → 60 assertions. Republish the artifact after any
   change: `node scripts/sandbox/build.js`, then publish `index.html` to
   https://claude.ai/artifact/T8JRXaeisQJMxskt4cbV3x.

---

## 4. Things only a person with credentials can do

- **Deploy the rules.** `firebase deploy --only firestore:rules` against
  project `clearsky-portal`. Until then `api/my-account.js` still works
  (Admin SDK), but nothing a browser does against `customers` is governed.
  After deploying, grep the LIVE rules for `customer_index` to confirm.
- **Clean Cell's real product list.** `tenants/cleancell/products.csv` is four
  PLACEHOLDER rows and there is no `tenants/cleancell/bom.csv`. Send them
  `docs/product-list-template.csv` and `docs/bom-template.csv`; when the
  sheets come back:
  `node scripts/import-products.js --org cleancell.us --file <products.csv> --bom <bom.csv> --out tenants/cleancell/products.json`
  (dry run; fix every PROBLEM line; then `--apply` with
  `FIREBASE_SERVICE_ACCOUNT` set). The `--out` JSON is what
  `scripts/preview-storefront.js` and `whitelabel-setup.html` read.
- **Smoke test on the real tenant** after deploy: sign in as a Clean Cell
  admin → `/logic-catalog.html?org=cleancell.us` → add one component and one
  BOM line → `/logic-materials.html?org=cleancell.us` shows a row → press
  Count → `omega_orgs/cleancell.us/fulfillment/materials` gains `stock[sku]`
  and `omega_audit` gains a `materials-stock` row.

---

## 5. Bounds to keep in mind

- `storefront/config.products` is one Firestore document: ≤ 200 rows
  (`api/logic-catalog.js`), ≤ 80 BOM lines per row (`materials.MAX_LINES`),
  ≤ 8 levels (`MAX_DEPTH`). That is well under 1 MB; do not lift the caps
  without checking the document size.
- The plan reads the newest 200 orders and 200 works orders (both indexes
  exist: `orders (orgId, createdAt desc)`, `plant_works_orders (orgId,
  createdAt desc)`). Past that it says `limited: true` and the page shows a
  note. If a tenant ever has more than 200 OPEN works orders, add a status
  filter and its composite index rather than raising the limit.
- Stock counts rewrite the whole `stock` map (a SKU may contain a dot, which
  Firestore would read as a path segment). The revision check on
  `fulfillment/materials.revision` is what stops two counters clobbering
  each other; keep it.
- SKU keys are validated against `__proto__`/`constructor`/`prototype` in
  three places on purpose (`materials.js`, `logic-materials.js`, the
  importer). Object.create(null) maps everywhere a SKU is a key.

---

## 6. Open decisions carried over from PR #45 (unchanged, still yours)

1. Whether flipping a customer's plan to `designer` provisions their own
   tenant or adds them to Clean Cell's workspace via `org_members`
   (`docs/CUSTOMER-PORTAL.md` §6).
2. Five manifest counters in `api/_lib/systems.js` reporting 0 until their
   counters/indexes exist.
3. `MERGE.md` §11 remaining editor branding: the "Omega Site Pro" export
   family and the CRM modal.
4. Whether the lite dashboard links `portals/finance/battery-sizer.html`.
5. Whether the demo's sample buyer contact ("Dana Ruiz") becomes a generic
   title.

Demo artifacts (already published, not served from the repo):
walkthrough with the 33-step tour https://claude.ai/artifact/T8JRXaeisQJMxskt4cbV3x ·
thirteen-step chain page https://claude.ai/artifact/E6NgSaH2ZW9ixU72Tz9q2P.
