/* ═══════════════════════════════════════════════════════════════════════════
   GET  /api/logic-materials?org=<orgId>          the materials plan
   POST /api/logic-materials { org, action:'stock', sku, onHand, onOrder,
                               note, revision }   a stock count
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The plan is computed here, on the server, from four reads: the catalog
   (products, components and their bills of materials), the stock counts,
   the open orders and the works orders. api/_lib/materials.js does the
   arithmetic and knows nothing about who is asking; X.authorize() decides
   that, the same way it does for the catalog and the plant.

   Stock counts live in omega_orgs/{org}/fulfillment/materials, which
   firestore.rules already closes to every browser (`allow read, write: if
   false` on fulfillment/*). A count is a fact somebody stated on a date —
   it is written with who and when, audited, and revision-checked so two
   people counting the same shelf cannot silently overwrite each other.

   SUPPLIERS AND PRICES live in omega_orgs/{org}/fulfillment/suppliers —
   supplier records and, per SKU, one price per supplier (unit cost, MOQ,
   lead time, preferred). action:'supplier' creates or updates a record,
   action:'price' sets a supplier's price for a part, action:'price-remove'
   drops it; each is revision-checked on that document and audited. A buy
   price is exactly what a supplier's spreadsheet leaks, so it exists only
   here: never in the catalog, never accepted by the importer, never in a
   public projection. The plan reads it to price the purchase list.

   PURCHASE ORDERS close the loop. POST action:'po' records what was sent to
   a supplier (omega_orgs/{org}/purchase_orders/{id}, Admin SDK only — no
   rule grants it) and adds the quantities to `onOrder` in the same
   transaction; action:'receive' moves received quantity from `onOrder` to
   `onHand` and marks the order partial or received; action:'cancel-po'
   releases what was never received. A manual count still overrides either
   number — a count is a fact about the shelf, a PO is a fact about a promise
   — and every one of these is revision-checked against the stock document
   and audited. What is still NOT here: any message to the supplier. The PO
   is a record of what a person sent; sending is theirs.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), M = require('./_lib/materials');

var SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var PO_LINES = 60, PO_LIST = 100, RECEIPTS = 50;
function safe(k) { return ['__proto__', 'constructor', 'prototype'].indexOf(k) < 0; }
function text(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n); }
function round4(n) { return Math.round(n * 10000) / 10000; }
function dateOf(v) {
  if (v == null || v === '') return null;
  var d = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) throw A.httpError(400, 'Use a valid YYYY-MM-DD date');
  return d;
}
/* Copies the stock map without prototype keys; the whole map is rewritten
   rather than a dotted path because a SKU may contain a dot. */
function stockOf(d) { var out = {}; Object.keys(d.stock || {}).forEach(function (k) { if (safe(k)) out[k] = d.stock[k]; }); return out; }
function poView(id, po) {
  return { id: id, supplier: po.supplier || '', supplierId: po.supplierId || null, reference: po.reference || '', expectedAt: po.expectedAt || null, note: po.note || '',
    status: po.status || 'open', createdAt: po.createdAt || null, createdBy: po.createdBy || null, receivedAt: po.receivedAt || null,
    lines: (po.lines || []).map(function (l) { return { sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, received: l.received || 0 }; }),
    receipts: (po.receipts || []).slice(-10) };
}
function count(v, what) {
  if (v == null || v === '') return 0;
  var n = Number(v);
  if (!isFinite(n) || n < 0 || n > 10000000) throw A.httpError(400, what + ' must be between 0 and 10,000,000');
  return Math.round(n * 10000) / 10000;
}

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'POST'].indexOf(req.method) < 0) throw A.httpError(405, 'GET or POST only');
  var b = req.body || {}, caller = await A.authenticate(req);
  var org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var ctx = await X.authorize(caller, org, req.method === 'POST');
  var db = A.db(), root = db.collection('omega_orgs').doc(org);
  var catalogRef = root.collection('storefront').doc('config'), stockRef = root.collection('fulfillment').doc('materials');
  var poCol = root.collection('purchase_orders'), supRef = root.collection('fulfillment').doc('suppliers');

  if (req.method === 'GET' && req.query.workOrder) {
    /* One works order: can it be built from what is on hand and on order?
       Same engine, demand restricted to this record, so the answer is the
       plan's answer for it in isolation — other open work is not competing
       for the same stock in this view, and the page says so. */
    var woId = String(req.query.workOrder || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(woId)) throw A.httpError(400, 'Invalid works order');
    var one = await Promise.all([catalogRef.get(), stockRef.get(), db.collection('plant_works_orders').doc(woId).get(), supRef.get()]);
    if (!one[2].exists || one[2].data().orgId !== org) throw A.httpError(404, 'Works order not found');
    var wo = Object.assign({ id: one[2].id }, one[2].data());
    var solo = M.plan({ products: one[0].exists ? (one[0].data().products || []) : [], stock: one[1].exists ? (one[1].data().stock || {}) : {}, works: [wo], orders: [],
      sourcing: one[3].exists ? one[3].data() : null });
    var short = M.shortfallsByWorksOrder(solo)[String(wo.orderNo || wo.id)] || [];
    return { org: org, workOrder: { id: wo.id, orderNo: wo.orderNo || null, status: wo.status || null, dueDate: wo.dueDate || null },
      feasible: short.length === 0, short: short, unknownSkus: solo.unknownSkus,
      hasBom: solo.rows.some(function (r) { return r.kind === 'component'; }) };
  }
  if (req.method === 'GET') {
    var rows = await Promise.all([
      catalogRef.get(), stockRef.get(),
      db.collection('orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(200).get(),
      db.collection('plant_works_orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(200).get(),
      poCol.orderBy('createdAt', 'desc').limit(PO_LIST).get(),
      supRef.get()
    ]);
    var sourcing = rows[5].exists ? (rows[5].data() || {}) : {};
    var cat = rows[0].exists ? (rows[0].data() || {}) : {}, st = rows[1].exists ? (rows[1].data() || {}) : {};
    var products = Array.isArray(cat.products) ? cat.products : [];
    var orders = rows[2].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    var works = rows[3].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    var planned = M.plan({ products: products, stock: st.stock || {}, orders: orders, works: works, sourcing: sourcing });
    /* Open purchase orders with an expected date are dated supply for the
       week view; what is still expected on each line, at that date. */
    var supplies = [];
    rows[4].docs.forEach(function (d) {
      var po = d.data() || {};
      if (['open', 'partial'].indexOf(po.status) < 0 || !po.expectedAt) return;
      (po.lines || []).forEach(function (l) { var left = Number(l.qty) - Number(l.received || 0); if (left > 0) supplies.push({ sku: l.sku, qty: left, at: po.expectedAt }); });
    });
    var weeks = M.projection({ products: products, stock: st.stock || {}, orders: orders, works: works, supplies: supplies, sourcing: sourcing }, { weeks: 12 });
    return { org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org), owner: X.owner(caller),
      asOf: planned.asOf, rows: planned.rows, summary: planned.summary, unknownSkus: planned.unknownSkus,
      stockRevision: st.revision || 0, catalogRevision: cat.catalogRevision || 0,
      components: products.filter(function (p) { return p && p.kind === 'component' && p.active !== false; }).length,
      withBom: products.filter(function (p) { return p && p.active !== false && (p.bom || []).length; }).length,
      purchaseOrders: rows[4].docs.map(function (d) { return poView(d.id, d.data() || {}); }),
      projection: weeks,
      bySupplier: M.purchaseBySupplier(planned),
      suppliers: Object.keys(sourcing.suppliers || {}).filter(safe).map(function (id) { return Object.assign({ id: id }, sourcing.suppliers[id]); })
        .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }),
      prices: (function () { var out = {}; Object.keys(sourcing.prices || {}).forEach(function (k) { if (safe(k)) out[k] = sourcing.prices[k]; }); return out; })(),
      sourcingRevision: sourcing.revision || 0,
      /* 200 is the read cap on each of orders and works orders. Past it the
         plan is computed on the newest 200 and says so, rather than being
         quietly short. */
      limited: rows[2].size === 200 || rows[3].size === 200 };
  }

  /* ── suppliers and prices ───────────────────────────────────────────── */
  if (b.action === 'supplier' || b.action === 'price' || b.action === 'price-remove') {
    var srev = Number(b.revision) || 0, sAt = new Date().toISOString();
    return db.runTransaction(async function (tx) {
      var ss = await tx.get(supRef), d = ss.exists ? (ss.data() || {}) : {};
      if ((d.revision || 0) !== srev) throw A.httpError(409, 'Supplier records changed. Reload before saving');
      var suppliers = {}, prices = {};
      Object.keys(d.suppliers || {}).forEach(function (k) { if (safe(k)) suppliers[k] = d.suppliers[k]; });
      Object.keys(d.prices || {}).forEach(function (k) { if (safe(k)) prices[k] = d.prices[k]; });
      var audit = { orgId: org, action: 'materials-' + b.action, by: caller.email, at: sAt };
      if (b.action === 'supplier') {
        var id = text(b.id, 60) || ('sup_' + require('crypto').randomBytes(6).toString('hex'));
        if (!/^[A-Za-z0-9_-]{1,60}$/.test(id) || !safe(id)) throw A.httpError(400, 'Invalid supplier id');
        var name = text(b.name, 160);
        if (!name) throw A.httpError(400, 'Name the supplier');
        if (!suppliers[id] && Object.keys(suppliers).length >= 200) throw A.httpError(400, 'At most 200 supplier records');
        var lead = b.leadTimeDays == null || b.leadTimeDays === '' ? null : count(b.leadTimeDays, 'Lead time');
        var rec = { name: name, contact: text(b.contact, 120), email: text(b.email, 160).toLowerCase(), phone: text(b.phone, 40),
          terms: text(b.terms, 120), leadTimeDays: lead ? Math.round(lead) : null, notes: text(b.notes, 400),
          active: b.active !== false, updatedAt: sAt, updatedBy: caller.email, createdAt: (suppliers[id] || {}).createdAt || sAt };
        audit.supplierId = id; audit.before = suppliers[id] || null; audit.after = rec;
        suppliers[id] = rec;
      } else {
        var psku = text(b.sku, 64), sid = text(b.supplierId, 60);
        if (!SKU.test(psku) || !safe(psku)) throw A.httpError(400, 'Invalid SKU');
        if (!suppliers[sid]) throw A.httpError(404, 'No such supplier');
        var cat = await tx.get(catalogRef), products = cat.exists ? (cat.data().products || []) : [];
        var comp = products.filter(function (x) { return x && x.sku === psku; })[0];
        if (!comp || comp.kind !== 'component') throw A.httpError(404, psku + ' is not a component in the catalog');
        var list = (Array.isArray(prices[psku]) ? prices[psku] : []).filter(function (x) { return x && x.supplierId !== sid; });
        audit.sku = psku; audit.supplierId = sid; audit.before = (prices[psku] || []).filter(function (x) { return x && x.supplierId === sid; })[0] || null;
        if (b.action === 'price') {
          if (list.length >= 6) throw A.httpError(400, 'At most six suppliers per part');
          var cost = b.unitCost == null || b.unitCost === '' ? null : count(b.unitCost, 'Unit cost');
          var moq = b.moq == null || b.moq === '' ? null : count(b.moq, 'MOQ'), plead = b.leadTimeDays == null || b.leadTimeDays === '' ? null : count(b.leadTimeDays, 'Lead time');
          var pr = { supplierId: sid, unitCost: cost, currency: 'USD', moq: moq, leadTimeDays: plead ? Math.round(plead) : null,
            supplierSku: text(b.supplierSku, 80), preferred: b.preferred === true, updatedAt: sAt, updatedBy: caller.email };
          if (pr.preferred) list.forEach(function (x) { x.preferred = false; });
          if (!list.length) pr.preferred = true;    /* the only source is the preferred one */
          list.push(pr); audit.after = pr;
        } else { audit.after = null; if (list.length && !list.some(function (x) { return x.preferred; })) list[0].preferred = true; }
        prices[psku] = list;
      }
      var next = (d.revision || 0) + 1;
      tx.set(supRef, { suppliers: suppliers, prices: prices, revision: next, updatedAt: sAt, updatedBy: caller.email }, { merge: false });
      tx.create(db.collection('omega_audit').doc(), audit);
      return { ok: true, revision: next, supplierId: audit.supplierId || null };
    });
  }

  /* ── purchase orders ────────────────────────────────────────────────── */
  if (b.action === 'po') {
    var supplier = text(b.supplier, 160), supplierId = text(b.supplierId, 60), reference = text(b.reference, 80), expectedAt = dateOf(b.expectedAt), poNote = text(b.note, 300);
    if (supplierId && !/^[A-Za-z0-9_-]{1,60}$/.test(supplierId)) throw A.httpError(400, 'Invalid supplier id');
    if (!supplier && !supplierId) throw A.httpError(400, 'Name the supplier');
    if (!Array.isArray(b.lines) || !b.lines.length) throw A.httpError(400, 'Add at least one line');
    if (b.lines.length > PO_LINES) throw A.httpError(400, 'A purchase order lists at most ' + PO_LINES + ' lines');
    var wanted = [], seenSku = {};
    b.lines.forEach(function (l) {
      var sku = text(l && l.sku, 64), qty = count(l && l.qty, 'Quantity of ' + sku);
      if (!SKU.test(sku) || !safe(sku)) throw A.httpError(400, 'Invalid SKU on a line');
      if (qty <= 0) throw A.httpError(400, 'Quantity of ' + sku + ' must be greater than zero');
      if (seenSku[sku]) throw A.httpError(400, sku + ' is listed twice — combine the quantities');
      seenSku[sku] = true; wanted.push({ sku: sku, qty: qty });
    });
    var poRevision = Number(b.revision) || 0, at = new Date().toISOString();
    return db.runTransaction(async function (tx) {
      var cat = await tx.get(catalogRef), st = await tx.get(stockRef), sd = supplierId ? await tx.get(supRef) : null;
      var products = cat.exists ? (cat.data().products || []) : [], d = st.exists ? (st.data() || {}) : {};
      if ((d.revision || 0) !== poRevision) throw A.httpError(409, 'Stock counts changed. Reload before saving');
      if (supplierId) {
        var srec = sd && sd.exists && safe(supplierId) ? ((sd.data().suppliers || {})[supplierId]) : null;
        if (!srec) throw A.httpError(404, 'No such supplier');
        supplier = text(srec.name, 160) || supplier;
      }
      var stock = stockOf(d);
      var lines = wanted.map(function (w) {
        var p = products.filter(function (x) { return x && x.sku === w.sku; })[0];
        if (!p || p.kind === 'service') throw A.httpError(404, w.sku + ' is not a component or product in the catalog');
        var e = Object.assign({ onHand: 0, onOrder: 0 }, stock[w.sku] || {});
        e.onOrder = round4(Number(e.onOrder || 0) + w.qty); e.countedAt = at; e.by = caller.email; e.note = 'PO ' + (reference || supplier);
        stock[w.sku] = e;
        return { sku: w.sku, name: text(p.name, 120) || w.sku, unit: p.kind === 'component' ? (text(p.unit, 8) || 'ea') : 'ea', qty: w.qty, received: 0 };
      });
      var po = { orgId: org, supplier: supplier, supplierId: supplierId || null, reference: reference, expectedAt: expectedAt, note: poNote, status: 'open',
        lines: lines, receipts: [], createdAt: at, createdBy: caller.email, receivedAt: null };
      var ref = poCol.doc(), next = (d.revision || 0) + 1;
      tx.create(ref, po);
      tx.set(stockRef, { stock: stock, revision: next, updatedAt: at, updatedBy: caller.email }, { merge: true });
      tx.create(db.collection('omega_audit').doc(), { orgId: org, action: 'materials-po', poId: ref.id, before: null, after: po, by: caller.email, at: at });
      return { ok: true, poId: ref.id, revision: next };
    });
  }
  if (b.action === 'receive' || b.action === 'cancel-po') {
    var poId = text(b.poId, 120);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(poId)) throw A.httpError(400, 'Invalid purchase order');
    var rcvRevision = Number(b.revision) || 0, now = new Date().toISOString(), rcvNote = text(b.note, 300);
    var asked = b.action === 'receive' ? (Array.isArray(b.lines) ? b.lines : []) : [];
    if (b.action === 'receive' && !asked.length) throw A.httpError(400, 'Say what arrived');
    return db.runTransaction(async function (tx) {
      var ps = await tx.get(poCol.doc(poId)), st = await tx.get(stockRef);
      if (!ps.exists || ps.data().orgId !== org) throw A.httpError(404, 'Purchase order not found');
      var po = ps.data(), d = st.exists ? (st.data() || {}) : {};
      if (['open', 'partial'].indexOf(po.status) < 0) throw A.httpError(409, 'This purchase order is ' + po.status);
      if ((d.revision || 0) !== rcvRevision) throw A.httpError(409, 'Stock counts changed. Reload before saving');
      var stock = stockOf(d), lines = (po.lines || []).map(function (l) { return Object.assign({}, l); }), moved = [];
      function entry(sku) { return Object.assign({ onHand: 0, onOrder: 0 }, stock[sku] || {}); }
      if (b.action === 'receive') {
        asked.forEach(function (a) {
          var sku = text(a && a.sku, 64), qty = count(a && a.qty, 'Received quantity of ' + sku);
          if (qty <= 0) return;
          var l = lines.filter(function (x) { return x.sku === sku; })[0];
          if (!l) throw A.httpError(400, sku + ' is not on this purchase order');
          var remaining = round4(Number(l.qty) - Number(l.received || 0));
          if (qty > remaining + 0.00005) throw A.httpError(409, sku + ': ' + qty + ' is more than the ' + remaining + ' still expected');
          l.received = round4(Number(l.received || 0) + qty);
          var e = entry(sku), lot = text(a && a.lot, 100);
          e.onOrder = round4(Math.max(0, Number(e.onOrder || 0) - qty)); e.onHand = round4(Number(e.onHand || 0) + qty);
          e.countedAt = now; e.by = caller.email; e.note = 'Received on PO ' + (po.reference || po.supplier);
          /* The supplier's lot travels with the shelf so the floor can put
             it on a unit's trace at registration (plant-release.js traceOf).
             Last twenty receipts per SKU; the PO keeps the full history. */
          if (lot) e.lots = (Array.isArray(e.lots) ? e.lots : []).concat([{ lot: lot, qty: qty, at: now, po: poId, supplier: po.supplier || null }]).slice(-20);
          stock[sku] = e; moved.push({ sku: sku, qty: qty, lot: lot || null });
        });
        if (!moved.length) throw A.httpError(400, 'Nothing to receive');
        var done = lines.every(function (l) { return Number(l.received || 0) + 0.00005 >= Number(l.qty); });
        var receipts = (po.receipts || []).concat([{ at: now, by: caller.email, lines: moved, note: rcvNote }]).slice(-RECEIPTS);
        var patch = { lines: lines, receipts: receipts, status: done ? 'received' : 'partial', receivedAt: done ? now : null, updatedAt: now, updatedBy: caller.email };
      } else {
        lines.forEach(function (l) {
          var remaining = round4(Number(l.qty) - Number(l.received || 0));
          if (remaining <= 0) return;
          var e = entry(l.sku);
          e.onOrder = round4(Math.max(0, Number(e.onOrder || 0) - remaining)); e.countedAt = now; e.by = caller.email; e.note = 'PO ' + (po.reference || po.supplier) + ' cancelled';
          stock[l.sku] = e; moved.push({ sku: l.sku, qty: -remaining });
        });
        patch = { status: 'cancelled', cancelledAt: now, cancelNote: rcvNote, updatedAt: now, updatedBy: caller.email };
      }
      var next = (d.revision || 0) + 1;
      tx.set(poCol.doc(poId), patch, { merge: true });
      tx.set(stockRef, { stock: stock, revision: next, updatedAt: now, updatedBy: caller.email }, { merge: true });
      tx.create(db.collection('omega_audit').doc(), { orgId: org, action: b.action === 'receive' ? 'materials-receive' : 'materials-po-cancel', poId: poId, before: { status: po.status }, after: { status: patch.status, moved: moved }, by: caller.email, at: now });
      return { ok: true, status: patch.status, revision: next };
    });
  }

  if (b.action !== 'stock') throw A.httpError(400, 'Unknown materials action');
  var sku = String(b.sku || '').trim();
  if (!SKU.test(sku) || ['__proto__', 'constructor', 'prototype'].indexOf(sku) >= 0) throw A.httpError(400, 'Invalid SKU');
  var entry = { onHand: count(b.onHand, 'On hand'), onOrder: count(b.onOrder, 'On order'),
    note: String(b.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300),
    countedAt: new Date().toISOString(), by: caller.email };
  var revision = Number(b.revision) || 0;
  return db.runTransaction(async function (tx) {
    var cat = await tx.get(catalogRef), st = await tx.get(stockRef);
    var products = cat.exists ? (cat.data().products || []) : [], d = st.exists ? (st.data() || {}) : {};
    var p = products.filter(function (x) { return x && x.sku === sku; })[0];
    if (!p || p.kind === 'service') throw A.httpError(404, 'No such component or product in the catalog');
    if ((d.revision || 0) !== revision) throw A.httpError(409, 'Stock counts changed. Reload before saving');
    /* The whole map is rewritten rather than a dotted field path, because a
       SKU may contain a dot and Firestore would read it as a segment. */
    var stock = {}, before = null;
    Object.keys(d.stock || {}).forEach(function (k) { if (['__proto__', 'constructor', 'prototype'].indexOf(k) < 0) stock[k] = d.stock[k]; });
    before = stock[sku] || null; stock[sku] = entry;
    var next = (d.revision || 0) + 1;
    tx.set(stockRef, { stock: stock, revision: next, updatedAt: entry.countedAt, updatedBy: caller.email }, { merge: true });
    tx.create(db.collection('omega_audit').doc(), { orgId: org, action: 'materials-stock', sku: sku, before: before, after: entry, by: caller.email, at: entry.countedAt });
    return { ok: true, revision: next };
  });
});
