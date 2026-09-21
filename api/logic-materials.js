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

   What is NOT here: a purchase order. The plan is a list a person acts on;
   marking material as "on order" is the count they enter after they have.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), M = require('./_lib/materials');

var SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
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

  if (req.method === 'GET' && req.query.workOrder) {
    /* One works order: can it be built from what is on hand and on order?
       Same engine, demand restricted to this record, so the answer is the
       plan's answer for it in isolation — other open work is not competing
       for the same stock in this view, and the page says so. */
    var woId = String(req.query.workOrder || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(woId)) throw A.httpError(400, 'Invalid works order');
    var one = await Promise.all([catalogRef.get(), stockRef.get(), db.collection('plant_works_orders').doc(woId).get()]);
    if (!one[2].exists || one[2].data().orgId !== org) throw A.httpError(404, 'Works order not found');
    var wo = Object.assign({ id: one[2].id }, one[2].data());
    var solo = M.plan({ products: one[0].exists ? (one[0].data().products || []) : [], stock: one[1].exists ? (one[1].data().stock || {}) : {}, works: [wo], orders: [] });
    var short = M.shortfallsByWorksOrder(solo)[String(wo.orderNo || wo.id)] || [];
    return { org: org, workOrder: { id: wo.id, orderNo: wo.orderNo || null, status: wo.status || null, dueDate: wo.dueDate || null },
      feasible: short.length === 0, short: short, unknownSkus: solo.unknownSkus,
      hasBom: solo.rows.some(function (r) { return r.kind === 'component'; }) };
  }
  if (req.method === 'GET') {
    var rows = await Promise.all([
      catalogRef.get(), stockRef.get(),
      db.collection('orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(200).get(),
      db.collection('plant_works_orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(200).get()
    ]);
    var cat = rows[0].exists ? (rows[0].data() || {}) : {}, st = rows[1].exists ? (rows[1].data() || {}) : {};
    var products = Array.isArray(cat.products) ? cat.products : [];
    var planned = M.plan({ products: products, stock: st.stock || {},
      orders: rows[2].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }),
      works: rows[3].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }) });
    return { org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org), owner: X.owner(caller),
      asOf: planned.asOf, rows: planned.rows, summary: planned.summary, unknownSkus: planned.unknownSkus,
      stockRevision: st.revision || 0, catalogRevision: cat.catalogRevision || 0,
      components: products.filter(function (p) { return p && p.kind === 'component' && p.active !== false; }).length,
      withBom: products.filter(function (p) { return p && p.active !== false && (p.bom || []).length; }).length,
      /* 200 is the read cap on each of orders and works orders. Past it the
         plan is computed on the newest 200 and says so, rather than being
         quietly short. */
      limited: rows[2].size === 200 || rows[3].size === 200 };
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
