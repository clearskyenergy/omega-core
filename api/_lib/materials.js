/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/materials.js — bills of materials, and the materials plan
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A product in omega_orgs/{org}/storefront/config.products is what the
   tenant SELLS. This module is about what it is MADE OF, so the plant can
   see what to buy before the floor runs out of it.

   ── ONE LIST, ONE MORE KIND ──────────────────────────────────────────────
   Components are catalog rows with `kind: 'component'`. They live in the
   same list as the products because a cabinet's bill of materials names
   modules, a module's names cells, and two lists that reference each other
   by SKU drift apart the first time somebody renames one. The public
   projection (api/embed-config.js), the designer merge
   (omega-bess-products.js) and the BESS picker (logic-catalog.js designs())
   each drop the kind on sight, so a component is never orderable, drawn or
   priced by anyone outside the tenant's own office.

   Any product or component may carry `bom: [{ sku, qty, unit }]` — the
   quantity of each component that goes into ONE of it. Multi-level is the
   normal case (cabinet → module → cell); validateCatalog() refuses a loop, a
   reference to a SKU that is not in the list, a service used as a material,
   and more than MAX_DEPTH levels, because every one of those turns a
   forecast into a hang or a lie.

   ── THE PLAN IS AN MRP EXPLOSION, NETTED LEVEL BY LEVEL ─────────────────
   plan() takes the demand that exists today — works orders still to be
   built, priced orders waiting on a deposit, and unpriced requests — and
   walks it down the bills of materials in low-level-code order (a SKU is
   processed only after every assembly that uses it), netting each SKU
   against what is on hand and on order BEFORE exploding the remainder into
   its children. That order matters: forty modules on the shelf mean forty
   modules' worth of cells that must NOT be bought, and a naive explosion
   buys them anyway.

   Stock is consumed by the firmest demand first — committed, then pipeline,
   then forecast — so the shortfall a buyer acts on is the one that already
   has money or a works order behind it, and the forecast is reported
   separately as "what you would also need if all of that converted".

   ── SUPPLIERS AND PRICES ─────────────────────────────────────────────────
   `input.sourcing` is omega_orgs/{org}/fulfillment/suppliers: supplier
   records, and per SKU a list of prices — one per supplier, each with its
   own unit cost, MOQ and lead time, one marked preferred. The plan takes
   the preferred price (else the cheapest) and lets it override the
   component's own MOQ and lead time, names the supplier on the row, and
   prices the suggested order (`spend`). A buy price is exactly the number a
   supplier's spreadsheet leaks, so it lives ONLY in that Firestore document
   — never in the catalog, never in a CSV (the importer refuses the column),
   never in any public projection (api/embed-config.js names its keys). This
   module reads it; it never writes it anywhere else.

   ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
   No supplier ordering: the output is a list a person sends to a supplier,
   with the order-by date computed from the lead time they entered.

   SAFETY STOCK. A component may carry `safetyStock`: the quantity the plant
   wants on the shelf at all times. It is netted as a fourth bucket, `buffer`,
   after committed and pipeline demand and before forecast — so the shelf
   covers real orders first, and what is left below the buffer is a firm
   purchase with the driver `safety`. A row below its buffer with no demand
   at all still appears, marked `belowSafety`, which is what a reorder point
   does in Katana or MRPeasy; NetSuite treats safety stock as demand the same
   way. The buffer explodes into children like any firm demand — a buffer of
   ten modules is ten modules' worth of cells.

   YIELD. A bill line may carry `yieldPct` (1–100, default 100): the share of
   what is issued that ends up in a good assembly. Cells that fail incoming
   test, paste that is wasted, harness cut to length — the plan divides the
   net demand by it (98% yield on 104 cells means 106.12 issued), and every
   row fed by such a line is marked `yielded` so the page can say the number
   is not the datasheet's. Default 100 keeps an unmarked bill exact.

   Pure: no Firestore, no clock unless one is passed in. api/logic-materials.js
   loads the inputs and writes the stock counts; this decides nothing about
   who may see them.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var MAX_LINES = 80;      /* bom lines per assembly */
var MAX_DEPTH = 8;       /* cabinet → rack → module → cell is four */
var MAX_DRIVERS = 24;    /* per row, so a page stays a page */
var BUCKETS = ['committed', 'pipeline', 'buffer', 'forecast'];
var SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var UNITS = ['ea', 'set', 'kg', 'g', 'm', 'mm', 'ft', 'L', 'mL', 'roll', 'box'];
var DAY = 86400000;

function fail(status, message) { var e = new Error(message); e.status = status; throw e; }
function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 120); }
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function isPlain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function safeKey(k) { return ['__proto__', 'constructor', 'prototype'].indexOf(k) < 0; }

/* ── one line of a bill of materials ───────────────────────────────────── */
function unitOf(v) {
  var u = clean(v, 8) || 'ea';
  if (UNITS.indexOf(u) < 0) fail(400, 'Unit must be one of ' + UNITS.join(', '));
  return u;
}
function qtyOf(v, what) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0 || n > 1000000) fail(400, (what || 'Quantity') + ' must be greater than zero and at most 1,000,000');
  return Math.round(n * 10000) / 10000;   /* 0.0001 — a gram of paste, a metre of harness */
}
function yieldOf(v, sku) {
  if (v == null || v === '') return 100;
  var n = Number(v);
  if (!isFinite(n) || n <= 0 || n > 100) fail(400, 'Yield for ' + sku + ' must be a percentage between 1 and 100');
  return Math.round(n * 100) / 100;
}
function line(raw) {
  if (!isPlain(raw)) fail(400, 'Each bill-of-materials line needs a component SKU and a quantity');
  var sku = clean(raw.sku, 64);
  if (!SKU.test(sku) || !safeKey(sku)) fail(400, 'Bill of materials: invalid component SKU "' + sku + '"');
  return { sku: sku, qty: qtyOf(raw.qty, 'Quantity of ' + sku), unit: unitOf(raw.unit), yieldPct: yieldOf(raw.yieldPct, sku) };
}
function bomLines(raw) {
  if (raw == null || raw === '') return [];
  if (!Array.isArray(raw)) fail(400, 'Bill of materials must be a list of lines');
  if (raw.length > MAX_LINES) fail(400, 'A bill of materials lists at most ' + MAX_LINES + ' components');
  var seen = Object.create(null), out = [];
  raw.forEach(function (r) {
    var l = line(r);
    if (seen[l.sku]) fail(400, 'Bill of materials lists ' + l.sku + ' twice — combine the quantities');
    seen[l.sku] = true; out.push(l);
  });
  return out;
}

/* ── the whole list, checked as a graph ────────────────────────────────── */
function index(products) {
  var by = Object.create(null);
  (products || []).forEach(function (p) { if (p && p.sku && safeKey(String(p.sku))) by[p.sku] = p; });
  return by;
}
function validateCatalog(products) {
  var by = index(products), state = Object.create(null), depth = Object.create(null);
  Object.keys(by).forEach(function (sku) {
    var p = by[sku];
    (p.bom || []).forEach(function (l) {
      var c = by[l.sku];
      if (!c) fail(400, sku + ' lists ' + l.sku + ' in its bill of materials, and there is no such SKU in the catalog');
      if (c.kind === 'service') fail(400, sku + ' lists ' + l.sku + ' as a material, but it is a service');
      if (l.sku === sku) fail(400, sku + ' cannot be a component of itself');
    });
  });
  function visit(sku, path) {
    if (state[sku] === 'visiting') fail(400, 'Bill of materials loops: ' + path.concat(sku).join(' → '));
    if (state[sku] === 'done') return depth[sku];
    state[sku] = 'visiting';
    var d = 0;
    (by[sku].bom || []).forEach(function (l) { d = Math.max(d, 1 + visit(l.sku, path.concat(sku))); });
    if (d > MAX_DEPTH) fail(400, sku + ' nests more than ' + MAX_DEPTH + ' levels of components');
    state[sku] = 'done'; depth[sku] = d;
    return d;
  }
  Object.keys(by).forEach(function (sku) { visit(sku, []); });
  return by;
}

/* Low-level code: the deepest level at which a SKU appears under ANY
   assembly. Processing in ascending order guarantees every parent has been
   netted and exploded before the child is looked at. */
function lowLevelCodes(by) {
  var llc = Object.create(null), parents = Object.create(null);
  Object.keys(by).forEach(function (sku) { llc[sku] = 0; });
  Object.keys(by).forEach(function (sku) {
    (by[sku].bom || []).forEach(function (l) { parents[l.sku] = (parents[l.sku] || 0) + 1; });
  });
  function push(sku, level) {
    if (level > MAX_DEPTH) fail(400, 'Bill of materials is deeper than ' + MAX_DEPTH + ' levels');
    if (llc[sku] >= level && level !== 0) return;
    llc[sku] = Math.max(llc[sku], level);
    (by[sku].bom || []).forEach(function (l) { push(l.sku, llc[sku] + 1); });
  }
  Object.keys(by).forEach(function (sku) { if (!parents[sku]) push(sku, 0); });
  return llc;
}

/* ── demand, classified by how firm it is ──────────────────────────────── */
function dateOf(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') v = v.toDate();
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function earlier(a, b) { if (!a) return b; if (!b) return a; return a < b ? a : b; }

/* Works orders are committed: somebody paid, or the plant chose to build
   stock. Priced orders waiting on the deposit are pipeline. Unpriced
   requests are forecast. An order that already has a works order is NOT
   counted again from its items — the works order is the truth of what is
   still to build, because registeredCounts tracks what the floor has
   already started. */
var DONE_WO = { complete: true, shipped: true, cancelled: true };
var DONE_ORDER = { cancelled: true, shipped: true, complete: true, in_fulfilment: true };
var PIPELINE = { accepted: true, quoted: true };
function demandsFrom(input) {
  input = input || {};
  var out = [];
  (input.works || []).forEach(function (w) {
    if (!w || DONE_WO[w.status] || w.shippedAt) return;
    var counts = w.registeredCounts || {}, need = dateOf(w.dueDate) || dateOf(w.promisedShipAt);
    (w.requirements || []).forEach(function (r) {
      var sku = clean(r && r.sku, 64), left = Math.max(0, num(r && r.qty) - num(counts[sku]));
      if (SKU.test(sku) && left > 0) out.push({ sku: sku, qty: left, bucket: 'committed', ref: clean(w.orderNo || w.id, 60), needBy: need });
    });
  });
  (input.orders || []).forEach(function (o) {
    if (!o || o.worksOrderId || o.cancelRequested || DONE_ORDER[o.status]) return;
    var bucket = PIPELINE[o.status] ? 'pipeline' : 'forecast';
    var need = dateOf(o.promisedShipAt) || dateOf(o.requestedDeliveryAt) || dateOf(o.needBy);
    (o.items || []).forEach(function (it) {
      if (!it || it.kind === 'service') return;
      var sku = clean(it.sku, 64), qty = num(it.qty);
      if (SKU.test(sku) && qty > 0) out.push({ sku: sku, qty: qty, bucket: bucket, ref: clean(o.orderNo || o.id, 60), needBy: need });
    });
  });
  return out;
}

/* ── the plan ──────────────────────────────────────────────────────────── */
/* The price the plan buys at: the one marked preferred, else the cheapest
   with a cost, else the first. Null when nothing is on file. */
function priceFor(sku, sourcing) {
  if (!isPlain(sourcing) || !isPlain(sourcing.prices) || !safeKey(sku)) return null;
  var list = Array.isArray(sourcing.prices[sku]) ? sourcing.prices[sku].filter(isPlain) : [];
  if (!list.length) return null;
  var pick = list.filter(function (x) { return x.preferred === true; })[0];
  if (!pick) { var priced = list.filter(function (x) { return num(x.unitCost) > 0; }).sort(function (a, b) { return num(a.unitCost) - num(b.unitCost); }); pick = priced[0] || list[0]; }
  var sup = isPlain(sourcing.suppliers) && safeKey(String(pick.supplierId || '')) ? sourcing.suppliers[pick.supplierId] : null;
  return { supplierId: clean(pick.supplierId, 60) || null, supplier: sup ? (clean(sup.name, 160) || null) : null,
    unitCost: num(pick.unitCost) > 0 ? roundQty(num(pick.unitCost)) : null, currency: clean(pick.currency, 3) || 'USD',
    moq: num(pick.moq) > 0 ? num(pick.moq) : null,
    leadTimeDays: num(pick.leadTimeDays) > 0 ? Math.round(num(pick.leadTimeDays)) : (sup && num(sup.leadTimeDays) > 0 ? Math.round(num(sup.leadTimeDays)) : null),
    supplierSku: clean(pick.supplierSku, 80) || null };
}
function emptyRow(p, sourcing) {
  var pr = p.kind === 'component' ? priceFor(p.sku, sourcing) : null;
  return { sku: p.sku, name: clean(p.name, 120) || p.sku, kind: p.kind === 'component' ? 'component' : (p.kind === 'service' ? 'service' : 'product'),
    unit: p.kind === 'component' ? (clean(p.unit, 8) || 'ea') : 'ea',
    supplier: (pr && pr.supplier) || clean(p.supplier, 160) || null, supplierId: pr ? pr.supplierId : null,
    supplierSku: (pr && pr.supplierSku) || clean(p.supplierSku, 80) || null,
    unitCost: pr ? pr.unitCost : null, currency: pr ? pr.currency : 'USD', spend: 0,
    moq: (pr && pr.moq) || (num(p.moq) > 0 ? num(p.moq) : null),
    leadTimeDays: (pr && pr.leadTimeDays) || (num(p.leadTimeDays) > 0 ? Math.round(num(p.leadTimeDays)) : null),
    safetyStock: num(p.safetyStock) > 0 ? roundQty(num(p.safetyStock)) : 0, belowSafety: false,
    gross: { committed: 0, pipeline: 0, buffer: 0, forecast: 0, total: 0 },
    onHand: 0, onOrder: 0, net: { committed: 0, pipeline: 0, buffer: 0, forecast: 0, total: 0 },
    /* A row with its own bill is a sub-assembly: the plant MAKES it, so its
       "suggested order" is units to build and it never appears on a purchase
       list — its children do. Only a leaf component is bought. */
    make: !!(p.bom && p.bom.length),
    suggestedOrder: 0, needBy: null, orderBy: null, late: false, drivers: [], worksOrders: [], yielded: false };
}
function roundQty(n) { return Math.round(n * 10000) / 10000; }
function addDays(day, n) { var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function plan(input) {
  input = input || {};
  var products = (input.products || []).filter(function (p) { return p && p.sku && p.active !== false; });
  var by = validateCatalog(products), llc = lowLevelCodes(by);
  var stock = isPlain(input.stock) ? input.stock : {};
  var today = dateOf(input.now) || new Date().toISOString().slice(0, 10);
  var rows = Object.create(null), unknown = [];
  function driver(row, d) { if (row.drivers.length < MAX_DRIVERS) row.drivers.push(d); }
  var sourcing = isPlain(input.sourcing) ? input.sourcing : null;
  Object.keys(by).forEach(function (sku) {
    var r = emptyRow(by[sku], sourcing), s = safeKey(sku) && isPlain(stock[sku]) ? stock[sku] : {};
    r.onHand = Math.max(0, num(s.onHand)); r.onOrder = Math.max(0, num(s.onOrder));
    if (r.safetyStock > 0) { r.gross.buffer = r.safetyStock; driver(r, { kind: 'safety', ref: 'safety stock', qty: r.safetyStock, needBy: null }); }
    rows[sku] = r;
  });

  /* Top-level demand: what people ordered. */
  (input.demands || demandsFrom(input)).forEach(function (d) {
    var row = rows[d.sku];
    if (!row) { if (unknown.indexOf(d.sku) < 0) unknown.push(d.sku); return; }
    if (BUCKETS.indexOf(d.bucket) < 0) return;
    row.gross[d.bucket] += d.qty;
    row.needBy = earlier(row.needBy, d.needBy);
    driver(row, { kind: d.bucket, ref: d.ref, qty: d.qty, needBy: d.needBy || null });
    if (d.bucket === 'committed' && d.ref && row.worksOrders.indexOf(d.ref) < 0 && row.worksOrders.length < MAX_DRIVERS) row.worksOrders.push(d.ref);
  });

  /* Net and explode, parents strictly before children. */
  Object.keys(rows).sort(function (a, b) { return llc[a] - llc[b] || (a < b ? -1 : 1); }).forEach(function (sku) {
    var r = rows[sku], g = r.gross, avail = r.onHand + r.onOrder;
    g.total = g.committed + g.pipeline + g.buffer + g.forecast;
    var rem = avail;
    BUCKETS.forEach(function (b) {
      var short = Math.max(0, g[b] - rem);
      r.net[b] = roundQty(short);
      rem = Math.max(0, rem - g[b]);
    });
    r.net.total = roundQty(r.net.committed + r.net.pipeline + r.net.buffer + r.net.forecast);
    r.belowSafety = r.net.buffer > 0;
    var firm = r.net.committed + r.net.pipeline + r.net.buffer;
    if (r.kind === 'component' && !r.make && firm > 0) {
      var q = r.unit === 'ea' || r.unit === 'set' || r.unit === 'roll' || r.unit === 'box' ? Math.ceil(firm) : firm;
      r.suggestedOrder = roundQty(r.moq ? Math.ceil(q / r.moq) * r.moq : q);
    } else if (firm > 0) {
      r.suggestedOrder = Math.ceil(firm);   /* units to build */
    }
    if (r.kind === 'component' && !r.make && r.unitCost && r.suggestedOrder > 0) r.spend = Math.round(r.suggestedOrder * r.unitCost * 100) / 100;
    if (r.needBy) {
      r.orderBy = r.leadTimeDays ? addDays(r.needBy, -r.leadTimeDays) : r.needBy;
      /* "late" is a purchasing fact: a sub-assembly's start-by date is shown
         but the alarm belongs to the parts it cannot be built without. A
         buffer alone is never "late" — it is "below safety stock", now. */
      r.late = r.net.committed + r.net.pipeline > 0 && !r.make && r.orderBy < today;
    } else if (r.belowSafety && !r.make) {
      r.orderBy = today;   /* the buffer is already breached: order now */
    }
    (by[sku].bom || []).forEach(function (l) {
      var child = rows[l.sku], per = l.qty / ((Number(l.yieldPct) > 0 && Number(l.yieldPct) <= 100 ? Number(l.yieldPct) : 100) / 100);
      BUCKETS.forEach(function (b) { child.gross[b] += r.net[b] * per; });
      child.needBy = earlier(child.needBy, r.needBy);
      if (r.net.total > 0) {
        driver(child, { kind: 'assembly', ref: sku, qty: roundQty(r.net.total * per), needBy: r.needBy || null });
        if (per !== l.qty || r.yielded) child.yielded = true;
        r.worksOrders.forEach(function (w) { if (child.worksOrders.indexOf(w) < 0 && child.worksOrders.length < MAX_DRIVERS) child.worksOrders.push(w); });
      }
    });
  });

  var list = Object.keys(rows).map(function (k) {
    var r = rows[k];
    BUCKETS.forEach(function (b) { r.gross[b] = roundQty(r.gross[b]); });
    r.gross.total = roundQty(r.gross.total);
    return r;
  }).filter(function (r) { return r.gross.total > 0 || r.onHand > 0 || r.onOrder > 0 || r.safetyStock > 0; });

  /* Late first, then soonest order-by, then biggest firm shortfall. */
  list.sort(function (a, b) {
    if (a.late !== b.late) return a.late ? -1 : 1;
    var fa = a.net.committed + a.net.pipeline + a.net.buffer, fb = b.net.committed + b.net.pipeline + b.net.buffer;
    if ((fa > 0) !== (fb > 0)) return fa > 0 ? -1 : 1;
    if (a.orderBy !== b.orderBy) { if (!a.orderBy) return 1; if (!b.orderBy) return -1; return a.orderBy < b.orderBy ? -1 : 1; }
    return fb - fa || (a.sku < b.sku ? -1 : 1);
  });
  return { asOf: today, rows: list, unknownSkus: unknown,
    summary: { components: list.filter(function (r) { return r.kind === 'component'; }).length,
      short: list.filter(function (r) { return r.kind === 'component' && !r.make && r.net.committed + r.net.pipeline + r.net.buffer > 0; }).length,
      toMake: list.filter(function (r) { return r.make && r.net.committed + r.net.pipeline + r.net.buffer > 0; }).length,
      belowSafety: list.filter(function (r) { return r.belowSafety; }).length,
      spend: Math.round(list.reduce(function (t, r) { return t + (r.spend || 0); }, 0) * 100) / 100,
      unpriced: list.filter(function (r) { return r.kind === 'component' && !r.make && r.suggestedOrder > 0 && !r.unitCost; }).length,
      late: list.filter(function (r) { return r.late; }).length,
      yielded: list.filter(function (r) { return r.yielded; }).length } };
}

/* The purchase list grouped by the supplier each line would go to; lines
   with no supplier on file land under null so nothing is silently dropped. */
function purchaseBySupplier(planned) {
  var by = Object.create(null), order = [];
  purchaseList(planned).forEach(function (r) {
    var k = r.supplierId || (r.supplier ? 'name:' + r.supplier : '');
    if (!by[k]) { by[k] = { supplierId: r.supplierId || null, supplier: r.supplier || null, lines: [], spend: 0 }; order.push(k); }
    by[k].lines.push(r); by[k].spend = Math.round((by[k].spend + (r.spend || 0)) * 100) / 100;
  });
  return order.map(function (k) { return by[k]; });
}

/* Per works order: which components stand between it and the floor. Rows
   are the plan's, so the netting is the same; this only groups them. */
function shortfallsByWorksOrder(planned) {
  var by = Object.create(null);
  (planned.rows || []).forEach(function (r) {
    if (r.kind !== 'component' || r.make) return;   /* what must be BOUGHT stands between it and the floor */
    var firm = r.net.committed + r.net.pipeline;   /* the buffer is not this works order's shortfall */
    if (firm <= 0) return;
    r.worksOrders.forEach(function (w) {
      if (!safeKey(w)) return;
      (by[w] = by[w] || []).push({ sku: r.sku, name: r.name, unit: r.unit, short: roundQty(firm), onHand: r.onHand, onOrder: r.onOrder, orderBy: r.orderBy, late: r.late });
    });
  });
  return by;
}

/* ── TIME-PHASED: the same plan, week by week ─────────────────────────────
   Every MRP a plant would compare us to projects stock week by week and
   shows where it goes negative. This runs plan() once per week with only
   the demand due by the end of that week and only the supply that will
   have arrived by then (a purchase order with an expected date counts from
   that week; on-order quantity with no date counts from now). Cumulative,
   so a shortfall appears in the week it first bites and stays. Twelve
   plan() calls over a catalog of a few hundred rows is milliseconds; the
   honesty of reusing the exact netting is worth more than a faster
   approximation that disagrees with the purchase list. */
function monday(day) {
  var d = new Date(day + 'T12:00:00Z'), dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function projection(input, opts) {
  input = input || {}; opts = opts || {};
  var weeks = Math.max(1, Math.min(26, Math.round(num(opts.weeks) || 12)));
  var today = dateOf(input.now) || new Date().toISOString().slice(0, 10);
  var demands = input.demands || demandsFrom(input);
  var supplies = (input.supplies || []).filter(function (x) { return x && SKU.test(String(x.sku || '')) && num(x.qty) > 0; });
  var stock = isPlain(input.stock) ? input.stock : {};
  var starts = [], first = monday(today);
  for (var w = 0; w < weeks; w++) starts.push(addDays(first, 7 * w));
  var per = Object.create(null), names = Object.create(null);
  starts.forEach(function (start, i) {
    var cutoff = addDays(start, 6);
    /* Dated supply: an open PO's remaining quantity is on order NOW in the
       stock document; for the week view it only counts from its expected
       date, so subtract the part that has not arrived by this cutoff. */
    var late = Object.create(null);
    supplies.forEach(function (x) { var at = dateOf(x.at); if (at && at > cutoff && safeKey(x.sku)) late[x.sku] = (late[x.sku] || 0) + num(x.qty); });
    var stockW = {};
    Object.keys(stock).forEach(function (k) { if (!safeKey(k) || !isPlain(stock[k])) return;
      stockW[k] = { onHand: num(stock[k].onHand), onOrder: Math.max(0, num(stock[k].onOrder) - (late[k] || 0)) }; });
    Object.keys(late).forEach(function (k) { if (!stockW[k]) stockW[k] = { onHand: 0, onOrder: 0 }; });
    var due = demands.filter(function (d) { return !d.needBy || d.needBy <= cutoff; });
    var planned = plan({ products: input.products, stock: stockW, demands: due, now: today, sourcing: input.sourcing });
    planned.rows.forEach(function (r) {
      if (!per[r.sku]) { per[r.sku] = []; names[r.sku] = r; }
      var firmGross = r.gross.committed + r.gross.pipeline + r.gross.buffer;
      per[r.sku][i] = { start: start, gross: roundQty(firmGross), forecast: roundQty(r.gross.forecast), avail: roundQty(r.onHand + r.onOrder),
        projected: roundQty(r.onHand + r.onOrder - firmGross), net: roundQty(r.net.committed + r.net.pipeline + r.net.buffer) };
    });
  });
  var rows = Object.keys(per).map(function (sku) {
    var r = names[sku], cells = starts.map(function (start, i) { return per[sku][i] || { start: start, gross: 0, forecast: 0, avail: 0, projected: 0, net: 0 }; });
    var firstShort = null;
    cells.forEach(function (c) { if (firstShort === null && c.net > 0) firstShort = c.start; });
    return { sku: sku, name: r.name, kind: r.kind, make: r.make, unit: r.unit, leadTimeDays: r.leadTimeDays, firstShort: firstShort, weeks: cells };
  }).filter(function (r) { return r.weeks.some(function (c) { return c.gross > 0 || c.net > 0; }); });
  rows.sort(function (a, b) {
    if ((a.firstShort === null) !== (b.firstShort === null)) return a.firstShort === null ? 1 : -1;
    if (a.firstShort !== b.firstShort) return a.firstShort < b.firstShort ? -1 : 1;
    return a.sku < b.sku ? -1 : 1;
  });
  return { asOf: today, weeks: starts, rows: rows };
}

/* The purchase list is the plan filtered to what a buyer sends out today. */
function purchaseList(planned) {
  return (planned.rows || []).filter(function (r) { return r.kind === 'component' && !r.make && r.suggestedOrder > 0; });
}

module.exports = { bomLines: bomLines, validateCatalog: validateCatalog, lowLevelCodes: lowLevelCodes,
  demandsFrom: demandsFrom, plan: plan, projection: projection, monday: monday, purchaseList: purchaseList, purchaseBySupplier: purchaseBySupplier,
  priceFor: priceFor, shortfallsByWorksOrder: shortfallsByWorksOrder, UNITS: UNITS,
  MAX_LINES: MAX_LINES, MAX_DEPTH: MAX_DEPTH };
