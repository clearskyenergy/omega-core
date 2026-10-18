/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/design-place.js — write the drawing's purchase order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The IO half of design-order.js. It reads each OEM's published catalog,
   opens (or reopens) one order per OEM, and makes the designer the
   customer account on that order. Admin SDK only. A failure here never
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

function writeOne(db, B, one, ctx) {
  var id = D.orderId(one.orgId, one.design.projectId);
  var ref = db.collection('orders').doc(id);
  var caller = ctx.caller || {};
  return ref.get().then(function (existing) {
    if (existing.exists) return D.response(id, existing.data(), caller.orgId, one.orgName);
    var seed = { source: 'office', company: ctx.designer.name || ctx.designer.orgId || one.orgId, hasOrders: true };
    if (ctx.domain) seed.domain = ctx.domain;
    return B.ensure(db, one.orgId, ctx.email, seed, caller).then(function (acct) {
      var now = new Date().toISOString();
      var ts = ctx.FieldValue && ctx.FieldValue.serverTimestamp ? ctx.FieldValue.serverTimestamp() : now;
      var doc = D.documentOf({ order: one, customer: acct, email: ctx.email, now: now, createdAt: ts });
      return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (cur) {
          if (cur.exists) return;
          tx.create(ref, doc);
          tx.create(ref.collection('events').doc(), {
            at: now, by: ctx.email,
            what: 'Opened from the drawing ' + (one.design.projectName || one.design.projectId) + '. The address, lines and estimate came with the project. Awaiting the customer price.'
          });
          tx.update(db.collection('omega_orgs').doc(one.orgId).collection('customers').doc(acct.id), { hasOrders: true });
        });
      }).then(function () { return ref.get(); }, function (err) {
        return ref.get().then(function (again) { if (again.exists) return again; throw err; });
      }).then(function (saved) {
        return D.response(id, saved.exists ? saved.data() : doc, caller.orgId, one.orgName);
      });
    });
  });
}

function place(spec) {
  spec = spec || {};
  var db = spec.db;
  if (!db || !spec.project || !spec.project.id) return Promise.resolve({ orders: [], unmatched: [] });
  var B = require('./buyer-accounts');
  var designer = spec.designer || {};
  var orgIds = D.catalogOrgs(spec.lines, designer.orgId);
  return catalogsOf(db, orgIds).then(function (got) {
    var drafted = D.draft({
      lines: spec.lines, catalogs: got.catalogs, orgNames: got.names,
      designerOrgId: designer.orgId, project: spec.project,
      estimateCents: spec.estimateCents, rfqId: spec.rfqId || null
    });
    if (!drafted.orders.length) return { orders: [], unmatched: drafted.unmatched };
    var email;
    try { email = B.email(spec.caller && spec.caller.email || designer.email); }
    catch (e) { return { orders: [], unmatched: drafted.unmatched }; }
    var domain = '';
    try { domain = designer.orgId ? B.accountDomain(designer.orgId) : ''; } catch (e2) { domain = ''; }
    var ctx = { email: email, caller: spec.caller || {}, designer: designer, domain: domain, FieldValue: spec.FieldValue };
    var orders = [];
    var chain = Promise.resolve();
    drafted.orders.forEach(function (one) {
      chain = chain.then(function () { return writeOne(db, B, one, ctx).then(function (row) { if (row) orders.push(row); }); });
    });
    return chain.then(function () { return { orders: orders, unmatched: drafted.unmatched }; });
  });
}

module.exports = { place: place };
