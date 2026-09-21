# Materials planning — what the competition does, and where we stand

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Researched 2026-09-21 from vendors' own pricing and feature pages and
current review sites; prices are list prices at that date. Re-check before
quoting any of them to a customer.

## Who we are measured against

Clean Cell will compare the materials plan to what a small battery-pack
assembler would otherwise buy: a cloud MRP. These are the ones that come up.

| Product | Who it is for | List price (2026) | Materials features that matter here |
|---|---|---|---|
| **Katana** | small manufacturers, D2C + wholesale | Core **$299/mo** (unlimited users, 1 location) + Manufacturing **$199/mo** + Traceability **$249/mo** → **~$747/mo** for the comparable set | multi-level BOM, reorder point + safety stock, MOQ-aware order suggestions with an order-by date, open supplier orders counted, batch/lot + expiry, shop-floor app, purchase orders |
| **MRPeasy** | small/mid manufacturers | **$49–$149 per user/mo**; PO automation and serials from Professional (**$69**), barcodes/MPS/API from Enterprise (**$99**) | multi-level and matrix BOM, MRP with purchase suggestions, multiple suppliers per item with lead times, lot traceability, reorder point, CRM, quality control |
| **Fishbowl Advanced Manufacturing** | QuickBooks shops moving up | from **$675/mo**, quoted by users | BOM with sub-assemblies, MRP and production scheduling, work orders, lot/batch traceability, job and labor costing; the cloud "Inventory" tiers ($229–$729) have **no** manufacturing at all |
| **Odoo Manufacturing** | anyone willing to configure | ~**$48/user/mo** (Manufacturing + Inventory + Purchase apps) | BOM with by-products and scrap, min/max reordering rules that raise an RFQ or a manufacturing order, MPS, lead times, lot/serial |
| **NetSuite** | mid-market and up | quote only (a separate module on an ERP) | full MRP: per-location lead time and safety stock, safety stock treated as demand, lot sizing, lead-time offset of planned POs, version-controlled BOMs |
| **Cetec ERP** | electronics / aerospace / medical assembly | **$50/user/mo**, 5-user minimum, shop-floor seats $25 | CRM → quote → MRP → shop floor → quality → accounting in one; deep BOM and recipe management |
| **Carbon** | engineering-first shops | cloud quote; **open-source AGPL** community edition | rule-based BOM with revisions and effectivity, MRP with finite capacity, multi-site, PO/receipt, serial and lot genealogy, NCR, scrap |
| **SAP Business One (battery vertical)** | battery / ESS OEMs at scale | quote, implementation partner | the reference for what a battery ERP is expected to hold: cells / modules / BMS / casing BOMs, WIP tracking by stage, yield / scrap / rework |

Sources: [Katana pricing](https://katanamrp.com/pricing/) ·
[Katana replenishment](https://support.katanamrp.com/en/articles/8937095-understanding-replenishment-and-order-suggestions) ·
[Katana batch tracking](https://katanamrp.com/features/inventory-management/batch-lot-tracking/) ·
[MRPeasy pricing](https://www.mrpeasy.com/pricing/) ·
[MRPeasy reorder point](https://www.mrpeasy.com/blog/what-is-reorder-point-and-reorder-point-formula/) ·
[Fishbowl pricing](https://www.fishbowlinventory.com/pricing) ·
[Odoo reordering rules](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html) ·
[Odoo MRP on SoftwareSuggest](https://www.softwaresuggest.com/odoo-mrp) ·
[NetSuite lead time and safety stock](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2286205.html) ·
[NetSuite MRP guide](https://www.brokenrubik.com/blog/netsuite-mrp-guide) ·
[Cetec vs Fulcrum](https://www.selecthub.com/manufacturing-software/cetec-vs-fulcrum-pro/) ·
[Carbon](https://carbon.ms/) ·
[SAP B1 for batteries](https://www.zyplesoft.com/sap-business-one-erp-for-batteries-and-energy-storage-equipment/) ·
[GE Vernova battery MES](https://www.gevernova.com/software/battery-manufacturing-solutions).

## Feature by feature

✔ have · ◐ partial · ✘ not built. "Us" is `api/_lib/materials.js` and
`api/logic-materials.js` at the head of `claude/white-label-cleancell-usa-st5trq`.

| Capability | Us | Katana | MRPeasy | Fishbowl Adv. | Odoo | NetSuite | Carbon |
|---|---|---|---|---|---|---|---|
| Multi-level BOM (cabinet → module → cell) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| BOM graph validated (no loops, no ghost SKUs) on save | ✔ | ◐ | ◐ | ◐ | ◐ | ✔ | ✔ |
| Sub-assembly is *made*, never on the purchase list | ✔ | ✔ | ✔ | ✔ | ✔ (Manufacture route) | ✔ | ✔ |
| Scrap / yield on a bill line | ✔ `yieldPct` | ✘ | ◐ | ◐ | ✔ | ✔ | ✔ |
| Low-level-code netting (shared part waits for every parent) | ✔ | ◐ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Stock consumed by firmest demand first, forecast reported separately | ✔ | ✘ (one demand pool) | ✘ | ✘ | ◐ (MPS) | ◐ | ◐ |
| Safety stock / reorder point | ✔ `safetyStock` (buffer bucket) | ✔ | ✔ | ✔ | ✔ min/max | ✔ per location | ✔ |
| MOQ rounding on suggestions | ✔ | ✔ | ✔ | ◐ | ✔ | ✔ (lot sizing) | ✔ |
| Order-by date = need-by − lead time | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Open supplier orders counted as supply | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Purchase orders with receiving, partial receipts | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Supplier lot on receipt → unit genealogy | ✔ | ✔ + expiry | ✔ | ✔ | ✔ | ✔ | ✔ |
| Time-phased buckets (week-by-week projection) | ✔ 12 weeks, dated PO supply | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Multiple stock locations / transfers | ✘ | ✔ (paid per location) | Enterprise | ✔ | ✔ | ✔ | ✔ |
| Supplier records, price lists, RFQ to supplier | ✘ | ◐ | ✔ | ◐ | ✔ | ✔ | ✔ |
| Component cost / landed cost / inventory valuation | ✘ (decision) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Finite-capacity scheduling | ✘ | ◐ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Feasibility check per works order, on its own | ✔ | ✘ | ◐ | ✘ | ◐ | ◐ | ✔ |
| Demand pulled from the customer's *own* storefront pipeline, classified by firmness | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Customer's milestone moves from the plant's scans | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| White-labelled to the manufacturer's brand and domain | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Deterministic agent that names late material and blocked works orders | ✔ | ◐ (alerts) | ◐ | ✘ | ◐ | ◐ | ◐ |
| Per-user pricing | none | none | **yes** | by deployment | **yes** | yes | quote |

## The honest read

**Where every competitor is ahead of us today**

1. ~~**Time-phased planning.**~~ Built the same day: `projection()` runs
   the plan once per week with only the demand due by then and only the
   supply arrived by then (purchase orders count from their expected date),
   so the week view cannot disagree with the purchase list. "Twelve weeks
   ahead" on the plan page, red from the week a shortfall first bites.
2. **Supplier records.** Ours is a name and a part number on the component.
   They keep suppliers as records with price lists and multiple sources per
   part. Cheap to add once costs are decided.
3. **Locations.** One shelf. Clean Cell has one plant, so this is not a
   launch blocker, but it is the first thing a second site asks for.
4. **Costs.** Every one of them prices the purchase list. We deliberately
   don't until the decision in `docs/cleancell-materials-handoff.md` §3.3
   is made about where a buy price may live.
5. **Capacity.** None of ours schedules benches. The routing and station
   model exists in `api/_lib/plant-flow.js`; finite scheduling is a
   separate product decision.

**Where we are ahead, and it is not close**

- **The demand is real, and it is theirs.** Every MRP above starts from a
  sales order somebody typed in, or a forecast somebody guessed. Ours starts
  from the customer sizing a battery on Clean Cell's own website, and knows
  the difference between a request, a priced quote and a paid works order.
  Nobody else's purchase list is this honest about how firm the number is.
- **The floor and the customer are one record.** A scan on bench 3 moves the
  customer's milestone on portal.cleancell.us. Katana has a shop-floor app;
  it does not have a customer.
- **Sub-assembly discipline and yield are in the engine, not the UI.** The
  plan will not tell you to buy modules and also buy their cells.
- **Feasibility per works order** is one call, with the other work
  deliberately excluded so the answer is about *this* order.
- **Pricing.** We charge a flat monthly white-label fee (see the pricing
  model) — no per-user seats. MRPeasy at $69–$149 a seat and Cetec at $50 a
  seat plus $25 per shop-floor tablet get expensive exactly as a plant grows.
  Katana's comparable set is ~$747/mo before a second location.

**What we should stop claiming**

- "Nobody has MRP for battery makers" — false; SAP B1 verticals and Carbon
  are aimed at exactly this. Our claim is narrower and true: nobody sells
  storefront → designer → works order → purchase list → customer milestone
  as one white-labelled product.

## Build order, from this comparison

1. ~~Time-phased weekly projection~~ — done.
2. Supplier record with per-part lead time and MOQ overrides.
3. A second location, when a second location exists.
4. Costs, after the decision.
