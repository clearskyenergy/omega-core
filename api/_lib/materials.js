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

   ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
   No unit costs. A component's price is a negotiated buy figure and the
   catalog is the one document three surfaces read; the number does not
   belong there and this module never asks for it. No supplier ordering:
   the output is a list a person sends to a supplier, with the order-by
   date computed from the lead time they entered.

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
var BUCKETS = ['committed', 'pipeline', 'forecast'];
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
function emptyRow(p) {
  return { sku: p.sku, name: clean(p.name, 120) || p.sku, kind: p.kind === 'component' ? 'component' : (p.kind === 'service' ? 'service' : 'product'),
    unit: p.kind === 'component' ? (clean(p.unit, 8) || 'ea') : 'ea', supplier: clean(p.supplier, 160) || null,
    supplierSku: clean(p.supplierSku, 80) || null, moq: num(p.moq) > 0 ? num(p.moq) : null,
    leadTimeDays: num(p.leadTimeDays) > 0 ? Math.round(num(p.leadTimeDays)) : null,
    gross: { committed: 0, pipeline: 0, forecast: 0, total: 0 },
    onHand: 0, onOrder: 0, net: { committed: 0, pipeline: 0, forecast: 0, total: 0 },
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
  Object.keys(by).forEach(function (sku) {
    var r = emptyRow(by[sku]), s = safeKey(sku) && isPlain(stock[sku]) ? stock[sku] : {};
    r.onHand = Math.max(0, num(s.onHand)); r.onOrder = Math.max(0, num(s.onOrder));
    rows[sku] = r;
  });
  function driver(row, d) { if (row.drivers.length < MAX_DRIVERS) row.drivers.push(d); }

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
    g.total = g.committed + g.pipeline + g.forecast;
    var rem = avail;
    BUCKETS.forEach(function (b) {
      var short = Math.max(0, g[b] - rem);
      r.net[b] = roundQty(short);
      rem = Math.max(0, rem - g[b]);
    });
    r.net.total = roundQty(r.net.committed + r.net.pipeline + r.net.forecast);
    var firm = r.net.committed + r.net.pipeline;
    if (r.kind === 'component' && firm > 0) {
      var q = r.unit === 'ea' || r.unit === 'set' || r.unit === 'roll' || r.unit === 'box' ? Math.ceil(firm) : firm;
      r.suggestedOrder = roundQty(r.moq ? Math.ceil(q / r.moq) * r.moq : q);
    } else if (r.kind !== 'component' && firm > 0) {
      r.suggestedOrder = Math.ceil(firm);   /* units to build */
    }
    if (r.needBy) {
      r.orderBy = r.leadTimeDays ? addDays(r.needBy, -r.leadTimeDays) : r.needBy;
      r.late = firm > 0 && r.orderBy < today;
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
  }).filter(function (r) { return r.gross.total > 0 || r.onHand > 0 || r.onOrder > 0; });

  /* Late first, then soonest order-by, then biggest firm shortfall. */
  list.sort(function (a, b) {
    if (a.late !== b.late) return a.late ? -1 : 1;
    var fa = a.net.committed + a.net.pipeline, fb = b.net.committed + b.net.pipeline;
    if ((fa > 0) !== (fb > 0)) return fa > 0 ? -1 : 1;
    if (a.orderBy !== b.orderBy) { if (!a.orderBy) return 1; if (!b.orderBy) return -1; return a.orderBy < b.orderBy ? -1 : 1; }
    return fb - fa || (a.sku < b.sku ? -1 : 1);
  });
  return { asOf: today, rows: list, unknownSkus: unknown,
    summary: { components: list.filter(function (r) { return r.kind === 'component'; }).length,
      short: list.filter(function (r) { return r.kind === 'component' && r.net.committed + r.net.pipeline > 0; }).length,
      late: list.filter(function (r) { return r.late; }).length,
      yielded: list.filter(function (r) { return r.yielded; }).length } };
}

/* Per works order: which components stand between it and the floor. Rows
   are the plan's, so the netting is the same; this only groups them. */
function shortfallsByWorksOrder(planned) {
  var by = Object.create(null);
  (planned.rows || []).forEach(function (r) {
    if (r.kind !== 'component') return;
    var firm = r.net.committed + r.net.pipeline;
    if (firm <= 0) return;
    r.worksOrders.forEach(function (w) {
      if (!safeKey(w)) return;
      (by[w] = by[w] || []).push({ sku: r.sku, name: r.name, unit: r.unit, short: roundQty(firm), onHand: r.onHand, onOrder: r.onOrder, orderBy: r.orderBy, late: r.late });
    });
  });
  return by;
}

/* The purchase list is the plan filtered to what a buyer sends out today. */
function purchaseList(planned) {
  return (planned.rows || []).filter(function (r) { return r.kind === 'component' && r.suggestedOrder > 0; });
}

module.exports = { bomLines: bomLines, validateCatalog: validateCatalog, lowLevelCodes: lowLevelCodes,
  demandsFrom: demandsFrom, plan: plan, purchaseList: purchaseList, shortfallsByWorksOrder: shortfallsByWorksOrder, UNITS: UNITS,
  MAX_LINES: MAX_LINES, MAX_DEPTH: MAX_DEPTH };
