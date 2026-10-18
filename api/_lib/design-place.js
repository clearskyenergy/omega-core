/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/design-place.js — write the drawing's purchase order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The IO half of design-order.js. It reads each OEM's published catalog,
   opens (or reopens) one order per OEM, without inventing a customer account. The designer is recorded only
   as the person submitting the drawing. Admin SDK only. A failure here never
   decides who received the quote request: api/rfq.js keeps that write
   and treats a placement error as "no order".
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var D = require('./design-order');

function catalogsOf(db, orgIds) {
  var catalogs = {}, names = {};
  return Promise.all(orgIds.map(function (org) {
    return Promise.all([
      db.collection('omega_orgs').doc(org).get(),
      db.collection('omega_orgs').doc(org).collection('storefront').doc('config').get()
    ]).then(function (rows) {
      names[org] = rows[0].exists ? ((rows[0].data() || {}).name || org) : org;
      var products = rows[1].exists ? (rows[1].data() || {}).products : [];
      catalogs[org] = Array.isArray(products) ? products : [];
    });
  })).then(function () { return { catalogs: catalogs, names: names }; });
}

function writeOne(db, one, ctx) {
  var id = D.orderId(one.orgId, one.design.projectId);
  var ref = db.collection('orders').doc(id);
  var now = new Date().toISOString();
  var ts = ctx.FieldValue && ctx.FieldValue.serverTimestamp ? ctx.FieldValue.serverTimestamp() : now;
  var doc = D.documentOf({ order: one, email: ctx.email, now: now, createdAt: ts });
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (cur) {
      if (cur.exists) return cur.data();
      tx.create(ref, doc);
      tx.create(ref.collection('events').doc(), {
        at: now, by: ctx.email,
        what: 'Opened from the drawing. Awaiting the customer price.'
      });
      return doc;
    });
  }).then(function (saved) { return D.response(id, saved, ctx.caller.orgId, one.orgName); });
}

function place(spec) {
  spec = spec || {};
  var db = spec.db;
  if (!db || !spec.project || !spec.project.id) return Promise.resolve({ orders: [], unmatched: [] });
  var designer = spec.designer || {};
  var orgIds = D.catalogOrgs(spec.lines, designer.orgId);
  return catalogsOf(db, orgIds).then(function (got) {
    var drafted = D.draft({
      lines: spec.lines, catalogs: got.catalogs, orgNames: got.names,
      designerOrgId: designer.orgId, project: spec.project,
      estimateCents: spec.estimateCents, rfqId: spec.rfqId || null
    });
    if (!drafted.orders.length) return { orders: [], unmatched: drafted.unmatched };
    var ctx = { email: String(spec.caller && spec.caller.email || ''), caller: spec.caller || {}, FieldValue: spec.FieldValue };
    var orders = [];
    var chain = Promise.resolve();
    drafted.orders.forEach(function (one) {
      chain = chain.then(function () { return writeOne(db, one, ctx).then(function (row) { if (row) orders.push(row); }); });
    });
    return chain.then(function () { return { orders: orders, unmatched: drafted.unmatched }; });
  });
}

module.exports = { place: place };
